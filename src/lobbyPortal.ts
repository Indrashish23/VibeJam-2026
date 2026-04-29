/**
 * Vibe Jam 2026 webring exit portal — a transparent overlay above the lobby vignette.
 *
 * Renders `Assets/Props/portall.gltf` in a dedicated WebGL canvas (alpha:true) stacked
 * **above** `.lobby-overlay` (vignette) but **below** the lobby buttons. The two GLTF
 * submeshes are replaced with custom emissive shaders:
 *
 *   - `portalMesh` (inner disc) — animated radial swirl with rainbow hue cycling.
 *   - the outer ring node      — solid hue-cycling energy band (no baked texture).
 *
 * A DOM hit-area is sized each frame to the projected screen-space circle of the
 * portal so hover/click hit-testing is precise. Hover reveals a `Leaving so soon?`
 * pill plus an `Enter portal` confirm button; the button is what actually redirects
 * (avoids accidental misclicks per design).
 *
 * Camera matches the lobby backdrop's viewpoint so positioning Tweaks behave the same
 * as the lobby monkey relative to the arena.
 */
import {
  AdditiveBlending,
  Clock,
  DoubleSide,
  Group,
  LoadingManager,
  MathUtils,
  Mesh,
  PerspectiveCamera,
  Scene,
  ShaderMaterial,
  Sphere,
  Vector3,
  WebGLRenderer,
} from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { defaultGameConfig, gameConfig, type GameConfigKey } from './gameConfig'

const LOBBY_PORTAL_GLTF_URL = new URL('../Assets/Props/portall.gltf', import.meta.url).href
/*
 * Multi-file GLTF (gltf + bin + texture) — Vite hashes each filename independently, so the
 * relative `"uri": "portall0.bin"` inside the gltf JSON points at a stale name in production.
 * We import the companion `.bin` via `new URL` (Vite emits + hashes it) and remap inside a
 * `LoadingManager` so GLTFLoader resolves the correct hashed URL at runtime.
 *
 * The albedo texture in the gltf is NOT imported: we replace both submesh materials with
 * custom shaders, so loading the 1.4 MB albedo would be pure waste. The URL modifier
 * substitutes a 1×1 transparent PNG instead, which the loader accepts without warnings.
 */
const LOBBY_PORTAL_BIN_URL = new URL('../Assets/Props/portall0.bin', import.meta.url).href
/** 1×1 transparent PNG (data URL) — placeholder for the throwaway portal albedo texture. */
const PORTAL_DUMMY_TEX_DATA_URL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNgYAAAAAMAAWgmWQ0AAAAASUVORK5CYII='

const PORTAL_INNER_NODE_NAME = 'portalMesh'
/** Vibe Jam 2026 webring exit URL — receives forwarded query params. */
const VIBE_JAM_PORTAL_URL = 'https://vibejam.cc/portal/2026'

const LOBBY_PORTAL_KEYS: GameConfigKey[] = [
  'lobbyPortalPosX',
  'lobbyPortalPosY',
  'lobbyPortalPosZ',
  'lobbyPortalPitchDeg',
  'lobbyPortalYawDeg',
  'lobbyPortalRollDeg',
  'lobbyPortalScale',
  'lobbyPortalRiftSpeed',
  'lobbyPortalHueCycleSpeed',
  'lobbyPortalHueRadialBias',
  'lobbyPortalIntensity',
  'lobbyPortalSaturation',
]

/** Reset runtime config to source defaults so stale Tweaks/HMR drift doesn't reposition the portal. */
function applyLobbyPortalDefaultsFromSource(): void {
  for (const key of LOBBY_PORTAL_KEYS) {
    gameConfig[key] = defaultGameConfig[key]
  }
}

/** Shared GLSL: HSV→RGB so both shaders cycle the same rainbow palette in sync. */
const HSV2RGB_GLSL = /* glsl */ `
  vec3 hsv2rgb(vec3 c) {
    vec4 K = vec4(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);
    vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
    return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
  }
`

/** Inner rift shader: animated radial swirl + rainbow hue cycling, additive blending. */
function makeRiftMaterial(): ShaderMaterial {
  return new ShaderMaterial({
    transparent: true,
    blending: AdditiveBlending,
    depthWrite: false,
    side: DoubleSide,
    uniforms: {
      uTime: { value: 0 },
      uRiftSpeed: { value: gameConfig.lobbyPortalRiftSpeed },
      uHueCycleSpeed: { value: gameConfig.lobbyPortalHueCycleSpeed },
      uHueRadialBias: { value: gameConfig.lobbyPortalHueRadialBias },
      uIntensity: { value: gameConfig.lobbyPortalIntensity },
      uSaturation: { value: gameConfig.lobbyPortalSaturation },
    },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      precision highp float;
      varying vec2 vUv;
      uniform float uTime;
      uniform float uRiftSpeed;
      uniform float uHueCycleSpeed;
      uniform float uHueRadialBias;
      uniform float uIntensity;
      uniform float uSaturation;
      ${HSV2RGB_GLSL}

      // Cheap hash + value noise for swirl texture.
      float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float noise(vec2 p) {
        vec2 i = floor(p), f = fract(p);
        float a = hash(i);
        float b = hash(i + vec2(1.0, 0.0));
        float c = hash(i + vec2(0.0, 1.0));
        float d = hash(i + vec2(1.0, 1.0));
        vec2 u = f * f * (3.0 - 2.0 * f);
        return mix(a, b, u.x) + (c - a) * u.y * (1.0 - u.x) + (d - b) * u.x * u.y;
      }

      void main() {
        vec2 p = vUv - 0.5;
        float r = length(p) * 2.0;
        float theta = atan(p.y, p.x);

        // Swirling angular field rotates around center; faster near the rim.
        float swirl = sin(theta * 5.0 + r * 7.0 - uTime * uRiftSpeed * 2.5);
        // Animated noise gives a "plasma" feel on top of the swirl.
        float n = noise(vec2(theta * 1.6 + uTime * uRiftSpeed * 0.7, r * 4.0 - uTime * uRiftSpeed * 0.45));
        float energy = 0.55 + 0.45 * swirl * n;

        // Rainbow: cycle base hue with time, bias by radius so center/edge differ.
        float hue = fract(uTime * uHueCycleSpeed + r * uHueRadialBias + swirl * 0.06);
        vec3 color = hsv2rgb(vec3(hue, uSaturation, 1.0));

        // Soft circular alpha: fade hard outside r=1, dim slightly at center for a 'core' look.
        float ringMask = smoothstep(1.0, 0.55, r) * smoothstep(0.0, 0.18, r);
        float alpha = clamp(ringMask * (0.55 + energy * 0.7), 0.0, 1.0);

        gl_FragColor = vec4(color * energy * uIntensity, alpha);
      }
    `,
  })
}

/** Outer ring shader: solid hue-cycling band with a fresnel-style rim boost. */
function makeRingMaterial(): ShaderMaterial {
  return new ShaderMaterial({
    transparent: true,
    blending: AdditiveBlending,
    depthWrite: false,
    side: DoubleSide,
    uniforms: {
      uTime: { value: 0 },
      uHueCycleSpeed: { value: gameConfig.lobbyPortalHueCycleSpeed },
      uHueRadialBias: { value: gameConfig.lobbyPortalHueRadialBias },
      uIntensity: { value: gameConfig.lobbyPortalIntensity },
      uSaturation: { value: gameConfig.lobbyPortalSaturation },
    },
    vertexShader: /* glsl */ `
      varying vec3 vWorldNormal;
      varying vec3 vWorldPos;
      void main() {
        vec4 worldPos = modelMatrix * vec4(position, 1.0);
        vWorldPos = worldPos.xyz;
        vWorldNormal = normalize(mat3(modelMatrix) * normal);
        gl_Position = projectionMatrix * viewMatrix * worldPos;
      }
    `,
    fragmentShader: /* glsl */ `
      precision highp float;
      varying vec3 vWorldNormal;
      varying vec3 vWorldPos;
      uniform float uTime;
      uniform float uHueCycleSpeed;
      uniform float uHueRadialBias;
      uniform float uIntensity;
      uniform float uSaturation;
      ${HSV2RGB_GLSL}

      void main() {
        // Fresnel-like rim using camera position (cameraPosition is auto-injected by three).
        vec3 viewDir = normalize(cameraPosition - vWorldPos);
        float rim = 1.0 - clamp(dot(normalize(vWorldNormal), viewDir), 0.0, 1.0);
        rim = pow(rim, 1.5);

        // Hue cycles in sync with the rift; radial bias offsets per-fragment for a band gradient.
        float hue = fract(uTime * uHueCycleSpeed + rim * uHueRadialBias * 0.4);
        vec3 color = hsv2rgb(vec3(hue, uSaturation, 1.0));

        float brightness = (0.65 + 0.55 * rim) * uIntensity;
        float alpha = clamp(0.6 + rim * 0.5, 0.0, 1.0);
        gl_FragColor = vec4(color * brightness, alpha);
      }
    `,
  })
}

export type LobbyPortalHandle = {
  dispose: () => void
  syncFromConfig: () => void
  pauseRendering: () => void
  resumeRendering: () => void
}

export function mountLobbyPortal(gameRoot: HTMLElement): LobbyPortalHandle {
  applyLobbyPortalDefaultsFromSource()

  const scene = new Scene()
  /*
   * Camera matches the lobby backdrop viewpoint (see lobbyBackdrop.ts) so portal world
   * coordinates feel consistent with the lobby monkey position values in Tweaks.
   */
  const camera = new PerspectiveCamera(
    gameConfig.cameraFov,
    window.innerWidth / Math.max(window.innerHeight, 1),
    gameConfig.cameraNear,
    gameConfig.cameraFar,
  )
  camera.position.set(18, 7.5, 20)
  camera.lookAt(new Vector3(0, 1.25, 0))

  const renderer = new WebGLRenderer({ alpha: true, antialias: true, premultipliedAlpha: false })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  renderer.setSize(window.innerWidth, window.innerHeight)
  renderer.setClearColor(0x000000, 0)
  renderer.domElement.classList.add('lobby-portal-canvas')
  /* Append AFTER the lobby-overlay element (z-index above the vignette via CSS class). */
  gameRoot.appendChild(renderer.domElement)

  const portalRoot = new Group()
  scene.add(portalRoot)

  const riftMaterial = makeRiftMaterial()
  const ringMaterial = makeRingMaterial()
  let innerMesh: Mesh | null = null

  /* Hit-area + tooltip + confirm button: created up-front so we can show/hide via class toggles. */
  const hitWrap = document.createElement('div')
  hitWrap.className = 'lobby-portal-hover'
  hitWrap.hidden = true

  const hitDot = document.createElement('div')
  hitDot.className = 'lobby-portal-hit'
  hitWrap.appendChild(hitDot)

  const tooltip = document.createElement('div')
  tooltip.className = 'lobby-portal-tooltip'
  tooltip.textContent = 'Leaving so soon?'
  hitWrap.appendChild(tooltip)

  const confirmBtn = document.createElement('button')
  confirmBtn.type = 'button'
  confirmBtn.className = 'lobby-portal-confirm'
  confirmBtn.textContent = 'Enter portal'
  hitWrap.appendChild(confirmBtn)

  gameRoot.appendChild(hitWrap)

  let hovered = false
  function setHovered(next: boolean): void {
    if (hovered === next) return
    hovered = next
    hitWrap.classList.toggle('is-hovered', next)
  }
  hitDot.addEventListener('mouseenter', () => setHovered(true))
  hitDot.addEventListener('mouseleave', (e) => {
    /* Stay hovered while moving onto the confirm button. */
    const to = e.relatedTarget as Node | null
    if (to && hitWrap.contains(to)) return
    setHovered(false)
  })
  confirmBtn.addEventListener('mouseleave', (e) => {
    const to = e.relatedTarget as Node | null
    if (to && hitWrap.contains(to)) return
    setHovered(false)
  })
  confirmBtn.addEventListener('click', () => {
    window.location.href = buildVibeJamExitUrl()
  })

  let portalLoaded = false
  /** World-space sphere of the inner mesh (recomputed on each pose change). */
  const portalSphere = new Sphere(new Vector3(), 1)

  void (async () => {
    try {
      const manager = new LoadingManager()
      manager.setURLModifier((rawUrl) => {
        /*
         * three.js resolves the gltf's relative URIs against its own URL, so requests look
         * like `<...>/portall0.bin` or `<...>/textures/tripo_mat_..._albedo.png`. Map the
         * `.bin` to the Vite-emitted hashed URL. The albedo is not used (materials are
         * replaced with custom shaders) — point it at a 1×1 transparent placeholder so we
         * skip the 1.4 MB download.
         */
        if (rawUrl.endsWith('portall0.bin')) return LOBBY_PORTAL_BIN_URL
        if (rawUrl.includes('tripo_mat_') && rawUrl.endsWith('_albedo.png'))
          return PORTAL_DUMMY_TEX_DATA_URL
        return rawUrl
      })
      const loader = new GLTFLoader(manager)
      const gltf = await loader.loadAsync(LOBBY_PORTAL_GLTF_URL)
      const root = gltf.scene
      portalRoot.add(root)
      root.traverse((obj) => {
        const m = obj as Mesh & { isMesh?: boolean; name?: string }
        if (!m.isMesh) return
        if (m.name === PORTAL_INNER_NODE_NAME) {
          m.material = riftMaterial
          /* Render order: inner rift on top of outer ring inside the same pass. */
          m.renderOrder = 2
          innerMesh = m
        } else {
          m.material = ringMaterial
          m.renderOrder = 1
        }
      })
      portalLoaded = true
      syncFromConfig()
    } catch (err) {
      console.warn('[lobbyPortal] Failed to load portall.gltf', err)
    }
  })()

  function syncFromConfig(): void {
    portalRoot.position.set(
      gameConfig.lobbyPortalPosX,
      gameConfig.lobbyPortalPosY,
      gameConfig.lobbyPortalPosZ,
    )
    portalRoot.rotation.set(
      MathUtils.degToRad(gameConfig.lobbyPortalPitchDeg),
      MathUtils.degToRad(gameConfig.lobbyPortalYawDeg),
      MathUtils.degToRad(gameConfig.lobbyPortalRollDeg),
      'YXZ',
    )
    portalRoot.scale.setScalar(Math.max(0.05, gameConfig.lobbyPortalScale))

    riftMaterial.uniforms.uRiftSpeed.value = gameConfig.lobbyPortalRiftSpeed
    riftMaterial.uniforms.uHueCycleSpeed.value = gameConfig.lobbyPortalHueCycleSpeed
    riftMaterial.uniforms.uHueRadialBias.value = gameConfig.lobbyPortalHueRadialBias
    riftMaterial.uniforms.uIntensity.value = gameConfig.lobbyPortalIntensity
    riftMaterial.uniforms.uSaturation.value = gameConfig.lobbyPortalSaturation

    ringMaterial.uniforms.uHueCycleSpeed.value = gameConfig.lobbyPortalHueCycleSpeed
    ringMaterial.uniforms.uHueRadialBias.value = gameConfig.lobbyPortalHueRadialBias
    ringMaterial.uniforms.uIntensity.value = gameConfig.lobbyPortalIntensity
    ringMaterial.uniforms.uSaturation.value = gameConfig.lobbyPortalSaturation
  }
  syncFromConfig()

  function projectPortalToScreen(): { x: number; y: number; r: number } | null {
    if (!portalLoaded || !innerMesh) return null
    /* Recompute world bounding sphere each frame because Tweaks can change pose live. */
    innerMesh.updateWorldMatrix(true, false)
    const geom = innerMesh.geometry
    if (!geom.boundingSphere) geom.computeBoundingSphere()
    if (!geom.boundingSphere) return null
    portalSphere.copy(geom.boundingSphere).applyMatrix4(innerMesh.matrixWorld)
    const center = portalSphere.center
    const ndc = center.clone().project(camera)
    if (ndc.z > 1 || ndc.z < -1) return null
    const w = window.innerWidth
    const h = window.innerHeight
    const x = (ndc.x * 0.5 + 0.5) * w
    const y = (-ndc.y * 0.5 + 0.5) * h
    /* Approx screen radius: project sphere edge by perturbing center along camera right. */
    const right = new Vector3()
    camera.getWorldDirection(right)
    right.cross(camera.up).normalize().multiplyScalar(portalSphere.radius)
    const edge = center.clone().add(right).project(camera)
    const px = (edge.x * 0.5 + 0.5) * w
    const py = (-edge.y * 0.5 + 0.5) * h
    const r = Math.hypot(px - x, py - y)
    return { x, y, r }
  }

  function syncHitArea(): void {
    const proj = projectPortalToScreen()
    if (!proj) {
      hitWrap.hidden = true
      return
    }
    hitWrap.hidden = false
    const r = Math.max(28, proj.r)
    hitWrap.style.setProperty('--portal-x', `${proj.x}px`)
    hitWrap.style.setProperty('--portal-y', `${proj.y}px`)
    hitWrap.style.setProperty('--portal-r', `${r}px`)
  }

  const clock = new Clock()
  let rafId = 0
  let paused = false
  let disposed = false

  function resize(): void {
    const w = window.innerWidth
    const h = Math.max(window.innerHeight, 1)
    camera.aspect = w / h
    camera.updateProjectionMatrix()
    renderer.setSize(w, h)
  }

  function tick(): void {
    rafId = requestAnimationFrame(tick)
    if (paused || disposed) return
    const rootHidden = (document.getElementById('game-root') as HTMLDivElement | null)?.hidden
    if (rootHidden) {
      hitWrap.hidden = true
      return
    }
    const dt = clock.getDelta()
    riftMaterial.uniforms.uTime.value += dt
    ringMaterial.uniforms.uTime.value += dt
    /* Re-sync FOV in case Tweaks changes it (matches lobby backdrop behaviour). */
    const wantFov = Math.max(20, Math.min(120, gameConfig.cameraFov))
    if (Math.abs(camera.fov - wantFov) > 0.01) {
      camera.fov = wantFov
      camera.updateProjectionMatrix()
    }
    syncHitArea()
    renderer.render(scene, camera)
  }

  window.addEventListener('resize', resize)
  tick()

  function pauseRendering(): void {
    paused = true
    hitWrap.hidden = true
  }

  function resumeRendering(): void {
    if (disposed) return
    paused = false
    clock.getDelta()
  }

  function dispose(): void {
    if (disposed) return
    disposed = true
    cancelAnimationFrame(rafId)
    window.removeEventListener('resize', resize)
    hitWrap.remove()
    portalRoot.traverse((o) => {
      const mo = o as Mesh
      if (mo.isMesh) {
        mo.geometry?.dispose()
      }
    })
    riftMaterial.dispose()
    ringMaterial.dispose()
    scene.remove(portalRoot)
    renderer.dispose()
    try {
      renderer.forceContextLoss()
    } catch {
      /* ignore */
    }
    renderer.domElement.remove()
    innerMesh = null
  }

  return { dispose, syncFromConfig, pauseRendering, resumeRendering }
}

/**
 * Build the Vibe Jam 2026 redirect URL. All optional params per spec — the receiving
 * site forwards them to the next game on the webring; we don't stand to know what
 * the next game wants, so we send the safe baseline (`username`, `color`, `speed`, `ref`).
 */
export function buildVibeJamExitUrl(): string {
  const u = new URL(VIBE_JAM_PORTAL_URL)
  const name = readPlayerNameForPortal()
  if (name) u.searchParams.set('username', name)
  /*
   * No first-class player color exists in this build; fall back to a stable hex so the
   * receiving game still has something to render. Honour any color we received via
   * `?portal=true` by stashing it; otherwise default to a vibe-jam-ish purple.
   */
  u.searchParams.set('color', incomingPortalColor() ?? '#a855f7')
  u.searchParams.set('speed', String(gameConfig.moveSpeed ?? 5))
  u.searchParams.set('ref', location.host)
  return u.toString()
}

function readPlayerNameForPortal(): string | null {
  try {
    const raw = sessionStorage.getItem('vibejam_player_name')?.trim()
    return raw || null
  } catch {
    return null
  }
}

function incomingPortalColor(): string | null {
  try {
    return sessionStorage.getItem('vibejam_portal_color') || null
  } catch {
    return null
  }
}
