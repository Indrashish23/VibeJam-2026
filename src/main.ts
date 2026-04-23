/**
 * Single entry, static imports only — keeps the production bundle one chunk and fast to parse (Vibe Jam instant-play goal).
 */
import './style.css'
import {
  AmbientLight,
  BoxGeometry,
  Clock,
  Color,
  DirectionalLight,
  Group,
  MathUtils,
  Mesh,
  MeshStandardMaterial,
  PerspectiveCamera,
  Raycaster,
  Scene,
  Vector3,
  WebGLRenderer,
} from 'three'
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js'
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js'
import { RenderPixelatedPass } from 'three/addons/postprocessing/RenderPixelatedPass.js'
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js'
import { gameConfig } from './gameConfig'
import { addArena, isBlastZone } from './arena'
import { BotFighter, type BotMode } from './boxing/bot'
import { PlayerArms } from './boxing/playerArms'
import { VoiceChargeManager } from './audio/voiceCharge'
import { mountTweaksPanel } from './tweaksPanel'
import { runLobbyGate } from './lobbyGate'

const STORAGE_KEY = 'vibejam_player_name'

const DOWN = new Vector3(0, -1, 0)

const usernameOverlay = document.getElementById('username-overlay') as HTMLDivElement
const usernameForm = document.getElementById('username-form') as HTMLFormElement
const usernameInput = document.getElementById('username-input') as HTMLInputElement
const gameRoot = document.getElementById('game-root') as HTMLDivElement

const scorePEl = document.getElementById('score-p')
const scoreBEl = document.getElementById('score-b')
const hitsNeedEnemyEl = document.getElementById('hits-need-enemy')
const hitsNeedPlayerEl = document.getElementById('hits-need-player')

const matchEndOverlay = document.getElementById('match-end-overlay') as HTMLDivElement | null
const matchEndTitle = document.getElementById('match-end-title')
const matchEndSub = document.getElementById('match-end-sub')
const hitFlashEl = document.getElementById('hit-flash') as HTMLDivElement | null
const invulnShineEl = document.getElementById('invuln-shine') as HTMLDivElement | null
const winGameSplashEl = document.getElementById('win-game-splash') as HTMLDivElement | null
const rematchSeqLayer = document.getElementById('rematch-sequence') as HTMLDivElement | null
const rematchBlackSheet = document.getElementById('rematch-black-sheet') as HTMLDivElement | null
const countdownOverlay = document.getElementById('countdown-overlay') as HTMLDivElement | null
const countdownNumEl = document.getElementById('countdown-num') as HTMLSpanElement | null
const dashScanEl = document.getElementById('dash-scanlines') as HTMLDivElement | null
const chargeBarWrap = document.getElementById('charge-bar-wrap') as HTMLDivElement | null
const chargeBarFill = document.getElementById('charge-bar-fill') as HTMLDivElement | null
const chargeBarMinMark = document.getElementById('charge-bar-min') as HTMLDivElement | null
const micBlockedOverlay = document.getElementById('mic-blocked-overlay') as HTMLDivElement | null
const micBlockedSubEl = document.getElementById('mic-blocked-sub') as HTMLParagraphElement | null

const HUB_SKY = 0x87b8e8
const PIXEL_HUB = 2

const _knDir = new Vector3()
const _fp = new Vector3()
const _camFwd = new Vector3()
const _camRight = new Vector3()
const _worldUp = new Vector3(0, 1, 0)

function sleepMs(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function readStoredName(): string | null {
  try {
    const v = localStorage.getItem(STORAGE_KEY)
    const t = v?.trim()
    return t ? t : null
  } catch {
    return null
  }
}

function saveName(name: string) {
  try {
    localStorage.setItem(STORAGE_KEY, name)
  } catch {
    /* ignore quota */
  }
}

function runUsernameGate(): Promise<void> {
  const stored = readStoredName()
  if (stored) {
    usernameOverlay.hidden = true
    gameRoot.hidden = true
    return Promise.resolve()
  }

  usernameOverlay.hidden = false
  gameRoot.hidden = true
  usernameInput.focus()

  return new Promise((resolve) => {
    usernameForm.addEventListener(
      'submit',
      (e) => {
        e.preventDefault()
        const raw = usernameInput.value.trim()
        const name = raw || 'Angler'
        saveName(name)
        usernameOverlay.hidden = true
        gameRoot.hidden = true
        resolve()
      },
      { once: true },
    )
  })
}

function initGame() {
  let tweaksPanelOpen = false

  const scene = new Scene()
  scene.background = new Color(HUB_SKY)

  const camera = new PerspectiveCamera(
    gameConfig.cameraFov,
    window.innerWidth / Math.max(window.innerHeight, 1),
    gameConfig.cameraNear,
    gameConfig.cameraFar,
  )

  const renderer = new WebGLRenderer({ antialias: true })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  renderer.setSize(window.innerWidth, window.innerHeight)
  /** Canvas first in DOM so HUD / hit-flash overlays stack above it. */
  gameRoot.prepend(renderer.domElement)

  const composer = new EffectComposer(renderer)
  composer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  const pixelPass = new RenderPixelatedPass(PIXEL_HUB, scene, camera, {
    normalEdgeStrength: 0,
    depthEdgeStrength: 0,
  })
  composer.addPass(pixelPass)
  composer.addPass(new OutputPass())
  composer.setSize(window.innerWidth, Math.max(window.innerHeight, 1))

  const controls = new PointerLockControls(camera, renderer.domElement)
  controls.pointerSpeed = gameConfig.mouseSensitivity

  const ambient = new AmbientLight(0xffffff, gameConfig.ambientIntensity)
  scene.add(ambient)

  const sun = new DirectionalLight(0xffffff, gameConfig.sunIntensity)
  sun.position.set(28, 50, 22)
  scene.add(sun)

  const hubRoot = new Group()
  scene.add(hubRoot)

  const ground = addArena(hubRoot)
  const colliders: Mesh[] = [ground]

  let parryGuardRoot: Group | null = null
  let parryArmMeshL: Mesh | null = null
  let parryArmMeshR: Mesh | null = null

  scene.add(camera)

  {
    const root = new Group()
    const fistCol = new Color(0xc45c6b)
    const pgMat = new MeshStandardMaterial({
      color: fistCol,
      roughness: 0.55,
      metalness: 0.14,
    })
    const pgGeo = new BoxGeometry(0.52, 0.13, 0.3)
    const armL = new Mesh(pgGeo, pgMat)
    const armR = new Mesh(pgGeo, pgMat.clone())
    armL.position.set(-0.44, -0.28, -0.55)
    armR.position.set(0.44, -0.28, -0.55)
    armL.rotation.set(0.28, 0.38, 0.92)
    armR.rotation.set(0.28, -0.38, -0.92)
    root.add(armL, armR)
    root.visible = false
    camera.add(root)
    parryGuardRoot = root
    parryArmMeshL = armL
    parryArmMeshR = armR
  }

  const arms = new PlayerArms(camera, scene)

  let botMode: BotMode = 'dummy'
  let bot = new BotFighter(scene, botMode, new Vector3())

  let playerHits = 0
  let botHits = 0
  let matchOutcome: null | 'win' | 'lose' = null
  let lastQAt = -1e12

  const playerKnock = new Vector3()
  const dashVel = new Vector3()
  let dashCdMs = 0

  const raycaster = new Raycaster()
  raycaster.far = 400
  const feetRayOrigin = new Vector3()
  const _normal = new Vector3()

  const clock = new Clock()
  const velocity = new Vector3()
  const direction = new Vector3()
  const prevShake = new Vector3()
  let shakeIntensity = 0
  let flashIntensity = 0

  let vy = 0
  let grounded = false
  let lastJumpAt = 0

  const keys = {
    forward: false,
    back: false,
    left: false,
    right: false,
  }

  let shiftDashArmed = true
  let parryGuardUntil = 0
  /** Blocks gameplay during KO rematch cinematic (black → swipe → countdown). */
  let rematchSequenceActive = false

  type PlayerHurtPhase = 'none' | 'air' | 'recover'
  let playerHurt: PlayerHurtPhase = 'none'
  let playerHurtRecoverLeft = 0
  let playerHurtAirSince = 0
  let playerInvulnUntil = 0

  const voice = new VoiceChargeManager()
  let chargingLmb = false
  /** Last smoothed voice charge (for shot power + UI). */
  let voiceChargeSmoothed = 0
  /** −1 = unlimited voice shots per round; otherwise shots left when capped. */
  let voiceAmmoLeft = -1
  /** Gameplay frozen until mic works + optional countdown. */
  let voiceInputBlocked = true
  let voiceResumeCountdownActive = false

  let tweakConfigDebounce: ReturnType<typeof setTimeout> | null = null
  let tweakConfigResetChain: Promise<void> = Promise.resolve()

  function displayPlayerName(): string {
    return readStoredName()?.trim() || 'Player'
  }

  let micPollId = 0

  function updateMicBlockedUi(): void {
    if (micBlockedSubEl) {
      micBlockedSubEl.textContent = `${displayPlayerName()} is fixing their voice input`
    }
    if (micBlockedOverlay) micBlockedOverlay.hidden = !voiceInputBlocked
    if (chargeBarWrap) chargeBarWrap.hidden = voiceInputBlocked
  }

  function scheduleRoundResetAfterTweak(): void {
    if (tweakConfigDebounce) window.clearTimeout(tweakConfigDebounce)
    tweakConfigDebounce = window.setTimeout(() => {
      tweakConfigDebounce = null
      tweakConfigResetChain = tweakConfigResetChain.then(() => resetRoundAfterTweakEdit())
    }, 420)
  }

  async function resetRoundAfterTweakEdit(): Promise<void> {
    while (rematchSequenceActive) await sleepMs(55)

    chargingLmb = false
    voice.resetChargeMeter()
    voiceChargeSmoothed = 0
    if (chargeBarFill) chargeBarFill.style.width = '0%'
    if (chargeBarWrap) chargeBarWrap.classList.remove('charge-bar-wrap--overload')
    await voice.finishChargeRecording()

    applyRoundReset()
    await runVoiceResumeCountdown()
    tryPointerLock()
  }

  /** Shared round restart (scores, overlays, actors) without pointer-lock. */
  function applyRoundReset(): void {
    matchOutcome = null
    winFinisher = null
    hideWinGameSplash()
    parryGuardUntil = 0
    playerHits = 0
    botHits = 0
    playerHurt = 'none'
    playerHurtRecoverLeft = 0
    playerInvulnUntil = 0
    if (matchEndOverlay) matchEndOverlay.hidden = true
    spawnActors()
    syncHud()
  }

  async function runVoiceResumeCountdown(): Promise<void> {
    if (!countdownOverlay || !countdownNumEl) return
    voiceResumeCountdownActive = true
    countdownOverlay.hidden = false
    for (const n of [3, 2, 1] as const) {
      countdownNumEl.textContent = String(n)
      countdownOverlay.classList.remove('countdown-overlay--pulse')
      void countdownOverlay.offsetWidth
      countdownOverlay.classList.add('countdown-overlay--pulse')
      await sleepMs(840)
    }
    countdownOverlay.hidden = true
    countdownOverlay.classList.remove('countdown-overlay--pulse')
    voiceResumeCountdownActive = false
  }

  async function initVoiceInput(): Promise<void> {
    updateMicBlockedUi()
    const ok = await voice.ensureMic()
    voiceInputBlocked = !ok
    updateMicBlockedUi()
    window.clearInterval(micPollId)
    if (ok) {
      await runVoiceResumeCountdown()
      tryPointerLock()
    } else {
      micPollId = window.setInterval(() => {
        void (async () => {
          if (!voiceInputBlocked) return
          const r = await voice.ensureMic()
          if (r) {
            voiceInputBlocked = false
            updateMicBlockedUi()
            window.clearInterval(micPollId)
            await runVoiceResumeCountdown()
            tryPointerLock()
          }
        })()
      }, 2800)
    }
  }

  async function releaseVoiceShot(): Promise<void> {
    const blob = await voice.finishChargeRecording()
    const buf = await voice.decodeRecording(blob)
    const raw = voiceChargeSmoothed
    voice.resetChargeMeter()
    voiceChargeSmoothed = 0
    if (chargeBarFill) chargeBarFill.style.width = '0%'
    if (chargeBarWrap) chargeBarWrap.classList.remove('charge-bar-wrap--overload')
    if (raw < gameConfig.voiceChargeMinRelease) return
    const cap = Math.round(gameConfig.voiceShotAmmoMax)
    if (cap > 0 && voiceAmmoLeft <= 0) return
    const span = Math.max(0.05, 1 - gameConfig.voiceChargeMinRelease)
    const t = Math.min(1, (raw - gameConfig.voiceChargeMinRelease) / span)
    const speedMul =
      gameConfig.voiceShotSpeedMinMul +
      t * (gameConfig.voiceShotSpeedMaxMul - gameConfig.voiceShotSpeedMinMul)
    const fired = arms.tryFire(speedMul, buf)
    if (fired && cap > 0 && voiceAmmoLeft > 0) voiceAmmoLeft -= 1
  }

  function syncHud(): void {
    if (scorePEl) scorePEl.textContent = String(playerHits)
    if (scoreBEl) scoreBEl.textContent = String(botHits)
    if (hitsNeedEnemyEl) hitsNeedEnemyEl.textContent = String(Math.round(gameConfig.enemyHitsToWin))
    if (hitsNeedPlayerEl) hitsNeedPlayerEl.textContent = String(Math.round(gameConfig.hitsToWin))
  }

  let dashTiltDeg = 0

  function spawnActors(): void {
    const arenaHalf = Math.min(gameConfig.groundWidth, gameConfig.groundDepth) * 0.5 - 2.5
    const spacing = Math.min(6.8, arenaHalf * 0.38)
    const botFeetY = gameConfig.botBodyRadius * 1.15 + 0.72

    camera.position.set(0, gameConfig.eyeHeight, spacing)
    camera.rotation.reorder('YXZ')
    camera.rotation.set(0, 0, 0)

    bot.root.position.set(0, botFeetY, -spacing)
    bot.root.rotation.set(0, 0, 0)
    bot.resetRoundState()
    bot.alignFacingToward(camera.position)

    dashTiltDeg = 0
    gameRoot.classList.remove('game-root--dash-tilt')
    gameRoot.style.transform = ''
    if (dashScanEl) dashScanEl.style.opacity = '0'
    playerKnock.set(0, 0, 0)
    dashVel.set(0, 0, 0)
    vy = 0
    shakeIntensity = 0
    flashIntensity = 0
    prevShake.set(0, 0, 0)
    if (hitFlashEl) hitFlashEl.style.opacity = '0'
    arms.resetAll()
    chargingLmb = false
    {
      const cap = Math.round(gameConfig.voiceShotAmmoMax)
      voiceAmmoLeft = cap > 0 ? cap : -1
    }
    playerHurt = 'none'
    playerHurtRecoverLeft = 0
    playerInvulnUntil = 0
  }

  type WinFinisherState =
    | { phase: 'launch'; started: number; sawAir: boolean }
    | { phase: 'flash'; started: number }

  let winFinisher: WinFinisherState | null = null

  function hideWinGameSplash(): void {
    if (!winGameSplashEl) return
    winGameSplashEl.classList.remove('win-game-splash--pulse')
    winGameSplashEl.hidden = true
  }

  function showWinGameSplash(): void {
    if (!winGameSplashEl) return
    winGameSplashEl.hidden = false
    winGameSplashEl.classList.remove('win-game-splash--pulse')
    void winGameSplashEl.offsetWidth
    winGameSplashEl.classList.add('win-game-splash--pulse')
  }

  function updateWinFinisher(_delta: number): void {
    if (!winFinisher || winFinisher.phase !== 'launch') return
    if (isBlastZone(bot.root.position)) {
      winFinisher = { phase: 'flash', started: performance.now() }
      showWinGameSplash()
      return
    }
    const elapse = performance.now() - winFinisher.started
    if (!bot.grounded) winFinisher.sawAir = true
    const landed =
      winFinisher.sawAir &&
      bot.grounded &&
      Math.abs(bot.vy) < 2.35 &&
      elapse > 200
    if (landed || elapse > 4200) {
      winFinisher = { phase: 'flash', started: performance.now() }
      showWinGameSplash()
    }
  }

  function advanceWinFlashTimer(): void {
    if (!winFinisher || winFinisher.phase !== 'flash') return
    if (performance.now() - winFinisher.started > 1120) {
      winFinisher = null
      hideWinGameSplash()
      endMatch('win')
    }
  }

  /** Push direction from fist impact → bot flies along punch line (XZ). */
  function knockDirFromFistImpact(fistWorld: Vector3, out: Vector3): void {
    out.subVectors(bot.bodyCenter, fistWorld)
    out.y = 0
    if (out.lengthSq() < 1e-8) {
      out.subVectors(bot.root.position, camera.position)
      out.y = 0
    }
    if (out.lengthSq() < 1e-8) out.set(0, 0, 1)
    out.normalize()
  }

  async function runRematchSequence(): Promise<void> {
    rematchSequenceActive = true
    chargingLmb = false
    controls.unlock()
    keys.forward = false
    keys.back = false
    keys.left = false
    keys.right = false
    matchOutcome = null
    winFinisher = null
    hideWinGameSplash()
    parryGuardUntil = 0
    playerHits = 0
    botHits = 0
    syncHud()
    if (matchEndOverlay) matchEndOverlay.hidden = true

    if (rematchSeqLayer && rematchBlackSheet) {
      rematchSeqLayer.hidden = false
      rematchBlackSheet.classList.remove('rematch-black-sheet--slide')
      rematchBlackSheet.style.transform = 'translateX(0)'
      await sleepMs(320)
    }

    spawnActors()
    syncHud()

    if (rematchBlackSheet) {
      void rematchBlackSheet.offsetWidth
      rematchBlackSheet.classList.add('rematch-black-sheet--slide')
      await sleepMs(900)
      if (rematchSeqLayer) rematchSeqLayer.hidden = true
      rematchBlackSheet.classList.remove('rematch-black-sheet--slide')
    }

    if (countdownOverlay && countdownNumEl) {
      countdownOverlay.hidden = false
      for (const n of [3, 2, 1] as const) {
        countdownNumEl.textContent = String(n)
        countdownOverlay.classList.remove('countdown-overlay--pulse')
        void countdownOverlay.offsetWidth
        countdownOverlay.classList.add('countdown-overlay--pulse')
        await sleepMs(840)
      }
      countdownOverlay.hidden = true
      countdownOverlay.classList.remove('countdown-overlay--pulse')
    }

    rematchSequenceActive = false
    tryPointerLock()
  }

  /** Full cinematic (black → swipe → 3-2-1) — used from match-end overlay. */
  function resetMatch(): void {
    void runRematchSequence()
  }

  /** In-round rematch button: instant restart without transition. */
  function instantHudRematch(): void {
    applyRoundReset()
    tryPointerLock()
  }

  function endMatch(outcome: 'win' | 'lose'): void {
    if (matchOutcome) return
    hideWinGameSplash()
    winFinisher = null
    matchOutcome = outcome
    controls.unlock()
    if (matchEndOverlay) matchEndOverlay.hidden = false
    if (matchEndTitle) {
      matchEndTitle.textContent = outcome === 'win' ? 'You win!' : 'You lose!'
    }
    if (matchEndSub) {
      matchEndSub.textContent =
        outcome === 'win'
          ? 'Opponent knocked out or out of bounds.'
          : 'You were KO’d or fell off the stage.'
    }
  }

  function hitsToKoEnemy(): number {
    return Math.max(1, Math.round(gameConfig.enemyHitsToWin))
  }

  function hitsToKoPlayer(): number {
    return Math.max(1, Math.round(gameConfig.hitsToWin))
  }

  function recreateBot(mode: BotMode): void {
    bot.dispose(scene)
    botMode = mode
    bot = new BotFighter(scene, botMode, new Vector3(0, 1.45, -gameConfig.groundDepth / 2 + 12))
    instantHudRematch()
  }

  spawnActors()
  syncHud()

  function feetY(): number {
    return camera.position.y - gameConfig.eyeHeight
  }

  /**
   * Raycast must start **above** the deck so we never tunnel through after knockback.
   * Second pass: analytical snap on the stage top (y = 0) when over the platform XZ.
   */
  function resolveGround(): void {
    const fy = feetY()
    const rayY = Math.max(
      camera.position.y + 2,
      fy + 6,
      12,
    )
    feetRayOrigin.set(camera.position.x, rayY, camera.position.z)
    raycaster.set(feetRayOrigin, DOWN)
    const hits = raycaster.intersectObjects(colliders, false)

    const skin = 0.22
    const maxStep = 2.4

    grounded = false
    let bestFloorY = -1e9

    for (const h of hits) {
      if (!h.face) continue
      _normal.copy(h.face.normal).transformDirection(h.object.matrixWorld)
      if (_normal.y < 0.35) continue
      const gy = h.point.y
      if (fy < gy - 0.2) continue
      if (fy - gy > maxStep + skin) continue
      if (gy > bestFloorY) bestFloorY = gy
    }

    if (bestFloorY > -1e8) {
      const deltaFeet = fy - bestFloorY
      if (deltaFeet <= skin && deltaFeet >= -2.5) {
        camera.position.y = bestFloorY + gameConfig.eyeHeight
        if (vy <= 0.55) {
          vy = 0
          grounded = true
        }
      }
    }

    snapDeckSurface()
  }

  /** Hard snap when feet are still over the platform AABB (prevents falling through). */
  function snapDeckSurface(): void {
    const hw = gameConfig.groundWidth / 2 + 0.02
    const hd = gameConfig.groundDepth / 2 + 0.02
    const { x, z } = camera.position
    if (Math.abs(x) > hw || Math.abs(z) > hd) return

    const fy = feetY()
    const deckTop = 0
    if (fy <= deckTop + 0.35 && fy >= deckTop - 4 && vy <= 12) {
      camera.position.y = deckTop + gameConfig.eyeHeight
      vy = Math.min(vy, 0)
      grounded = true
    }
  }

  function tryJump() {
    if (
      tweaksPanelOpen ||
      matchOutcome ||
      winFinisher ||
      rematchSequenceActive ||
      playerHurt !== 'none'
    )
      return
    const now = performance.now()
    if (now - lastJumpAt < gameConfig.jumpCooldownMs) return
    if (!grounded) return
    vy = gameConfig.jumpForce
    grounded = false
    lastJumpAt = now
  }

  /** Dash matches WASD in camera-local space (same idea as PointerLock walk). */
  function computeDashDirection(out: Vector3): void {
    const ix = Number(keys.right) - Number(keys.left)
    const iz = Number(keys.forward) - Number(keys.back)
    out.set(ix, 0, -iz)
    if (out.lengthSq() < 1e-10) {
      out.set(0, 0, -1)
    } else {
      out.normalize()
    }
    out.applyQuaternion(camera.quaternion)
    out.y = 0
    if (out.lengthSq() < 1e-10) {
      camera.getWorldDirection(out)
      out.y = 0
    }
    out.normalize()
  }

  function tryDash(): void {
    if (
      matchOutcome ||
      winFinisher ||
      rematchSequenceActive ||
      dashCdMs > 0 ||
      !grounded ||
      tweaksPanelOpen ||
      playerHurt !== 'none'
    )
      return
    computeDashDirection(_knDir)
    const mul = gameConfig.dashVelocityMul
    dashVel.copy(_knDir).multiplyScalar(gameConfig.dashImpulse * mul)

    camera.getWorldDirection(_camFwd)
    _camFwd.y = 0
    if (_camFwd.lengthSq() < 1e-8) _camFwd.set(0, 0, -1)
    _camFwd.normalize()
    _camRight.crossVectors(_camFwd, _worldUp).normalize()
    const lateral = _camRight.dot(_knDir)
    dashTiltDeg = MathUtils.clamp(lateral * -7.8, -6.8, 6.8)
    gameRoot.classList.add('game-root--dash-tilt')

    dashCdMs = gameConfig.dashCooldownMs
  }

  function resolveCombat(delta: number): void {
    if (matchOutcome || rematchSequenceActive || voiceInputBlocked || voiceResumeCountdownActive)
      return

    if (winFinisher) {
      if (isBlastZone(camera.position)) {
        winFinisher = null
        hideWinGameSplash()
        endMatch('lose')
        return
      }
      arms.update(delta)
      bot.update(delta, camera.position, colliders, false)
      updateWinFinisher(delta)
      advanceWinFlashTimer()
      return
    }

    arms.update(delta)

    const playerProjActive = arms.isProjectileActive()
    bot.update(delta, camera.position, colliders, playerProjActive)

    /* Player projectile vs bot */
    if (arms.canDealHit()) {
      arms.getProjectileWorld(_fp)
      const reach = arms.projectileRadius() + gameConfig.botBodyRadius * 0.88
      if (_fp.distanceTo(bot.bodyCenter) < reach) {
        const hitAudio = arms.takeHitAudio()
        arms.markDealt()
        voice.playBufferFading(hitAudio)
        knockDirFromFistImpact(_fp, _knDir)
        playerHits += 1
        syncHud()
        const clinch = playerHits >= hitsToKoEnemy()
        if (clinch) {
          winFinisher = { phase: 'launch', started: performance.now(), sawAir: false }
          arms.resetAll()
          bot.applyFinisherKnockback(
            _knDir,
            gameConfig.winFinisherKnockXZ,
            gameConfig.winFinisherVy,
          )
          triggerHitImpactFx()
        } else {
          bot.applyKnockback(_knDir, gameConfig.knockbackOnBot)
          triggerHitImpactFx()
        }
      }
    }

    /* Bot projectile vs player */
    if (bot.canDealHit(camera.position)) {
      const now = performance.now()
      if (
        now < playerInvulnUntil ||
        playerHurt === 'air' ||
        playerHurt === 'recover'
      ) {
        bot.markHitDealt()
      } else {
        const victimClip = bot.peekProjectileVoice()
        _fp.copy(bot.projPos)
        const parried =
          !chargingLmb &&
          arms.canParry() &&
          now - lastQAt <= gameConfig.parryWindowMs
        bot.markHitDealt()
        if (!parried) {
          if (victimClip) voice.playBufferSpatialAt(victimClip, _fp, camera)
          _knDir.subVectors(camera.position, _fp)
          _knDir.y = 0
          if (_knDir.lengthSq() < 1e-8) _knDir.set(0, 0, 1)
          _knDir.normalize()
          playerHurt = 'air'
          playerHurtAirSince = performance.now()
          dashVel.set(0, 0, 0)
          playerKnock.addScaledVector(
            _knDir,
            gameConfig.knockbackOnPlayer * gameConfig.playerHurtKnockMul,
          )
          vy += gameConfig.playerHurtVyBoost
          botHits += 1
          syncHud()
          triggerHitImpactFx()
          if (botHits >= hitsToKoPlayer()) endMatch('lose')
        }
      }
    }

    if (isBlastZone(camera.position)) endMatch('lose')
    if (isBlastZone(bot.root.position)) endMatch('win')
  }

  function onKeyDown(e: KeyboardEvent) {
    if (e.code === 'KeyQ') {
      if (
        !tweaksPanelOpen &&
        !matchOutcome &&
        !winFinisher &&
        !rematchSequenceActive &&
        playerHurt === 'none' &&
        !chargingLmb &&
        arms.canParry()
      ) {
        lastQAt = performance.now()
        parryGuardUntil = performance.now() + gameConfig.parryGuardVisibleMs
      }
    }

    /** 1 dummy · 2 smart · 3 toggle bot · R restart (also when match-end overlay is open). */
    const shortcutBlock =
      tweaksPanelOpen || rematchSequenceActive || winFinisher
    if (!shortcutBlock) {
      switch (e.code) {
        case 'Digit1':
          e.preventDefault()
          recreateBot('dummy')
          return
        case 'Digit2':
          e.preventDefault()
          recreateBot('smart')
          return
        case 'Digit3':
          e.preventDefault()
          recreateBot(botMode === 'dummy' ? 'smart' : 'dummy')
          return
        case 'KeyR':
          e.preventDefault()
          instantHudRematch()
          return
        default:
          break
      }
    }

    if (
      tweaksPanelOpen ||
      matchOutcome ||
      winFinisher ||
      rematchSequenceActive ||
      playerHurt !== 'none'
    )
      return
    switch (e.code) {
      case 'ShiftLeft':
      case 'ShiftRight':
        if (shiftDashArmed) {
          shiftDashArmed = false
          tryDash()
        }
        break
      case 'Space':
        e.preventDefault()
        tryJump()
        break
      case 'KeyW':
      case 'ArrowUp':
        keys.forward = true
        break
      case 'KeyS':
      case 'ArrowDown':
        keys.back = true
        break
      case 'KeyA':
      case 'ArrowLeft':
        keys.left = true
        break
      case 'KeyD':
      case 'ArrowRight':
        keys.right = true
        break
      default:
        break
    }
  }

  function onKeyUp(e: KeyboardEvent) {
    if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') {
      shiftDashArmed = true
    }
    if (tweaksPanelOpen || matchOutcome) return
    switch (e.code) {
      case 'KeyW':
      case 'ArrowUp':
        keys.forward = false
        break
      case 'KeyS':
      case 'ArrowDown':
        keys.back = false
        break
      case 'KeyA':
      case 'ArrowLeft':
        keys.left = false
        break
      case 'KeyD':
      case 'ArrowRight':
        keys.right = false
        break
      default:
        break
    }
  }

  window.addEventListener('keydown', onKeyDown)
  window.addEventListener('keyup', onKeyUp)

  function onMouseDown(e: MouseEvent): void {
    if (e.button !== 0) return
    const ammoCap = Math.round(gameConfig.voiceShotAmmoMax)
    if (ammoCap > 0 && voiceAmmoLeft <= 0) return
    if (
      voiceInputBlocked ||
      voiceResumeCountdownActive ||
      tweaksPanelOpen ||
      matchOutcome ||
      winFinisher ||
      rematchSequenceActive ||
      playerHurt !== 'none' ||
      arms.isProjectileActive()
    )
      return
    voice.resumeAudio()
    voice.startChargeRecording()
    chargingLmb = true
  }

  function onMouseUp(e: MouseEvent): void {
    if (e.button !== 0) return
    if (!chargingLmb) return
    chargingLmb = false
    void releaseVoiceShot()
  }

  renderer.domElement.addEventListener('mousedown', onMouseDown)
  window.addEventListener('mouseup', onMouseUp)
  renderer.domElement.addEventListener('contextmenu', (ev) => ev.preventDefault())

  document.getElementById('bot-dummy')?.addEventListener('click', () => recreateBot('dummy'))
  document.getElementById('bot-smart')?.addEventListener('click', () => recreateBot('smart'))
  document.getElementById('fight-rematch')?.addEventListener('click', () => instantHudRematch())

  function onResize() {
    const w = window.innerWidth
    const h = Math.max(window.innerHeight, 1)
    camera.aspect = w / h
    camera.updateProjectionMatrix()
    renderer.setSize(w, h)
    composer.setSize(w, h)
  }
  window.addEventListener('resize', onResize)

  function updateMovement(delta: number) {
    if (voiceInputBlocked || voiceResumeCountdownActive) return

    const groundedBeforeResolve = grounded

    vy -= gameConfig.gravity * delta
    camera.position.y += vy * delta

    const canWalk = playerHurt === 'none'

    if (canWalk) {
      velocity.x -= velocity.x * gameConfig.damping * delta
      velocity.z -= velocity.z * gameConfig.damping * delta

      direction.z = Number(keys.forward) - Number(keys.back)
      direction.x = Number(keys.right) - Number(keys.left)
      direction.normalize()

      if (keys.forward || keys.back) {
        velocity.z -= direction.z * gameConfig.moveSpeed * delta
      }
      if (keys.left || keys.right) {
        velocity.x -= direction.x * gameConfig.moveSpeed * delta
      }

      controls.moveRight(-velocity.x * delta)
      controls.moveForward(-velocity.z * delta)
    } else {
      velocity.set(0, 0, 0)
      dashVel.set(0, 0, 0)
    }

    if (dashCdMs > 0) dashCdMs -= delta * 1000

    camera.position.x += (playerKnock.x + dashVel.x) * delta
    camera.position.z += (playerKnock.z + dashVel.z) * delta

    if (playerHurt === 'air') {
      playerKnock.multiplyScalar(Math.exp(-Math.max(0.4, gameConfig.knockHurtAirDrag) * delta))
    } else if (playerHurt === 'recover') {
      playerKnock.multiplyScalar(Math.exp(-14 * delta))
    } else {
      playerKnock.multiplyScalar(Math.exp(-11 * delta))
    }
    dashVel.multiplyScalar(Math.exp(-gameConfig.dashDecay * delta))

    resolveGround()

    if (playerHurt === 'air') {
      const elapsed = performance.now() - playerHurtAirSince
      const landed = !groundedBeforeResolve && grounded
      const slideEnd =
        grounded && playerKnock.length() < 2.4 && elapsed > 175
      const groundedTimeout = grounded && elapsed > 1050
      if (landed || slideEnd || groundedTimeout) {
        playerHurt = 'recover'
        playerHurtRecoverLeft = gameConfig.playerKnockRecoverMs / 1000
        playerKnock.multiplyScalar(0.5)
      }
    } else if (playerHurt === 'recover') {
      playerHurtRecoverLeft -= delta
      if (playerHurtRecoverLeft <= 0) {
        playerHurt = 'none'
        playerInvulnUntil = performance.now() + gameConfig.playerPostKnockInvulnMs
      }
    }

    controls.pointerSpeed = gameConfig.mouseSensitivity
  }

  function triggerHitImpactFx(): void {
    shakeIntensity = Math.max(shakeIntensity, gameConfig.hitScreenShake)
    flashIntensity = Math.max(flashIntensity, gameConfig.hitFlashOpacity)
  }

  function applyHitPresentation(delta: number): void {
    camera.position.sub(prevShake)
    prevShake.set(0, 0, 0)
    if (shakeIntensity > 0.004) {
      shakeIntensity *= Math.exp(-21 * delta)
      prevShake.set(
        (Math.random() - 0.5) * 2 * shakeIntensity,
        (Math.random() - 0.5) * 2 * shakeIntensity * 0.52,
        (Math.random() - 0.5) * 2 * shakeIntensity,
      )
      camera.position.add(prevShake)
    } else {
      shakeIntensity = 0
    }
    if (hitFlashEl) {
      if (flashIntensity > 0.012) {
        flashIntensity *= Math.exp(-26 * delta)
        hitFlashEl.style.opacity = String(Math.min(1, flashIntensity))
      } else {
        flashIntensity = 0
        hitFlashEl.style.opacity = '0'
      }
    }
  }

  function animate() {
    const delta = Math.min(clock.getDelta(), gameConfig.movementMaxDelta)

    if (voiceInputBlocked && chargingLmb) {
      chargingLmb = false
      voice.resetChargeMeter()
      voiceChargeSmoothed = 0
      void voice.finishChargeRecording()
      if (chargeBarFill) chargeBarFill.style.width = '0%'
    }

    if (!voiceInputBlocked && !voiceResumeCountdownActive) {
      voiceChargeSmoothed = voice.tickChargeMeter(delta, chargingLmb)
    }
    if (chargeBarFill) {
      const pct = Math.min(150, voiceChargeSmoothed * 100)
      chargeBarFill.style.width = `${pct}%`
    }
    if (chargeBarMinMark) {
      chargeBarMinMark.style.left = `${gameConfig.voiceChargeMinRelease * 100}%`
    }
    if (chargeBarWrap) {
      if (voiceChargeSmoothed >= gameConfig.voiceOverloadThreshold) {
        chargeBarWrap.classList.add('charge-bar-wrap--overload')
      } else {
        chargeBarWrap.classList.remove('charge-bar-wrap--overload')
      }
    }

    const dashSpd = dashVel.length()
    dashTiltDeg *= Math.exp(-13.5 * delta)
    if (Math.abs(dashTiltDeg) < 0.08) {
      dashTiltDeg = 0
      gameRoot.classList.remove('game-root--dash-tilt')
      gameRoot.style.transform = ''
    } else {
      gameRoot.style.transform = `rotateZ(${dashTiltDeg.toFixed(3)}deg)`
    }
    if (dashScanEl) {
      const o = Math.min(0.72, dashSpd * 0.045 + dashSpd * dashSpd * 0.0012)
      dashScanEl.style.opacity = dashSpd > 0.35 ? String(o) : String(o * 0.65)
      if (dashSpd < 0.18) dashScanEl.style.opacity = '0'
    }

    if (parryArmMeshL && parryArmMeshR && parryGuardRoot) {
      const showGuard =
        performance.now() < parryGuardUntil &&
        !matchOutcome &&
        !tweaksPanelOpen &&
        !winFinisher &&
        !rematchSequenceActive &&
        playerHurt === 'none' &&
        !chargingLmb &&
        !arms.isProjectileActive()
      parryArmMeshL.visible = showGuard
      parryArmMeshR.visible = showGuard
      parryGuardRoot.visible = showGuard
    }

    if (!tweaksPanelOpen) {
      if (
        !matchOutcome &&
        !rematchSequenceActive &&
        !voiceInputBlocked &&
        !voiceResumeCountdownActive
      ) {
        updateMovement(delta)
        resolveCombat(delta)
      } else if (matchOutcome) {
        arms.update(delta)
      }
    }

    applyHitPresentation(delta)

    if (invulnShineEl) {
      const now = performance.now()
      const left = playerInvulnUntil - now
      if (left > 0) {
        invulnShineEl.hidden = false
        invulnShineEl.classList.add('invuln-shine--on')
        const span = Math.max(400, gameConfig.playerPostKnockInvulnMs)
        const wave = 0.19 + Math.sin(now * 0.0085) * 0.14
        invulnShineEl.style.opacity = String(
          Math.min(0.42, wave * Math.min(1, left / span)),
        )
      } else {
        invulnShineEl.style.opacity = '0'
        invulnShineEl.hidden = true
        invulnShineEl.classList.remove('invuln-shine--on')
      }
    }

    composer.render()
  }

  renderer.setAnimationLoop(animate)

  function tryPointerLock(): void {
    if (
      tweaksPanelOpen ||
      matchOutcome ||
      winFinisher ||
      rematchSequenceActive ||
      voiceInputBlocked ||
      voiceResumeCountdownActive
    )
      return
    void controls.lock()
  }

  /** Browser gesture policy: lock right after name entry; silent retry on first pointer event. */
  queueMicrotask(() => tryPointerLock())
  window.addEventListener('pointerdown', tryPointerLock, { capture: true, once: true })
  queueMicrotask(() => {
    void initVoiceInput()
  })

  matchEndOverlay?.querySelector('#match-rematch-btn')?.addEventListener('click', () => {
    resetMatch()
  })
  matchEndOverlay?.querySelector('#match-close-btn')?.addEventListener('click', () => {
    resetMatch()
  })

  const tweaksHost = document.getElementById('tweaks-panel-host')
  if (tweaksHost) {
    mountTweaksPanel(tweaksHost, {
      controls,
      camera,
      ambient,
      sun,
      onToggle(open) {
        tweaksPanelOpen = open
        if (!open) tryPointerLock()
      },
      onConfigChanged: scheduleRoundResetAfterTweak,
    })
  }
}

runUsernameGate()
  .then(() => runLobbyGate(readStoredName()?.trim() || 'Angler'))
  .then(() => {
    gameRoot.hidden = false
    initGame()
  })
