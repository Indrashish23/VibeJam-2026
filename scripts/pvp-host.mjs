#!/usr/bin/env node
/**
 * Authoritative listen server (Quake-style dedicated host).
 * Anyone can run `npm run pvp:listen` — clients point `VITE_PVP_RELAY_URL` (or session URL) here.
 *
 * - Relays JSON like a dumb pipe (voice blobs, poses, hello).
 * - Validates voice-shot ballistics against last known rival pose; emits authDamage / authMatchEnd only from here.
 * - Validates ring-out from pose packets.
 *
 * Usage: npm run pvp:listen
 * Env: PVP_LISTEN_PORT (default 8765)
 */

import os from 'node:os'
import { WebSocketServer } from 'ws'
import { COMBAT } from './lib/combatConstants.mjs'
import {
  checkFeetEliminated,
  opponentBodyCenterFromPose,
  simulateVoiceShotHit,
} from './lib/voiceShotSim.mjs'

const PORT = Number(process.env.PVP_LISTEN_PORT || 8765)

/** @typedef {{ peers: Set<import('ws').WebSocket>, poses: { host: object | null, guest: object | null }, scores: { host: number, guest: number }, shots: Set<string>, ended: boolean }} Room */

/** @type {Map<string, Room>} */
const rooms = new Map()

function getOrCreateRoom(roomId) {
  let r = rooms.get(roomId)
  if (!r) {
    r = {
      peers: new Set(),
      poses: { host: null, guest: null },
      scores: { host: 0, guest: 0 },
      shots: new Set(),
      ended: false,
    }
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

function defaultPose(role) {
  const spacing = Math.min(6.8, Math.min(COMBAT.groundWidth, COMBAT.groundDepth) * 0.5 - 2.5)
  const fy = 0
  if (role === 'host') return { x: 0, z: spacing, fy, ry: 0 }
  return { x: 0, z: -spacing, fy, ry: Math.PI }
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
  const roles = /** @type {const} */ (['host', 'guest'])
  for (const role of roles) {
    const pose = r.poses[role]
    if (pose && checkFeetEliminated(pose)) {
      r.ended = true
      const winner = role === 'host' ? 'guest' : 'host'
      const payload = JSON.stringify({
        type: 'authMatchEnd',
        winnerRole: winner,
        reason: 'ring',
      })
      broadcastAll(roomId, payload)
      return
    }
  }
}

function validateVoiceShot(roomId, ws, raw, data) {
  const r = rooms.get(roomId)
  if (!r || r.ended) return
  const aggressor = ws._vjRole
  if (aggressor !== 'host' && aggressor !== 'guest') return

  const victim = aggressor === 'host' ? 'guest' : 'host'
  let oppPose = r.poses[victim]
  if (!oppPose) oppPose = defaultPose(victim)

  const oppCenter = opponentBodyCenterFromPose(oppPose)
  if (!oppCenter) return

  const ox = data.ox
  const oy = data.oy
  const oz = data.oz
  const vx = data.vx
  const vy = data.vy
  const vz = data.vz
  const shotId = data.shotId

  if (typeof ox !== 'number' || typeof shotId !== 'string') return

  const sim = simulateVoiceShotHit(
    { x: ox, y: oy, z: oz },
    { x: vx, y: vy, z: vz },
    oppCenter,
  )

  if (!sim.hit) return
  if (r.shots.has(shotId)) return
  r.shots.add(shotId)
  if (r.shots.size > 512) r.shots.clear()

  const key = aggressor === 'host' ? 'host' : 'guest'
  r.scores[key] += 1

  const dmg = JSON.stringify({
    type: 'authDamage',
    aggressorRole: aggressor,
    victimRole: victim,
    dx: sim.dx,
    dz: sim.dz,
    shotId,
    scoreHost: r.scores.host,
    scoreGuest: r.scores.guest,
  })
  broadcastAll(roomId, dmg)

  const cap = COMBAT.enemyHitsToWin
  if (r.scores[key] >= cap) {
    r.ended = true
    broadcastAll(
      roomId,
      JSON.stringify({
        type: 'authMatchEnd',
        winnerRole: aggressor,
        reason: 'ko',
      }),
    )
  }
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
    if (t === 'hello' && parsed.role) {
      ws._vjRole = parsed.role === 'host' || parsed.role === 'guest' ? parsed.role : undefined
    }

    if (t === 'pose' && ws._vjRole && typeof parsed.x === 'number' && typeof parsed.z === 'number') {
      const role = ws._vjRole
      r.poses[role] = {
        x: parsed.x,
        z: parsed.z,
        fy: parsed.fy,
        ry: parsed.ry,
      }
      validateRingOut(roomId, r)
    }

    relay(ws, raw)

    if (t === 'voiceShot') {
      validateVoiceShot(roomId, ws, raw, parsed)
    }
  })

  ws.on('close', () => leaveRoom(ws))
})

console.log(`[pvp-host] listening on 0.0.0.0:${PORT}  (authoritative gameplay)`)
printLanHints(PORT)
