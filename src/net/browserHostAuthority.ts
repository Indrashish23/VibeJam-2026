/**
 * First browser in the match (lobby role `host`) runs the same validations as `scripts/pvp-host.mjs`
 * when WebRTC game channel is up and there is no Node listen relay.
 */

import { gameConfig } from '../gameConfig'
import {
  checkFeetEliminated,
  opponentBodyCenterFromPose,
  simulateVoiceShotHit,
  type PoseLite,
} from './voiceShotSim'

export type AuthBroadcast = (obj: Record<string, unknown>) => void

const defaultPose = (role: 'host' | 'guest'): PoseLite => {
  const spacing = Math.min(6.8, Math.min(gameConfig.groundWidth, gameConfig.groundDepth) * 0.5 - 2.5)
  const fy = 0
  if (role === 'host') return { x: 0, z: spacing, fy, ry: 0 }
  return { x: 0, z: -spacing, fy, ry: Math.PI }
}

export function createBrowserHostAuthority(broadcast: AuthBroadcast) {
  const poses: { host: PoseLite | null; guest: PoseLite | null } = {
    host: null,
    guest: null,
  }
  const scores = { host: 0, guest: 0 }
  const shots = new Set<string>()
  let ended = false

  function ringCheck(): void {
    if (ended) return
    const roles = ['host', 'guest'] as const
    for (const role of roles) {
      const p = poses[role]
      if (p && checkFeetEliminated(p)) {
        ended = true
        const winner = role === 'host' ? 'guest' : 'host'
        broadcast({
          type: 'authMatchEnd',
          winnerRole: winner,
          reason: 'ring',
        })
        return
      }
    }
  }

  return {
    setPose(role: 'host' | 'guest', p: PoseLite): void {
      poses[role] = p
      ringCheck()
    },

    /** @returns whether a new hit was scored (caller may show aggressor FX; host does not echo authDamage back). */
    processVoiceShot(fromRole: 'host' | 'guest', data: Record<string, unknown>): boolean {
      if (ended) return false
      const victim: 'host' | 'guest' = fromRole === 'host' ? 'guest' : 'host'
      let oppPose = poses[victim]
      if (!oppPose) oppPose = defaultPose(victim)

      const oppCenter = opponentBodyCenterFromPose(oppPose)
      if (!oppCenter) return false

      const ox = data.ox
      const oy = data.oy
      const oz = data.oz
      const vx = data.vx
      const vy = data.vy
      const vz = data.vz
      const shotId = data.shotId
      if (typeof ox !== 'number' || typeof shotId !== 'string') return false

      const sim = simulateVoiceShotHit(
        { x: ox, y: oy as number, z: oz as number },
        { x: vx as number, y: vy as number, z: vz as number },
        oppCenter,
      )
      if (!sim.hit) return false
      if (shots.has(shotId)) return false
      shots.add(shotId)
      if (shots.size > 512) shots.clear()

      const key = fromRole
      scores[key] += 1

      broadcast({
        type: 'authDamage',
        aggressorRole: fromRole,
        victimRole: victim,
        dx: sim.dx,
        dz: sim.dz,
        shotId,
        scoreHost: scores.host,
        scoreGuest: scores.guest,
      })

      const cap = Math.round(gameConfig.enemyHitsToWin)
      if (scores[key] >= cap) {
        ended = true
        broadcast({
          type: 'authMatchEnd',
          winnerRole: fromRole,
          reason: 'ko',
        })
      }
      return true
    },

    reset(): void {
      poses.host = null
      poses.guest = null
      scores.host = 0
      scores.guest = 0
      shots.clear()
      ended = false
    },
  }
}
