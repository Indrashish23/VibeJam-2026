import {
  Box3,
  Euler,
  Group,
  MathUtils,
  Mesh,
  PerspectiveCamera,
  Vector3,
} from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { gameConfig } from '../gameConfig'

const GLB_URL = new URL('../../Assets/Props/MegaPhone.glb', import.meta.url).href
/** After bbox fit, max axis length in world units before `megaphoneScaleMul`. */
const BASE_EXTENT = 0.36

const _eRest = new Euler(0, 0, 0, 'YXZ')
const _ePull = new Euler(0, 0, 0, 'YXZ')
const _eShake = new Euler(0, 0, 0, 'YXZ')
const _tmpPos = new Vector3()
const _tmpPull = new Vector3()

export type MegaphoneUpdateOpts = {
  /** True while LMB/RMB charge is active (same gates as voice charge tick). */
  charging: boolean
  /** Smoothed charge 0–1 (`voiceChargeSmoothed`). */
  charge01: number
  /** Hide megaphone while banana is in hand (same moment as banana hand mesh). */
  hideForBanana: boolean
}

/**
 * First-person megaphone prop: GLB parented to camera, lerps rest→pull with charge,
 * shakes when charge is above `voiceMinChargeToFire`.
 */
export class MegaphoneFpProp {
  readonly root = new Group()
  private readonly visualRoot = new Group()
  private loaded = false
  private poseSmooth = 0

  constructor() {
    this.root.name = 'megaphoneFp'
    this.visualRoot.name = 'megaphoneFpVisual'
    this.root.add(this.visualRoot)
    this.root.visible = false
    void this.loadModel()
  }

  private async loadModel(): Promise<void> {
    const loader = new GLTFLoader()
    try {
      const gltf = await loader.loadAsync(GLB_URL)
      const scene = gltf.scene
      scene.updateMatrixWorld(true)
      scene.traverse((o) => {
        if (o instanceof Mesh) {
          o.castShadow = true
          o.receiveShadow = true
        }
      })
      const box = new Box3().setFromObject(scene)
      const size = new Vector3()
      box.getSize(size)
      const maxDim = Math.max(size.x, size.y, size.z, 1e-6)
      scene.scale.multiplyScalar(BASE_EXTENT / maxDim)
      scene.updateMatrixWorld(true)
      const box2 = new Box3().setFromObject(scene)
      scene.position.y -= box2.min.y
      this.visualRoot.add(scene)
      this.loaded = true
      this.root.visible = true
    } catch {
      this.loaded = false
    }
  }

  attachToCamera(camera: PerspectiveCamera): void {
    this.root.removeFromParent()
    camera.add(this.root)
  }

  /** Smoothstep 0–1 (Ken Perlin). */
  private static smooth01(t: number): number {
    const x = Math.min(1, Math.max(0, t))
    return x * x * (3 - 2 * x)
  }

  update(delta: number, opts: MegaphoneUpdateOpts): void {
    if (!this.loaded) return

    const {
      megaphoneScaleMul,
      megaphoneRestLocalX,
      megaphoneRestLocalY,
      megaphoneRestLocalZ,
      megaphoneRestPitchDeg,
      megaphoneRestYawDeg,
      megaphoneRestRollDeg,
      megaphonePullLocalX,
      megaphonePullLocalY,
      megaphonePullLocalZ,
      megaphonePullPitchDeg,
      megaphonePullYawDeg,
      megaphonePullRollDeg,
      megaphoneRestReturnSec,
      megaphoneShakePosAmp,
      megaphoneShakeRotDeg,
      megaphoneShakeFreqHz,
      megaphoneShakeFreq2Hz,
      megaphoneShakeRampPow,
      voiceMinChargeToFire,
    } = gameConfig

    this.visualRoot.scale.setScalar(Math.max(0.05, megaphoneScaleMul))

    const chargeEase = MegaphoneFpProp.smooth01(opts.charge01)
    const targetPose = opts.charging ? chargeEase : 0
    /* One time constant for both easing toward pull (recording) and back to rest — `megaphoneRestReturnSec`. */
    const easeTauSec = Math.max(0.02, megaphoneRestReturnSec)
    const alpha = 1 - Math.exp(-delta / easeTauSec)
    this.poseSmooth += (targetPose - this.poseSmooth) * alpha

    const t = this.poseSmooth
    _tmpPos.set(megaphoneRestLocalX, megaphoneRestLocalY, megaphoneRestLocalZ)
    _tmpPull.set(megaphonePullLocalX, megaphonePullLocalY, megaphonePullLocalZ)
    this.root.position.lerpVectors(_tmpPos, _tmpPull, t)

    _eRest.set(
      MathUtils.degToRad(megaphoneRestPitchDeg),
      MathUtils.degToRad(megaphoneRestYawDeg),
      MathUtils.degToRad(megaphoneRestRollDeg),
      'YXZ',
    )
    _ePull.set(
      MathUtils.degToRad(megaphonePullPitchDeg),
      MathUtils.degToRad(megaphonePullYawDeg),
      MathUtils.degToRad(megaphonePullRollDeg),
      'YXZ',
    )
    this.root.rotation.x = MathUtils.lerp(_eRest.x, _ePull.x, t)
    this.root.rotation.y = MathUtils.lerp(_eRest.y, _ePull.y, t)
    this.root.rotation.z = MathUtils.lerp(_eRest.z, _ePull.z, t)

    /* Shake: only while charging and at/above min fire charge. */
    const minF = Math.min(0.999, Math.max(0.01, voiceMinChargeToFire))
    let shakeMix = 0
    if (opts.charging && opts.charge01 >= minF) {
      shakeMix = (opts.charge01 - minF) / (1 - minF)
      shakeMix = Math.min(1, Math.max(0, shakeMix))
      shakeMix = Math.pow(shakeMix, Math.max(0.15, megaphoneShakeRampPow))
    }

    const w = performance.now() * 0.001
    const twoPi = Math.PI * 2
    const f1 = megaphoneShakeFreqHz
    const f2 = megaphoneShakeFreq2Hz
    const pa = shakeMix * megaphoneShakePosAmp
    const rd = shakeMix * MathUtils.degToRad(megaphoneShakeRotDeg)

    this.root.position.x += Math.sin(w * twoPi * f1) * pa
    this.root.position.y += Math.cos(w * twoPi * f2 * 0.97) * pa * 0.85
    this.root.position.z += Math.sin(w * twoPi * f2 * 1.03) * pa * 0.55

    _eShake.set(
      Math.sin(w * twoPi * f2 * 0.88) * rd * 0.22,
      Math.cos(w * twoPi * f1 * 1.07) * rd * 0.35,
      Math.sin(w * twoPi * (f1 + f2) * 0.31) * rd * 0.18,
      'YXZ',
    )
    this.root.rotation.x += _eShake.x
    this.root.rotation.y += _eShake.y
    this.root.rotation.z += _eShake.z

    this.root.visible = !opts.hideForBanana
  }

  dispose(): void {
    this.visualRoot.traverse((o) => {
      const m = o as Mesh
      if (m.isMesh) {
        m.geometry?.dispose?.()
        const mat = m.material
        if (Array.isArray(mat)) for (const x of mat) x.dispose?.()
        else mat?.dispose?.()
      }
    })
    this.visualRoot.clear()
    this.root.removeFromParent()
  }
}
