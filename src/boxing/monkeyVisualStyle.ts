import {
  CompressedTexture,
  CubeTexture,
  DataTexture,
  Mesh,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  NearestFilter,
  Object3D,
  SRGBColorSpace,
  Texture,
  TextureLoader,
} from 'three'

/** Hand-painted atlas; replaces embedded GLB base color on all monkey PBR materials. */
const MONKEY_BASECOLOR_SRC = new URL(
  '../../Assets/MonkeyModel/low-poly+monkey+3d+model.glb_basecolor.JPEG',
  import.meta.url,
).href
const MONKEY_BASECOLOR_URL =
  import.meta.env.DEV
    ? `${MONKEY_BASECOLOR_SRC}${MONKEY_BASECOLOR_SRC.includes('?') ? '&' : '?'}v=${encodeURIComponent(String(Math.floor(performance.timeOrigin)))}`
    : MONKEY_BASECOLOR_SRC

function isPbrMat(m: unknown): m is MeshStandardMaterial | MeshPhysicalMaterial {
  return m instanceof MeshStandardMaterial || m instanceof MeshPhysicalMaterial
}

function loadTextureFromUrl(url: string): Promise<Texture> {
  const loader = new TextureLoader()
  return new Promise((resolve, reject) => {
    loader.load(
      url,
      (tex) => {
        tex.colorSpace = SRGBColorSpace
        /* Match GLTF sampler convention so UV layout matches the GLB. */
        tex.flipY = false
        resolve(tex)
      },
      undefined,
      reject,
    )
  })
}

/**
 * Swap every PBR material's `map` to `tex` (shared instance). Disposes distinct previous `map` textures once.
 */
export function applyMonkeyBaseColorMap(root: Object3D, tex: Texture): void {
  const oldMaps = new Set<Texture>()
  root.traverse((o) => {
    const mesh = o as Mesh
    if (!mesh.isMesh || !mesh.material) return
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
    for (const raw of mats) {
      if (!isPbrMat(raw)) continue
      if (raw.map && raw.map !== tex) oldMaps.add(raw.map)
      raw.map = tex
      raw.needsUpdate = true
    }
  })
  for (const t of oldMaps) t.dispose()
}

/** Load the external base-color atlas and assign it to the skinned monkey root. */
export async function applyMonkeyExternalBaseColorTexture(root: Object3D): Promise<void> {
  const tex = await loadTextureFromUrl(MONKEY_BASECOLOR_URL)
  applyMonkeyBaseColorMap(root, tex)
}

/** Texture slots we aggressively nearest-filter for chunky in-game pixels. */
const TEX_PROPS = [
  'map',
  'normalMap',
  'roughnessMap',
  'metalnessMap',
  'emissiveMap',
  'aoMap',
  'alphaMap',
  'bumpMap',
  'displacementMap',
  'lightMap',
  'clearcoatMap',
  'clearcoatNormalMap',
  'clearcoatRoughnessMap',
  'sheenColorMap',
  'transmissionMap',
  'thicknessMap',
] as const

const processedDownscale = new WeakSet<Texture>()

/** How many times smaller each axis becomes (4 => 16× fewer texels, very chunky). */
const DOWNSCALE_DIVISOR = 4

function pixelateTexture(tex: Texture): void {
  tex.magFilter = NearestFilter
  tex.minFilter = NearestFilter
  tex.generateMipmaps = false
  tex.needsUpdate = true
}

/**
 * Reduces raster resolution so nearest sampling shows much larger on-screen pixels.
 * Safe to call multiple times per texture (guarded by WeakSet).
 */
function downscaleTextureImage(tex: Texture): void {
  if (processedDownscale.has(tex)) return
  if (
    tex instanceof DataTexture ||
    tex instanceof CompressedTexture ||
    tex instanceof CubeTexture
  )
    return
  const img = tex.image as { width?: number; height?: number } | undefined
  const w = img && typeof img.width === 'number' ? img.width : 0
  const h = img && typeof img.height === 'number' ? img.height : 0
  if (w < 2 || h < 2 || typeof document === 'undefined') return
  const nw = Math.max(1, Math.floor(w / DOWNSCALE_DIVISOR))
  const nh = Math.max(1, Math.floor(h / DOWNSCALE_DIVISOR))
  if (nw === w && nh === h) return
  const c = document.createElement('canvas')
  c.width = nw
  c.height = nh
  const ctx = c.getContext('2d')
  if (!ctx) return
  ctx.imageSmoothingEnabled = false
  try {
    ctx.drawImage(img as CanvasImageSource, 0, 0, nw, nh)
  } catch {
    return
  }
  tex.image = c
  processedDownscale.add(tex)
}

/**
 * Faceted (flat) per-face lighting on PBR monkey materials + nearest-neighbor maps for heavy texture pixelation.
 * Call once on the skinned mesh root after GLTF load.
 */
export function applyMonkeyFlatVertexPixelatedStyle(root: Object3D): void {
  root.traverse((o) => {
    const mesh = o as Mesh
    if (!mesh.isMesh || !mesh.material) return
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
    for (const raw of mats) {
      if (!isPbrMat(raw)) continue
      raw.flatShading = true
      raw.needsUpdate = true
      for (const prop of TEX_PROPS) {
        const t = (raw as unknown as Record<string, unknown>)[prop]
        if (t instanceof Texture) {
          downscaleTextureImage(t)
          pixelateTexture(t)
        }
      }
    }
  })
}
