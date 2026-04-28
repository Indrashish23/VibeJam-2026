/**
 * Voice shot appearance: solid white disc + animated canvas “vector” ring strokes + soft smoke points.
 * Billboards with the view camera so the projectile reads clearly while flying.
 */
import {
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  CircleGeometry,
  Color,
  DoubleSide,
  Group,
  Mesh,
  MeshBasicMaterial,
  PerspectiveCamera,
  PlaneGeometry,
  Points,
  PointsMaterial,
  Scene,
  Vector3,
} from 'three'
/** Matches `PROJECTILE_R` in playerArms (shared visual / hit baseline). */
const CORE_DISC_R = 0.2

const CANVAS_SZ = 256
const RIPPLE_WORLD = 0.78

export class VoiceProjectileVisual {
  readonly group: Group

  private readonly canvas: HTMLCanvasElement
  private readonly rippleTex: CanvasTexture
  private readonly ripplePlane: Mesh
  private readonly core: Mesh
  private readonly smoke: Points
  private readonly smokeGeom: BufferGeometry
  private readonly smokeMat: PointsMaterial
  private readonly smokePos: Float32Array
  private readonly smokeCount = 22

  private t = 0

  constructor(scene: Scene) {
    this.group = new Group()
    this.group.name = 'voiceProjectileVisual'

    this.canvas = document.createElement('canvas')
    this.canvas.width = CANVAS_SZ
    this.canvas.height = CANVAS_SZ
    this.rippleTex = new CanvasTexture(this.canvas)
    this.rippleTex.colorSpace = 'srgb'

    const rippleMat = new MeshBasicMaterial({
      map: this.rippleTex,
      transparent: true,
      opacity: 1,
      depthWrite: false,
      side: DoubleSide,
    })
    this.ripplePlane = new Mesh(new PlaneGeometry(RIPPLE_WORLD, RIPPLE_WORLD), rippleMat)
    this.ripplePlane.position.z = -0.004
    this.ripplePlane.renderOrder = 6
    this.group.add(this.ripplePlane)

    const coreMat = new MeshBasicMaterial({
      color: new Color(0xffffff),
      side: DoubleSide,
      depthWrite: true,
      transparent: false,
    })
    this.core = new Mesh(new CircleGeometry(CORE_DISC_R * 1.05, 40), coreMat)
    this.core.renderOrder = 8
    this.group.add(this.core)

    this.smokePos = new Float32Array(this.smokeCount * 3)
    this.smokeGeom = new BufferGeometry()
    this.smokeGeom.setAttribute('position', new BufferAttribute(this.smokePos, 3))
    this.smokeMat = new PointsMaterial({
      color: new Color(0xd4d0d0),
      size: 0.13,
      transparent: true,
      opacity: 0.52,
      depthWrite: false,
      sizeAttenuation: true,
    })
    this.smoke = new Points(this.smokeGeom, this.smokeMat)
    this.smoke.frustumCulled = false
    this.smoke.renderOrder = 7
    this.group.add(this.smoke)

    this.group.visible = false
    scene.add(this.group)
  }

  private paintRipples(): void {
    const ctx = this.canvas.getContext('2d')
    if (!ctx) return
    const w = CANVAS_SZ
    const cx = w / 2
    const cy = w / 2
    ctx.clearRect(0, 0, w, w)

    const rings = 6
    for (let i = 0; i < rings; i++) {
      const phase = this.t * (5.5 + i * 0.35) + i * 1.15
      const breathe = 0.5 + 0.5 * Math.sin(phase)
      const wobble = 10 * Math.sin(this.t * 9 + i * 2.2)
      const r = 22 + i * 26 + breathe * 18 + wobble + i * 6 * Math.sin(this.t * 7 + i)
      const alpha = 0.18 + breathe * 0.42 - i * 0.045
      ctx.strokeStyle = `rgba(255,255,255,${Math.max(0.06, Math.min(0.95, alpha))})`
      ctx.lineWidth = 2 + (i % 3) * 0.35
      ctx.beginPath()
      ctx.arc(cx, cy, Math.max(4, r), 0, Math.PI * 2)
      ctx.stroke()
    }
    this.rippleTex.needsUpdate = true
  }

  update(opts: {
    active: boolean
    position: Vector3
    sizeMul: number
    camera: PerspectiveCamera
    delta: number
  }): void {
    const { active, position, sizeMul, camera, delta } = opts
    this.t += delta
    this.group.visible = active
    if (!active) return

    this.group.position.copy(position)
    this.group.scale.setScalar(sizeMul)
    this.group.quaternion.copy(camera.quaternion)

    this.paintRipples()

    const st = this.t * 6
    for (let i = 0; i < this.smokeCount; i++) {
      const k = i * 3
      const seed = i * 0.631
      const ang = st * (0.95 + (i % 5) * 0.11) + seed * 6.28318
      const rad = CORE_DISC_R * (1.2 + (i % 6) * 0.35) + 0.06 * Math.sin(st * 3.1 + seed)
      const bob = 0.06 * Math.sin(st * 4.4 + seed * 3)
      this.smokePos[k] = Math.cos(ang) * rad
      this.smokePos[k + 1] = bob + 0.04 * Math.sin(st * 2.8 + i)
      this.smokePos[k + 2] = Math.sin(ang) * rad
    }
    const pulse = 0.38 + 0.42 * Math.sin(this.t * 13.5 + 0.4)
    this.smokeMat.opacity = pulse * 0.62
    this.smokeMat.size = 0.1 + 0.07 * Math.sin(this.t * 17 + 1.1)
    this.smokeGeom.attributes.position.needsUpdate = true
  }

  dispose(scene: Scene): void {
    scene.remove(this.group)
    this.ripplePlane.geometry.dispose()
    ;(this.ripplePlane.material as MeshBasicMaterial).dispose()
    this.rippleTex.dispose()
    this.core.geometry.dispose()
    ;(this.core.material as MeshBasicMaterial).dispose()
    this.smokeGeom.dispose()
    this.smokeMat.dispose()
  }
}
