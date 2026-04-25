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

function percentGainFromCharge(charge: number): number {
  const minF = Math.max(0.01, Math.min(0.99, gameConfig.voiceMinChargeToFire))
  const c = Math.max(minF, Math.min(1, charge))
  const t = (c - minF) / (1 - minF + 1e-6)
  return gameConfig.percentGainMin + t * (gameConfig.percentGainMax - gameConfig.percentGainMin)
}

function startingPercent(): { host: number; guest: number } {
  return { host: 0, guest: 0 }
}

export function createBrowserHostAuthority(broadcast: AuthBroadcast) {
  const poses: { host: PoseLite | null; guest: PoseLite | null } = {
    host: null,
    guest: null,
  }
  let percent = startingPercent()
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

      const tRaw = data.chargeT
      const chargeT =
        typeof tRaw === 'number' ? Math.max(0, Math.min(1, tRaw)) : 0.5
      const shotScaleRaw = data.shotScale
      const shotScale = typeof shotScaleRaw === 'number' ? Math.max(0.15, shotScaleRaw) : 1
      if (chargeT < gameConfig.voiceMinChargeToFire - 1e-6) return false
      const gain = percentGainFromCharge(chargeT)

      const sim = simulateVoiceShotHit(
        { x: ox, y: oy as number, z: oz as number },
        { x: vx as number, y: vy as number, z: vz as number },
        oppCenter,
        shotScale,
      )
      if (!sim.hit) return false
      if (shots.has(shotId)) return false
      shots.add(shotId)
      if (shots.size > 512) shots.clear()

      percent[victim] = Math.min(999, percent[victim] + gain)

      broadcast({
        type: 'authDamage',
        aggressorRole: fromRole,
        victimRole: victim,
        dx: sim.dx,
        dz: sim.dz,
        shotId,
        percentHost: percent.host,
        percentGuest: percent.guest,
        chargeT,
        percentGain: gain,
      })

      return true
    },

    reset(): void {
      poses.host = null
      poses.guest = null
      percent = startingPercent()
      shots.clear()
      ended = false
    },
  }
}
