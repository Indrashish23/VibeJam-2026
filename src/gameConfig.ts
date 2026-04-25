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

  gravity: 38,
  jumpForce: 25,
  jumpCooldownMs: 480,
  /** How many extra mid-air jumps you get per landing cycle (1 = double jump). */
  airJumpsMax: 1,
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
  fistAscentGravityScale: 0.08,
  /** Gravity on flying fists; 0 = constant-velocity line in aim direction. */
  fistGravity: 0,
  punchHitRadius: 0.72,
  /** Projectile base size multiplier (visual + hit radius baseline). */
  projectileSizeBase: 1.15,
  /** Extra projectile size bonus at full charge `t=1` (0.2 = +20%, 1 = +100%). */
  projectileSizeChargeMaxBonus: 0.57,
  /** Horizontal knockback on player when bot lands a hit (non-parried). */
  knockbackOnPlayer: 20,
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
  dummyTestFiresPerSec: 1,
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
  knockHurtAirDrag: 1.42,
  /** Scales initial hurt-knock impulse (lower = gentler launch speed, tune with knockHurtAirDrag for distance). */
  knockLaunchImpulseMul: 0.62,
  /** Victim launch % above this (0–1) applies knockHighPctSpeedMul to incoming knock speed. */
  knockHighPctVictimThreshold: 0.6,
  /** Extra multiplier on knock speed when victim is above knockHighPctVictimThreshold (e.g. 0.6 = softer hits at high %). */
  knockHighPctSpeedMul: 0.6,
  /** Air strafe strength on hurt knock (world velocity push per second at full input, scaled by air control). */
  knockAirStrafeAccel: 26,
  /** Full air control of knock drift at 0% victim launch; linearly fades to 0 by knockAirControlFadePct (percent). */
  knockAirControlFadePct: 80,
  /** Full-screen white flash duration when you take a hit (ms). */
  hitVictimWhiteFlashMs: 480,
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
  blastMargin: 12,
  /** When 1, draw a green ring-out boundary loop on the deck (Tweaks → Arena). */
  showBlastBounds: 0,
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
  voiceShotSpeedMinMul: 0.24,
  /** Speed multiplier cap when voice is maxed (× punchProjectileSpeed). */
  voiceShotSpeedMaxMul: 1.56,
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

  /**
   * PlayerCamera (FPS rig) — tunables for placing the camera inside the monkey
   * head and where the projectile leaves the face. The camera position itself
   * is `camera.position`; these add an extra offset from the player position so
   * you can dial the head/mouth alignment without recompiling.
   *
   * pcAvatarFwd/Side: shift the rendered monkey body relative to the camera
   * (positive forward pushes the body in front of the camera; usually you want
   * a small negative value so when you look down you can see your own torso).
   */
  pcAvatarYOffset: 0,
  pcAvatarForward: -0.18,
  pcAvatarSide: 0,
  /** Multiplier on top of the auto-fit scale (which sizes the monkey to the player capsule). 1 = exact capsule fit. */
  pcAvatarScale: 1,
  /** If 1, hide bones whose names match /head/i so the local model doesn't clip the camera. */
  pcHideHead: 1,

  /** Mouth muzzle offset relative to the camera position (forward / up / side, in world meters). */
  pcMouthForward: 0.45,
  pcMouthHeight: -0.37,
  pcMouthSide: 0,
  /** Camera height bias from the default eye height (negative lowers, positive raises). */
  pcCameraHeightBias: -0.4,
  /** Yaw correction applied to the monkey root so its forward axis matches gameplay yaw (rad). */
  pcAvatarYawOffset: Math.PI,
  /** Model-space translation (m) along local right (X), up (Y), forward (Z) after body forward/side offsets. */
  pcModelTransX: 0,
  pcModelTransY: 0,
  pcModelTransZ: 0,
  /** Extra model pitch (X) and yaw trim (Y) in radians; applied in YXZ order on top of look yaw + `pcAvatarYawOffset`. */
  pcModelRotX: 0,
  pcModelRotY: 0,

  /**
   * Shared character collision capsule (player + foe use the same radius/height/offset).
   * `pcCollisionView` toggles red wireframe capsules for both; underlying move physics still uses `playerRadius`.
   */
  pcCollisionView: 0,
  pcCapsuleRadius: 0.75,
  pcCapsuleHeight: 0.95,
  pcCapsuleOffsetY: 0,

  /**
   * EnemyCamera (FPS rig for opponent / dummy monkey) — independent knobs for tuning the enemy's avatar
   * placement and debug capsule. Defaults are chosen so existing gameplay looks identical until tweaked.
   */
  ecAvatarYOffset: 0,
  ecAvatarForward: 0,
  ecAvatarSide: 0,
  ecAvatarScale: 1,
  /**
   * Yaw correction for the enemy monkey in root-local space (rad). Default 0: root already faces the target;
   * the previous default π made the dummy often appear backward; use the tweaks panel to adjust.
   */
  ecAvatarYawOffset: 0,
  /** Extra model translation (m) in bot root local space: right (X), up (Y), forward (Z). */
  ecModelTransX: 0,
  ecModelTransY: -1.01,
  ecModelTransZ: 0,
  /** Extra model pitch (X) and yaw trim (Y) on the monkey wrap (rad), applied in YXZ order. */
  ecModelRotX: 0,
  ecModelRotY: 0,

  /**
   * Stunned hit VFX (see `public/ui/` stars): radial distance from screen center uses
   * `minDim × (0.22…0.48) × this`. Higher = stars sit farther out (more spread).
   */
  stunnedStarSpreadMul: 1.38,
  /**
   * Multiplies seconds per full star spin (base random ~0.42–0.97s). Higher = slower rotation.
   */
  stunnedStarSpinMul: 2.15,
  /** Multiplies randomized star graphic width (base ~72–220px). */
  stunnedStarScaleMul: 1.02,

  /** Debug Room: when 1, slider edits do NOT trigger a round reset; teleports you + dummy to a side arena. */
  debugRoomActive: 0,
} as const

export type GameConfigKey = keyof typeof defaultGameConfig

export const gameConfig = { ...defaultGameConfig } as Record<GameConfigKey, number>

export function resetGameConfig(): void {
  const k = Object.keys(defaultGameConfig) as GameConfigKey[]
  for (const key of k) {
    gameConfig[key] = defaultGameConfig[key]
  }
}
