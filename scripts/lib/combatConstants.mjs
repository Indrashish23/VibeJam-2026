/**
 * Must stay aligned with `src/gameConfig.ts` defaults for authoritative simulation.
 */
export const COMBAT = {
  eyeHeight: 1.55,
  /** 0 = ballistic, 1+ = head hitscan (must match client `gameConfig.voiceProjectileMode`). */
  voiceProjectileMode: 0,
  punchMaxRange: 42,
  fistGravity: 0,
  fistAirDrag: 0,
  fistAscentGravityScale: 0.38,
  punchHitRadius: 0.72,
  botBodyRadius: 0.72,
  /** Same as client: projectileRadius + botBodyRadius * reachMul */
  reachMul: 0.88,
  /** Must match `gameConfig.voiceMinChargeToFire`. */
  voiceMinChargeToFire: 0.36,
  percentGainMin: 4,
  percentGainMax: 22,
  /** Approximate capsule feet offset (matches BotFighter geometry). */
  feetFromCenterApprox: 0.85,
  blastMargin: 12,
  blastY: -12,
  /** Stocks per fighter at match begin / after series reset — mirror `gameConfig.startStocks`. */
  startStocks: 2,
  groundWidth: 52,
  groundDepth: 52,
}
