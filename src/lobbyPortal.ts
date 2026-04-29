/**
 * Vibe Jam 2026 webring exit portal — a transparent overlay above the lobby vignette.
 *
 * Renders `Assets/Props/portal.glb` in a dedicated WebGL canvas (alpha:true) stacked
 * **above** `.lobby-overlay` but **below** the lobby buttons. The model has two submeshes:
 *
 *   - `PortalSwirlMesh` (inner disc) — replaced with a hand-tuned fire/swirl shader
 *     (orange palette, fbm-modulated rotational swirl with a pulse + radial streaks).
 *   - the outer textured ring (`tripo_node_...`) — material swapped to `MeshBasicMaterial`
 *     so the embedded GLB texture renders unlit (this scene has no lights).
 *
 * A DOM hit-area is sized each frame to the projected screen-space circle of the
 * inner swirl mesh so hover/click hit-testing is precise. Hover reveals a
 * `Leaving so soon?` pill plus an `Enter portal` confirm button; only the button
 * actually triggers the redirect (avoids accidental misclicks per design).
 *
 * Camera matches the lobby backdrop's viewpoint so positioning Tweaks behave the
 * same as the lobby monkey relative to the arena.
 */
import {
  Clock,
  Color,
  DoubleSide,
  Group,
  MathUtils,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  NormalBlending,
  PerspectiveCamera,
  Scene,
  ShaderMaterial,
  Sphere,
  Vector3,
  WebGLRenderer,
  type Material,
} from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { defaultGameConfig, gameConfig, type GameConfigKey } from './gameConfig'

const LOBBY_PORTAL_GLB_URL = new URL('../Assets/Props/portal.glb', import.meta.url).href
/** Inner swirl disc — new GLB uses this; older assets used `portalMesh`. */
const PORTAL_INNER_NODE_NAMES = new Set(['portalswirlmesh', 'portalmesh'])
/** Vibe Jam 2026 webring exit URL — receives forwarded query params. */
/** Central webring hub; override with `VITE_VIBEJAM_PORTAL_URL` if the default route changes. */
const VIBE_JAM_PORTAL_URL =
  (import.meta.env.VITE_VIBEJAM_PORTAL_URL as string | undefined)?.trim() ||
  'https://vibejam.cc/portal/2026'

const LOBBY_PORTAL_KEYS: GameConfigKey[] = [
  'lobbyPortalPosX',
  'lobbyPortalPosY',
  'lobbyPortalPosZ',
  'lobbyPortalPitchDeg',
  'lobbyPortalYawDeg',
  'lobbyPortalRollDeg',
  'lobbyPortalScale',
  'lobbyPortalSwirlSpeed',
  'lobbyPortalSwirlTightness',
  'lobbyPortalSwirlScale',
  'lobbyPortalPulseSpeed',
  'lobbyPortalPulseStrength',
  'lobbyPortalIntensity',
  'lobbyPortalUvScale',
  'lobbyPortalUvOffsetU',
  'lobbyPortalUvOffsetV',
  'lobbyPortalDiskUvRadius',
]

/** Reset runtime config to source defaults so stale Tweaks/HMR drift doesn't reposition the portal. */
function applyLobbyPortalDefaultsFromSource(): void {
  for (const key of LOBBY_PORTAL_KEYS) {
    gameConfig[key] = defaultGameConfig[key]
  }
}

/**
 * Inner-disc fire/swirl `ShaderMaterial`. Port of the user-provided Godot shader:
 * orange-palette radial swirl with fbm noise modulation, slow pulse, and angular
 * streaks. A circular UV mask (`uDiskUvRadius` around a tweakable center) discards
 * fragments so the inner quad does not show past the ring. The
 * Godot `ALBEDO + EMISSION*1.5` combo is folded into a single `*2.5` multiplier;
 * `uIntensity` is the user-facing emissive boost on top.
 */
function makeFireSwirlMaterial(): ShaderMaterial {
  return new ShaderMaterial({
    transparent: true,
    blending: NormalBlending,
    depthWrite: false,
    depthTest: false,
    side: DoubleSide,
    uniforms: {
      uTime: { value: 0 },
      uSwirlSpeed: { value: gameConfig.lobbyPortalSwirlSpeed },
      uSwirlTightness: { value: gameConfig.lobbyPortalSwirlTightness },
      uSwirlScale: { value: gameConfig.lobbyPortalSwirlScale },
      uPulseSpeed: { value: gameConfig.lobbyPortalPulseSpeed },
      uPulseStrength: { value: gameConfig.lobbyPortalPulseStrength },
      uIntensity: { value: gameConfig.lobbyPortalIntensity },
      uUvScale: { value: gameConfig.lobbyPortalUvScale },
      uUvOffsetU: { value: gameConfig.lobbyPortalUvOffsetU },
      uUvOffsetV: { value: gameConfig.lobbyPortalUvOffsetV },
      uDiskUvRadius: { value: gameConfig.lobbyPortalDiskUvRadius },
      uColorCore: { value: new Color(1.0, 1.0, 0.6) },
      uColorMid: { value: new Color(1.0, 0.45, 0.0) },
      uColorOuter: { value: new Color(0.6, 0.05, 0.0) },
      uColorRim: { value: new Color(0.15, 0.0, 0.0) },
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
      uniform float uSwirlSpeed;
      uniform float uSwirlTightness;
      uniform float uSwirlScale;
      uniform float uPulseSpeed;
      uniform float uPulseStrength;
      uniform float uIntensity;
      uniform float uUvScale;
      uniform float uUvOffsetU;
      uniform float uUvOffsetV;
      uniform float uDiskUvRadius;
      uniform vec3 uColorCore;
      uniform vec3 uColorMid;
      uniform vec3 uColorOuter;
      uniform vec3 uColorRim;

      #define TAU 6.2831853

      float hash(vec2 p) {
        p = fract(p * vec2(127.1, 311.7));
        p += dot(p, p + 19.19);
        return fract(p.x * p.y);
      }

      float smoothnoise(vec2 p) {
        vec2 i = floor(p);
        vec2 f = fract(p);
        vec2 u = f * f * (3.0 - 2.0 * f);
        return mix(
          mix(hash(i + vec2(0.0, 0.0)), hash(i + vec2(1.0, 0.0)), u.x),
          mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x),
          u.y
        );
      }

      float fbm(vec2 p) {
        float v = 0.0;
        float a = 0.5;
        for (int i = 0; i < 5; i++) {
          v += a * smoothnoise(p);
          p = p * 2.1 + vec2(1.7, 9.2);
          a *= 0.5;
        }
        return v;
      }

      void main() {
        vec2 c = vec2(0.5 + uUvOffsetU, 0.5 + uUvOffsetV);
        vec2 rawDelta = vUv - c;
        float rUV = length(rawDelta);
        if (rUV > uDiskUvRadius) discard;

        vec2 uv = rawDelta * uUvScale * uSwirlScale;
        float dist = length(uv);
        float angle = atan(uv.y, uv.x);

        float t = uTime;
        float swirl_angle = angle - uSwirlTightness * dist + uSwirlSpeed * t;
        vec2 swirl_uv = vec2(cos(swirl_angle) * dist, sin(swirl_angle) * dist);

        float n = fbm(swirl_uv * 3.5 + vec2(t * 0.3, t * 0.15));
        float n2 = fbm(swirl_uv * 6.0 - vec2(t * 0.2, t * 0.4));
        float noise_val = mix(n, n2, 0.4);

        float radial = 1.0 - smoothstep(0.0, 1.0, dist);
        radial = pow(radial, 0.7);

        float pulse = 1.0 + uPulseStrength * sin(t * uPulseSpeed * TAU);
        radial *= pulse;

        float ramp = clamp(radial * 0.75 + noise_val * 0.5, 0.0, 1.0);

        vec3 col;
        if (ramp > 0.75) {
          col = mix(uColorMid, uColorCore, (ramp - 0.75) / 0.25);
        } else if (ramp > 0.45) {
          col = mix(uColorOuter, uColorMid, (ramp - 0.45) / 0.30);
        } else if (ramp > 0.15) {
          col = mix(uColorRim, uColorOuter, (ramp - 0.15) / 0.30);
        } else {
          col = uColorRim;
        }

        float edge_mask = smoothstep(
          uDiskUvRadius * uUvScale * uSwirlScale,
          uDiskUvRadius * uUvScale * uSwirlScale * 0.85,
          dist
        );
        col *= edge_mask;

        float streak = pow(max(0.0, sin(swirl_angle * 3.0 + t * 4.0)), 8.0);
        streak *= (1.0 - dist) * 0.6;
        col += vec3(1.0, 0.6, 0.1) * streak;

        // Combine ALBEDO + EMISSION (Godot semantics) into one bright unlit term.
        vec3 finalCol = col * 2.5 * uIntensity;
        gl_FragColor = vec4(finalCol, 1.0);
      }
    `,
  })
}

/**
 * Outer ring: GLB ships `MeshStandardMaterial` but the portal scene has no lights.
 * Fall back to a basic unlit material; clone `MeshBasicMaterial` if already basic.
 */
function unlitFromModelMaterial(src: Material): MeshBasicMaterial {
  if (src instanceof MeshStandardMaterial) {
    return new MeshBasicMaterial({
      map: src.map,
      color: src.color,
      transparent: src.transparent,
      side: DoubleSide,
      depthWrite: true,
    })
  }
  if (src instanceof MeshBasicMaterial) {
    return src.clone()
  }
  return new MeshBasicMaterial({ color: 0xffffff, side: DoubleSide, depthWrite: true })
}

export type LobbyPortalHandle = {
  dispose: () => void
  syncFromConfig: () => void
  pauseRendering: () => void
  resumeRendering: () => void
}

export function mountLobbyPortal(_gameRoot: HTMLElement): LobbyPortalHandle {
  applyLobbyPortalDefaultsFromSource()
  void _gameRoot
  /*
   * Mount on `document.body`, not `game-root`: `#game-root` is z-index 0 while
   * `#lobby-overlay` is z-index 18, so a portal canvas *inside* game-root stays
   * underneath the lobby layer’s stacking context and can disappear visually.
   * A fixed canvas on `body` at z-index 17 paints between the backdrop (0) and
   * the lobby shell (18); transparent regions of the lobby still show it.
   */
  const portalHost = document.body

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
  portalHost.appendChild(renderer.domElement)

  const portalRoot = new Group()
  scene.add(portalRoot)

  const swirlMaterial = makeFireSwirlMaterial()
  const swappedRingMaterials: MeshBasicMaterial[] = []
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

  portalHost.appendChild(hitWrap)

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
      const loader = new GLTFLoader()
      const gltf = await loader.loadAsync(LOBBY_PORTAL_GLB_URL)
      const root = gltf.scene
      portalRoot.add(root)
      root.traverse((obj) => {
        const m = obj as Mesh & { isMesh?: boolean; name?: string }
        if (!m.isMesh) return
        const nm = (m.name || '').toLowerCase()
        if (PORTAL_INNER_NODE_NAMES.has(nm)) {
          const prev = m.material
          if (Array.isArray(prev)) prev.forEach((mm) => mm.dispose())
          else prev.dispose()
          m.material = swirlMaterial
          m.renderOrder = 2
          m.frustumCulled = false
          innerMesh = m
        } else {
          const prev = m.material
          const mats = Array.isArray(prev) ? prev : [prev]
          const lit = unlitFromModelMaterial(mats[0] as Material)
          swappedRingMaterials.push(lit)
          if (Array.isArray(prev)) prev.forEach((mm) => mm.dispose())
          else prev.dispose()
          m.material = lit
          m.renderOrder = 1
        }
      })
      portalLoaded = true
      syncFromConfig()
    } catch (err) {
      console.warn('[lobbyPortal] Failed to load portal.glb', err)
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

    swirlMaterial.uniforms.uSwirlSpeed.value = gameConfig.lobbyPortalSwirlSpeed
    swirlMaterial.uniforms.uSwirlTightness.value = gameConfig.lobbyPortalSwirlTightness
    swirlMaterial.uniforms.uSwirlScale.value = gameConfig.lobbyPortalSwirlScale
    swirlMaterial.uniforms.uPulseSpeed.value = gameConfig.lobbyPortalPulseSpeed
    swirlMaterial.uniforms.uPulseStrength.value = gameConfig.lobbyPortalPulseStrength
    swirlMaterial.uniforms.uIntensity.value = gameConfig.lobbyPortalIntensity
    swirlMaterial.uniforms.uUvScale.value = Math.max(0.01, gameConfig.lobbyPortalUvScale)
    swirlMaterial.uniforms.uUvOffsetU.value = gameConfig.lobbyPortalUvOffsetU
    swirlMaterial.uniforms.uUvOffsetV.value = gameConfig.lobbyPortalUvOffsetV
    swirlMaterial.uniforms.uDiskUvRadius.value = Math.max(0.05, gameConfig.lobbyPortalDiskUvRadius)
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
    swirlMaterial.uniforms.uTime.value += dt
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
    swirlMaterial.dispose()
    for (const mat of swappedRingMaterials) mat.dispose()
    swappedRingMaterials.length = 0
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
 * Build the Vibe Jam 2026 exit-portal URL (see `portalEntry.ts` for **inbound** `?portal=true`).
 *
 * Spec: leaving players are sent to the **hub** (`VIBE_JAM_PORTAL_URL`) with optional query
 * params (`username`, `color`, `speed`, `ref`). The hub is responsible for routing to the
 * next jam game; this build does not control that page. Inbound entry to *this* game uses
 * `?portal=true` and the same optional params.
 */
export function buildVibeJamExitUrl(): string {
  const u = new URL(VIBE_JAM_PORTAL_URL)
  const name = readPlayerNameForPortal()
  if (name) u.searchParams.set('username', name)
  /*
   * No first-class player color exists in this build; fall back to a stable hex so the
   * receiving game still has something to render. Honour any color we received via
   * `?portal=true` by stashing it; otherwise default to a fiery orange to match the rift.
   */
  u.searchParams.set('color', incomingPortalColor() ?? '#ff7300')
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
