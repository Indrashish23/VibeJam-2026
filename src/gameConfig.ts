/** Live-tunable gameplay values (`T` or `−` opens the dev panel). Mutate properties at runtime; defaults used for reset. */

export const defaultGameConfig = {
  moveSpeed: 24,
  damping: 8,
  eyeHeight: 1.55,
  mouseSensitivity: 1,

  groundWidth: 52,
  groundDepth: 52,

  cameraFov: 75,
  cameraNear: 0.1,
  cameraFar: 650,

  ambientIntensity: 0.5,
  sunIntensity: 1.05,
  movementMaxDelta: 0.1,

  gravity: 42,
  jumpForce: 10,
  jumpCooldownMs: 2500,
  playerRadius: 0.38,

  /** Bot hits on you before you lose (ring-out still applies). */
  hitsToWin: 2,
  /** Landed hits on the enemy required to KO them (your win condition). */
  enemyHitsToWin: 3,
  /** Ms before impact: parry counts if Q pressed within this window of hit resolution. */
  parryWindowMs: 200,
  punchMaxRange: 18,
  /** Initial fist speed along aim (rocket launch); air drag slows horizontal motion over time. */
  punchProjectileSpeed: 92,
  /** Horizontal air drag on fists (higher = faster slowdown). Vertical uses gravity only. */
  fistAirDrag: 2.4,
  /**
   * While the fist is still moving upward (vel.y positive), gravity is scaled by this.
   * Lower = straighter vertical travel before the arc drops at the apex.
   */
  fistAscentGravityScale: 0.38,
  /** Gravity on flying fists (world units/s²), after ascent scale; full value on descent. */
  fistGravity: 46,
  punchHitRadius: 0.72,
  /** Horizontal knockback on player when bot lands a hit (non-parried). */
  knockbackOnPlayer: 26,
  /** Knockback impulse on bot for non-finisher hits (first hit — strong push). */
  knockbackOnBot: 62,
  /** Horizontal knock decay while tumbling from a hit (lower = flies farther before sliding). */
  knockHurtAirDrag: 2.35,
  /** Ms grounded “down” phase before bot regains movement after a knockback. */
  botKnockRecoverMs: 420,
  /** Same for player after they land from bot knockback. */
  playerKnockRecoverMs: 380,
  /** Vertical boost on player when bot punch connects (hurt flight). */
  playerHurtVyBoost: 6.2,
  /** XZ impulse scale for player hurt flight (uses knockbackOnPlayer). */
  playerHurtKnockMul: 0.82,
  /** Invulnerability after player stand-up recover (ms) — golden screen shine. */
  playerPostKnockInvulnMs: 1500,
  /** Peak camera shake amplitude when your fist connects (world units). */
  hitScreenShake: 0.22,
  /** Peak opacity for white hit flash overlay (0–1). */
  hitFlashOpacity: 0.82,
  /** PvP: camera shake when your authoritative shot connects (host applies locally; guest via message). */
  pvpAggressorHitShake: 0.12,
  /** PvP: flash opacity when your authoritative shot connects. */
  pvpAggressorHitFlash: 0.44,
  /**
   * PvP: knock multiplier when another authoritative hit lands while already hurt / invuln.
   * Keeps combos readable without stacking full impulse every frame.
   */
  pvpAuthComboKnockMul: 0.76,
  dashImpulse: 52,
  /** Multiplier with dashImpulse for horizontal slide velocity (units/s scale). */
  dashVelocityMul: 0.46,
  /** Dash velocity decay per second (lower = slide lasts longer). */
  dashDecay: 9.2,
  dashCooldownMs: 950,
  dashDurationMs: 145,
  /** Outside platform half-extent + this (XZ) or below yKill = blast. */
  blastMargin: 4,
  /** Fall below this Y on blast zone (death plane). */
  blastY: -12,
  botBodyRadius: 0.72,
  botPunchRange: 3.8,
  botHitRadius: 0.95,
  /** Winning hit: horizontal launch — fling off the stage (punch direction). */
  winFinisherKnockXZ: 208,
  /** Winning hit: small vertical pop — mostly flies back along punch line. */
  winFinisherVy: 26,
  /** How long crossed forearms stay visible after Q (parry). */
  parryGuardVisibleMs: 420,

  /** Speed multiplier at minimum valid voice charge when firing (× punchProjectileSpeed). */
  voiceShotSpeedMinMul: 0.38,
  /** Speed multiplier cap when voice is maxed (× punchProjectileSpeed). */
  voiceShotSpeedMaxMul: 1.35,
  /** Normalized charge (0–1) required before release counts as a shot. */
  voiceChargeMinRelease: 0.22,
  /** Scales RMS → charge buildup. */
  voiceChargeSensitivity: 1.35,
  /** × RMS after sensitivity — higher = reach max charge with less shouting. */
  voiceChargeRmsScale: (4.2 / 1.7) * 1.85,
  /** Attack smoothing while charging (higher = meter follows input faster). */
  voiceChargeAttack: 14,
  /** When not charging: smoothing toward quiet (higher = faster decay). */
  voiceChargeRelease: 6,
  /** Above this normalized charge the UI bar shakes (overload). */
  voiceOverloadThreshold: 1.02,
  /** Shooter hit replay: fade gain to zero over this many seconds (capped vs clip length). */
  voiceShooterReplayFadeSec: 1.35,

  /** Voice shots per round; `0` = unlimited. */
  voiceShotAmmoMax: 0,

  /** Proximity-style hit audio: distance at which rolloff starts (world units). */
  voiceHitRefDistance: 5,
  voiceHitMaxDistance: 96,
  voiceHitRolloff: 1.28,
} as const

export type GameConfigKey = keyof typeof defaultGameConfig

export const gameConfig = { ...defaultGameConfig } as Record<GameConfigKey, number>

export function resetGameConfig(): void {
  const k = Object.keys(defaultGameConfig) as GameConfigKey[]
  for (const key of k) {
    gameConfig[key] = defaultGameConfig[key]
  }
}
