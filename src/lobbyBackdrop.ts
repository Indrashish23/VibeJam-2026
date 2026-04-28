/**
 * Non-playable 3D preview for the main menu: same map lighting + procedural sky as gameplay,
 * no avatars, weapons, or banana world (those are only created in `initGame`).
 */
import {
  AmbientLight,
  BasicShadowMap,
  Clock,
  Color,
  DirectionalLight,
  Group,
  PerspectiveCamera,
  Scene,
  Vector3,
  WebGLRenderer,
} from 'three'
import { gameConfig } from './gameConfig'
import { createProceduralSky } from './skyDome'
import { loadMap, type MapHandle, type MapId } from './maps'

type LobbyBackdropHandle = {
  dispose: () => void
  setMapId: (id: MapId) => Promise<void>
}

function applySunShadowFrustum(sun: DirectionalLight): void {
  const ext = Math.max(gameConfig.groundWidth, gameConfig.groundDepth) * 0.5 + gameConfig.blastMargin + 10
  const cam = sun.shadow.camera
  cam.left = -ext
  cam.right = ext
  cam.top = ext
  cam.bottom = -ext
  cam.updateProjectionMatrix()
}

/** Elevated diagonal view of the arena / map origin (menu is non-interactive). */
function aimPreviewCamera(cam: PerspectiveCamera): void {
  cam.position.set(18, 7.5, 20)
  cam.lookAt(new Vector3(0, 1.25, 0))
}

export async function mountLobbyBackdrop(
  gameRoot: HTMLElement,
  initialMapId: MapId,
): Promise<LobbyBackdropHandle> {
  const scene = new Scene()
  scene.background = new Color(
    gameConfig.skyboxColorR,
    gameConfig.skyboxColorG,
    gameConfig.skyboxColorB,
  )

  const camera = new PerspectiveCamera(
    gameConfig.cameraFov,
    window.innerWidth / Math.max(window.innerHeight, 1),
    gameConfig.cameraNear,
    gameConfig.cameraFar,
  )
  aimPreviewCamera(camera)

  const renderer = new WebGLRenderer({ antialias: true })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  renderer.setSize(window.innerWidth, window.innerHeight)
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = BasicShadowMap
  renderer.domElement.classList.add('lobby-backdrop-canvas')
  gameRoot.prepend(renderer.domElement)

  const ambient = new AmbientLight(0xffffff, gameConfig.ambientIntensity)
  scene.add(ambient)

  const sun = new DirectionalLight(0xffffff, gameConfig.sunIntensity)
  sun.position.set(58, 34, 42)
  sun.castShadow = true
  sun.shadow.mapSize.set(4096, 4096)
  sun.shadow.camera.near = 0.5
  sun.shadow.camera.far = 220
  sun.shadow.bias = -0.0004
  sun.shadow.normalBias = 0.035
  applySunShadowFrustum(sun)
  scene.add(sun)
  scene.add(sun.target)
  sun.target.position.set(0, 0, 0)

  const hubRoot = new Group()
  scene.add(hubRoot)

  const skyDome = createProceduralSky(scene)

  let mapHandle: MapHandle | null = null
  let currentId: MapId | null = null

  async function applyMap(id: MapId): Promise<void> {
    if (currentId === id && mapHandle) return
    if (mapHandle) {
      mapHandle.dispose()
      mapHandle = null
    }
    mapHandle = await loadMap(id, scene, hubRoot)
    currentId = id
    hubRoot.traverse((obj) => {
      const m = obj as { isMesh?: boolean; castShadow?: boolean; receiveShadow?: boolean }
      if (m.isMesh) {
        m.castShadow = true
        m.receiveShadow = true
      }
    })
  }

  await applyMap(initialMapId)

  scene.add(camera)

  const clock = new Clock()
  let rafId = 0

  function resize(): void {
    const w = window.innerWidth
    const h = Math.max(window.innerHeight, 1)
    camera.aspect = w / h
    camera.updateProjectionMatrix()
    renderer.setSize(w, h)
  }

  function tick(): void {
    rafId = requestAnimationFrame(tick)
    const rootHidden = (document.getElementById('game-root') as HTMLDivElement | null)?.hidden
    if (rootHidden) return

    const dt = clock.getDelta()
    skyDome.update(dt, camera.position)
    renderer.render(scene, camera)
  }

  window.addEventListener('resize', resize)
  tick()

  function dispose(): void {
    cancelAnimationFrame(rafId)
    window.removeEventListener('resize', resize)
    mapHandle?.dispose()
    mapHandle = null
    currentId = null
    skyDome.dispose()
    scene.remove(ambient)
    scene.remove(sun)
    scene.remove(sun.target)
    scene.remove(hubRoot)
    scene.remove(camera)
    renderer.dispose()
    renderer.domElement.remove()
  }

  return {
    dispose,
    setMapId: applyMap,
  }
}
