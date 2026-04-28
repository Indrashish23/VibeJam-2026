/**
 * Non-playable 3D preview for the main menu: always the default arena + lights + procedural sky.
 * Match map choice is separate; gameplay entities only exist after `initGame`.
 */
import {
  AmbientLight,
  BasicShadowMap,
  Clock,
  Color,
  DirectionalLight,
  Group,
  MathUtils,
  Mesh,
  PerspectiveCamera,
  Scene,
  Vector3,
  WebGLRenderer,
} from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { applyMonkeyFlatVertexPixelatedStyle } from './boxing/monkeyVisualStyle'
import { gameConfig } from './gameConfig'
import { createProceduralSky } from './skyDome'
import { loadMap, type MapHandle } from './maps'

const LOBBY_MONKEY_URL = new URL('../Assets/Props/LobbyMonkeyModel.glb', import.meta.url).href

function applySunShadowFrustum(sun: DirectionalLight): void {
  const ext = Math.max(gameConfig.groundWidth, gameConfig.groundDepth) * 0.5 + gameConfig.blastMargin + 10
  const cam = sun.shadow.camera
  cam.left = -ext
  cam.right = ext
  cam.top = ext
  cam.bottom = -ext
  cam.updateProjectionMatrix()
}

/** Elevated diagonal view of the arena (menu is non-interactive). */
function aimPreviewCamera(cam: PerspectiveCamera): void {
  cam.position.set(18, 7.5, 20)
  cam.lookAt(new Vector3(0, 1.25, 0))
}

export type LobbyBackdropHandle = {
  dispose: () => void
  syncLobbyMonkeyFromConfig: () => void
  camera: PerspectiveCamera
  ambient: AmbientLight
  sun: DirectionalLight
}

export async function mountLobbyBackdrop(gameRoot: HTMLElement): Promise<LobbyBackdropHandle> {
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

  const mapHandle: MapHandle = await loadMap('default', scene, hubRoot)
  hubRoot.traverse((obj) => {
    const m = obj as { isMesh?: boolean; castShadow?: boolean; receiveShadow?: boolean }
    if (m.isMesh) {
      m.castShadow = true
      m.receiveShadow = true
    }
  })

  let monkeyRoot: Group | null = null
  try {
    const loader = new GLTFLoader()
    const gltf = await loader.loadAsync(LOBBY_MONKEY_URL)
    monkeyRoot = gltf.scene
    hubRoot.add(monkeyRoot)
    monkeyRoot.traverse((obj) => {
      const m = obj as { isMesh?: boolean; castShadow?: boolean; receiveShadow?: boolean }
      if (m.isMesh) {
        m.castShadow = true
        m.receiveShadow = true
      }
    })
    applyMonkeyFlatVertexPixelatedStyle(monkeyRoot)
  } catch (err) {
    console.warn('[lobbyBackdrop] Failed to load LobbyMonkeyModel.glb', err)
  }

  function syncLobbyMonkeyFromConfig(): void {
    if (!monkeyRoot) return
    monkeyRoot.position.set(
      gameConfig.lobbyMonkeyPosX,
      gameConfig.lobbyMonkeyPosY,
      gameConfig.lobbyMonkeyPosZ,
    )
    monkeyRoot.rotation.set(
      MathUtils.degToRad(gameConfig.lobbyMonkeyPitchDeg),
      MathUtils.degToRad(gameConfig.lobbyMonkeyYawDeg),
      MathUtils.degToRad(gameConfig.lobbyMonkeyRollDeg),
      'YXZ',
    )
    monkeyRoot.scale.setScalar(Math.max(0.05, gameConfig.lobbyMonkeyScale))
  }

  syncLobbyMonkeyFromConfig()

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
    syncLobbyMonkeyFromConfig()
    renderer.render(scene, camera)
  }

  window.addEventListener('resize', resize)
  tick()

  function dispose(): void {
    cancelAnimationFrame(rafId)
    window.removeEventListener('resize', resize)
    mapHandle.dispose()
    skyDome.dispose()
    scene.remove(ambient)
    scene.remove(sun)
    scene.remove(sun.target)
    if (monkeyRoot) {
      hubRoot.remove(monkeyRoot)
      monkeyRoot.traverse((o) => {
        const mo = o as Mesh
        if (mo.isMesh) {
          mo.geometry?.dispose()
          const mats = mo.material
          if (Array.isArray(mats)) mats.forEach((mat) => mat.dispose())
          else mats?.dispose()
        }
      })
      monkeyRoot = null
    }
    scene.remove(hubRoot)
    scene.remove(camera)
    renderer.dispose()
    renderer.domElement.remove()
  }

  return {
    dispose,
    syncLobbyMonkeyFromConfig,
    camera,
    ambient,
    sun,
  }
}
