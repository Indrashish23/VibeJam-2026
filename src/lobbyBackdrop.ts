/**
 * Non-playable 3D preview for the main menu: always the default arena + lights + procedural sky.
 * Match map choice is separate; gameplay entities only exist after `initGame`.
 */
import {
  AmbientLight,
  Clock,
  Color,
  DirectionalLight,
  Group,
  MathUtils,
  Mesh,
  PerspectiveCamera,
  PCFSoftShadowMap,
  Scene,
  Vector3,
  WebGLRenderer,
} from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import {
  applyLobbyMonkeyLoadedStyle,
  syncLobbyMonkeyPresentation,
} from './boxing/monkeyVisualStyle'
import { defaultGameConfig, gameConfig, type GameConfigKey } from './gameConfig'
import { createLobbyHubUnlitSwapper } from './lobbyUnlitMaterials'
import { mountLobbyPortal, type LobbyPortalHandle } from './lobbyPortal'
import { createProceduralSky } from './skyDome'
import { loadMap, type MapHandle } from './maps'

const LOBBY_MONKEY_URL = new URL('../Assets/Props/LobbyMonkeyModel.glb', import.meta.url).href

const LOBBY_MONKEY_KEYS: GameConfigKey[] = [
  'lobbyMonkeyPosX',
  'lobbyMonkeyPosY',
  'lobbyMonkeyPosZ',
  'lobbyMonkeyPitchDeg',
  'lobbyMonkeyYawDeg',
  'lobbyMonkeyRollDeg',
  'lobbyMonkeyScale',
]

/** Ensures runtime `gameConfig` matches source defaults for the menu monkey (avoids stale Tweaks/HMR drift). */
function applyLobbyMonkeyDefaultsFromSource(): void {
  for (const key of LOBBY_MONKEY_KEYS) {
    gameConfig[key] = defaultGameConfig[key]
  }
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

/** Elevated diagonal view of the arena (menu is non-interactive). */
function aimPreviewCamera(cam: PerspectiveCamera): void {
  cam.position.set(18, 7.5, 20)
  cam.lookAt(new Vector3(0, 1.25, 0))
}

export type LobbyBackdropHandle = {
  dispose: () => void
  /** Apply lighting, sky, sun, unlit swap, monkey style + pose (call from Tweaks sync). */
  syncLobbyBackdropFromConfig: () => void
  /** Pause the RAF render loop (use while a fullscreen overlay covers the backdrop). */
  pauseRendering: () => void
  /** Resume the RAF render loop after a previous pause. */
  resumeRendering: () => void
  camera: PerspectiveCamera
  ambient: AmbientLight
  sun: DirectionalLight
}

export async function mountLobbyBackdrop(gameRoot: HTMLElement): Promise<LobbyBackdropHandle> {
  applyLobbyMonkeyDefaultsFromSource()

  const scene = new Scene()
  const hubUnlit = createLobbyHubUnlitSwapper()

  function setSceneBackgroundAndClearColor(): void {
    scene.background = new Color(
      gameConfig.skyboxColorR,
      gameConfig.skyboxColorG,
      gameConfig.skyboxColorB,
    )
  }
  setSceneBackgroundAndClearColor()

  const camera = new PerspectiveCamera(
    gameConfig.cameraFov,
    window.innerWidth / Math.max(window.innerHeight, 1),
    gameConfig.cameraNear,
    gameConfig.cameraFar,
  )
  aimPreviewCamera(camera)

  const renderer = new WebGLRenderer({ antialias: true })
  const lobbyEffectiveDpr = () => Math.min(window.devicePixelRatio, 1.25)
  renderer.setPixelRatio(lobbyEffectiveDpr())
  renderer.setSize(window.innerWidth, window.innerHeight)
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = PCFSoftShadowMap
  renderer.domElement.classList.add('lobby-backdrop-canvas')
  gameRoot.prepend(renderer.domElement)

  const ambient = new AmbientLight(0xffffff, gameConfig.ambientIntensity)
  scene.add(ambient)

  const sun = new DirectionalLight(0xffffff, gameConfig.sunIntensity)
  sun.position.set(gameConfig.sunPosX, gameConfig.sunPosY, gameConfig.sunPosZ)
  sun.castShadow = true
  sun.shadow.mapSize.set(2048, 2048)
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

  const mapHandle: MapHandle = await loadMap('arena', scene, hubRoot)
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
    applyLobbyMonkeyLoadedStyle(monkeyRoot, {
      flatShading: gameConfig.lobbyMonkeyFlatShading >= 0.5,
      texNearest: gameConfig.lobbyMonkeyTexPixelated >= 0.5,
      texDownscale: gameConfig.lobbyMonkeyTexDownscale >= 0.5,
    })
  } catch (err) {
    console.warn('[lobbyBackdrop] Failed to load LobbyMonkeyModel.glb', err)
  }

  function syncLobbyMonkeyPoseFromConfig(): void {
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

  /* Vibe Jam webring exit portal — separate WebGL overlay above the vignette. Mounted
   * alongside the backdrop so it shares the lobby lifecycle (pause / resume / dispose). */
  const portal: LobbyPortalHandle = mountLobbyPortal(gameRoot)

  function syncLobbyBackdropFromConfig(): void {
    setSceneBackgroundAndClearColor()
    ambient.intensity = gameConfig.ambientIntensity
    sun.intensity = gameConfig.sunIntensity
    sun.position.set(gameConfig.sunPosX, gameConfig.sunPosY, gameConfig.sunPosZ)
    applySunShadowFrustum(sun)
    skyDome.syncFromConfig()
    hubUnlit.applyToHubRoot(hubRoot, gameConfig.lightingUnlitMode >= 0.5)
    syncLobbyMonkeyPresentation(monkeyRoot, {
      flatShading: gameConfig.lobbyMonkeyFlatShading >= 0.5,
      texNearest: gameConfig.lobbyMonkeyTexPixelated >= 0.5,
    })
    syncLobbyMonkeyPoseFromConfig()
    portal.syncFromConfig()
  }

  syncLobbyBackdropFromConfig()

  scene.add(camera)

  const clock = new Clock()
  let rafId = 0
  let paused = false
  let disposed = false

  function resize(): void {
    const w = window.innerWidth
    const h = Math.max(window.innerHeight, 1)
    renderer.setPixelRatio(lobbyEffectiveDpr())
    camera.aspect = w / h
    camera.updateProjectionMatrix()
    renderer.setSize(w, h)
  }

  function tick(): void {
    rafId = requestAnimationFrame(tick)
    if (paused || disposed) return
    const rootHidden = (document.getElementById('game-root') as HTMLDivElement | null)?.hidden
    if (rootHidden) return

    const dt = clock.getDelta()
    skyDome.update(dt, camera.position)
    syncLobbyMonkeyPoseFromConfig()
    const wantFov = Math.max(20, Math.min(120, gameConfig.cameraFov))
    if (Math.abs(camera.fov - wantFov) > 0.01) {
      camera.fov = wantFov
      camera.updateProjectionMatrix()
    }
    renderer.render(scene, camera)
  }

  function pauseRendering(): void {
    paused = true
    portal.pauseRendering()
  }

  function resumeRendering(): void {
    if (disposed) return
    paused = false
    /* Reset clock so the first resumed frame doesn't burn a long delta on skyDome / animations. */
    clock.getDelta()
    portal.resumeRendering()
  }

  window.addEventListener('resize', resize)
  tick()

  function dispose(): void {
    if (disposed) return
    disposed = true
    cancelAnimationFrame(rafId)
    window.removeEventListener('resize', resize)
    portal.dispose()
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
    /*
     * Explicitly drop the WebGL context. `renderer.dispose()` only frees
     * three.js-side resources; the underlying GL context lingers on the
     * detached canvas until GC, which on some browsers can collide with
     * the new gameplay renderer (rapid create/destroy after a longer
     * lobby/queue session was producing a black canvas for the second peer).
     */
    try {
      renderer.forceContextLoss()
    } catch {
      /* ignore — older browsers may not expose WEBGL_lose_context */
    }
    renderer.domElement.remove()
  }

  return {
    dispose,
    syncLobbyBackdropFromConfig,
    pauseRendering,
    resumeRendering,
    camera,
    ambient,
    sun,
  }
}
