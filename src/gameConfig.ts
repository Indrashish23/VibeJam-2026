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

  /** Screen-space charge wedge: inset from the right edge (rem). */
  chargeHudRightRem: 0.85,
  /** Vertical offset from screen center (rem); positive moves the wedge down. */
  chargeHudVerticalBiasRem: 8.3,
  /** Max width of the wedge column (rem); pairs with viewport clamp in CSS. */
  chargeHudWidthRem: 11.2,
  /** Max height for the wedge (vh); capped in CSS with a rem ceiling. */
  chargeHudMaxHeightVh: 35,
  /** Uniform scale of the wedge art (1 = authored size). */
  chargeHudScale: 1.92,
  /** %/MAX label horizontal position (percent of wedge width from left). */
  chargeHudPctLabelLeftPct: 5.5,
  /** %/MAX label vertical position (percent from top of wedge). */
  chargeHudPctLabelTopPct: 4.6,
  /** Pistol instruction overlay: distance from top of wedge (% height). */
  chargeHudPistolOverlayTopPct: 44,
  /** Pistol overlay width as percent of wedge width. */
  chargeHudPistolOverlayWidthPct: 58,
  /** Ammo +1 feedback: gap left of wedge (rem). */
  chargeHudAmmoPopGapRem: 0.35,
  /** Ammo +1 feedback: vertical anchor (% from top of #charge-bar-wrap). */
  chargeHudAmmoPopTopPct: 38,
  /** Min-fire horizontal rule: inset from wedge left (%). Lower extends line toward the left edge. */
  chargeHudMinMarkLeftPct: 4,
  /** Min-fire horizontal rule: inset from wedge right (%). */
  chargeHudMinMarkRightPct: 8,

  /** 1 = show live mic-activity icon beside the charge wedge; pulses with voice RMS. */
  chargeHudMicEnabled: 1,
  /** Gap between mic icon and wedge (rem). */
  chargeHudMicGapRem: 0,
  /** Mic icon display width (rem), height follows SVG aspect. */
  chargeHudMicWidthRem: 2.25,
  /** Nudge icon down from row top to align with wedge fill (rem). */
  chargeHudMicTopOffsetRem: 0.55,
  /** RMS above (voiceSilenceRmsThreshold × mul) maps to 0 activity; then span maps to full pulse. */
  chargeHudMicNoiseThresholdMul: 1,
  /** RMS headroom above the noise floor to hit full icon pulse (typ. 0.05–0.2). */
  chargeHudMicRmsSpan: 0.09,
  /** 0–1: how fast the icon follows loudness (higher = snappier). */
  chargeHudMicSmoothing: 0.24,
  /** Max extra scale at full activity (0.4 ≈ +40% size at loudest). */
  chargeHudMicPulseScale: 0.38,

  /** Uniform scale for `#hud-viewport` (launch % + charge wedge cluster); 1 = default. */
  uiHudMasterScale: 1,
  /** 1 = anchor launch-% cluster to the right; 0 = anchor left. */
  percentHudAnchorRight: 0,
  /** Extra horizontal inset from the anchored edge (rem); + = farther from edge (toward center). */
  percentHudOffsetXRem: 2.7,
  /** Vertical offset from bottom for the launch-% cluster (rem); + = higher. */
  percentHudOffsetYRem: 1.05,
  /** Subtle stacking / parallax offset (px); forwarded as translateZ on the cluster. */
  percentHudOffsetZPx: 23,
  /** Scale only the launch-percent HUD block (inside master viewport scale). */
  percentHudScale: 0.65,
  /** Multiplier on the large damage % digits (inside block scale). */
  percentHudTextScale: 1.47,
  /** Nudge the damage % digits horizontally (rem). */
  percentHudTextOffsetXRem: -0.45,
  /** Nudge the damage % digits vertically (rem). */
  percentHudTextOffsetYRem: -0.65,
  /** Multiplies the damage % clamp() font-size base (before percentHudTextScale). */
  hudDamagePctFontClampMul: 1.11,
  /** Uniform scale on the portrait + your stock badge column. */
  percentHudPortraitScale: 1.33,
  /** Smoke layer behind % / name (transform). */
  hudSmokeOffsetXRem: 0,
  hudSmokeOffsetYRem: 0,
  hudSmokeOffsetZPx: 0,
  hudSmokeScale: 1,
  /** Column with smoke + damage % shell + player card (transform). */
  hudLeftStackOffsetXRem: -6.1,
  hudLeftStackOffsetYRem: -1.4,
  hudLeftStackOffsetZPx: 0,
  hudLeftStackScale: 1.07,
  /** Wrapper around damage % span (transform; inner span keeps shake + text nudge). */
  hudDamagePctShellOffsetXRem: 8,
  hudDamagePctShellOffsetYRem: -0.25,
  hudDamagePctShellOffsetZPx: -13,
  hudDamagePctShellScale: 0.89,
  /** Name card SVG container (transform). */
  hudPlayerCardOffsetXRem: -1.15,
  hudPlayerCardOffsetYRem: 0,
  hudPlayerCardOffsetZPx: 0,
  hudPlayerCardScale: 0.99,
  /** Display name text (transform + font scale). */
  hudDisplayNameOffsetXRem: 7.1,
  hudDisplayNameOffsetYRem: -0.1,
  hudDisplayNameOffsetZPx: 14,
  hudDisplayNameScale: 1.59,
  hudDisplayNameFontScale: 1.65,
  /** Portrait column container (transform + portrait scale via percentHudPortraitScale). */
  hudPortraitColumnOffsetXRem: -3.35,
  hudPortraitColumnOffsetYRem: 8,
  hudPortraitColumnOffsetZPx: -7,
  /** Wrapper around portrait image (transform; inner keeps shake). */
  hudPortraitWrapShellOffsetXRem: 2.25,
  hudPortraitWrapShellOffsetYRem: 0,
  hudPortraitWrapShellOffsetZPx: 0,
  hudPortraitWrapShellScale: 1,
  /** Your stock badge wrapper (transform + font scale on × / num). */
  hudStockYouShellOffsetXRem: 2.5,
  hudStockYouShellOffsetYRem: 2,
  hudStockYouShellOffsetZPx: 0,
  hudStockYouShellScale: 1,
  hudStockYouFontScale: 1,
  /** Tweaks panel window UI scale (slider rows stay usable when shrunk). */
  tweaksPanelUiScale: 0.81,
  /** When 1 and Tweaks (T) is open, drag launch % + charge wedge anywhere on screen (positions persist per browser tab). */
  hudDragLayoutEnabled: 0,

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
  /** Launch % at which danger vignette and red tint begin on your screen; foot smoke uses same threshold but only renders on the opponent model (enemy sees yours; you see theirs). */
  dangerFxStartPercent: 50,
  /** Skybox base color channels (0–1) for the procedural sky dome. */
  skyboxColorR: 0.66,
  skyboxColorG: 0.58,
  skyboxColorB: 0.43,
  /** Clouds: threshold where noise starts showing clouds (higher = fewer clouds). */
  skyCloudCoverage: 0.52,
  /** Clouds: softness of cloud edges in the procedural mask. */
  skyCloudSoftness: 0.07,
  /** Clouds: noise frequency scale (higher = smaller/more clouds). */
  skyCloudScale: 2.35,
  /** Clouds: advection speed across the dome. */
  skyCloudSpeed: 0.022,
  /** Clouds: blend strength over the base sky color. */
  skyCloudOpacity: 0.22,

  /** Fill light; keep low so the directional sun reads harsh against the skybox. */
  ambientIntensity: 1,
  /** Key directional sun strength (shadow caster). */
  sunIntensity: 2,
  /** Directional sun position (world units); shared by match + lobby preview. */
  sunPosX: 62,
  sunPosY: 34,
  sunPosZ: 7,
  /** 1 = force unlit materials (ignores scene lighting) for flat readability/debugging. */
  lightingUnlitMode: 1,
  /** 1 = force unlit materials on the local player avatar only. */
  lightingUnlitSelfModel: 0,
  /** 1 = force unlit materials on the enemy / bot avatar only. */
  lightingUnlitEnemyModel: 0,
  movementMaxDelta: 0.1,

  /** 0/1: walking camera Y bob + walk-cycle roll (presentation only). Tweaks → FPS view & weapons. */
  fpViewBobEnabled: 0,
  /** Camera vertical bob peak while walking (m × sin(walk phase)); replaces old pitch-axis bob — arms follow camera. */
  fpHeadbobCameraYMul: 0.026,
  /** Walk-cycle camera roll amplitude (±deg peak); scales with cosine of walk phase, not move speed. */
  fpHeadbobRollDeg: 1.7,
  /** Walk-cycle frequency scale (Hz × move speed blend). */
  fpHeadbobHz: 1.6,
  /** Scales continuous idle hand sway loop on megaphone + banana (0 = off; not movement-gated). */
  fpWeaponSwayMul: 1.05,
  /**
   * Spring-arm camera **rotation** lag toggle.
   * 1 = camera quaternion slerps toward the player's intended look (subtle drag while turning).
   */
  fpCamRotLagEnabled: 1,
  /**
   * Rotation lag follow rate (Unreal SpringArm `rotationLagSpeed`).
   * Per-frame slerp `t = clamp(rotLagSpeed * delta, 0, 1)`. Higher = snappier (less drag).
   */
  fpCamRotLagSpeed: 20,
  /**
   * Spring-arm camera **Y position** lag toggle.
   * Camera position lerps toward the player capsule's Y so jumping dips the camera and landing pops it up.
   */
  fpCamYLagEnabled: 1,
  /**
   * Y-position lag follow rate (Unreal SpringArm `lagSpeed`).
   * Per-frame lerp `t = clamp(yLagSpeed * delta, 0, 1)`. Higher = snappier.
   */
  fpCamYLagSpeed: 16,
  /**
   * Maximum allowed Y lag distance in meters (Unreal SpringArm `maxLagDistance`).
   * If `displayY` falls more than this behind the player capsule it snaps to the clamp.
   */
  fpCamYMaxLag: 3,
  /** Shared gravity for non-player simulations (bot / banana projectile arc). */
  gravity: 38,
  /** Upward-phase gravity while vy > 0 (jump ascent). */
  jumpGravity: 147,
  /** Downward-phase gravity while vy <= 0 (fall / fast descent). */
  fallGravity: 70,
  jumpForce: 45,
  /**
   * Variable-jump cut strength while jump is released and vy > 0.
   * Applied as `vy *= jumpCutMultiplier^(delta*60)`; lower = harder cut.
   */
  jumpCutMultiplier: 0.8,
  /** Time window after leaving ground where a jump still counts as grounded (seconds). */
  coyoteTime: 0.12,
  /** Time window to queue a jump press before landing (seconds). */
  jumpBufferTime: 0.1,
  /** Terminal downward speed clamp for player vy (negative = downward). */
  maxFallSpeed: -72,
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
  /**
   * Rapier terrain vs voice projectiles: if hit normal Y is above this, treat as floor/deck and
   * do not stop the shot (walls and ceilings still block).
   */
  projectileFloorPassMinNormalY: 0.58,
  /** Horizontal knockback on player when bot lands a hit (non-parried). */
  knockbackOnPlayer: 30,
  /** Converts horizontal knock impulse into upward vy (pop when hurt; tune with capsule slide). */
  knockVictimLiftMul: 0.74,
  /** Extra vy when the shot connects from below you (uses aim vector Y from shot → victim). */
  knockVictimBelowAimMul: 0.88,
  /** Extra bot vy from knock strength (launch arc vs sliding on the deck). */
  knockBotVertBoostMul: 0.4,
  /** Extra bot vy when the shot is from below (normalized fist→body Y, × strength). */
  knockBotBelowAimMul: 0.58,
  /** Base knock on bot (multiplied by voice `t` lerp). */
  knockbackOnBot: 30,
  /** At quiet voice (t=0) knock = base × this; at loud (t=1) × that. */
  knockVoiceMinMul: 0.22,
  knockVoiceMaxMul: 0.72,
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
  percentGainMin: 7.5,
  /** Percent added at full charge (1). */
  percentGainMax: 27.5,
  /** Knock scale floor from victim launch percent (at 0%). */
  launchKnockFloor: 0.04,
  /** Multiplier on (percent/100)^exponent for knock scaling. */
  launchKnockScale: 7.5,
  /** Exponent on normalized percent for launch knock (higher = gentler at low %). */
  launchKnockExponent: 2.15,
  /** Horizontal knock decay while tumbling from a hit (lower = flies farther before sliding). */
  knockHurtAirDrag: 1.42,
  /** Scales initial hurt-knock impulse (lower = gentler launch speed, tune with knockHurtAirDrag for distance). */
  knockLaunchImpulseMul: 0.4,
  /** Victim launch % above this (0–1) applies knockHighPctSpeedMul to incoming knock speed. */
  knockHighPctVictimThreshold: 0.8,
  /** Extra multiplier on knock speed when victim is above knockHighPctVictimThreshold (e.g. 0.6 = softer hits at high %). */
  knockHighPctSpeedMul: 0.6,
  /** Air strafe strength on hurt knock (world velocity push per second at full input, scaled by air control). */
  knockAirStrafeAccel: 65,
  /** Full air control of knock drift at 0% victim launch; linearly fades to 0 by knockAirControlFadePct (percent). */
  knockAirControlFadePct: 88,
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
  /**
   * After a final-stock KO is detected, wait this long before showing the GAME splash so
   * the player can watch the ragdoll arc / blast spectacle play out. Applies to both win
   * and lose paths (your own ringout also gets the cinematic moment).
   */
  winRingoutPreSplashDelayMs: 3000,
  /**
   * After the GAME splash + match-end overlay paints, automatically dissolve
   * back to the main menu. The "Return to Lobby" button is just a skip; this
   * timer fires the same path even if the user does nothing.
   */
  matchEndAutoReturnMs: 2400,
  /** When 1, play `match_victory.mp3` / `match_defeat.mp3` at match end (last stock). */
  matchEndAnnouncerEnabled: 1,
  /** Gain × on match-end announcer (after SFX chain). */
  matchEndAnnouncerVolumeMul: 1,
  /** Outside platform half-extent + this (XZ) or below yKill = blast. */
  blastMargin: 12,
  /** When 1, draw a green ring-out boundary loop on the deck (Tweaks → Arena). */
  showBlastBounds: 0,
  /** Fall below this Y on blast zone (death plane). */
  blastY: -38,

  /** Stocks per fighter at match start / round reset (Smash-style ring-outs). */
  startStocks: 2,
  /** Hold KO name + stock HUD punch animation before teleport respawn (ms). */
  koAnnounceHoldMs: 1000,
  /** Invulnerability after respawn — no incoming/outgoing combat (ms). */
  respawnInvulnMs: 2000,
  /** Enemy mesh flash cadence during respawn invuln (blinks per second). */
  respawnFlashHz: 10,
  botBodyRadius: 0.72,
  botPunchRange: 2,
  botHitRadius: 0.95,
  /** Smart bot: preferred spacing around the player before switching to flanking. */
  botSmartPreferredRange: 5.8,
  /** Smart bot: half-band around preferred range considered "in ring". */
  botSmartRangeBand: 1.25,
  /** Smart bot: if closer than this, prioritize retreat. */
  botSmartRetreatRange: 1.7,
  /** Smart bot movement speed as multiplier of player move speed. */
  botSmartMoveSpeedMul: 0.2,
  /** Smart bot approach wobble/flank blend while closing distance. */
  botSmartApproachFlankBias: 1,
  /** Smart bot: attack window as multiplier of botPunchRange (kept high so smart bot still pressures from range). */
  botSmartAttackRangeMul: 4,
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
  bananaPeelYTolerance: 2.15,
  /** How long a slip stuns movement (ms). Vulnerable to hits. */
  bananaSlipMs: 1700,
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
  /** Cartoon slip flip pitch magnitude in degrees (upward arc). */
  slipPitchAngle: 50,
  /** Seconds for the upward flip snap-in. */
  slipPitchInTime: 0.08,
  /** Seconds for easing back down after the upward snap. */
  slipPitchOutTime: 0.25,
  /** Initial throw speed (world; × physics frame feel). */
  bananaThrowSpeed: 32,
  /** Max throw distance on XZ from throw start. */
  bananaThrowMaxRange: 74,
  /** Arc bias on aim vector before normalize. */
  bananaThrowUpMul: 0.54,
  /** Hover bob amplitude (m) on pickups only (peels use offsets below, no bob). */
  bananaHoverAmp: 0.24,
  /** Pickup crate mesh sits this far above terrain contact (matches prior ~0.35 constant). */
  bananaPickupVisualYOffset: 0.35,
  /** Peel mesh sits this far above landed point — match pickup lift; tweakers can separate if needed. */
  bananaPeelVisualYOffset: 0.35,
  /** Local-space offset for the in-hand banana (camera parent). */
  bananaHandLocalX: -0.42,
  bananaHandLocalY: -0.4,
  bananaHandLocalZ: -0.52,
  /** PvP: third-person banana on peer avatar root (same scale as FP hand banana). */
  bananaOpponentLocalX: 0.34,
  bananaOpponentLocalY: 0.04,
  bananaOpponentLocalZ: 0.39,
  bananaOpponentRotYDeg: -22,

  /**
   * FP megaphone (`MegaPhone.glb`): camera-local rest pose, pull pose while charging, shake.
   * Tweaks → Player weapon.
   */
  megaphoneScaleMul: 1.31,
  megaphoneRestLocalX: 0.26,
  megaphoneRestLocalY: -0.44,
  megaphoneRestLocalZ: -0.48,
  megaphoneRestPitchDeg: 5,
  megaphoneRestYawDeg: 80,
  megaphoneRestRollDeg: -11,
  /** Charge-tween target (camera-local); Y/pitch match rest, X/Z/yaw/roll tuned vs rest for pull-in. */
  megaphonePullLocalX: 0.14,
  megaphonePullLocalY: -0.44,
  megaphonePullLocalZ: -0.48,
  megaphonePullPitchDeg: 5,
  megaphonePullYawDeg: 80,
  megaphonePullRollDeg: -11,
  /** Time constant (s) for easing megaphone back to rest after release (pull snaps on when recording starts). */
  megaphoneRestReturnSec: 0.23,
  megaphoneShakePosAmp: 0.006,
  megaphoneShakeRotDeg: 1,
  megaphoneShakeFreqHz: 19,
  megaphoneShakeFreq2Hz: 42,
  /** Curves shake intensity vs charge above min-fire (higher = snappier ramp). */
  megaphoneShakeRampPow: 2.25,
  /**
   * Scales FP hand sway on the megaphone only (× global `fpWeaponSwayMul`). 1 = match banana relative intensity.
   */
  megaphoneSwayMul: 2,
  /**
   * Seconds to ease into the pull/charge pose when recording starts; 0 = snap (legacy).
   */
  megaphonePullSmoothSec: 0,

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
  /** 0 = off. Tiered hit-impact one-shot (`Assets/SFX/HitEffects/*.ogg`) on confirmed hit. */
  hitImpactTierSfxEnabled: 1,
  /** Victim launch % <22. */
  hitImpactUnder20VolumeMul: 0.68,
  /** Victim launch % 22..49 (`Over20%` / `Over20%v2` random). */
  hitImpactOver20VolumeMul: 0.68,
  /** Victim launch % 50..69. */
  hitImpactOver50VolumeMul: 0.7,
  /** Victim launch % >=70. */
  hitImpactOver70VolumeMul: 0.74,

  /** 1 = hide main-menu HTML card (buttons) for screenshots; Tweaks panel still works. */
  hideLobbyUi: 0,
  /** Main-menu Play card: horizontal nudge (rem); translateX on the modal only (logo stays put). */
  lobbyMenuModalOffsetXRem: 0,
  /** Main-menu Play card: vertical nudge (rem); translateY on the modal only. */
  lobbyMenuModalOffsetYRem: 0,
  /** Lobby monkey: faceted per-face shading. */
  lobbyMonkeyFlatShading: 1,
  /** Lobby monkey: nearest-neighbor maps (chunky texels). */
  lobbyMonkeyTexPixelated: 1,
  /** Lobby monkey: 4× downscale embedded maps (reload menu after toggling). */
  lobbyMonkeyTexDownscale: 1,

  /** Menu-only: lobby 3D preview monkey position (world units). */
  lobbyMonkeyPosX: 5.5,
  lobbyMonkeyPosY: 6.5,
  lobbyMonkeyPosZ: 18,
  /** Lobby monkey Euler degrees (applied YXZ). */
  lobbyMonkeyPitchDeg: 0,
  lobbyMonkeyYawDeg: 16,
  lobbyMonkeyRollDeg: 3,
  lobbyMonkeyScale: 6.05,
} as const

export type GameConfigKey = keyof typeof defaultGameConfig

export const gameConfig = { ...defaultGameConfig } as Record<GameConfigKey, number>

export function resetGameConfig(): void {
  const k = Object.keys(defaultGameConfig) as GameConfigKey[]
  for (const key of k) {
    gameConfig[key] = defaultGameConfig[key]
  }
}
