import {
  AnimationAction,
  AnimationClip,
  AnimationMixer,
  Group,
  LoopOnce,
  Material,
  Object3D,
  Scene,
} from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { gameConfig } from '../gameConfig'

type AvatarClipName =
  | 'idle'
  | 'running'
  | 'jumping'
  | 'hitreact'
  | 'recording'
  | 'shooting'

type OneShotClip = 'recording' | 'shooting'
type BaseClip = 'idle' | 'running' | 'jumping' | 'hitreact'
type HurtPhase = 'none' | 'air' | 'recover'

export type LocalAvatarSnapshot = {
  x: number
  feetY: number
  z: number
  yaw: number
  grounded: boolean
  moving: boolean
  playerHurt: HurtPhase
  slideActive: boolean
}

const GLB_IDLE = new URL('../../Assets/MonkeyModel/Idle.glb', import.meta.url).href
const GLB_RUNNING = new URL('../../Assets/MonkeyModel/Running.glb', import.meta.url).href
const GLB_JUMPING = new URL('../../Assets/MonkeyModel/Jumping.glb', import.meta.url).href
const GLB_HITREACT = new URL('../../Assets/MonkeyModel/HitReact.glb', import.meta.url).href
const GLB_RECORDING = new URL('../../Assets/MonkeyModel/RecordingSound.glb', import.meta.url).href
const GLB_SHOOTING = new URL('../../Assets/MonkeyModel/ShootingSound.glb', import.meta.url).href

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

function firstClip(gltf: { animations: AnimationClip[] }): AnimationClip | null {
  return gltf.animations?.[0] ?? null
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
  private currentBase: BaseClip = 'idle'
  private activeOneShot: OneShotClip | null = null
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

  private constructor(scene: Scene, modelRoot: Object3D, mixer: AnimationMixer) {
    this.scene = scene
    this.mixer = mixer
    this.root.add(modelRoot)
    this.root.scale.setScalar(Math.max(0.05, gameConfig.pcAvatarScale))
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

    const idleClip = firstClip(idleGltf)
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
      const clip = firstClip(gltf)
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

  private resolveBase(s: LocalAvatarSnapshot): BaseClip {
    if (s.playerHurt !== 'none') return 'hitreact'
    if (!s.grounded || s.slideActive) return 'jumping'
    if (s.moving) return 'running'
    return 'idle'
  }

  private playBase(next: BaseClip, immediate = false): void {
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

  private playOneShot(name: OneShotClip): void {
    if (this.lastSnapshot.playerHurt !== 'none') return
    const action = this.actions.get(name)
    if (!action) return

    this.stopOneShot(0.05)
    const base = this.actions.get(this.currentBase)
    base?.fadeOut(0.06)

    action.reset()
    action.setEffectiveWeight(1)
    action.setLoop(LoopOnce, 1)
    action.clampWhenFinished = true
    action.fadeIn(0.06)
    action.play()
    this.activeOneShot = name
  }

  onRecordingStarted(): void {
    this.playOneShot('recording')
  }

  onRecordingReleased(): void {
    this.playOneShot('shooting')
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
    this.root.position.set(
      snapshot.x + fwdX * bodyFwd + rightX * bodySide,
      snapshot.feetY + gameConfig.pcAvatarYOffset,
      snapshot.z + fwdZ * bodyFwd + rightZ * bodySide,
    )
    this.root.rotation.set(0, snapshot.yaw, 0)
    const desiredScale = Math.max(0.05, gameConfig.pcAvatarScale)
    if (Math.abs(this.root.scale.x - desiredScale) > 1e-3) {
      this.root.scale.setScalar(desiredScale)
    }

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

