/**
 * Must stay aligned with `src/gameConfig.ts` defaults for authoritative simulation.
 */
export const COMBAT = {
  eyeHeight: 1.55,
  punchMaxRange: 18,
  fistGravity: 46,
  fistAirDrag: 2.4,
  fistAscentGravityScale: 0.38,
  punchHitRadius: 0.72,
  botBodyRadius: 0.72,
  /** Same as client: projectileRadius + botBodyRadius * reachMul */
  reachMul: 0.88,
  enemyHitsToWin: 3,
  hitsToWin: 2,
  /** Approximate capsule feet offset (matches BotFighter geometry). */
  feetFromCenterApprox: 0.85,
  blastMargin: 4,
  blastY: -12,
  groundWidth: 52,
  groundDepth: 52,
}
