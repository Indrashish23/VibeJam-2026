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
  Scene,
  Vector3,
} from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { gameConfig } from '../gameConfig'
import {
  applyMonkeyExternalBaseColorTexture,
  applyMonkeyFlatVertexPixelatedStyle,
} from './monkeyVisualStyle'
import { PROJECTILE_R } from './playerArms'
import {
  pickClipForSlot,
  type AvatarBaseClip,
  type AvatarClipName,
  type AvatarOneShotClip,
} from './localPlayerAvatar'
import type { TerrainPhysics } from '../physics/terrainPhysics'

const BOT_GLB_IDLE = new URL('../../Assets/MonkeyModel/Idle.glb', import.meta.url).href
const BOT_GLB_RUNNING = new URL('../../Assets/MonkeyModel/Running.glb', import.meta.url).href
const BOT_GLB_JUMPING = new URL('../../Assets/MonkeyModel/Jumping.glb', import.meta.url).href
const BOT_GLB_HITREACT = new URL('../../Assets/MonkeyModel/HitReact.glb', import.meta.url).href
const BOT_GLB_RECORDING = new URL('../../Assets/MonkeyModel/RecordingSound.glb', import.meta.url).href
const BOT_GLB_SHOOTING = new URL('../../Assets/MonkeyModel/ShootingSound.glb', import.meta.url).href

export type BotMode = 'dummy' | 'smart' | 'network'
type SmartBotState = 'chase' | 'flank' | 'retreat' | 'aim' | 'recover' | 'unstuck'

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

  private smartState: SmartBotState = 'chase'
  private smartStateLeft = 0
  private smartStrafePickT = 0
  private smartFlankSign = Math.random() < 0.5 ? -1 : 1
  private readonly smartMoveDir = new Vector3(0, 0, 1)
  private smartShotGapMs = 2500
  private smartDesiredSpeed = 0
  private smartStuckAcc = 0
  private readonly smartUnstuckDir = new Vector3(1, 0, 0)

  mesh: Mesh
  private readonly bodyMat: MeshStandardMaterial
  private readonly baseBodyColor: Color
  private readonly recordingBodyColor = new Color(0xff4d4f)
  private recordingTelegraph = false
  private recordingTelegraphMix = 0
  private recordingShakeT = 0
  readonly projMesh: Mesh

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
    opts?: { bodyColor?: number },
  ) {
    this.mode = mode
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

    const pm = new MeshStandardMaterial({
      color: new Color(0xff7a4a),
      roughness: 0.42,
      metalness: 0.2,
    })
    this.projMesh = new Mesh(new BoxGeometry(PROJECTILE_R * 2, PROJECTILE_R * 2, PROJECTILE_R * 2), pm)
    this.projMesh.castShadow = true
    this.projMesh.receiveShadow = true
    this.projMesh.visible = false
    scene.add(this.projMesh)

    this.root.position.copy(startPos)
    this.networkTargetPos.copy(this.root.position)
    scene.add(this.root)

    this.smartShotGapMs = 1200 + Math.random() * 700

    void this.loadMonkeyVisual()
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

  /** Resolve the monkey's locomotor base from this bot's own physics (used by dummy/smart modes). */
  private resolveLocalBase(): AvatarBaseClip {
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
    if (this.mode === 'network' && this.remoteAnimBase) {
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

  /**
   * Opponent voice shot replicated in world space (same ballistic integration as local arms).
   */
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
    scene.remove(this.projMesh)
    this.mesh.geometry.dispose()
    ;(this.mesh.material as MeshStandardMaterial).dispose()
    this.projMesh.geometry.dispose()
    ;(this.projMesh.material as MeshStandardMaterial).dispose()
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
    this.smartState = 'chase'
    this.smartStateLeft = 0
    this.smartStrafePickT = 0
    this.smartFlankSign = Math.random() < 0.5 ? -1 : 1
    this.smartShotGapMs = 1200 + Math.random() * 700
    this.smartMoveDir.set(0, 0, 1)
    this.smartDesiredSpeed = 0
    this.smartStuckAcc = 0
    this.smartUnstuckDir.set(1, 0, 0)
    this.hurtPhase = 'none'
    this.hurtRecoverLeft = 0
    this.hurtFinisher = false
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
  }

  setRecordingTelegraph(active: boolean): void {
    this.recordingTelegraph = active
  }

  /** Brief white tint (invuln / got hit feedback) on the visible bot mesh. */
  flashVictimInvuln(ms: number): void {
    this.victimInvulnFlashEnd = performance.now() + Math.max(80, ms)
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

  private setSmartState(next: SmartBotState, durationSec = 0): void {
    this.smartState = next
    this.smartStateLeft = Math.max(0, durationSec)
  }

  private updateSmartAi(delta: number, playerPos: Vector3, dist: number, toPx: number, toPz: number): void {
    const safeDist = Math.max(1e-5, dist)
    const rdx = toPx / safeDist
    const rdz = toPz / safeDist
    _rad.set(rdx, 0, rdz)
    _tan.set(-rdz, 0, rdx)
    if (this.smartStateLeft > 0) this.smartStateLeft = Math.max(0, this.smartStateLeft - delta)
    this.smartShotGapMs -= delta * 1000
    this.setRecordingTelegraph(false)
    this.turnToward(playerPos, delta, gameConfig.botSmartTurnRate)

    const prefer = gameConfig.botSmartPreferredRange
    const ringBand = Math.max(0.4, gameConfig.botSmartRangeBand)
    const retreatAt = gameConfig.botSmartRetreatRange
    const attackMax = gameConfig.botPunchRange * gameConfig.botSmartAttackRangeMul
    const canAttack = !this.projActive && this.smartShotGapMs <= 0 && dist <= attackMax && dist >= 0.32
    const moveBase = gameConfig.moveSpeed * gameConfig.botSmartMoveSpeedMul

    if (this.smartState === 'aim') {
      this.setRecordingTelegraph(true)
      this.velocity.set(0, 0, 0)
      this.smartDesiredSpeed = 0
      this.turnToward(playerPos, delta, gameConfig.botSmartAimTurnRate)
      if (this.smartStateLeft <= 0) {
        if (canAttack) {
          const t = Math.max(0, Math.min(1, (dist - retreatAt) / Math.max(1, attackMax - retreatAt)))
          const speedMul =
            gameConfig.botSmartShotSpeedMinMul +
            (1 - t) * (gameConfig.botSmartShotSpeedMaxMul - gameConfig.botSmartShotSpeedMinMul)
          this.spawnProjectile(playerPos, speedMul)
          this.smartShotGapMs = gameConfig.botSmartShotCooldownMs + Math.random() * 220
          this.setSmartState('recover', gameConfig.botSmartRecoverMs / 1000)
          return
        }
        this.setSmartState(dist < retreatAt ? 'retreat' : 'chase')
      }
      return
    }

    if (this.smartState === 'recover') {
      this.velocity.set(0, 0, 0)
      this.smartDesiredSpeed = 0
      if (this.smartStateLeft <= 0) this.setSmartState(dist < retreatAt ? 'retreat' : 'chase')
      return
    }

    if (this.smartState === 'unstuck') {
      this.velocity.x = this.smartUnstuckDir.x * moveBase
      this.velocity.z = this.smartUnstuckDir.z * moveBase
      this.smartDesiredSpeed = moveBase
      if (this.smartStateLeft <= 0) this.setSmartState('flank')
      return
    }

    if (dist < retreatAt) {
      this.setSmartState('retreat')
    } else if (canAttack && dist >= prefer - ringBand * 0.45) {
      this.setSmartState('aim', gameConfig.botSmartAimMs / 1000)
      return
    } else if (Math.abs(dist - prefer) <= ringBand) {
      this.setSmartState('flank')
    } else {
      this.setSmartState('chase')
    }

    if (this.smartState === 'retreat') {
      this.smartMoveDir.copy(_rad).multiplyScalar(-1)
      if (dist > prefer + ringBand * 0.4) this.setSmartState('flank')
    } else if (this.smartState === 'chase') {
      this.smartMoveDir.copy(_rad)
      if (dist > prefer + ringBand) {
        this.smartMoveDir.addScaledVector(_tan, this.smartFlankSign * gameConfig.botSmartApproachFlankBias)
      }
      if (Math.abs(dist - prefer) <= ringBand) this.setSmartState('flank')
    } else {
      this.smartStrafePickT -= delta
      if (this.smartStrafePickT <= 0) {
        this.smartStrafePickT = 0.32 + Math.random() * 0.55
        this.smartFlankSign = Math.random() < 0.5 ? -1 : 1
      }
      const inOut = (dist - prefer) / Math.max(1, prefer)
      this.smartMoveDir
        .copy(_tan)
        .multiplyScalar(this.smartFlankSign)
        .addScaledVector(_rad, Math.max(-0.55, Math.min(0.55, inOut * 0.7)))
    }

    if (this.smartMoveDir.lengthSq() < 1e-8) this.smartMoveDir.copy(_rad)
    this.smartMoveDir.normalize()
    this.velocity.x = this.smartMoveDir.x * moveBase
    this.velocity.z = this.smartMoveDir.z * moveBase
    this.smartDesiredSpeed = moveBase
  }

  applyKnockback(
    dirXZ: Vector3,
    strength: number,
    victimPercent = 0,
    /** Normalized fist→body Y (from full impact vector before XZ flattening). */
    aimUpN = 0,
  ): void {
    if (dirXZ.lengthSq() < 1e-8) return
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

  private clearProjectile(): void {
    this.projActive = false
    this.projFlying = false
    this.projVel.set(0, 0, 0)
    this.projDealt = true
    this.projHitAudio = null
    this.projSizeMul = 1
    this.projMesh.scale.setScalar(1)
    this.projMesh.visible = false
  }

  /** Voice clip attached to the current bot shot (if any), for victim-side spatial playback. */
  peekProjectileVoice(): AudioBuffer | null {
    return this.projHitAudio
  }

  private spawnProjectile(
    playerPos: Vector3,
    speedMul: number,
    voiceClip: AudioBuffer | null = null,
  ): void {
    if (this.projActive) return
    this.faceToward(playerPos)
    const muzzleY = this.root.position.y + this.feetFromCenter * 0.52 + 0.55
    this.projPos.set(this.root.position.x, muzzleY, this.root.position.z)
    this.projSpawn.copy(this.projPos)
    _work.subVectors(playerPos, this.projPos)
    _work.y *= 0.85
    if (_work.lengthSq() < 1e-6) _work.set(0, 0, 1)
    _work.normalize()
    const base = gameConfig.punchProjectileSpeed
    this.projVel.copy(_work).multiplyScalar(base * speedMul)
    this.projActive = true
    this.projFlying = true
    this.projDealt = false
    this.projHitAudio = voiceClip
  }

  private integrateProjectile(delta: number): void {
    if (!this.projFlying) return
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
      const rad = PROJECTILE_R * this.projSizeMul
      const hwIn = gameConfig.groundWidth / 2 - rad * 0.5
      const hdIn = gameConfig.groundDepth / 2 - rad * 0.5
      const minY = rad
      if (
        Math.abs(this.projPos.x) <= hwIn &&
        Math.abs(this.projPos.z) <= hdIn &&
        this.projPos.y <= minY + 0.08
      ) {
        this.clearProjectile()
        return
      }
      const hw = gameConfig.groundWidth / 2 + rad
      const hd = gameConfig.groundDepth / 2 + rad
      if (Math.abs(this.projPos.x) > hw || Math.abs(this.projPos.z) > hd) {
        this.clearProjectile()
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

    const rad = PROJECTILE_R * this.projSizeMul
    const hw = gameConfig.groundWidth / 2 - rad * 0.5
    const hd = gameConfig.groundDepth / 2 - rad * 0.5
    const minY = rad
    const onDeck =
      Math.abs(this.projPos.x) <= hw &&
      Math.abs(this.projPos.z) <= hd &&
      this.projPos.y <= minY + 0.08
    if (onDeck) {
      this.clearProjectile()
      return
    }
    let hit = false
    if (Math.abs(this.projPos.x) > hw) {
      this.projPos.x = Math.sign(this.projPos.x) * hw
      hit = true
    }
    if (Math.abs(this.projPos.z) > hd) {
      this.projPos.z = Math.sign(this.projPos.z) * hd
      hit = true
    }
    if (hit) this.clearProjectile()
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

      this.integrateProjectile(delta)
      this.clearProjectileNearLocalPlayer(playerPos)
      if (this.projActive) {
        this.projMesh.position.copy(this.projPos)
        this.projMesh.scale.setScalar(this.projSizeMul)
        this.projMesh.visible = true
      }
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

    const canThink = this.hurtPhase === 'none'

    const toPx = playerPos.x - this.root.position.x
    const toPz = playerPos.z - this.root.position.z
    const dist = Math.hypot(toPx, toPz) || 1

    if (canThink && this.mode === 'smart') {
      this.updateSmartAi(delta, playerPos, dist, toPx, toPz)
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
      if (this.smartStuckAcc >= gameConfig.botSmartStuckMs / 1000 && this.smartState !== 'aim') {
        this.smartStuckAcc = 0
        this.smartUnstuckDir
          .copy(_tan)
          .multiplyScalar(this.smartFlankSign)
          .addScaledVector(_rad, -0.35)
        if (this.smartUnstuckDir.lengthSq() < 1e-8) this.smartUnstuckDir.copy(_tan)
        this.smartUnstuckDir.normalize()
        this.setSmartState('unstuck', gameConfig.botSmartUnstuckMs / 1000)
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

    this.integrateProjectile(delta)
    if (this.projActive) {
      this.projMesh.position.copy(this.projPos)
      this.projMesh.visible = true
    }
  }

  canDealHit(playerPos: Vector3): boolean {
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
const _moveStart = new Vector3()
const _moveDesired = new Vector3()

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
