/** Live-tunable gameplay values (`T` or `−` opens the dev panel). Mutate properties at runtime; defaults used for reset. */

export const defaultGameConfig = {
  moveSpeed: 100,
  /** Legacy (unused): sprint removed; Shift now triggers dash. */
  sprintSpeedMul: 1.48,
  damping: 8,
  eyeHeight: 1.55,
  mouseSensitivity: 1,

  groundWidth: 52,
  groundDepth: 52,

  cameraFov: 75,
  cameraNear: 0.1,
  cameraFar: 650,
  /** Pixel pass cell size (higher = chunkier retro pixels). */
  retroPixelScale: 2.35,
  /** Pixel pass edge hint strength (subtle retro contour). */
  retroEdgeStrength: 0.12,

  ambientIntensity: 0.5,
  sunIntensity: 1.05,
  movementMaxDelta: 0.1,

  gravity: 42,
  jumpForce: 10,
  jumpCooldownMs: 480,
  playerRadius: 0.38,

  /** Bot hits on you before you lose (ring-out still applies). */
  hitsToWin: 2,
  /** Legacy Tweaks; win is ring-out / launch percent, not hit count. */
  enemyHitsToWin: 3,
  punchMaxRange: 42,
  /** Initial fist speed along aim; straight-line projectile (no gravity when fistGravity is 0). */
  punchProjectileSpeed: 56,
  /** Horizontal air drag on fists; 0 = no drag (straight line). */
  fistAirDrag: 0,
  /**
   * Unused when fistGravity is 0; kept for Tweaks compatibility.
   */
  fistAscentGravityScale: 0.38,
  /** Gravity on flying fists; 0 = constant-velocity line in aim direction. */
  fistGravity: 0,
  punchHitRadius: 0.72,
  /** Projectile base size multiplier (visual + hit radius baseline). */
  projectileSizeBase: 1,
  /** Extra projectile size bonus at full charge `t=1` (0.2 = +20%). */
  projectileSizeChargeMaxBonus: 0.2,
  /** Horizontal knockback on player when bot lands a hit (non-parried). */
  knockbackOnPlayer: 26,
  /** Base knock on bot (multiplied by voice `t` lerp). */
  knockbackOnBot: 62,
  /** Legacy: unused; knock uses knockVoice Min/Max. */
  knockRingShot1Mul: 0.2,
  knockRingShot2Mul: 0.5,
  knockRingShot3Mul: 1.2,
  /** At quiet voice (t=0) knock = base × this; at loud (t=1) × that. */
  knockVoiceMinMul: 0.4,
  knockVoiceMaxMul: 1.05,
  /** Legacy Tweaks (unused: percent combat). */
  playerMaxHealth: 100,
  enemyMaxHealth: 100,
  /** Legacy Tweaks (unused: percent combat). */
  voiceDamageMin: 6,
  voiceDamageMax: 18,
  /** PvE: percent added when the bot’s fist hits you. */
  botFistPercentGain: 12,
  /** 0..1: bot fist knock lerp (uses knockVoice min/max). */
  botFistKnockT: 0.52,
  /** 0 = off. Per-second auto shots from the dummy (offline dummy/smart) for testing. */
  dummyTestFiresPerSec: 0,
  /** Speed mult for `dummyTestFiresPerSec` shots (× punchProjectileSpeed). */
  dummyTestShotSpeedMul: 0.9,
  /** If the mic is still blocked, LMB uses this charge (0–1) for a test shot; should be ≥ voiceMinChargeToFire to fire. */
  voiceDryFireT: 0.82,
  /** Minimum charge bar (0–1) before a release spawns a fist. */
  voiceMinChargeToFire: 0.55,
  /** Percent added to victim at minimum valid charge (at voiceMinChargeToFire). */
  percentGainMin: 4,
  /** Percent added at full charge (1). */
  percentGainMax: 22,
  /** Knock scale floor from victim launch percent (at 0%). */
  launchKnockFloor: 0.04,
  /** Multiplier on (percent/100)^exponent for knock scaling. */
  launchKnockScale: 10,
  /** Exponent on normalized percent for launch knock (higher = gentler at low %). */
  launchKnockExponent: 2.15,
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
  /** Shift dash target travel distance in world units (approx with current decay model). */
  dashImpulse: 7,
  /** Additional multiplier on the dash distance target. */
  dashVelocityMul: 1,
  /** Slide velocity decay per second (higher = shorter slide). */
  dashDecay: 12,
  /** Ms cooldown before another Shift dash. */
  dashCooldownMs: 820,
  /** After opponent ring-out (win), wait this many ms before flashing GAME. */
  winRingoutPresentDelayMs: 2000,
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
  /** Speed multiplier at minimum valid voice charge when firing (× punchProjectileSpeed). */
  voiceShotSpeedMinMul: 0.38,
  /** Speed multiplier cap when voice is maxed (× punchProjectileSpeed). */
  voiceShotSpeedMaxMul: 1.35,
  voiceChargeMinRelease: 0.22,
  /** Legacy unused (always fire on release; `t` from charge). */
  voiceChargeFullThreshold: 0,
  /** Scales RMS → charge buildup. */
  voiceChargeSensitivity: 1.85,
  /** × RMS after sensitivity — higher = reach max charge with less shouting. */
  voiceChargeRmsScale: (4.2 / 1.7) * 2.1,
  /** Legacy Tweaks (charge meter no longer uses this). */
  voiceChargeAttack: 14,
  /** Legacy Tweaks. */
  voiceChargeRelease: 6,
  voiceSilenceRmsThreshold: 0.01,
  /** Seconds of quiet mic before charge starts decaying. */
  voiceSilenceBeforeDecaySec: 2,
  /** Charge units per second removed while in decay (after silence delay). */
  voiceChargeDecayPerSec: 0.72,
  /** How fast charge rises at full loudness while LMB held (per second toward 1). */
  voiceChargeRisePerSec: 0.66,
  voiceChargeSilenceDissipate: 1.35,
  voiceChargePeakHoldSec: 0,
  /** Bar shake / highlight when this normalized charge is exceeded. */
  voiceOverloadThreshold: 0.85,
  /** Shooter hit replay: fade gain to zero over this many seconds (capped vs clip length). */
  voiceShooterReplayFadeSec: 1.35,

  /** Max seconds of mic captured per charge (MediaRecorder cap). */
  voiceRecordMaxSec: 10,

  /** Look-down voice shot: min |pitch| (rad); PointerLockControls uses negative x when looking down. */
  voiceLookdownPitchMin: 0.38,
  /** Upward vy impulse when look-down shot boost triggers. */
  voiceLookdownBoostVy: 4.2,
  /** Clamp vy after boost (prevents extreme stacking with jump). */
  voiceLookdownBoostMaxVy: 18,

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
