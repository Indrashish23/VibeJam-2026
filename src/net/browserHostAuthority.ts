/**
 * Session host browser validates ring-out + voice shots (FFA). Mirrors `scripts/pvp-host.mjs`
 * when WebRTC is up and there is no Node listen relay.
 */

import { gameConfig } from '../gameConfig'
import {
  checkFeetEliminated,
  opponentBodyCenterFromPose,
  simulateVoiceShotHitFfa,
  type PoseLite,
} from './voiceShotSim'

export type AuthBroadcast = (obj: Record<string, unknown>) => void

function percentGainFromCharge(charge: number): number {
  const minF = Math.max(0.01, Math.min(0.99, gameConfig.voiceMinChargeToFire))
  const c = Math.max(minF, Math.min(1, charge))
  const t = (c - minF) / (1 - minF + 1e-6)
  return gameConfig.percentGainMin + t * (gameConfig.percentGainMax - gameConfig.percentGainMin)
}

function stockCountAtStart(): number {
  return Math.max(1, Math.round(gameConfig.startStocks))
}

function defaultPoseForIndex(index: number, total: number): PoseLite {
  const spacing = Math.min(6.8, Math.min(gameConfig.groundWidth, gameConfig.groundDepth) * 0.5 - 2.5)
  const fy = 0
  const t = (index / Math.max(1, total)) * Math.PI * 2
  const x = Math.sin(t) * spacing * 0.85
  const z = Math.cos(t) * spacing * 0.85
  const ry = Math.atan2(-x, -z)
  return { x, z, fy, ry }
}

function snapshotPercents(percent: Record<string, number>): Record<string, number> {
  return { ...percent }
}

function snapshotStocks(stocks: Record<string, number>): Record<string, number> {
  return { ...stocks }
}

function legacyTwoPlayerPercents(fighterIds: readonly string[], percent: Record<string, number>): {
  percentHost?: number
  percentGuest?: number
} {
  if (fighterIds.length !== 2) return {}
  const [a, b] = fighterIds
  if ((a === 'host' && b === 'guest') || (a === 'guest' && b === 'host')) {
    return {
      percentHost: percent.host ?? 0,
      percentGuest: percent.guest ?? 0,
    }
  }
  return {}
}

function legacyTwoPlayerStocks(stocks: Record<string, number>): {
  stocksHost?: number
  stocksGuest?: number
} {
  if ('host' in stocks && 'guest' in stocks) {
    return { stocksHost: stocks.host, stocksGuest: stocks.guest }
  }
  return {}
}

function remainingCompetitors(stocks: Record<string, number>): string[] {
  return Object.entries(stocks)
    .filter(([, n]) => n > 0)
    .map(([id]) => id)
}

/**
 * @param fighterIds ordered roster (same order as spawn slots); must be unique strings.
 */
export function createFfaBrowserAuthority(fighterIds: readonly string[], broadcast: AuthBroadcast) {
  const ids = [...fighterIds]
  if (ids.length < 2) throw new Error('[ffaAuthority] need at least 2 fighters')

  const poses: Record<string, PoseLite | null> = Object.fromEntries(ids.map((id) => [id, null]))
  let percent: Record<string, number> = Object.fromEntries(ids.map((id) => [id, 0]))
  const shots = new Set<string>()
  let ended = false
  const n0 = stockCountAtStart()
  let stocks: Record<string, number> = Object.fromEntries(ids.map((id) => [id, n0]))
  const ringOutPending: Record<string, boolean> = Object.fromEntries(ids.map((id) => [id, false]))
  const respawnInvulnUntil: Record<string, number> = Object.fromEntries(ids.map((id) => [id, 0]))

  function defaultPose(id: string): PoseLite {
    const ix = ids.indexOf(id)
    return defaultPoseForIndex(ix >= 0 ? ix : 0, ids.length)
  }

  function maybeEndMatch(): void {
    const alive = remainingCompetitors(stocks)
    if (alive.length === 1) {
      ended = true
      broadcast({
        type: 'authMatchEnd',
        winnerFighterId: alive[0],
        ...legacyWinnerRole(alive[0]),
      })
    }
  }

  function legacyWinnerRole(winnerId: string): { winnerRole?: 'host' | 'guest' } {
    if (ids.length === 2 && winnerId === 'host') return { winnerRole: 'host' }
    if (ids.length === 2 && winnerId === 'guest') return { winnerRole: 'guest' }
    return {}
  }

  function ringCheck(): void {
    if (ended) return
    const now = Date.now()
    for (const id of ids) {
      if (ringOutPending[id]) continue
      if (now < respawnInvulnUntil[id]) continue
      const p = poses[id]
      if (p && checkFeetEliminated(p)) {
        stocks[id] = Math.max(0, stocks[id] - 1)
        if (stocks[id] <= 0) {
          ringOutPending[id] = false
          maybeEndMatch()
          if (ended) return
          broadcast({
            type: 'authFighterEliminated',
            fighterId: id,
            percents: snapshotPercents(percent),
            stocks: snapshotStocks(stocks),
            ...legacyTwoPlayerPercents(ids, percent),
            ...legacyTwoPlayerStocks(stocks),
          })
          return
        }
        ringOutPending[id] = true
        broadcast({
          type: 'authStockKO',
          victimFighterId: id,
          victimRole: ids.length === 2 ? (id === 'host' || id === 'guest' ? id : undefined) : undefined,
          percents: snapshotPercents(percent),
          stocks: snapshotStocks(stocks),
          ...legacyTwoPlayerPercents(ids, percent),
          ...legacyTwoPlayerStocks(stocks),
        })
        return
      }
    }
  }

  return {
    /** Full roster this authority was built for. */
    fighterIds: ids,

    setPose(fighterId: string, p: PoseLite): void {
      if (!ids.includes(fighterId)) return
      poses[fighterId] = p
      ringCheck()
    },

    getLastPose(fighterId: string): PoseLite | null {
      return poses[fighterId] ?? null
    },

    notifyRespawnApplied(fighterId: string): void {
      if (ringOutPending[fighterId]) ringOutPending[fighterId] = false
    },

    setRespawnInvulnUntil(fighterId: string, untilMs: number): void {
      if (!ids.includes(fighterId)) return
      respawnInvulnUntil[fighterId] = untilMs
    },

    processVoiceShot(fromFighterId: string, data: Record<string, unknown>): boolean {
      if (ended || !ids.includes(fromFighterId)) return false

      const ox = data.ox
      const oy = data.oy
      const oz = data.oz
      const vx = data.vx
      const vy = data.vy
      const vz = data.vz
      const shotId = data.shotId
      if (typeof ox !== 'number' || typeof shotId !== 'string') return false

      const tRaw = data.chargeT
      const chargeT =
        typeof tRaw === 'number' ? Math.max(0, Math.min(1, tRaw)) : 0.5
      const shotScaleRaw = data.shotScale
      const shotScale = typeof shotScaleRaw === 'number' ? Math.max(0.15, shotScaleRaw) : 1
      if (chargeT < gameConfig.voiceMinChargeToFire - 1e-6) return false
      const gain = percentGainFromCharge(chargeT)

      const targets = ids
        .filter((id) => id !== fromFighterId && stocks[id] > 0)
        .map((id) => {
          let oppPose = poses[id]
          if (!oppPose) oppPose = defaultPose(id)
          const c = opponentBodyCenterFromPose(oppPose)
          return c ? { fighterId: id, center: c } : null
        })
        .filter((x): x is { fighterId: string; center: { x: number; y: number; z: number } } => x !== null)

      if (targets.length === 0) return false

      const sim = simulateVoiceShotHitFfa(
        { x: ox, y: oy as number, z: oz as number },
        { x: vx as number, y: vy as number, z: vz as number },
        targets,
        shotScale,
      )
      if (!sim.hit) return false
      const victim = sim.victimFighterId
      if (Date.now() < respawnInvulnUntil[victim]) return false
      if (shots.has(shotId)) return false
      shots.add(shotId)
      if (shots.size > 512) shots.clear()

      percent[victim] = Math.min(999, (percent[victim] ?? 0) + gain)

      broadcast({
        type: 'authDamage',
        aggressorFighterId: fromFighterId,
        victimFighterId: victim,
        aggressorRole:
          ids.length === 2 && (fromFighterId === 'host' || fromFighterId === 'guest')
            ? fromFighterId
            : undefined,
        victimRole:
          ids.length === 2 && (victim === 'host' || victim === 'guest') ? victim : undefined,
        dx: sim.dx,
        dz: sim.dz,
        hx: sim.hx,
        hy: sim.hy,
        hz: sim.hz,
        shotId,
        percents: snapshotPercents(percent),
        chargeT,
        percentGain: gain,
        ...legacyTwoPlayerPercents(ids, percent),
      })

      return true
    },

    reset(): void {
      for (const id of ids) {
        poses[id] = null
        percent[id] = 0
        stocks[id] = n0
        ringOutPending[id] = false
        respawnInvulnUntil[id] = 0
      }
      shots.clear()
      ended = false
    },
  }
}

export type FfaBrowserAuthority = ReturnType<typeof createFfaBrowserAuthority>

/** @deprecated Use {@link createFfaBrowserAuthority} with `['host','guest']`. */
export function createBrowserHostAuthority(broadcast: AuthBroadcast) {
  return createFfaBrowserAuthority(['host', 'guest'], broadcast)
}
