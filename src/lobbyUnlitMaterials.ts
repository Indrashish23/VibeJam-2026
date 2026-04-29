/**
 * Lobby preview only: swap non-arena meshes to MeshBasic when `lightingUnlitMode` is on.
 * Mirrors main-menu arena rule: keeps imported GLB maps (e.g. `map:arena`) as PBR so shadows read.
 */
import { type Material, Mesh, MeshBasicMaterial, type Object3D } from 'three'

function isUnderImportedArenaMap(node: Object3D): boolean {
  let cur: Object3D | null = node
  while (cur) {
    if (cur.name === 'map:arena') return true
    cur = cur.parent
  }
  return false
}

export function createLobbyHubUnlitSwapper() {
  const litToUnlit = new WeakMap<Material, Material>()
  const unlitToLit = new WeakMap<Material, Material>()

  function mapMaterial(src: Material, unlit: boolean): Material {
    if (unlit) {
      const cached = litToUnlit.get(src)
      if (cached) return cached
      const shaderLike = src as unknown as { isShaderMaterial?: boolean }
      if (shaderLike.isShaderMaterial) return src
      const m = src as unknown as {
        map?: unknown
        color?: { clone?: () => unknown }
        vertexColors?: boolean
        wireframe?: boolean
        transparent?: boolean
        opacity?: number
        alphaTest?: number
        side?: number
        visible?: boolean
        depthTest?: boolean
        depthWrite?: boolean
        name?: string
      }
      const basic = new MeshBasicMaterial()
      const basicAs = basic as unknown as {
        map?: unknown
        color?: { copy?: (c: unknown) => void; set?: (v: unknown) => void }
        vertexColors?: boolean
        wireframe?: boolean
        transparent?: boolean
        opacity?: number
        alphaTest?: number
        side?: unknown
        visible?: boolean
        depthTest?: boolean
        depthWrite?: boolean
      }
      basicAs.map = m.map ?? null
      if (m.color && basicAs.color?.copy) basicAs.color.copy(m.color)
      else basicAs.color?.set?.(0xffffff)
      basicAs.vertexColors = !!m.vertexColors
      basicAs.wireframe = !!m.wireframe
      basicAs.transparent = !!m.transparent
      basicAs.opacity = m.opacity ?? 1
      basicAs.alphaTest = m.alphaTest ?? 0
      basicAs.side = m.side
      basicAs.visible = m.visible ?? true
      basicAs.depthTest = m.depthTest ?? true
      basicAs.depthWrite = m.depthWrite ?? true
      if (m.name) basic.name = `${m.name} (unlit)`
      litToUnlit.set(src, basic)
      unlitToLit.set(basic, src)
      return basic
    }
    return unlitToLit.get(src) ?? src
  }

  function applyToHubRoot(hubRoot: Object3D, globalUnlit: boolean): void {
    hubRoot.traverse((node) => {
      const mesh = node as Mesh
      if (!mesh.isMesh || !mesh.material) return
      let meshUnlit = globalUnlit
      if (meshUnlit && isUnderImportedArenaMap(mesh)) meshUnlit = false
      const matRef = mesh.material
      if (Array.isArray(matRef)) {
        mesh.material = matRef.map((m) => mapMaterial(m, meshUnlit))
      } else {
        mesh.material = mapMaterial(matRef, meshUnlit)
      }
    })
  }

  return { applyToHubRoot }
}
