#!/usr/bin/env node
/**
 * Authoritative listen server (Quake-style dedicated host).
 *
 * - Relays JSON like a dumb pipe (voice blobs, poses, hello).
 * - Validates voice-shot ballistics (FFA closest-hit); emits authDamage / authMatchEnd.
 * - Validates ring-out from pose packets.
 */

import os from 'node:os'
import { WebSocketServer } from 'ws'
import { COMBAT as C } from './lib/combatConstants.mjs'
import {
  checkFeetEliminated,
  opponentBodyCenterFromPose,
  simulateVoiceShotHit,
  simulateVoiceShotHitFfa,
} from './lib/voiceShotSim.mjs'

const PORT = Number(process.env.PVP_LISTEN_PORT || 8765)

let bananaRelaxedTrustWarned = false

/**
 * @typedef {{
 *   peers: Set<import('ws').WebSocket>
 *   poses: Record<string, object | null>
 *   percent: Record<string, number>
 *   shots: Set<string>
 *   ended: boolean
 *   stocks: Record<string, number>
 *   ringOutPending: Record<string, boolean>
 *   respawnInvulnUntil: Record<string, number>
 * }} Room
 */

/** @type {Map<string, Room>} */
const rooms = new Map()

function newRoom() {
  const n = Math.max(1, Math.round(COMBAT.startStocks))
  return {
    peers: new Set(),
    poses: {},
    percent: {},
    shots: new Set(),
    ended: false,
    stocks: {},
    ringOutPending: {},
    respawnInvulnUntil: {},
  }
}

function ensureFighter(r, id, stockCount = Math.max(1, Math.round(COMBAT.startStocks))) {
  if (!(id in r.poses)) r.poses[id] = null
  if (r.stocks[id] === undefined) r.stocks[id] = stockCount
  if (r.percent[id] === undefined) r.percent[id] = 0
  if (r.respawnInvulnUntil[id] === undefined) r.respawnInvulnUntil[id] = 0
  if (r.ringOutPending[id] === undefined) r.ringOutPending[id] = false
}

function fighterIds(r) {
  return Object.keys(r.stocks).sort((a, b) => a.localeCompare(b))
}

function remainingAlive(r) {
  return fighterIds(r).filter((id) => r.stocks[id] > 0)
}

function defaultPose(id, allIds) {
  const spacing = Math.min(6.8, Math.min(COMBAT.groundWidth, COMBAT.groundDepth) * 0.5 - 2.5)
  const fy = 0
  const ix = allIds.indexOf(id)
  const i = ix >= 0 ? ix : 0
  const total = Math.max(2, allIds.length)
  const t = (i / total) * Math.PI * 2
  const x = Math.sin(t) * spacing * 0.85
  const z = Math.cos(t) * spacing * 0.85
  const ry = Math.atan2(-x, -z)
  return { x, z, fy, ry }
}

function legacyPercents(r) {
  const fh = r.percent.host
  const fg = r.percent.guest
  if (typeof fh === 'number' && typeof fg === 'number') {
    return { percentHost: fh, percentGuest: fg }
  }
  return {}
}

function legacyStocks(r) {
  const sh = r.stocks.host
  const sg = r.stocks.guest
  if (typeof sh === 'number' && typeof sg === 'number') {
    return { stocksHost: sh, stocksGuest: sg }
  }
  return {}
}

function getOrCreateRoom(roomId) {
  let r = rooms.get(roomId)
  if (!r) {
    r = newRoom()
    rooms.set(roomId, r)
  }
  return r
}

function broadcastPresence(roomId) {
  const r = rooms.get(roomId)
  const count = r ? r.peers.size : 0
  const payload = JSON.stringify({ type: 'presence', count })
  for (const c of r?.peers || []) {
    if (c.readyState === 1) {
      try {
        c.send(payload)
      } catch {
        /* ignore */
      }
    }
  }
}

/** @param {import('ws').WebSocket} ws */
function leaveRoom(ws) {
  const roomId = ws._vjRoom
  if (!roomId) return
  const r = rooms.get(roomId)
  if (r) {
    r.peers.delete(ws)
    if (r.peers.size === 0) rooms.delete(roomId)
  }
  broadcastPresence(roomId)
}

function broadcast(roomId, raw, except) {
  const r = rooms.get(roomId)
  if (!r) return
  for (const peer of r.peers) {
    if (peer !== except && peer.readyState === 1) {
      try {
        peer.send(raw)
      } catch {
        /* ignore */
      }
    }
  }
}

function broadcastAll(roomId, raw) {
  broadcast(roomId, raw, undefined)
}

function validateRingOut(roomId, r) {
  if (r.ended) return
  const ids = fighterIds(r)
  const now = Date.now()
  for (const id of ids) {
    if (r.ringOutPending[id]) continue
    if (now < (r.respawnInvulnUntil[id] ?? 0)) continue
    const pose = r.poses[id]
    if (pose && checkFeetEliminated(pose)) {
      r.stocks[id] = Math.max(0, r.stocks[id] - 1)
      if (r.stocks[id] <= 0) {
        r.ringOutPending[id] = false
        const alive = remainingAlive(r)
        if (alive.length === 1) {
          r.ended = true
          const w = alive[0]
          broadcastAll(
            roomId,
            JSON.stringify({
              type: 'authMatchEnd',
              winnerFighterId: w,
              winnerRole: w === 'host' || w === 'guest' ? w : undefined,
              reason: 'ring',
            }),
          )
          return
        }
        broadcastAll(
          roomId,
          JSON.stringify({
            type: 'authFighterEliminated',
            fighterId: id,
            percents: { ...r.percent },
            stocks: { ...r.stocks },
            ...legacyPercents(r),
            ...legacyStocks(r),
          }),
        )
        return
      }
      r.ringOutPending[id] = true
      broadcastAll(
        roomId,
        JSON.stringify({
          type: 'authStockKO',
          victimFighterId: id,
          victimRole: id === 'host' || id === 'guest' ? id : undefined,
          percents: { ...r.percent },
          stocks: { ...r.stocks },
          ...legacyPercents(r),
          ...legacyStocks(r),
        }),
      )
      return
    }
  }
}

function validateVoiceShot(roomId, ws, parsed) {
  const r = rooms.get(roomId)
  if (!r || r.ended) return
  const aggressor = ws._vjFighterId
  if (!aggressor || r.stocks[aggressor] === undefined) return

  const ox = dataOx(parsed)
  const shotId = parsed.shotId
  if (typeof ox !== 'number' || typeof shotId !== 'string') return

  const ids = fighterIds(r)
  const tRaw = parsed.chargeT
  const chargeT = typeof tRaw === 'number' ? Math.max(0, Math.min(1, tRaw)) : 0.5
  const shotScaleRaw = parsed.shotScale
  const shotScale = typeof shotScaleRaw === 'number' ? Math.max(0.15, shotScaleRaw) : 1
  if (chargeT < COMBAT.voiceMinChargeToFire - 1e-6) return
  const minF = Math.max(0.01, Math.min(0.99, COMBAT.voiceMinChargeToFire))
  const c = Math.max(minF, Math.min(1, chargeT))
  const t = (c - minF) / (1 - minF + 1e-6)
  const gain = COMBAT.percentGainMin + t * (COMBAT.percentGainMax - COMBAT.percentGainMin)

  const targets = []
  for (const vid of ids) {
    if (vid === aggressor) continue
    if ((r.stocks[vid] ?? 0) <= 0) continue
    if (Date.now() < (r.respawnInvulnUntil[vid] ?? 0)) continue
    let oppPose = r.poses[vid]
    if (!oppPose) oppPose = defaultPose(vid, ids)
    const center = opponentBodyCenterFromPose(oppPose)
    if (center) targets.push({ fighterId: vid, center })
  }

  let sim
  if (targets.length === 1) {
    sim = simulateVoiceShotHit(
      { x: ox, y: parsed.oy, z: parsed.oz },
      { x: parsed.vx, y: parsed.vy, z: parsed.vz },
      targets[0].center,
      shotScale,
    )
    if (!sim.hit) return
    sim = { ...sim, victimFighterId: targets[0].fighterId }
  } else if (targets.length > 1) {
    const ffa = simulateVoiceShotHitFfa(
      { x: ox, y: parsed.oy, z: parsed.oz },
      { x: parsed.vx, y: parsed.vy, z: parsed.vz },
      targets,
      shotScale,
    )
    if (!ffa.hit) return
    sim = ffa
  } else {
    return
  }

  const victim = sim.victimFighterId
  if (Date.now() < (r.respawnInvulnUntil[victim] ?? 0)) return
  if (r.shots.has(shotId)) return
  r.shots.add(shotId)
  if (r.shots.size > 512) r.shots.clear()

  r.percent[victim] = Math.min(999, (r.percent[victim] ?? 0) + gain)

  broadcastAll(
    roomId,
    JSON.stringify({
      type: 'authDamage',
      aggressorFighterId: aggressor,
      victimFighterId: victim,
      aggressorRole: aggressor === 'host' || aggressor === 'guest' ? aggressor : undefined,
      victimRole: victim === 'host' || victim === 'guest' ? victim : undefined,
      dx: sim.dx,
      dz: sim.dz,
      hx: sim.hx,
      hy: sim.hy,
      hz: sim.hz,
      shotId,
      percents: { ...r.percent },
      chargeT,
      percentGain: gain,
      ...legacyPercents(r),
    }),
  )
}

function dataOx(parsed) {
  return typeof parsed.ox === 'number' ? parsed.ox : undefined
}

function relay(sender, raw) {
  const roomId = sender._vjRoom
  if (!roomId) return
  broadcast(roomId, raw, sender)
}

function printLanHints(port) {
  console.log('')
  console.log('[pvp-host] Authoritative dedicated server (listen). Clients set:')
  console.log(`             VITE_PVP_RELAY_URL=ws://127.0.0.1:${port}`)
  console.log('')
  const nets = os.networkInterfaces()
  for (const name of Object.keys(nets)) {
    for (const net of nets[name] || []) {
      if (net.family === 'IPv4' && !net.internal) {
        console.log(`  LAN clients:  ws://${net.address}:${port}`)
      }
    }
  }
  console.log('')
}

const wss = new WebSocketServer({ port: PORT, host: '0.0.0.0' })

wss.on('connection', (ws, req) => {
  let roomId = 'default'
  try {
    const u = new URL(req.url || '/', 'http://localhost')
    roomId = u.searchParams.get('room') || 'default'
  } catch {
    roomId = 'default'
  }

  const r = getOrCreateRoom(roomId)
  r.peers.add(ws)
  ws._vjRoom = roomId

  broadcastPresence(roomId)

  ws.on('message', (data) => {
    const raw = typeof data === 'string' ? data : data.toString()
    let parsed = null
    try {
      parsed = JSON.parse(raw)
    } catch {
      relay(ws, raw)
      return
    }

    const t = parsed?.type
    if (t === 'sessionRoster' && Array.isArray(parsed.fighters)) {
      for (const row of parsed.fighters) {
        const fid = typeof row?.fighterId === 'string' ? row.fighterId : null
        if (fid) ensureFighter(r, fid)
      }
    }
    if (t === 'hello' && parsed.role) {
      const roleOk = parsed.role === 'host' || parsed.role === 'guest' ? parsed.role : undefined
      const fid = typeof parsed.fighterId === 'string' && parsed.fighterId.length > 0 ? parsed.fighterId : roleOk
      ws._vjRole = roleOk
      ws._vjFighterId = fid
      if (fid) ensureFighter(r, fid)
    }

    if (t === 'authRespawn' && ws._vjRole === 'host') {
      const vr = parsed.victimFighterId ?? parsed.victimRole
      if (typeof vr === 'string' && r.stocks[vr] !== undefined) {
        const msRaw = parsed.invulnMs
        const ms =
          typeof msRaw === 'number' && Number.isFinite(msRaw) ? Math.min(120_000, Math.max(0, msRaw)) : 2000
        r.respawnInvulnUntil[vr] = Date.now() + ms
        if (r.ringOutPending[vr]) r.ringOutPending[vr] = false
      }
    }

    if (
      t === 'pose' &&
      ws._vjFighterId &&
      typeof parsed.x === 'number' &&
      typeof parsed.z === 'number'
    ) {
      const fid = ws._vjFighterId
      r.poses[fid] = {
        x: parsed.x,
        z: parsed.z,
        fy: parsed.fy,
        ry: parsed.ry,
      }
      validateRingOut(roomId, r)
    }

    if (t === 'seriesHostBeginNext' && ws._vjRole === 'host') {
      r.ended = false
      r.shots.clear()
      const n = Math.max(1, Math.round(COMBAT.startStocks))
      for (const id of fighterIds(r)) {
        r.percent[id] = 0
        r.stocks[id] = n
        r.ringOutPending[id] = false
        r.respawnInvulnUntil[id] = 0
      }
      return
    }

    relay(ws, raw)

    if (typeof t === 'string' && t.startsWith('banana') && !bananaRelaxedTrustWarned) {
      bananaRelaxedTrustWarned = true
      console.warn(
        '[pvp-host] Banana PvP messages are relayed without dedicated validation (v1). Browser-as-host P2P validates locally.',
      )
    }

    if (t === 'voiceShot') {
      validateVoiceShot(roomId, ws, parsed)
    }
  })

  ws.on('close', () => leaveRoom(ws))
})

console.log(`[pvp-host] listening on 0.0.0.0:${PORT}  (authoritative gameplay)`)
printLanHints(PORT)
