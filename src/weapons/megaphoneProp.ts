import {
  Box3,
  Euler,
  Group,
  MathUtils,
  Mesh,
  PerspectiveCamera,
  Quaternion,
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
const _qRest = new Quaternion()
const _qPull = new Quaternion()
const _qCur = new Quaternion()
const _qShake = new Quaternion()
const _tmpPos = new Vector3()
const _tmpPull = new Vector3()

export type MegaphoneUpdateOpts = {
  /** True while LMB/RMB charge is active (same gates as voice charge tick). */
  charging: boolean
  /** Smoothed charge 0–1 (`voiceChargeSmoothed`). */
  charge01: number
  /** Camera-local Y offset from FP walk bob (same phase as camera head bob). */
  walkBobLocalY?: number
}

/**
 * First-person megaphone prop: GLB parented to camera, lerps rest→pull with charge,
 * shakes when charge is above `voiceMinChargeToFire`. Stays visible with the in-hand banana.
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
      megaphoneSwayMul,
      megaphonePullSmoothSec,
      voiceMinChargeToFire,
      fpWeaponSwayMul,
    } = gameConfig

    this.visualRoot.scale.setScalar(Math.max(0.05, megaphoneScaleMul))

    /* Pull pose: snap (default) or ease in via `megaphonePullSmoothSec`; return to rest still eases (`megaphoneRestReturnSec`). */
    const targetPose = opts.charging ? 1 : 0
    if (opts.charging) {
      const pullTau = Math.max(0, megaphonePullSmoothSec)
      if (pullTau <= 1e-5) {
        this.poseSmooth = 1
      } else {
        const alpha = 1 - Math.exp(-delta / pullTau)
        this.poseSmooth += (1 - this.poseSmooth) * alpha
      }
    } else {
      const restTau = Math.max(0.02, megaphoneRestReturnSec)
      const alpha = 1 - Math.exp(-delta / restTau)
      this.poseSmooth += (targetPose - this.poseSmooth) * alpha
    }

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
    _qRest.setFromEuler(_eRest)
    _qPull.setFromEuler(_ePull)
    _qCur.slerpQuaternions(_qRest, _qPull, t)
    this.root.quaternion.copy(_qCur)

    const wby = opts.walkBobLocalY ?? 0
    if (Math.abs(wby) > 1e-8) this.root.position.y += wby

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
    _qShake.setFromEuler(_eShake)
    this.root.quaternion.multiply(_qShake)

    const wm = Math.max(
      0,
      Math.min(2, fpWeaponSwayMul * Math.max(0, megaphoneSwayMul)),
    )
    /* Idle loop only (time-based); amplitude not gated on movement/strafe. */
    if (wm > 1e-4) {
      const sway = wm
      const tt = performance.now() * 0.001
      this.root.position.x += Math.sin(tt * 2.15) * 0.0036 * sway
      this.root.position.y += Math.cos(tt * 2.55) * 0.0029 * sway
      this.root.position.z += Math.sin(tt * 1.95) * 0.0024 * sway
      _eShake.set(
        Math.sin(tt * 1.35) * 0.022 * sway,
        Math.cos(tt * 1.15) * 0.017 * sway,
        Math.sin(tt * 1.75) * 0.019 * sway,
        'YXZ',
      )
      _qShake.setFromEuler(_eShake)
      this.root.quaternion.multiply(_qShake)
    }
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
