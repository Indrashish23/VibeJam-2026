import {
  AnimationAction,
  AnimationClip,
  AnimationMixer,
  Box3,
  BoxGeometry,
  CapsuleGeometry,
  Color,
  Group,
  LoopOnce,
  LoopRepeat,
  Material,
  Mesh,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  Object3D,
  PerspectiveCamera,
  Scene,
  Vector3,
} from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { gameConfig } from '../gameConfig'
import {
  applyMonkeyExternalBaseColorTexture,
  applyMonkeyFlatVertexPixelatedStyle,
} from './monkeyVisualStyle'
import { VoiceProjectileVisual } from './voiceProjectileVisual'
import {
  pickClipForSlot,
  type AvatarBaseClip,
  type AvatarClipName,
  type AvatarOneShotClip,
} from './localPlayerAvatar'
import { advanceProjectilePastTerrain } from '../physics/projectileTerrain'
import type { TerrainPhysics } from '../physics/terrainPhysics'

export type BotProfile = {
  reactionMs: number
  aimJitterDegSigma: number
  predictionConfidence: number
  dodgeRate: number
  decisionMargin: number
  shotGapMs: readonly [number, number]
  commitmentMs: readonly [number, number]
  chargeWindupMs: number
  windupMoveScale: number
  dodgeWindowMs: readonly [number, number]
  dodgeDurationMs: number
  ringMargin: number
}

/** Mid-tier human-like opponent defaults (windup telegraph → predictionConfidence 0.7 day-one). */
export const MID_TIER_PROFILE: BotProfile = {
  reactionMs: 180,
  aimJitterDegSigma: 2,
  predictionConfidence: 0.7,
  dodgeRate: 0.35,
  decisionMargin: 0.15,
  shotGapMs: [800, 1400],
  commitmentMs: [400, 800],
  chargeWindupMs: 350,
  windupMoveScale: 0.6,
  dodgeWindowMs: [200, 500],
  dodgeDurationMs: 150,
  /** Keep bot well inside the deck; rays + inward steering also pull away from ring-out. */
  ringMargin: 5.5,
}

type MoveState = 'approach' | 'spacing' | 'reposition' | 'unstuck'

const BOT_GLB_IDLE = new URL('../../Assets/MonkeyModel/Idle.glb', import.meta.url).href
const BOT_GLB_RUNNING = new URL('../../Assets/MonkeyModel/Running.glb', import.meta.url).href
const BOT_GLB_JUMPING = new URL('../../Assets/MonkeyModel/Jumping.glb', import.meta.url).href
const BOT_GLB_HITREACT = new URL('../../Assets/MonkeyModel/HitReact.glb', import.meta.url).href
const BOT_GLB_RECORDING = new URL('../../Assets/MonkeyModel/RecordingSound.glb', import.meta.url).href
const BOT_GLB_SHOOTING = new URL('../../Assets/MonkeyModel/ShootingSound.glb', import.meta.url).href

export type BotMode = 'dummy' | 'smart' | 'network'

export class BotFighter {
  readonly root = new Group()
  readonly mode: BotMode
  readonly bodyCenter = new Vector3()

  velocity = new Vector3()
  knockXZ = new Vector3()
  vy = 0
  grounded = true

  dashCd = 0

  private hurtPhase: 'none' | 'air' | 'recover' = 'none'
  private hurtRecoverLeft = 0
  private hurtFinisher = false
  private hurtAirSince = 0

  private readonly profile: BotProfile
  private readonly lastPlayerPos = new Vector3()
  private hasPlayerSample = false
  private readonly smoothedPlayerVel = new Vector3()
  private readonly playerSampleBuffer: { t: number; pos: Vector3; vel: Vector3 }[] = []
  private playerCharging = false
  private prevPlayerCharging = false
  private recentDamageTaken = 0
  private recentHitsLanded = 0
  private intentPlayerPercent = 0
  private intentBotPercent = 0
  private currentIntent: 'push' | 'hold' | 'retreat' = 'hold'
  private moveState: MoveState = 'approach'
  private moveCommitLeftMs = 0
  private strafeSign: -1 | 1 = Math.random() < 0.5 ? -1 : 1
  private dodgeUntilMs = 0
  private dodgeScheduleAtMs = 0
  private readonly dodgeDir = new Vector3()
  private smartDesiredSpeed = 0
  private smartStuckAcc = 0
  private readonly smartUnstuckDir = new Vector3(1, 0, 0)
  private shotState: 'idle' | 'windup' = 'idle'
  private windupLeftMs = 0
  private pendingSpeedMul = 1
  private shotGapLeftMs = 0
  /** Cooldown for opportunistic jumps toward an elevated player (smart mode). */
  private smartJumpCdMs = 0
  private aiSuppressed = false
  private netAnimOneShotOut: AvatarOneShotClip | null = null
  private netAnimEpoch = 0
  private windupEpochBumped = false
  private readonly smartMoveDir = new Vector3(0, 0, 1)
  private onHostAiVoiceShot:
    | ((p: {
        ox: number
        oy: number
        oz: number
        vx: number
        vy: number
        vz: number
        speedMul: number
        shotScale: number
      }) => void)
    | null = null

  mesh: Mesh
  private readonly bodyMat: MeshStandardMaterial
  private readonly baseBodyColor: Color
  private readonly recordingBodyColor = new Color(0xff4d4f)
  private recordingTelegraph = false
  private recordingTelegraphMix = 0
  private recordingShakeT = 0
  readonly projVfx: VoiceProjectileVisual

  private readonly feetFromCenter: number

  /** Monkey GLB visual (loaded async; replaces the capsule once ready). */
  private monkeyWrap: Group | null = null
  private monkeyRoot: Object3D | null = null
  private monkeyMixer: AnimationMixer | null = null
  private readonly monkeyActions = new Map<AvatarClipName, AnimationAction>()
  private monkeyCurrentBase: AvatarBaseClip = 'idle'
  private monkeyActiveOneShot: AvatarOneShotClip | null = null
  private monkeyAutoFitScale = 1
  private monkeyBboxMinYAtUnit = 0
  private monkeyShakeX = 0
  private monkeyShakeZ = 0
  private monkeyShakeRollZ = 0
  private monkeyFinishedHandler: ((ev: { action?: AnimationAction }) => void) | null = null
  private readonly monkeyMaterials: { mat: MeshStandardMaterial | MeshPhysicalMaterial; baseColor: Color }[] = []
  private victimInvulnFlashEnd = 0
  private readonly _flashWhite = new Color(0xffffff)
  private respawnMeshFlashUntil = 0
  /** Banana slip: no locomotion/attack until this time. */
  bananaSlipUntil = 0

  /** Set by network mode (overrides locally-derived animation evaluation). */
  private remoteAnimBase: AvatarBaseClip | null = null
  private remoteAnimOneShot: AvatarOneShotClip | null = null
  private lastRemoteOneShotEpoch = 0
  /** Bot's current speed-normalized for run blend / future tuning. */
  speedN = 0

  /** World-space ballistic (matches player projectile integration). */
  projActive = false
  projFlying = false
  readonly projPos = new Vector3()
  readonly projVel = new Vector3()
  private readonly projSpawn = new Vector3()
  private readonly projIntegratePrev = new Vector3()
  private readonly projTerrainResolve = new Vector3()
  projDealt = true
  private projSizeMul = 1

  /** Optional decoded clip on bot projectile (PvP / future); spatial playback for victim. */
  private projHitAudio: AudioBuffer | null = null

  /** PvP peer avatar — smoothed from snapshots (world space). */
  readonly networkTargetPos = new Vector3()
  networkTargetYaw = 0

  constructor(
    scene: Scene,
    mode: BotMode,
    startPos: Vector3,
    opts?: {
      bodyColor?: number
      profile?: BotProfile
      onHostAiVoiceShot?: (p: {
        ox: number
        oy: number
        oz: number
        vx: number
        vy: number
        vz: number
        speedMul: number
        shotScale: number
      }) => void
    },
  ) {
    this.mode = mode
    this.profile = opts?.profile ?? MID_TIER_PROFILE
    this.onHostAiVoiceShot = opts?.onHostAiVoiceShot ?? null
    this.root.name = 'avatar:enemy'
    const bodyHex =
      typeof opts?.bodyColor === 'number'
        ? opts.bodyColor
        : mode === 'dummy'
          ? 0x5b8cff
          : mode === 'network'
            ? 0x5cffb8
            : 0xff6b4a
    const mat = new MeshStandardMaterial({
      color: new Color(bodyHex),
      roughness: 0.78,
      metalness: 0.12,
    })
    this.bodyMat = mat
    this.baseBodyColor = new Color(bodyHex)
    let geo: BoxGeometry | CapsuleGeometry
    let feet: number
    try {
      geo = new CapsuleGeometry(gameConfig.botBodyRadius * 0.85, 1.45, 5, 10)
      const p = geo.parameters
      feet = p.height * 0.5 + p.radius
    } catch {
      geo = new BoxGeometry(
        gameConfig.botBodyRadius * 1.6,
        1.65,
        gameConfig.botBodyRadius * 1.6,
      )
      feet = geo.parameters.height * 0.5
    }
    this.feetFromCenter = feet
    this.mesh = new Mesh(geo, mat)
    this.mesh.castShadow = true
    this.mesh.receiveShadow = true
    this.root.add(this.mesh)

    this.projVfx = new VoiceProjectileVisual(scene)

    this.root.position.copy(startPos)
    this.networkTargetPos.copy(this.root.position)
    scene.add(this.root)

    this.shotGapLeftMs = this.randomShotGapMs()

    void this.loadMonkeyVisual()
  }

  private randomShotGapMs(): number {
    const [a, b] = this.profile.shotGapMs
    return a + Math.random() * (b - a)
  }

  /** Load and attach the monkey GLB + every animation slot; once it's in, hide the capsule mesh. */
  private async loadMonkeyVisual(): Promise<void> {
    try {
      const loader = new GLTFLoader()
      const idleGltf = await loadBotGltf(loader, BOT_GLB_IDLE)
      const sceneRoot = idleGltf.scene as Object3D

      /* Auto-fit the monkey to the same target height the local player uses (eyeHeight + 0.20). */
      sceneRoot.updateMatrixWorld(true)
      const bbox = new Box3().setFromObject(sceneRoot)
      const naturalH = Math.max(0.1, bbox.max.y - bbox.min.y)
      const targetH = gameConfig.eyeHeight + 0.2
      const scaleNum = targetH / naturalH
      this.monkeyAutoFitScale = scaleNum
      this.monkeyBboxMinYAtUnit = bbox.min.y

      const wrap = new Group()
      wrap.rotation.order = 'YXZ'
      wrap.add(sceneRoot)
      this.applyMonkeyTransform(wrap)
      this.root.add(wrap)
      this.monkeyWrap = wrap
      this.monkeyRoot = sceneRoot
      try {
        await applyMonkeyExternalBaseColorTexture(sceneRoot)
      } catch (err) {
        console.warn('[bot] Failed to load monkey base-color texture; GLB maps kept', err)
      }
      applyMonkeyFlatVertexPixelatedStyle(sceneRoot)
      sceneRoot.traverse((o) => {
        const mo = o as Mesh
        if (mo.isMesh) {
          mo.castShadow = true
          mo.receiveShadow = true
        }
      })

      /* Hide the capsule visual now that the monkey is rendering. The hit-detection capsule (math) is unaffected. */
      this.mesh.visible = false

      /* Collect material refs + their original colors so we can tint for the recording telegraph. */
      sceneRoot.traverse((o) => {
        const meshObj = o as Mesh
        const m = meshObj.material as Material | Material[] | undefined
        if (!m) return
        const mats: Material[] = Array.isArray(m) ? m : [m]
        for (const mm of mats) {
          if (
            mm instanceof MeshStandardMaterial ||
            mm instanceof MeshPhysicalMaterial
          ) {
            this.monkeyMaterials.push({
              mat: mm,
              baseColor: mm.color.clone(),
            })
          }
        }
      })

      this.monkeyMixer = new AnimationMixer(sceneRoot)
      this.monkeyFinishedHandler = (ev) => {
        const shot = this.monkeyActiveOneShot
        if (!shot) return
        if (shot === 'recording' && this.recordingTelegraph) {
          return
        }
        const a = this.monkeyActions.get(shot)
        if (!a || ev.action !== a) return
        this.monkeyActiveOneShot = null
        a.stop()
        this.playMonkeyBase(this.monkeyCurrentBase, true)
      }
      this.monkeyMixer.addEventListener('finished', this.monkeyFinishedHandler)

      /* Bind idle from this gltf, then load other slots in parallel. */
      const idleClip = pickClipForSlot(idleGltf, 'idle')
      if (idleClip) this.bindMonkeyClip('idle', idleClip)

      await Promise.all([
        this.loadAndBindBotClip(loader, BOT_GLB_RUNNING, 'running'),
        this.loadAndBindBotClip(loader, BOT_GLB_JUMPING, 'jumping'),
        this.loadAndBindBotClip(loader, BOT_GLB_HITREACT, 'hitreact'),
        this.loadAndBindBotClip(loader, BOT_GLB_RECORDING, 'recording'),
        this.loadAndBindBotClip(loader, BOT_GLB_SHOOTING, 'shooting'),
      ])

      this.playMonkeyBase('idle', true)
    } catch (err) {
      console.warn('[bot] Failed to load monkey GLB; keeping capsule fallback', err)
    }
  }

  private async loadAndBindBotClip(
    loader: GLTFLoader,
    url: string,
    slot: AvatarClipName,
  ): Promise<void> {
    try {
      const gltf = await loadBotGltf(loader, url)
      const clip = pickClipForSlot(gltf, slot)
      if (!clip) {
        console.warn(`[bot] ${slot} clip missing in`, url)
        return
      }
      this.bindMonkeyClip(slot, clip)
    } catch (err) {
      console.warn(`[bot] Failed to load ${slot} clip`, err)
    }
  }

  private bindMonkeyClip(slot: AvatarClipName, clip: AnimationClip): void {
    if (!this.monkeyMixer) return
    const action = this.monkeyMixer.clipAction(clip)
    action.enabled = true
    action.clampWhenFinished = slot === 'recording' || slot === 'shooting'
    this.monkeyActions.set(slot, action)
  }

  private playMonkeyBase(next: AvatarBaseClip, immediate = false): void {
    if (this.monkeyCurrentBase === next && !immediate) return
    const nextAction = this.monkeyActions.get(next)
    if (!nextAction) return
    const prevAction = this.monkeyActions.get(this.monkeyCurrentBase)
    if (immediate || !prevAction) {
      prevAction?.stop()
      nextAction.reset().setEffectiveWeight(1).play()
    } else {
      prevAction.fadeOut(0.14)
      nextAction.reset().setEffectiveWeight(1).fadeIn(0.14).play()
    }
    this.monkeyCurrentBase = next
  }

  private playMonkeyOneShot(name: AvatarOneShotClip): void {
    const action = this.monkeyActions.get(name)
    if (!action) return
    if (this.monkeyActiveOneShot) {
      const prev = this.monkeyActions.get(this.monkeyActiveOneShot)
      prev?.fadeOut(0.05)
      prev?.stop()
    }
    const base = this.monkeyActions.get(this.monkeyCurrentBase)
    base?.fadeOut(0.06)
    action.reset()
    action.setEffectiveWeight(1)
    if (name === 'recording') {
      /* Hold LMB / peer charging: keep the recording motion cycling until release. */
      action.setLoop(LoopRepeat, Number.POSITIVE_INFINITY)
      action.clampWhenFinished = false
    } else {
      action.setLoop(LoopOnce, 1)
      action.clampWhenFinished = true
    }
    action.fadeIn(0.06)
    action.play()
    this.monkeyActiveOneShot = name
  }

  /** Compute & apply monkey wrap transform: feet pinned to capsule bottom, ec* offsets, yaw correction, shake. */
  private applyMonkeyTransform(wrap: Group): void {
    const scaleMul = Math.max(0.05, gameConfig.ecAvatarScale)
    const finalScale = this.monkeyAutoFitScale * scaleMul
    if (Math.abs(wrap.scale.x - finalScale) > 1e-3) wrap.scale.setScalar(finalScale)

    /* Pin feet at root.y - feetFromCenter (capsule bottom in root-local space).
       In wrap-local space the model's feet are at `bboxMinYAtUnit * finalScale`. */
    const feetLocalAtScale = this.monkeyBboxMinYAtUnit * finalScale
    wrap.position.set(
      gameConfig.ecAvatarSide + gameConfig.ecModelTransX + this.monkeyShakeX,
      -this.feetFromCenter - feetLocalAtScale + gameConfig.ecAvatarYOffset + gameConfig.ecModelTransY,
      gameConfig.ecAvatarForward + gameConfig.ecModelTransZ + this.monkeyShakeZ,
    )
    /** PvP opponent only: GLB forward vs gameplay facing; dummy/smart unchanged. */
    const networkModelYaw = this.mode === 'network' ? Math.PI : 0
    wrap.rotation.set(
      gameConfig.ecModelRotX,
      gameConfig.ecAvatarYawOffset + gameConfig.ecModelRotY + networkModelYaw,
      this.monkeyShakeRollZ,
    )
  }

  /** Network-mode: feed authoritative animation state from the peer's pose packet. */
  setRemoteAnimState(base: AvatarBaseClip, oneShot: AvatarOneShotClip | null, oneShotEpoch?: number): void {
    this.remoteAnimBase = base
    if (oneShot && oneShotEpoch !== undefined && oneShotEpoch !== this.lastRemoteOneShotEpoch) {
      this.remoteAnimOneShot = oneShot
      this.lastRemoteOneShotEpoch = oneShotEpoch
    }
  }

  isBananaSlipNow(now = performance.now()): boolean {
    return now < this.bananaSlipUntil
  }

  applyBananaSlipMs(durationMs: number): void {
    this.bananaSlipUntil = performance.now() + Math.max(0, durationMs)
  }

  private clearBananaSlipOnHit(): void {
    this.bananaSlipUntil = 0
  }

  /** Resolve the monkey's locomotor base from this bot's own physics (used by dummy/smart modes). */
  private resolveLocalBase(): AvatarBaseClip {
    if (this.isBananaSlipNow()) return 'hitreact'
    if (this.hurtPhase !== 'none') return 'hitreact'
    if (!this.grounded) return 'jumping'
    return this.speedN > gameConfig.botSmartRunAnimThreshold ? 'running' : 'idle'
  }

  private updateMonkeyAnimation(delta: number): void {
    if (!this.monkeyMixer) return

    if (!this.recordingTelegraph && this.monkeyActiveOneShot === 'recording') {
      const rec = this.monkeyActions.get('recording')
      this.monkeyActiveOneShot = null
      if (rec) {
        rec.fadeOut(0.1)
        rec.stop()
      }
    }

    let base: AvatarBaseClip
    if (this.mode === 'network' && this.isBananaSlipNow()) {
      base = 'hitreact'
    } else if (this.mode === 'network' && this.remoteAnimBase) {
      base = this.remoteAnimBase
      if (this.remoteAnimOneShot) {
        const shot = this.remoteAnimOneShot
        this.remoteAnimOneShot = null
        this.playMonkeyOneShot(shot)
      }
    } else {
      base = this.resolveLocalBase()
      /* Recording telegraph drives a one-shot for dummy/smart bots. */
      if (this.recordingTelegraph && this.monkeyActiveOneShot !== 'recording' && base !== 'hitreact') {
        this.playMonkeyOneShot('recording')
      }
    }

    if (this.monkeyActiveOneShot && base === 'hitreact') {
      const prev = this.monkeyActions.get(this.monkeyActiveOneShot)
      this.monkeyActiveOneShot = null
      prev?.fadeOut(0.04)
      prev?.stop()
      this.playMonkeyBase('hitreact')
    } else if (!this.monkeyActiveOneShot) {
      this.playMonkeyBase(base)
    }

    this.monkeyMixer.update(delta)
  }

  /** Feet offset from root Y (capsule geometry). */
  getFootOffset(): number {
    return this.feetFromCenter
  }

  setPlayerCharging(charging: boolean): void {
    this.playerCharging = charging
  }

  setIntentInputs(playerPercent: number, botPercent: number): void {
    this.intentPlayerPercent = playerPercent
    this.intentBotPercent = botPercent
  }

  /** When true, smart AI does not start windups or fire (e.g. win finisher sequence). */
  setAiSuppressed(suppressed: boolean): void {
    this.aiSuppressed = suppressed
    if (!suppressed) {
      this.playerSampleBuffer.length = 0
      this.hasPlayerSample = false
    }
  }

  setHostAiVoiceShotHandler(
    cb:
      | ((
          p: {
            ox: number
            oy: number
            oz: number
            vx: number
            vy: number
            vz: number
            speedMul: number
            shotScale: number
          },
        ) => void)
      | null,
  ): void {
    this.onHostAiVoiceShot = cb
  }

  isWindingUp(): boolean {
    return this.shotState === 'windup'
  }

  /** Animation base for outbound `pose` when replicating host-side AI. */
  deriveAnimBaseForNet(): AvatarBaseClip {
    if (this.isBananaSlipNow()) return 'hitreact'
    if (this.hurtPhase !== 'none') return 'hitreact'
    if (!this.grounded) return 'jumping'
    return this.speedN > gameConfig.botSmartRunAnimThreshold ? 'running' : 'idle'
  }

  peekNetAnimOneShotForPose(): AvatarOneShotClip | null {
    return this.netAnimOneShotOut
  }

  getNetAnimEpoch(): number {
    return this.netAnimEpoch
  }

  /**
   * Opponent voice shot replicated in world space (same ballistic integration as local arms).
   */
  /** Late-bind decoded peer voice to the current replicated projectile (follow-up `voiceShotAudio`). */
  attachReplicatedProjectileAudio(voiceClip: AudioBuffer | null): void {
    if (!this.projActive || !this.projFlying) return
    this.projHitAudio = voiceClip
  }

  injectWorldProjectile(
    worldOrigin: Vector3,
    velWorld: Vector3,
    voiceClip: AudioBuffer | null,
    sizeMul = 1,
  ): void {
    if (this.mode === 'network' && this.projActive) {
      this.clearProjectile()
    } else if (this.projActive) return
    this.projPos.copy(worldOrigin)
    this.projSpawn.copy(worldOrigin)
    this.projVel.copy(velWorld)
    this.projActive = true
    this.projFlying = true
    this.projDealt = false
    this.projSizeMul = Math.max(0.15, Math.min(6, sizeMul))
    this.projHitAudio = voiceClip
    _work.copy(worldOrigin).add(velWorld)
    this.faceToward(_work)
  }

  dispose(scene: Scene): void {
    scene.remove(this.root)
    this.projVfx.dispose(scene)
    this.mesh.geometry.dispose()
    ;(this.mesh.material as MeshStandardMaterial).dispose()
    if (this.monkeyMixer) {
      if (this.monkeyFinishedHandler) {
        this.monkeyMixer.removeEventListener('finished', this.monkeyFinishedHandler)
        this.monkeyFinishedHandler = null
      }
      this.monkeyMixer.stopAllAction()
      this.monkeyMixer = null
    }
    this.monkeyActions.clear()
    if (this.monkeyRoot) {
      this.monkeyRoot.traverse((o) => {
        const meshObj = o as Mesh
        const m = meshObj.material as Material | Material[] | undefined
        if (Array.isArray(m)) for (const mm of m) mm?.dispose?.()
        else m?.dispose?.()
        meshObj.geometry?.dispose?.()
      })
      this.monkeyRoot = null
    }
    this.monkeyWrap = null
    this.monkeyMaterials.length = 0
  }

  resetRoundState(): void {
    this.velocity.set(0, 0, 0)
    this.knockXZ.set(0, 0, 0)
    this.vy = 0
    this.moveState = 'approach'
    this.moveCommitLeftMs = 0
    this.strafeSign = Math.random() < 0.5 ? -1 : 1
    this.shotGapLeftMs = this.randomShotGapMs()
    this.shotState = 'idle'
    this.windupLeftMs = 0
    this.windupEpochBumped = false
    this.pendingSpeedMul = 1
    this.currentIntent = 'hold'
    this.recentDamageTaken = 0
    this.recentHitsLanded = 0
    this.playerCharging = false
    this.prevPlayerCharging = false
    this.dodgeUntilMs = 0
    this.dodgeScheduleAtMs = 0
    this.smartJumpCdMs = 0
    this.smartMoveDir.set(0, 0, 1)
    this.smartDesiredSpeed = 0
    this.smartStuckAcc = 0
    this.smartUnstuckDir.set(1, 0, 0)
    this.hurtPhase = 'none'
    this.hurtRecoverLeft = 0
    this.hurtFinisher = false
    this.bananaSlipUntil = 0
    this.recordingTelegraph = false
    this.recordingTelegraphMix = 0
    this.recordingShakeT = 0
    this.monkeyShakeX = 0
    this.monkeyShakeZ = 0
    this.monkeyShakeRollZ = 0
    this.mesh.position.set(0, 0, 0)
    this.mesh.rotation.z = 0
    this.bodyMat.color.copy(this.baseBodyColor)
    if (this.monkeyWrap) this.applyMonkeyTransform(this.monkeyWrap)
    for (const { mat, baseColor } of this.monkeyMaterials) {
      mat.color.copy(baseColor)
    }
    this.clearProjectile()
    this.playerSampleBuffer.length = 0
    this.hasPlayerSample = false
    this.netAnimOneShotOut = null
    this.netAnimEpoch = 0
    this.aiSuppressed = false
    this.respawnMeshFlashUntil = 0
  }

  setRecordingTelegraph(active: boolean): void {
    this.recordingTelegraph = active
  }

  /** Brief white tint (invuln / got hit feedback) on the visible bot mesh. */
  flashVictimInvuln(ms: number): void {
    this.victimInvulnFlashEnd = performance.now() + Math.max(80, ms)
  }

  /** Post-respawn invulnerability: toggle visible mesh opacity cadence (`respawnFlashHz`). */
  beginRespawnMeshFlash(durationMs: number): void {
    this.respawnMeshFlashUntil = performance.now() + Math.max(0, durationMs)
  }

  private applyRespawnMeshFlash(): void {
    const now = performance.now()
    if (now >= this.respawnMeshFlashUntil) {
      if (this.monkeyWrap) this.monkeyWrap.visible = true
      else this.mesh.visible = true
      return
    }
    const hz = Math.max(1, gameConfig.respawnFlashHz)
    const phase = Math.floor((now / 1000) * hz)
    const vis = phase % 2 === 0
    if (this.monkeyWrap) this.monkeyWrap.visible = vis
    else this.mesh.visible = vis
  }

  private applyVictimInvulnFlash(): void {
    const left = this.victimInvulnFlashEnd - performance.now()
    if (left <= 0) return
    const peak = Math.min(0.92, left / Math.max(120, gameConfig.hitVictimWhiteFlashMs * 0.85))
    this.bodyMat.color.copy(this.baseBodyColor).lerp(this._flashWhite, peak)
    for (const { mat, baseColor } of this.monkeyMaterials) {
      mat.color.copy(baseColor).lerp(this._flashWhite, peak)
    }
  }

  private updateRecordingTelegraph(delta: number): void {
    const target = this.recordingTelegraph ? 1 : 0
    const k = this.recordingTelegraph ? 2.8 : 4.2
    this.recordingTelegraphMix += (target - this.recordingTelegraphMix) * (1 - Math.exp(-k * delta))
    const mix = this.recordingTelegraphMix
    this.bodyMat.color.copy(this.baseBodyColor).lerp(this.recordingBodyColor, mix)
    /* Tint the monkey materials toward the danger color while telegraphing. */
    for (const { mat, baseColor } of this.monkeyMaterials) {
      mat.color.copy(baseColor).lerp(this.recordingBodyColor, mix)
    }

    if (mix < 1e-3) {
      this.monkeyShakeX = 0
      this.monkeyShakeZ = 0
      this.monkeyShakeRollZ = 0
      this.mesh.position.x = 0
      this.mesh.position.z = 0
      this.mesh.rotation.z = 0
      return
    }

    this.recordingShakeT += delta
    const amp = 0.06 * mix
    this.monkeyShakeX = Math.sin(this.recordingShakeT * 7.2) * amp
    this.monkeyShakeZ = Math.cos(this.recordingShakeT * 5.4) * amp * 0.7
    this.monkeyShakeRollZ = Math.sin(this.recordingShakeT * 4.6) * 0.045 * mix
    /* Fallback shake on the capsule too (in case the monkey didn't load yet). */
    if (!this.monkeyWrap) {
      this.mesh.position.x = this.monkeyShakeX
      this.mesh.position.z = this.monkeyShakeZ
      this.mesh.rotation.z = this.monkeyShakeRollZ
    }
  }

  alignFacingToward(worldPos: Vector3): void {
    this.faceToward(worldPos)
  }

  private resolveTerrainCollision(terrain: TerrainPhysics, start: Vector3, deltaSeconds: number): void {
    _moveDesired.subVectors(this.root.position, start)
    this.root.position.copy(start)
    const radius = Math.max(0.05, gameConfig.botBodyRadius)
    const totalHeight = Math.max(radius * 2 + 0.08, this.feetFromCenter * 2)
    const result = terrain.moveCapsuleFromFeet(
      'bot',
      new Vector3(start.x, start.y - this.feetFromCenter, start.z),
      _moveDesired,
      radius,
      totalHeight,
      deltaSeconds,
    )
    this.root.position.add(result.movement)
    this.grounded = result.grounded
    if (this.grounded && this.vy <= 0.6) {
      this.vy = 0
    } else if (
      _moveDesired.y > 0 &&
      result.movement.y < _moveDesired.y - 0.01 &&
      this.vy <= 0.6
    ) {
      this.vy = 0
    }
  }

  private faceToward(target: Vector3): void {
    const dx = target.x - this.root.position.x
    const dz = target.z - this.root.position.z
    if (Math.abs(dx) + Math.abs(dz) < 1e-5) return
    this.root.rotation.y = Math.atan2(dx, dz)
  }

  private turnToward(target: Vector3, delta: number, maxRate: number): void {
    const dx = target.x - this.root.position.x
    const dz = target.z - this.root.position.z
    if (Math.abs(dx) + Math.abs(dz) < 1e-5) return
    const desired = Math.atan2(dx, dz)
    let dy = desired - this.root.rotation.y
    while (dy > Math.PI) dy -= Math.PI * 2
    while (dy < -Math.PI) dy += Math.PI * 2
    const step = Math.min(Math.abs(dy), Math.max(0.01, maxRate) * delta)
    this.root.rotation.y += Math.sign(dy) * step
  }

  /**
   * Ray-based wall nudge, edge speed falloff, inward pull toward stage center, AABB clamp,
   * and optional jump when the player is higher. Runs after intent velocity is chosen.
   */
  private applySmartLocomotionGuards(
    terrain: TerrainPhysics,
    playerPos: Vector3,
    moveBase: number,
    opts: { allowJump: boolean; maxSpeedMul: number },
  ): void {
    const px = this.root.position.x
    const pz = this.root.position.z
    const margin = Math.max(this.profile.ringMargin, 5.0)
    const halfX = gameConfig.groundWidth * 0.5 - margin
    const halfZ = gameConfig.groundDepth * 0.5 - margin
    const wallRayLen = 2.5
    const chestY = this.root.position.y + this.feetFromCenter * 0.78

    _steerTmp.set(0, 0, 0)
    const push = 0.82
    const rays: { dx: number; dz: number }[] = [
      { dx: 1, dz: 0 },
      { dx: -1, dz: 0 },
      { dx: 0, dz: 1 },
      { dx: 0, dz: -1 },
      { dx: 0.7071, dz: 0.7071 },
      { dx: 0.7071, dz: -0.7071 },
      { dx: -0.7071, dz: 0.7071 },
      { dx: -0.7071, dz: -0.7071 },
    ]
    for (const { dx, dz } of rays) {
      const t = terrain.raycastAlong(px, chestY, pz, dx, 0, dz, wallRayLen)
      if (t != null && t < wallRayLen * 0.94) {
        const w = 1 - t / wallRayLen
        _steerTmp.x += -dx * w * push
        _steerTmp.z += -dz * w * push
      }
    }
    if (_steerTmp.lengthSq() > 1e-7) {
      _steerTmp.normalize()
      this.velocity.addScaledVector(_steerTmp, moveBase * 0.88)
    }

    const distEdge = Math.min(halfX - Math.abs(px), halfZ - Math.abs(pz))
    const edgeBand = 6.5
    const u = distEdge < edgeBand ? Math.max(0, distEdge / edgeBand) : 1
    const edgeScale = 0.2 + 0.8 * u * u
    this.velocity.x *= edgeScale
    this.velocity.z *= edgeScale

    _steerTmp.set(-px, 0, -pz)
    if (_steerTmp.lengthSq() > 0.04) {
      _steerTmp.normalize()
      this.velocity.addScaledVector(_steerTmp, moveBase * (1 - u) * (1 - u) * 1.05)
    }

    const look = 0.5
    const npx = px + this.velocity.x * look
    const npz = pz + this.velocity.z * look
    if ((npx > halfX && this.velocity.x > 0) || (npx < -halfX && this.velocity.x < 0)) this.velocity.x = 0
    if ((npz > halfZ && this.velocity.z > 0) || (npz < -halfZ && this.velocity.z < 0)) this.velocity.z = 0

    const cap = moveBase * opts.maxSpeedMul
    let h = Math.hypot(this.velocity.x, this.velocity.z)
    if (h > cap && h > 1e-6) {
      const s = cap / h
      this.velocity.x *= s
      this.velocity.z *= s
      h = cap
    }
    this.smartDesiredSpeed = h

    if (
      opts.allowJump &&
      this.grounded &&
      this.smartJumpCdMs <= 0 &&
      this.shotState !== 'windup' &&
      this.hurtPhase === 'none'
    ) {
      const dy = playerPos.y - this.root.position.y
      if (dy > 0.42) {
        this.vy = gameConfig.jumpForce * 0.9
        this.smartJumpCdMs = 800
      }
    }
  }

  private updateSmartAi(
    delta: number,
    playerPos: Vector3,
    dist: number,
    toPx: number,
    toPz: number,
    terrain: TerrainPhysics,
  ): void {
    if (this.aiSuppressed) {
      this.velocity.set(0, 0, 0)
      this.smartDesiredSpeed = 0
      return
    }

    const now = performance.now()
    const dt = Math.max(delta, 1e-4)

    /* --- Perception --- */
    if (!this.hasPlayerSample) {
      this.lastPlayerPos.copy(playerPos)
      this.smoothedPlayerVel.set(0, 0, 0)
      this.hasPlayerSample = true
    }
    _work.subVectors(playerPos, this.lastPlayerPos).divideScalar(dt)
    this.smoothedPlayerVel.lerp(_work, 0.2)
    this.lastPlayerPos.copy(playerPos)
    this.playerSampleBuffer.push({
      t: now,
      pos: playerPos.clone(),
      vel: this.smoothedPlayerVel.clone(),
    })
    while (this.playerSampleBuffer.length && now - this.playerSampleBuffer[0].t > 600) {
      this.playerSampleBuffer.shift()
    }
    this.recentDamageTaken *= Math.exp(-delta / 1.5)
    this.recentHitsLanded *= Math.exp(-delta / 1.5)

    const safeDist = Math.max(1e-5, dist)
    const rdx = toPx / safeDist
    const rdz = toPz / safeDist
    _rad.set(rdx, 0, rdz)
    _tan.set(-rdz, 0, rdx)

    const prefer = gameConfig.botSmartPreferredRange
    const ringBand = Math.max(0.4, gameConfig.botSmartRangeBand)
    const retreatAt = gameConfig.botSmartRetreatRange
    const attackMax = gameConfig.botPunchRange * gameConfig.botSmartAttackRangeMul
    const moveBase = gameConfig.moveSpeed * gameConfig.botSmartMoveSpeedMul

    /* --- Utility scorer (push / hold / retreat) --- */
    const botHpN = Math.max(0, 1 - this.intentBotPercent / 150)
    const playerHpN = Math.max(0, 1 - this.intentPlayerPercent / 150)
    const optimalRange = gameConfig.botPunchRange * 1.1
    const distNorm = Math.min(1, Math.abs(dist - optimalRange) / 26)
    const pushScore = botHpN + (1 - playerHpN) + this.recentHitsLanded
    const holdScore = 0.5 + (1 - distNorm)
    const retreatScore = (1 - botHpN) + this.recentDamageTaken
    let nextIntent: 'push' | 'hold' | 'retreat' = 'hold'
    const mx = Math.max(pushScore, holdScore, retreatScore)
    if (mx === pushScore) nextIntent = 'push'
    else if (mx === retreatScore) nextIntent = 'retreat'
    else nextIntent = 'hold'

    const curScore =
      this.currentIntent === 'push'
        ? pushScore
        : this.currentIntent === 'retreat'
          ? retreatScore
          : holdScore
    if (mx > curScore + this.profile.decisionMargin) {
      this.currentIntent = nextIntent
    }

    /* --- Shot FSM (idle → windup → fire at windup end) --- */
    this.shotGapLeftMs -= delta * 1000

    const chargingEdge = this.playerCharging && !this.prevPlayerCharging
    this.prevPlayerCharging = this.playerCharging

    if (
      chargingEdge &&
      this.dodgeScheduleAtMs === 0 &&
      now >= this.dodgeUntilMs &&
      Math.random() < this.profile.dodgeRate
    ) {
      const [dw0, dw1] = this.profile.dodgeWindowMs
      this.dodgeScheduleAtMs = now + dw0 + Math.random() * (dw1 - dw0)
    }
    if (this.dodgeScheduleAtMs > 0 && now >= this.dodgeScheduleAtMs) {
      this.dodgeScheduleAtMs = 0
      this.dodgeDir.set(-_rad.z, 0, _rad.x).multiplyScalar(Math.random() < 0.5 ? -1 : 1)
      if (this.dodgeDir.lengthSq() < 1e-8) this.dodgeDir.set(-_rad.z, 0, _rad.x)
      this.dodgeDir.normalize()
      this.dodgeUntilMs = now + this.profile.dodgeDurationMs
    }

    if (this.shotState === 'windup') {
      this.windupLeftMs -= delta * 1000
      this.recordingTelegraph = true
      if (!this.windupEpochBumped) {
        this.netAnimOneShotOut = 'recording'
        this.netAnimEpoch++
        this.windupEpochBumped = true
      }
      this.turnToward(playerPos, delta, gameConfig.botSmartAimTurnRate)

      if (this.windupLeftMs <= 0) {
        const projSpeed =
          gameConfig.punchProjectileSpeed * this.pendingSpeedMul
        const aim = _moveDesired
        if (this.solveIntercept(aim, projSpeed)) {
          this.spawnProjectileAimed(aim, this.pendingSpeedMul)
        }
        this.shotState = 'idle'
        this.recordingTelegraph = false
        this.shotGapLeftMs = this.randomShotGapMs()
        this.windupEpochBumped = false
      }

      const wMul = this.profile.windupMoveScale
      const vx =
        now < this.dodgeUntilMs ? this.dodgeDir.x * moveBase * 1.35 : 0
      const vz =
        now < this.dodgeUntilMs ? this.dodgeDir.z * moveBase * 1.35 : 0
      if (now >= this.dodgeUntilMs) {
        /* Minimal drift during windup — solver aims at fire time */
        this.velocity.x = this.smartMoveDir.x * moveBase * wMul * 0.35
        this.velocity.z = this.smartMoveDir.z * moveBase * wMul * 0.35
      } else {
        this.velocity.x = vx
        this.velocity.z = vz
      }
      this.applySmartLocomotionGuards(terrain, playerPos, moveBase, {
        allowJump: false,
        maxSpeedMul: 0.72,
      })
      return
    }

    /* Offer windup when idle */
    const canOfferShot =
      !this.projActive &&
      this.shotGapLeftMs <= 0 &&
      dist <= attackMax &&
      dist >= 0.32 &&
      dist <= gameConfig.punchMaxRange * 0.92

    if (this.shotState === 'idle' && canOfferShot) {
      const t = Math.max(0, Math.min(1, (dist - retreatAt) / Math.max(1e-3, attackMax - retreatAt)))
      this.pendingSpeedMul =
        gameConfig.voiceShotSpeedMinMul +
        (1 - t) * (gameConfig.voiceShotSpeedMaxMul - gameConfig.voiceShotSpeedMinMul) * 0.92
      this.shotState = 'windup'
      this.windupLeftMs = this.profile.chargeWindupMs
      this.windupEpochBumped = false
      this.recordingTelegraph = true
      return
    }

    /* --- Movement commitment --- */
    if (this.moveState !== 'unstuck') {
      if (this.moveCommitLeftMs <= 0 || this.recentDamageTaken > 1.5) {
        const r = gameConfig.botPunchRange
        let wApproach = 0.25
        let wSpacing = 0.35
        let wRetreat = 0.25
        if (dist > r * 1.4) {
          wApproach = 0.65
          wSpacing = 0.28
          wRetreat = 0.07
        } else if (dist < r * 0.89) {
          wApproach = 0.08
          wSpacing = 0.27
          wRetreat = 0.65
        }
        if (this.currentIntent === 'push') wApproach *= 1.35
        if (this.currentIntent === 'retreat') wRetreat *= 1.35
        const sum = wApproach + wSpacing + wRetreat
        const pick = Math.random() * sum
        if (pick < wApproach) this.moveState = 'approach'
        else if (pick < wApproach + wSpacing) this.moveState = 'spacing'
        else this.moveState = 'reposition'
        const [c0, c1] = this.profile.commitmentMs
        this.moveCommitLeftMs = c0 + Math.random() * (c1 - c0)
        if (Math.random() < 0.5) this.strafeSign = -1
        else this.strafeSign = 1
      } else {
        this.moveCommitLeftMs -= delta * 1000
      }
    }

    /* --- Unstuck --- */
    if (this.moveState === 'unstuck') {
      this.moveCommitLeftMs -= delta * 1000
      this.velocity.x = this.smartUnstuckDir.x * moveBase
      this.velocity.z = this.smartUnstuckDir.z * moveBase
      if (this.moveCommitLeftMs <= 0) {
        this.moveState = 'spacing'
        const [c0, c1] = this.profile.commitmentMs
        this.moveCommitLeftMs = c0 + Math.random() * (c1 - c0)
      }
      this.applySmartLocomotionGuards(terrain, playerPos, moveBase, {
        allowJump: false,
        maxSpeedMul: 1.0,
      })
      this.turnToward(playerPos, delta, gameConfig.botSmartTurnRate)
      this.setRecordingTelegraph(false)
      return
    }

    /* Direction from movement mode */
    if (this.moveState === 'reposition') {
      this.smartMoveDir.copy(_rad).multiplyScalar(-1)
      this.smartMoveDir.addScaledVector(_tan, this.strafeSign * 0.38)
    } else if (this.moveState === 'approach') {
      this.smartMoveDir.copy(_rad)
      if (dist > prefer + ringBand * 0.6) {
        this.smartMoveDir.addScaledVector(_tan, this.strafeSign * gameConfig.botSmartApproachFlankBias)
      }
    } else {
      const inOut = (dist - prefer) / Math.max(1, prefer)
      this.smartMoveDir
        .copy(_tan)
        .multiplyScalar(this.strafeSign)
        .addScaledVector(_rad, Math.max(-0.55, Math.min(0.55, inOut * 0.65)))
    }

    if (this.smartMoveDir.lengthSq() < 1e-8) this.smartMoveDir.copy(_rad)
    this.smartMoveDir.normalize()

    /* Dodge override */
    if (now < this.dodgeUntilMs) {
      this.velocity.x = this.dodgeDir.x * moveBase * 1.35
      this.velocity.z = this.dodgeDir.z * moveBase * 1.35
    } else {
      this.velocity.x = this.smartMoveDir.x * moveBase
      this.velocity.z = this.smartMoveDir.z * moveBase
    }

    this.applySmartLocomotionGuards(terrain, playerPos, moveBase, {
      allowJump: true,
      maxSpeedMul: 1.48,
    })
    this.turnToward(playerPos, delta, gameConfig.botSmartTurnRate)
    this.setRecordingTelegraph(false)
  }

  private solveIntercept(out: Vector3, projectileSpeed: number): boolean {
    const target = this.sampleDelayed(this.profile.reactionMs)
    const v = target.vel.clone().multiplyScalar(this.profile.predictionConfidence)
    const muzzleY = this.root.position.y + this.feetFromCenter * 0.52 + 0.55
    _muzzleForSolve.set(this.root.position.x, muzzleY, this.root.position.z)
    const r = target.pos.clone().sub(_muzzleForSolve)
    const vv = v.dot(v) - projectileSpeed * projectileSpeed
    const b = 2 * r.dot(v)
    const c = r.dot(r)
    let t: number
    if (Math.abs(vv) < 1e-3) {
      if (Math.abs(b) < 1e-6) return false
      t = -c / b
    } else {
      const disc = b * b - 4 * vv * c
      if (disc < 0) return false
      const sq = Math.sqrt(disc)
      const t1 = (-b - sq) / (2 * vv)
      const t2 = (-b + sq) / (2 * vv)
      const cand = [t1, t2].filter((x) => x > 0)
      if (cand.length === 0) return false
      t = Math.min(...cand)
    }
    if (!isFinite(t) || t <= 0) return false
    if (t * projectileSpeed > gameConfig.punchMaxRange) return false
    const aimPoint = target.pos.clone().addScaledVector(v, t)
    if (
      Math.abs(aimPoint.x) > gameConfig.groundWidth / 2 ||
      Math.abs(aimPoint.z) > gameConfig.groundDepth / 2
    ) {
      return false
    }
    const dir = aimPoint.sub(_muzzleForSolve)
    if (dir.lengthSq() < 1e-6) return false
    dir.normalize()
    dir.y *= 0.85
    dir.normalize()
    const sigma = (this.profile.aimJitterDegSigma * Math.PI) / 180
    const ang = gaussianRand() * sigma
    out.copy(dir).applyAxisAngle(_yAxis, ang)
    return true
  }

  private sampleDelayed(reactionMs: number): { pos: Vector3; vel: Vector3 } {
    const targetT = performance.now() - reactionMs
    if (this.playerSampleBuffer.length === 0) {
      return { pos: this.lastPlayerPos.clone(), vel: this.smoothedPlayerVel.clone() }
    }
    let best = this.playerSampleBuffer[0]!
    let bestDelta = Math.abs(best.t - targetT)
    for (const s of this.playerSampleBuffer) {
      const d = Math.abs(s.t - targetT)
      if (d < bestDelta) {
        best = s
        bestDelta = d
      }
    }
    return { pos: best.pos.clone(), vel: best.vel.clone() }
  }

  applyKnockback(
    dirXZ: Vector3,
    strength: number,
    victimPercent = 0,
    /** Normalized fist→body Y (from full impact vector before XZ flattening). */
    aimUpN = 0,
  ): void {
    this.abortSmartShotFsm()
    this.clearBananaSlipOnHit()
    if (dirXZ.lengthSq() < 1e-8) return
    this.recentDamageTaken += 1
    dirXZ.normalize()
    this.hurtPhase = 'air'
    this.hurtFinisher = false
    this.hurtAirSince = performance.now()
    this.velocity.set(0, 0, 0)
    this.clearProjectile()
    const xzImpulse = strength * 1.12
    this.knockXZ.addScaledVector(dirXZ, xzImpulse)
    const pct = Math.max(0, victimPercent)
    const pctN = Math.min(2.5, pct / 100)
    const below = Math.max(0, aimUpN)
    /* Base pop plus extra lift that grows with launch percent (more consistent arc at high %). */
    this.vy +=
      strength * (0.1 + 0.045 * pctN) +
      1.15 * pctN +
      strength * gameConfig.knockBotVertBoostMul +
      strength * gameConfig.knockBotBelowAimMul * below
  }

  /** Cataclysm knock when victim crosses 150% launch — huge send-off. */
  applyLaunchPercentCataclysm(dirXZ: Vector3): void {
    this.abortSmartShotFsm()
    this.clearBananaSlipOnHit()
    this.recentDamageTaken += 1
    if (dirXZ.lengthSq() < 1e-8) dirXZ.set(0, 0, 1)
    dirXZ.normalize()
    this.hurtPhase = 'air'
    this.hurtFinisher = false
    this.hurtAirSince = performance.now()
    this.velocity.set(0, 0, 0)
    this.clearProjectile()
    this.knockXZ.copy(dirXZ).multiplyScalar(10_000)
    this.vy += 4200
  }

  applyFinisherKnockback(dirXZ: Vector3, xzImpulse: number, yImpulse: number): void {
    this.abortSmartShotFsm()
    this.clearBananaSlipOnHit()
    this.recentDamageTaken += 1
    if (dirXZ.lengthSq() < 1e-8) dirXZ.set(0, 0, 1)
    dirXZ.normalize()
    this.hurtPhase = 'air'
    this.hurtFinisher = true
    this.hurtAirSince = performance.now()
    this.velocity.set(0, 0, 0)
    this.clearProjectile()
    this.knockXZ.addScaledVector(dirXZ, xzImpulse)
    this.vy += yImpulse
  }

  get inHitstun(): boolean {
    return this.hurtPhase !== 'none'
  }

  private abortSmartShotFsm(): void {
    this.shotState = 'idle'
    this.windupLeftMs = 0
    this.windupEpochBumped = false
    this.recordingTelegraph = false
  }

  private clearProjectile(): void {
    this.projActive = false
    this.projFlying = false
    this.projVel.set(0, 0, 0)
    this.projDealt = true
    this.projHitAudio = null
    this.projSizeMul = 1
  }

  /** Voice clip attached to the current bot shot (if any), for victim-side spatial playback. */
  peekProjectileVoice(): AudioBuffer | null {
    return this.projHitAudio
  }

  private spawnProjectileAimed(
    direction: Vector3,
    speedMul: number,
    voiceClip: AudioBuffer | null = null,
  ): void {
    if (this.projActive) return
    const muzzleY = this.root.position.y + this.feetFromCenter * 0.52 + 0.55
    this.projPos.set(this.root.position.x, muzzleY, this.root.position.z)
    this.projSpawn.copy(this.projPos)
    _work.copy(direction)
    if (_work.lengthSq() < 1e-6) _work.set(0, 0, 1)
    _work.normalize()
    const base = gameConfig.punchProjectileSpeed
    this.projVel.copy(_work).multiplyScalar(base * speedMul)
    this.projActive = true
    this.projFlying = true
    this.projDealt = false
    this.projHitAudio = voiceClip
    _moveDesired.copy(this.projPos).add(this.projVel)
    this.faceToward(_moveDesired)
    if (this.mode !== 'network') {
      this.playMonkeyOneShot('shooting')
    }
    this.netAnimOneShotOut = 'shooting'
    this.netAnimEpoch++
    this.onHostAiVoiceShot?.({
      ox: this.projPos.x,
      oy: this.projPos.y,
      oz: this.projPos.z,
      vx: this.projVel.x,
      vy: this.projVel.y,
      vz: this.projVel.z,
      speedMul,
      shotScale: this.projSizeMul,
    })
  }

  /** Legacy: `tryTweakTestShot` — same y-dampening as pre-refactor `spawnProjectile`. */
  private spawnProjectile(
    playerPos: Vector3,
    speedMul: number,
    voiceClip: AudioBuffer | null = null,
  ): void {
    if (this.projActive) return
    _work.set(
      playerPos.x - this.root.position.x,
      (playerPos.y - this.root.position.y) * 0.85,
      playerPos.z - this.root.position.z,
    )
    this.spawnProjectileAimed(_work, speedMul, voiceClip)
  }

  private integrateProjectile(delta: number, terrain: TerrainPhysics): void {
    if (!this.projFlying) return
    this.projIntegratePrev.copy(this.projPos)
    const maxR = gameConfig.punchMaxRange
    const g = gameConfig.fistGravity
    const drag = gameConfig.fistAirDrag

    if (g < 1e-6 && drag < 1e-6) {
      this.projPos.addScaledVector(this.projVel, delta)
      _work.subVectors(this.projPos, this.projSpawn)
      if (_work.length() > maxR + 1e-3) {
        this.clearProjectile()
        return
      }
      if (
        advanceProjectilePastTerrain(
          terrain,
          this.projIntegratePrev,
          this.projPos,
          this.projTerrainResolve,
        )
      ) {
        this.projPos.copy(this.projTerrainResolve)
        this.clearProjectile()
      } else {
        this.projPos.copy(this.projTerrainResolve)
      }
      return
    }

    if (drag > 1e-6) {
      const k = Math.exp(-drag * delta)
      this.projVel.x *= k
      this.projVel.z *= k
    }
    const ascentScale =
      this.projVel.y > 0 ? Math.max(0.05, gameConfig.fistAscentGravityScale) : 1
    this.projVel.y -= g * ascentScale * delta
    this.projPos.addScaledVector(this.projVel, delta)

    _work.subVectors(this.projPos, this.projSpawn)
    if (_work.length() > maxR + 1e-3) {
      this.clearProjectile()
      return
    }

    if (
      advanceProjectilePastTerrain(
        terrain,
        this.projIntegratePrev,
        this.projPos,
        this.projTerrainResolve,
      )
    ) {
      this.projPos.copy(this.projTerrainResolve)
      this.clearProjectile()
      return
    }
    this.projPos.copy(this.projTerrainResolve)
  }

  /** PvP only: hide incoming fist once it reaches local player torso (does not affect authority). */
  private clearProjectileNearLocalPlayer(playerPos: Vector3): void {
    if (!this.projFlying || !this.projActive) return
    const fy = playerPos.y - gameConfig.eyeHeight
    const feetOffset = gameConfig.botBodyRadius * 1.15 + 0.72
    const rootY = fy + feetOffset
    const cx = playerPos.x
    const cy = rootY + feetOffset * 0.52
    const cz = playerPos.z
    const dx = this.projPos.x - cx
    const dy = this.projPos.y - cy
    const dz = this.projPos.z - cz
    const dist = Math.hypot(dx, dy * 0.75, dz)
    const reach = gameConfig.punchHitRadius * this.projSizeMul + gameConfig.botBodyRadius * 0.88
    if (dist < reach) this.clearProjectile()
  }

  update(
    delta: number,
    playerPos: Vector3,
    terrain: TerrainPhysics,
    _playerProjectileActive: boolean,
    viewCamera: PerspectiveCamera,
  ): void {
    this.updateRecordingTelegraph(delta)
    this.applyVictimInvulnFlash()
    if (this.monkeyWrap) this.applyMonkeyTransform(this.monkeyWrap)
    /* Track normalized speed for replication / future blend tree usage. */
    this.speedN = Math.min(
      1,
      Math.hypot(this.velocity.x, this.velocity.z) / Math.max(0.5, gameConfig.moveSpeed),
    )
    this.updateMonkeyAnimation(delta)
    if (this.mode === 'network') {
      const a = Math.min(1, delta * 16)
      this.root.position.lerp(this.networkTargetPos, a)
      let dy = this.networkTargetYaw - this.root.rotation.y
      while (dy > Math.PI) dy -= Math.PI * 2
      while (dy < -Math.PI) dy += Math.PI * 2
      this.root.rotation.y += dy * Math.min(1, delta * 14)

      this.bodyCenter.copy(this.root.position)
      this.bodyCenter.y += this.feetFromCenter * 0.52

      this.integrateProjectile(delta, terrain)
      this.clearProjectileNearLocalPlayer(playerPos)
      this.projVfx.update({
        active: this.projActive && this.projFlying,
        position: this.projPos,
        sizeMul: this.projSizeMul,
        camera: viewCamera,
        delta,
      })
      this.applyRespawnMeshFlash()
      return
    }

    const groundedAtStart = this.grounded
    this.grounded = false
    _moveStart.copy(this.root.position)

    this.bodyCenter.copy(this.root.position)
    this.bodyCenter.y += this.feetFromCenter * 0.52

    if (this.hurtPhase === 'recover') {
      this.hurtRecoverLeft -= delta
      this.velocity.set(0, 0, 0)
      this.knockXZ.multiplyScalar(Math.exp(-14 * delta))
      if (this.hurtRecoverLeft <= 0) {
        this.hurtPhase = 'none'
        this.knockXZ.multiplyScalar(0.35)
      }
    } else if (this.hurtFinisher) {
      this.knockXZ.multiplyScalar(Math.exp(-4.2 * delta))
    } else if (this.hurtPhase === 'air') {
      this.knockXZ.multiplyScalar(
        Math.exp(-Math.max(0.4, gameConfig.knockHurtAirDrag) * delta),
      )
    } else {
      this.knockXZ.multiplyScalar(Math.exp(-10 * delta))
    }

    this.vy -= gameConfig.gravity * delta
    this.root.position.y += this.vy * delta

    if (this.dashCd > 0) this.dashCd -= delta * 1000

    const canThink = this.hurtPhase === 'none' && !this.isBananaSlipNow()

    const toPx = playerPos.x - this.root.position.x
    const toPz = playerPos.z - this.root.position.z
    const dist = Math.hypot(toPx, toPz) || 1

    if (this.mode === 'smart' && this.smartJumpCdMs > 0) {
      this.smartJumpCdMs = Math.max(0, this.smartJumpCdMs - delta * 1000)
    }

    if (canThink && this.mode === 'smart') {
      this.updateSmartAi(delta, playerPos, dist, toPx, toPz, terrain)
    } else if (canThink) {
      this.faceToward(playerPos)
      this.setRecordingTelegraph(false)
      this.velocity.set(0, 0, 0)
      this.smartDesiredSpeed = 0
    } else {
      this.setRecordingTelegraph(false)
      this.velocity.set(0, 0, 0)
      this.smartDesiredSpeed = 0
    }

    if (!canThink) {
      this.clearProjectile()
      this.abortSmartShotFsm()
      this.dodgeScheduleAtMs = 0
      this.dodgeUntilMs = 0
    }

    this.root.position.x += (this.velocity.x + this.knockXZ.x) * delta
    this.root.position.z += (this.velocity.z + this.knockXZ.z) * delta

    this.resolveTerrainCollision(terrain, _moveStart, delta)

    if (canThink && this.mode === 'smart' && this.smartDesiredSpeed > 0.1) {
      const moved = Math.hypot(this.root.position.x - _moveStart.x, this.root.position.z - _moveStart.z)
      const expect = this.smartDesiredSpeed * delta
      if (moved < expect * gameConfig.botSmartStuckMoveRatio) {
        this.smartStuckAcc += delta
      } else {
        this.smartStuckAcc = Math.max(0, this.smartStuckAcc - delta * 1.4)
      }
      if (this.smartStuckAcc >= gameConfig.botSmartStuckMs / 1000 && this.shotState !== 'windup') {
        this.smartStuckAcc = 0
        this.smartUnstuckDir
          .copy(_tan)
          .multiplyScalar(this.strafeSign)
          .addScaledVector(_rad, -0.35)
        if (this.smartUnstuckDir.lengthSq() < 1e-8) this.smartUnstuckDir.copy(_tan)
        this.smartUnstuckDir.normalize()
        this.moveState = 'unstuck'
        this.moveCommitLeftMs = gameConfig.botSmartUnstuckMs
      }
    } else {
      this.smartStuckAcc = 0
    }

    if (this.hurtPhase === 'air' && !this.hurtFinisher) {
      const elapsed = performance.now() - this.hurtAirSince
      const landed = !groundedAtStart && this.grounded
      const slideEnd =
        this.grounded && this.knockXZ.length() < 2.1 && elapsed > 160
      const groundedTimeout = this.grounded && elapsed > 980
      if (landed || slideEnd || groundedTimeout) {
        this.hurtPhase = 'recover'
        this.hurtRecoverLeft = gameConfig.botKnockRecoverMs / 1000
        this.knockXZ.multiplyScalar(0.55)
      }
    }

    this.integrateProjectile(delta, terrain)
    this.projVfx.update({
      active: this.projActive && this.projFlying,
      position: this.projPos,
      sizeMul: this.projSizeMul,
      camera: viewCamera,
      delta,
    })
    this.applyRespawnMeshFlash()
  }

  canDealHit(playerPos: Vector3): boolean {
    if (this.isBananaSlipNow()) return false
    if (this.inHitstun) return false
    if (this.projDealt || !this.projActive || !this.projFlying) return false
    const eyeY = gameConfig.eyeHeight
    const dx = playerPos.x - this.projPos.x
    const dy = playerPos.y - eyeY * 0.42 - this.projPos.y
    const dz = playerPos.z - this.projPos.z
    const travel = _work.subVectors(this.projPos, this.projSpawn).length()
    if (travel < gameConfig.punchMaxRange * 0.06) return false
    return Math.hypot(dx, dy * 0.75, dz) < gameConfig.botHitRadius
  }

  markHitDealt(): void {
    this.recentHitsLanded += 1
    this.projDealt = true
    this.clearProjectile()
  }

  /**
   * Dev / Tweaks: dummy (or smart) fires a single fist at `playerPos` for combat testing. No-op in network mode.
   */
  tryTweakTestShot(playerPos: Vector3, speedMul: number): boolean {
    if (this.mode === 'network') return false
    if (this.hurtPhase !== 'none' || this.projActive) return false
    this.spawnProjectile(playerPos, speedMul)
    return true
  }
}

const _work = new Vector3()
const _rad = new Vector3()
const _tan = new Vector3()
const _yAxis = new Vector3(0, 1, 0)
const _muzzleForSolve = new Vector3()
const _moveStart = new Vector3()
const _moveDesired = new Vector3()
const _steerTmp = new Vector3()

function gaussianRand(): number {
  const u1 = Math.random() || 1e-9
  const u2 = Math.random()
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2)
}

function loadBotGltf(
  loader: GLTFLoader,
  url: string,
): Promise<{ scene: Group; animations: AnimationClip[] }> {
  return new Promise((resolve, reject) => {
    loader.load(
      url,
      (gltf) => resolve(gltf as { scene: Group; animations: AnimationClip[] }),
      undefined,
      reject,
    )
  })
}
