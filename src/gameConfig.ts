/** Live-tunable gameplay values (`T` or `−` opens the dev panel). Mutate properties at runtime; defaults used for reset. */

export const defaultGameConfig = {
  moveSpeed: 50,
  damping: 8,
  eyeHeight: 1.55,
  mouseSensitivity: 1,

  groundWidth: 52,
  groundDepth: 52,

  /** 1 = hide gameplay HUD overlays (percent, charge bar, crosshair, mp code/toast); Tweaks stays usable. */
  hideGameHud: 0,

  cameraFov: 75,
  cameraNear: 0.1,
  cameraFar: 650,
  /** Pixel pass cell size (higher = chunkier retro pixels). */
  retroPixelScale: 2.35,
  /** Pixel pass edge hint strength (subtle retro contour). */
  retroEdgeStrength: 0.12,
  /** 0 = skip cel/toon post-pass; 1 = apply cel outline pass after output. */
  celShadeEnabled: 0,
  /** Cel post-pass color quantization bands (higher = smoother, lower = flatter toon steps). */
  celShadeLevels: 5,
  /** Cel post-pass local-contrast threshold for black outlines. */
  celOutlineThreshold: 0.19,
  /** Cel post-pass edge softness around threshold. */
  celOutlineSoftness: 0.1,
  /** Cel post-pass black outline intensity (0 = off). */
  celOutlineStrength: 1,
  /** 0 = skip post dither pass; 1 = apply after cel (or after output if cel off). */
  postDitherEnabled: 1,
  /** Post dither strength 0–1 (maps to shader; higher = grainier / more retro crunch). */
  postDitherStrength: 0.32,
  /** Launch % at which danger vignette, smoke, and red tint begin (local player). */
  dangerFxStartPercent: 50,
  /** Skybox base color channels (0–1) for the procedural sky dome. */
  skyboxColorR: 0.14,
  skyboxColorG: 0.58,
  skyboxColorB: 0.43,
  /** Clouds: threshold where noise starts showing clouds (higher = fewer clouds). */
  skyCloudCoverage: 0.52,
  /** Clouds: softness of cloud edges in the procedural mask. */
  skyCloudSoftness: 0.04,
  /** Clouds: noise frequency scale (higher = smaller/more clouds). */
  skyCloudScale: 2.9,
  /** Clouds: advection speed across the dome. */
  skyCloudSpeed: 0.022,
  /** Clouds: blend strength over the base sky color. */
  skyCloudOpacity: 0.22,

  /** Fill light; keep low so the directional sun reads harsh against the skybox. */
  ambientIntensity: 10,
  /** Key directional sun strength (shadow caster). */
  sunIntensity: 1,
  /** 1 = force unlit materials (ignores scene lighting) for flat readability/debugging. */
  lightingUnlitMode: 0,
  movementMaxDelta: 0.1,

  gravity: 38,
  jumpForce: 25,
  jumpCooldownMs: 480,
  /** How many extra mid-air jumps you get per landing cycle (1 = double jump). */
  airJumpsMax: 1,
  /**
   * Projectile delivery (Gameplay panel dropdown + optional slider copy).
   * 0 = ballistic cube, 1 = instant ray / “head scan” from mouth, 2 = ray from camera (eye).
   */
  voiceProjectileMode: 0,
  /** Camera shake peak when you jump (world units; stacks with hit shake via max). */
  jumpFxShake: 0,
  /** Brief white overlay strength on jump (0–1); separate from punch hit-flash. */
  jumpFxWhiteFlash: 0,
  playerRadius: 0.38,

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
  /** Converts horizontal knock impulse into upward vy (pop when hurt; tune with capsule slide). */
  knockVictimLiftMul: 0.52,
  /** Extra vy when the shot connects from below you (uses aim vector Y from shot → victim). */
  knockVictimBelowAimMul: 0.62,
  /** Extra bot vy from knock strength (launch arc vs sliding on the deck). */
  knockBotVertBoostMul: 0.4,
  /** Extra bot vy when the shot is from below (normalized fist→body Y, × strength). */
  knockBotBelowAimMul: 0.58,
  /** Base knock on bot (multiplied by voice `t` lerp). */
  knockbackOnBot: 62,
  /** At quiet voice (t=0) knock = base × this; at loud (t=1) × that. */
  knockVoiceMinMul: 0.4,
  knockVoiceMaxMul: 1.05,
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
  voiceMinChargeToFire: 0.36,
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
  hitScreenShake: 0.54,
  /** Peak opacity for white hit flash overlay (0–1). */
  hitFlashOpacity: 0.92,
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
  blastY: -38,
  botBodyRadius: 0.72,
  botPunchRange: 3.8,
  botHitRadius: 0.95,
  /** Smart bot: preferred spacing around the player before switching to flanking. */
  botSmartPreferredRange: 5.8,
  /** Smart bot: half-band around preferred range considered "in ring". */
  botSmartRangeBand: 1.25,
  /** Smart bot: if closer than this, prioritize retreat. */
  botSmartRetreatRange: 3.1,
  /** Smart bot movement speed as multiplier of player move speed. */
  botSmartMoveSpeedMul: 0.52,
  /** Smart bot approach wobble/flank blend while closing distance. */
  botSmartApproachFlankBias: 0.38,
  /** Smart bot: attack window as multiplier of botPunchRange. */
  botSmartAttackRangeMul: 1.75,
  /** Smart bot: telegraph/aim wind-up before firing (ms). */
  botSmartAimMs: 340,
  /** Smart bot: cooldown after firing (ms). */
  botSmartRecoverMs: 420,
  /** Smart bot: minimum time between shots (ms). */
  botSmartShotCooldownMs: 1550,
  /** Smart bot: default turn speed (rad/s). */
  botSmartTurnRate: 9.8,
  /** Smart bot: faster turn speed while aiming (rad/s). */
  botSmartAimTurnRate: 14,
  /** Smart bot: shot speed range independent of player voice ranges. */
  botSmartShotSpeedMinMul: 0.34,
  botSmartShotSpeedMaxMul: 1.12,
  /** Smart bot: mark as stuck if actual movement drops below expected ratio. */
  botSmartStuckMoveRatio: 0.22,
  /** Smart bot: time under stuck threshold before forcing escape (ms). */
  botSmartStuckMs: 300,
  /** Smart bot: duration of forced tangent escape (ms). */
  botSmartUnstuckMs: 360,
  /** Local bot animation: speedN threshold for running clip. */
  botSmartRunAnimThreshold: 0.14,
  /** Winning hit: horizontal launch — fling off the stage (punch direction). */
  winFinisherKnockXZ: 208,
  /** Winning hit: small vertical pop — mostly flies back along punch line. */
  winFinisherVy: 26,
  /** Speed multiplier at minimum valid voice charge when firing (× punchProjectileSpeed). */
  voiceShotSpeedMinMul: 0.24,
  /** Speed multiplier cap when voice is maxed (× punchProjectileSpeed). */
  voiceShotSpeedMaxMul: 1.56,
  /** Scales RMS → charge buildup. */
  voiceChargeSensitivity: 1.85,
  /** × RMS after sensitivity — higher = reach max charge with less shouting. */
  voiceChargeRmsScale: (4.2 / 1.7) * 2.1,
  voiceSilenceRmsThreshold: 0.01,
  /** Seconds of quiet mic before charge starts decaying. */
  voiceSilenceBeforeDecaySec: 2,
  /** Charge units per second removed while in decay (after silence delay). */
  voiceChargeDecayPerSec: 0.72,
  /** How fast charge rises at full loudness while LMB held (per second toward 1). */
  voiceChargeRisePerSec: 0.66,
  /** Bar shake / highlight when this normalized charge is exceeded. */
  voiceOverloadThreshold: 0.85,
  /** Shooter hit replay: fade gain to zero over this many seconds (capped vs clip length). */
  voiceShooterReplayFadeSec: 1.35,
  /**
   * Web Audio `playbackRate` for mic clips on **hit / replay delivery** (1 = original speed & pitch;
   * higher = faster + higher “chipmunk” pitch). Does not affect live monitoring.
   */
  voiceDeliveryPlaybackRate: 1.64,
  /**
   * Linear gain on Web Audio playback of voice clips on hit / spatial / replay (1 = unity;
   * raise to hear shots over SFX; very high may clip).
   */
  voiceClipPlaybackGainMul: 1.45,
  /**
   * Extra gain multiplier when you are the **victim** and hear the opponent’s shot
   * spatialized at the hit (PvP; stacks × `voiceClipPlaybackGainMul`).
   */
  voiceClipVictimReceiveGainMul: 2,

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

  /**
   * Online PvP: minimum seconds between outgoing pose sync packets. Lower = snappier authoritative
   * hit checks vs moving targets (more traffic). Default ~30 Hz.
   */
  pvpPoseSendIntervalSec: 1 / 30,

  /**
   * Experimental pistol/magazine mode toggle. When 1, RMB-hold-to-shout fills the magazine
   * (`voiceMagazineSize` rounds), and LMB clicks fire one pre-loaded snippet per click without
   * recharging. Recharge is only allowed when the magazine is empty. 0 = legacy charge-and-release.
   *
   * Pistol-only tweaks below are isolated from the global voice/projectile knobs so legacy mode
   * is unaffected when the toggle is 0.
   */
  voicePistolModeEnabled: 0,
  /** Pistol mode: rounds in a full magazine (snippets carved equally from the recorded clip). */
  voiceMagazineSize: 10,
  /**
   * Pistol mode: direct projectile speed multiplier (× `punchProjectileSpeed`) for pistol shots.
   * Bypasses the voice shot speed min/max clamp so pistol can be tuned independently. Lower =
   * slower travel (easier to dodge / less spam pressure).
   */
  pistolShotSpeedMul: 0.55,
  /**
   * Pistol mode: scales the resolved knockback impulse on local pistol-shot hits.
   * Way down by default so spam clicks can't fling people off the stage.
   */
  pistolKnockMul: 0.18,
  /**
   * Pistol mode: scales the launch-percent gain added to the victim per pistol-shot hit.
   * Lower = victims build launch-% slowly even under sustained pistol fire.
   */
  pistolPercentMul: 0.4,
  /** Pistol mode: projectile visual + hit size multiplier for pistol shots only. */
  pistolShotSizeMul: 0.85,
  /** Pistol mode: ms between each +1 round revealed during the reload animation. */
  pistolReloadStepMs: 80,

  /**
   * Decoded voice clip: keep only high-energy "sound wave" windows (0 = raw decode, 1 = on).
   * Cuts most idle room/ambient; see `voiceClipExtractRmsRatio`.
   */
  voiceClipExtractToActiveSound: 1,
  /** When extraction is on, keep 12ms windows with RMS &gt; peak × this (0.04–0.55). */
  voiceClipExtractRmsRatio: 0.12,

  /**
   * Online: WebRTC full-duplex live voice (0/1), spatialized to opponent position.
   * Outgoing is **muted to peer** while a voice **shot** is being recorded (LMB or pistol RMB).
   */
  proximityVoipEnabled: 1,
  /** Web Audio output gain for peer live voice; can exceed 1 in Tweaks to hear the peer clearly. */
  proximityVoipOutputMul: 1.25,
  /** Panner ref distance (world u) for peer live voice. */
  proximityVoipRefDistance: 24,
  proximityVoipMaxDistance: 240,
  proximityVoipRolloff: 0.35,

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

  /** Glowing crate pickups per map reset (0 = none). */
  bananaPickupCount: 5,
  /** Horizontal + vertical tolerance to collect a crate (world units). */
  bananaPickupRadius: 1.35,
  /** Peels: feet must be within this radius to slip. */
  bananaPeelRadius: 1.1,
  /** Y tolerance feet vs baked peel Y (island / slopes). */
  bananaPeelYTolerance: 1.25,
  /** How long a slip stuns movement (ms). Vulnerable to hits. */
  bananaSlipMs: 2000,
  /** 0/1: one-shot slip_sound.ogg when **you** slip on a peel (local). */
  bananaSlipSfxEnabled: 1,
  /** Gain × for slip one-shot (× SFX chain). */
  bananaSlipSfxVolumeMul: 0.55,
  /** 0/1: camera Z-roll wobble when **you** slip on a peel (local view). Tweaks → Animations. */
  bananaSlipCamRollEnabled: 1,
  /** Peak roll (deg, YXZ); sign = barrel direction. */
  bananaSlipCamRollPeakDeg: 13,
  /** Seconds to snap from 0 → peak (small = snappy). */
  bananaSlipCamRollSnapSec: 0.038,
  /** Seconds to ease roll back to 0 after peak. */
  bananaSlipCamRollRecoverSec: 0.3,
  /** Initial throw speed (world; × physics frame feel). */
  bananaThrowSpeed: 32,
  /** Max throw distance on XZ from throw start. */
  bananaThrowMaxRange: 48,
  /** Arc bias on aim vector before normalize. */
  bananaThrowUpMul: 1,
  /** Hover bob amplitude (m) on pickups. */
  bananaHoverAmp: 0.12,
  /** Local-space offset for the in-hand banana (camera parent). */
  bananaHandLocalX: -0.38,
  bananaHandLocalY: -0.2,
  bananaHandLocalZ: -0.52,

  /**
   * FP megaphone (`MegaPhone.glb`): camera-local rest pose, pull pose while charging, shake.
   * Tweaks → Player weapon.
   */
  megaphoneScaleMul: 1.31,
  megaphoneRestLocalX: 0.34,
  megaphoneRestLocalY: -0.4,
  megaphoneRestLocalZ: -0.48,
  megaphoneRestPitchDeg: -23,
  megaphoneRestYawDeg: 75,
  megaphoneRestRollDeg: 10,
  /** Charge-tween target (camera-local); Y/pitch match rest, X/Z/yaw/roll tuned vs rest for pull-in. */
  megaphonePullLocalX: 0.14,
  megaphonePullLocalY: -0.4,
  megaphonePullLocalZ: -0.36,
  megaphonePullPitchDeg: -23,
  megaphonePullYawDeg: 87,
  megaphonePullRollDeg: 7,
  /** Time constant (s) for easing megaphone back to rest after release (pull snaps on when recording starts). */
  megaphoneRestReturnSec: 0.05,
  megaphoneShakePosAmp: 0.014,
  megaphoneShakeRotDeg: 3.2,
  megaphoneShakeFreqHz: 38,
  megaphoneShakeFreq2Hz: 71,
  /** Curves shake intensity vs charge above min-fire (higher = snappier ramp). */
  megaphoneShakeRampPow: 0.4,

  /** Debug Room: when 1, slider edits do NOT trigger a round reset; teleports you + dummy to a side arena. */
  debugRoomActive: 0,

  /**
   * Sound (Tweaks): BGM `×` player Music in Settings, SFX chain, footsteps, jump/land, voice UI SFX.
   * BGM: `src/audio/backgroundMusic.ts` each frame.
   */
  /** Dev BGM level (0–1); final volume × player Music in Settings. */
  bgmVolume: 0.1,
  /** Min seconds holding a move key (WASD) before the first footstep. */
  footstepMinHoldSec: 0.01,
  /** Seconds between one-shot footstep triggers while moving on ground. */
  footstepIntervalSec: 0.5,
  /** 0 = off, 1 = on. */
  footstepSfxEnabled: 1,
  /**
   * Dev relative level for one-shot footstep clips (0–1); × Settings SFX × `sfxTweakVolumeMul`.
   */
  footstepVolumeMul: 0.3,
  /**
   * Tweaks “SFX” (0–1) applied on top of Settings → Sound effects. Chained in `src/audio/sfxChain.ts`.
   */
  sfxTweakVolumeMul: 1,
  /** 0/1. Local: one-shot on jump (ground + double jump). */
  jumpSfxEnabled: 1,
  /** Dev gain for jump one-shot. */
  jumpSfxVolumeMul: 1,
  /** 0/1. Local: one-shot when feet touch ground from air. */
  landSfxEnabled: 1,
  /** Dev gain for land one-shot. */
  landSfxVolumeMul: 1,
  /** 0 = off. Local only: one-shot when mic charge recording actually starts. */
  voiceRecordSfxEnabled: 1,
  /**
   * Final record-start one-shot: `level ×` this × `voiceRecordSfxVolumeMul` × SFX settings.
   * Default 0.2 tames the loud MP3.
   */
  voiceRecordSfxBaseMul: 0.2,
  /** Dev level × (0–1) for `RecordingSound.mp3` on top of `voiceRecordSfxBaseMul`. */
  voiceRecordSfxVolumeMul: 0.22,
  /** 0 = off. Local only: one-shot when a voice **projectile** is launched (not dry-fire). */
  voiceReleaseSfxEnabled: 1,
  /** Dev level × (0–1) for `ThrowSound.ogg`; × master SFX in Settings. */
  voiceReleaseSfxVolumeMul: 0.26,
  /** 0 = off. Spatial `ImpactSound.mp3` layer when a voice hit resolves (dry + delayed echo). */
  voiceHitImpactSfxEnabled: 1,
  /** Impact one-shot gain × SFX chain (before echo wet mix). */
  voiceHitImpactSfxVolumeMul: 0.42,
  /** Echo tap level × dry impact gain (0 = dry only). */
  voiceHitImpactEchoMul: 0.32,
  /** Seconds of delay before the echo tap (slight slapback). */
  voiceHitImpactEchoDelaySec: 0.088,
} as const

export type GameConfigKey = keyof typeof defaultGameConfig

export const gameConfig = { ...defaultGameConfig } as Record<GameConfigKey, number>

export function resetGameConfig(): void {
  const k = Object.keys(defaultGameConfig) as GameConfigKey[]
  for (const key of k) {
    gameConfig[key] = defaultGameConfig[key]
  }
}
