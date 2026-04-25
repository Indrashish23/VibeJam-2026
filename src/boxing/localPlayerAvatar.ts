import {
  AnimationAction,
  AnimationClip,
  AnimationMixer,
  Box3,
  Group,
  LoopOnce,
  LoopRepeat,
  Material,
  Object3D,
  Scene,
} from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { gameConfig } from '../gameConfig'

/** The capsule we want the monkey to fit into: feet on the floor, head ~ a tad above the camera. */
function targetMonkeyHeight(): number {
  return gameConfig.eyeHeight + 0.2
}

/** Compute a uniform fit-scale so the GLB's natural bounding-box height equals `targetMonkeyHeight`. */
export function computeMonkeyAutoFitScale(model: Object3D): number {
  model.updateMatrixWorld(true)
  const bbox = new Box3().setFromObject(model)
  const natural = Math.max(0.1, bbox.max.y - bbox.min.y)
  return targetMonkeyHeight() / natural
}

export type AvatarBaseClip = 'idle' | 'running' | 'jumping' | 'hitreact'
export type AvatarOneShotClip = 'recording' | 'shooting'
export type AvatarClipName = AvatarBaseClip | AvatarOneShotClip
export type AvatarHurtPhase = 'none' | 'air' | 'recover'

export type LocalAvatarSnapshot = {
  x: number
  feetY: number
  z: number
  yaw: number
  grounded: boolean
  moving: boolean
  playerHurt: AvatarHurtPhase
  slideActive: boolean
}

const GLB_IDLE = new URL('../../Assets/MonkeyModel/Idle.glb', import.meta.url).href
const GLB_RUNNING = new URL('../../Assets/MonkeyModel/Running.glb', import.meta.url).href
const GLB_JUMPING = new URL('../../Assets/MonkeyModel/Jumping.glb', import.meta.url).href
const GLB_HITREACT = new URL('../../Assets/MonkeyModel/HitReact.glb', import.meta.url).href
const GLB_RECORDING = new URL('../../Assets/MonkeyModel/RecordingSound.glb', import.meta.url).href
const GLB_SHOOTING = new URL('../../Assets/MonkeyModel/ShootingSound.glb', import.meta.url).href

/** Heuristic clip-name match per slot (so we pick the right clip even if the GLB ships several). */
const CLIP_NAME_PATTERNS: Record<AvatarClipName, RegExp> = {
  idle: /idle/i,
  running: /run/i,
  jumping: /jump/i,
  hitreact: /hit|react|damage|hurt/i,
  recording: /record/i,
  shooting: /shoot|fire|throw|attack/i,
}

function loadGltf(loader: GLTFLoader, url: string): Promise<{ scene: Group; animations: AnimationClip[] }> {
  return new Promise((resolve, reject) => {
    loader.load(
      url,
      (gltf) => resolve(gltf as { scene: Group; animations: AnimationClip[] }),
      undefined,
      reject,
    )
  })
}

/** Prefer a clip whose name matches the slot's pattern; fall back to the first clip in the GLB. */
export function pickClipForSlot(
  gltf: { animations: AnimationClip[] },
  slot: AvatarClipName,
): AnimationClip | null {
  if (!gltf.animations || gltf.animations.length === 0) return null
  const pat = CLIP_NAME_PATTERNS[slot]
  for (const c of gltf.animations) {
    if (pat.test(c.name || '')) return c
  }
  return gltf.animations[0] ?? null
}

/** Collect all bones whose name matches /head/i. We toggle visibility live based on `pcHideHead`. */
function collectHeadLikeBones(root: Object3D): Object3D[] {
  const out: Object3D[] = []
  root.traverse((o) => {
    if (!o.name) return
    if (!/head/i.test(o.name)) return
    out.push(o)
  })
  return out
}

export class LocalPlayerAvatar {
  readonly root = new Group()

  private readonly scene: Scene
  private readonly mixer: AnimationMixer
  private readonly actions = new Map<AvatarClipName, AnimationAction>()
  private currentBase: AvatarBaseClip = 'idle'
  private activeOneShot: AvatarOneShotClip | null = null
  /** Latest one-shot fired (sticky between calls) + monotonic epoch so peers can detect new triggers. */
  private lastOneShot: AvatarOneShotClip | null = null
  private oneShotEpoch = 0
  private lastSnapshot: LocalAvatarSnapshot = {
    x: 0,
    feetY: 0,
    z: 0,
    yaw: 0,
    grounded: true,
    moving: false,
    playerHurt: 'none',
    slideActive: false,
  }
  private readonly finishedHandler: (ev: { action?: AnimationAction }) => void
  private readonly headBones: Object3D[]
  private lastHideHead = -1
  /** Auto-fit scale so the monkey is exactly capsule-height (eyeHeight + small headroom) at scale 1.0. */
  private readonly autoFitScale: number
  /** Local-Y of the model's feet (bbox.min.y) at scale 1; used to pin feet to the capsule bottom. */
  private readonly bboxMinYAtUnitScale: number

  private constructor(scene: Scene, modelRoot: Object3D, mixer: AnimationMixer) {
    this.scene = scene
    this.mixer = mixer
    this.root.rotation.order = 'YXZ'
    this.root.add(modelRoot)
    /* Capture bbox at native scale before any auto-fit, so we can cleanly anchor feet later. */
    modelRoot.updateMatrixWorld(true)
    const bbox = new Box3().setFromObject(modelRoot)
    this.bboxMinYAtUnitScale = bbox.min.y
    this.autoFitScale = computeMonkeyAutoFitScale(modelRoot)
    this.root.scale.setScalar(this.autoFitScale * Math.max(0.05, gameConfig.pcAvatarScale))
    this.scene.add(this.root)
    this.headBones = collectHeadLikeBones(modelRoot)

    this.finishedHandler = (ev) => {
      const shot = this.activeOneShot
      if (!shot) return
      const action = this.actions.get(shot)
      if (!action || ev.action !== action) return
      this.activeOneShot = null
      action.stop()
      this.playBase(this.resolveBase(this.lastSnapshot))
    }
    this.mixer.addEventListener('finished', this.finishedHandler)
  }

  static async create(scene: Scene): Promise<LocalPlayerAvatar | null> {
    const loader = new GLTFLoader()
    let idleGltf: { scene: Group; animations: AnimationClip[] }
    try {
      idleGltf = await loadGltf(loader, GLB_IDLE)
    } catch (err) {
      console.warn('[avatar] Failed to load Idle.glb', err)
      return null
    }

    const idleClip = pickClipForSlot(idleGltf, 'idle')
    if (!idleClip) {
      console.warn('[avatar] Idle.glb has no animation clip')
      return null
    }

    const mixer = new AnimationMixer(idleGltf.scene)
    const avatar = new LocalPlayerAvatar(scene, idleGltf.scene, mixer)
    avatar.bindClip('idle', idleClip)

    await Promise.all([
      avatar.loadAndBind(loader, GLB_RUNNING, 'running'),
      avatar.loadAndBind(loader, GLB_JUMPING, 'jumping'),
      avatar.loadAndBind(loader, GLB_HITREACT, 'hitreact'),
      avatar.loadAndBind(loader, GLB_RECORDING, 'recording'),
      avatar.loadAndBind(loader, GLB_SHOOTING, 'shooting'),
    ])

    avatar.playBase('idle', true)
    return avatar
  }

  private async loadAndBind(loader: GLTFLoader, url: string, key: AvatarClipName): Promise<void> {
    try {
      const gltf = await loadGltf(loader, url)
      const clip = pickClipForSlot(gltf, key)
      if (!clip) {
        console.warn(`[avatar] ${key} clip missing in`, url)
        return
      }
      this.bindClip(key, clip)
    } catch (err) {
      console.warn(`[avatar] Failed to load ${key} clip`, err)
    }
  }

  private bindClip(key: AvatarClipName, clip: AnimationClip): void {
    const action = this.mixer.clipAction(clip)
    action.enabled = true
    action.clampWhenFinished = key === 'recording' || key === 'shooting'
    this.actions.set(key, action)
  }

  /** Public so the host can compute and replicate the base clip from the same rules. */
  resolveBase(s: LocalAvatarSnapshot): AvatarBaseClip {
    if (s.playerHurt !== 'none') return 'hitreact'
    if (!s.grounded || s.slideActive) return 'jumping'
    if (s.moving) return 'running'
    return 'idle'
  }

  private playBase(next: AvatarBaseClip, immediate = false): void {
    if (this.currentBase === next && !immediate) return
    const nextAction = this.actions.get(next)
    if (!nextAction) return
    const prevAction = this.actions.get(this.currentBase)

    if (immediate || !prevAction) {
      prevAction?.stop()
      nextAction.reset().setEffectiveWeight(1).play()
    } else {
      prevAction.fadeOut(0.14)
      nextAction.reset().setEffectiveWeight(1).fadeIn(0.14).play()
    }
    this.currentBase = next
  }

  private stopOneShot(forceFade = 0.06): void {
    if (!this.activeOneShot) return
    const action = this.actions.get(this.activeOneShot)
    this.activeOneShot = null
    if (!action) return
    action.fadeOut(forceFade)
    action.stop()
  }

  private playOneShot(name: AvatarOneShotClip): void {
    if (this.lastSnapshot.playerHurt !== 'none') return
    const action = this.actions.get(name)
    if (!action) return

    this.stopOneShot(0.05)
    const base = this.actions.get(this.currentBase)
    base?.fadeOut(0.06)

    action.reset()
    action.setEffectiveWeight(1)
    if (name === 'recording') {
      action.setLoop(LoopRepeat, Number.POSITIVE_INFINITY)
      action.clampWhenFinished = false
    } else {
      action.setLoop(LoopOnce, 1)
      action.clampWhenFinished = true
    }
    action.fadeIn(0.06)
    action.play()
    this.activeOneShot = name
  }

  onRecordingStarted(): void {
    this.playOneShot('recording')
    this.lastOneShot = 'recording'
    this.oneShotEpoch += 1
  }

  onRecordingReleased(): void {
    this.playOneShot('shooting')
    this.lastOneShot = 'shooting'
    this.oneShotEpoch += 1
  }

  /** Returns the current high-level animation state (used to replicate to peers). */
  getNetAnimState(): {
    base: AvatarBaseClip
    oneShot: AvatarOneShotClip | null
    epoch: number
  } {
    return { base: this.currentBase, oneShot: this.lastOneShot, epoch: this.oneShotEpoch }
  }

  update(delta: number, snapshot: LocalAvatarSnapshot): void {
    this.lastSnapshot = snapshot

    /* Camera-yaw-relative offsets: positive forward pushes body in front of the camera; positive side pushes right. */
    const sinY = Math.sin(snapshot.yaw)
    const cosY = Math.cos(snapshot.yaw)
    const fwdX = -sinY
    const fwdZ = -cosY
    const rightX = cosY
    const rightZ = -sinY
    const bodyFwd = gameConfig.pcAvatarForward
    const bodySide = gameConfig.pcAvatarSide

    const desiredScale = this.autoFitScale * Math.max(0.05, gameConfig.pcAvatarScale)
    if (Math.abs(this.root.scale.x - desiredScale) > 1e-3) {
      this.root.scale.setScalar(desiredScale)
    }

    /* Pin model feet to the capsule bottom (snapshot.feetY).
       The model's local feet Y at scale=1 is `bboxMinYAtUnitScale`; scale it by current root scale.
       Then user-controllable `pcAvatarYOffset` lifts/lowers from there. */
    const feetLocalAtScale = this.bboxMinYAtUnitScale * desiredScale
    const mdx = gameConfig.pcModelTransX
    const mdy = gameConfig.pcModelTransY
    const mdz = gameConfig.pcModelTransZ
    this.root.position.set(
      snapshot.x + fwdX * bodyFwd + rightX * bodySide + rightX * mdx + fwdX * mdz,
      snapshot.feetY - feetLocalAtScale + gameConfig.pcAvatarYOffset + mdy,
      snapshot.z + fwdZ * bodyFwd + rightZ * bodySide + rightZ * mdx + fwdZ * mdz,
    )
    /* Yaw + 180° model-forward correction (configurable in case the GLB changes) + model pitch / yaw trim. */
    this.root.rotation.set(
      gameConfig.pcModelRotX,
      snapshot.yaw + gameConfig.pcAvatarYawOffset + gameConfig.pcModelRotY,
      0,
    )

    /* Live head-bones visibility toggle (1 = hide for FPS, 0 = show). */
    const hideHead = gameConfig.pcHideHead >= 0.5 ? 1 : 0
    if (hideHead !== this.lastHideHead) {
      const visible = hideHead === 0
      for (const o of this.headBones) o.visible = visible
      this.lastHideHead = hideHead
    }

    const base = this.resolveBase(snapshot)
    if (this.activeOneShot && base === 'hitreact') {
      this.stopOneShot(0.04)
      this.playBase('hitreact')
    } else if (!this.activeOneShot) {
      this.playBase(base)
    }

    this.mixer.update(delta)
  }

  dispose(): void {
    this.mixer.removeEventListener('finished', this.finishedHandler)
    this.scene.remove(this.root)
    this.root.traverse((o) => {
      const withGeom = o as Object3D & { geometry?: { dispose?: () => void } }
      withGeom.geometry?.dispose?.()
      const withMat = o as Object3D & { material?: Material | Material[] }
      const mat = withMat.material
      if (!mat) return
      if (Array.isArray(mat)) {
        for (const m of mat) m.dispose()
      } else {
        mat.dispose()
      }
    })
    this.mixer.stopAllAction()
  }
}
