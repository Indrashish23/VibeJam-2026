import type { PerspectiveCamera } from 'three'
import type { PointerLockControls } from 'three/addons/controls/PointerLockControls.js'
import { defaultGameConfig, gameConfig, resetGameConfig, type GameConfigKey } from './gameConfig'
import { TWEAK_DISPLAY_NAME, TWEAK_RANGE, TWEAK_SECTIONS, TWEAK_TOOLTIP } from './tweakRanges'

function isTypingTarget(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false
  const tag = el.tagName
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true
  return el.isContentEditable
}

export type DebugBoolToggle = {
  label: string
  get: () => boolean
  set: (value: boolean) => void
  onChange?: () => void
}

export type TweaksPanelHooks = {
  controls: PointerLockControls
  camera: PerspectiveCamera
  ambient: import('three').AmbientLight
  sun: import('three').DirectionalLight
  onToggle: (open: boolean) => void
  /** Called after any slider / reset / debug-toggle edit (debounce in main). */
  onConfigChanged?: () => void
  blockToggle?: () => boolean
  debugBoolToggles?: DebugBoolToggle[]
  /** Online lobby (waiting): start local dummy round without leaving the room. */
  onPracticeWithDummy?: () => void | Promise<void>
}

type RowInput = { key: GameConfigKey; range: HTMLInputElement; num: HTMLInputElement }

function formatTweakValue(v: number): string {
  if (Number.isInteger(v)) return String(v)
  return Number(v.toFixed(6)).toString()
}

function appendConfigRow(
  key: GameConfigKey,
  rows: RowInput[],
  syncSceneFromConfig: () => void,
  onConfigChanged?: () => void,
): HTMLElement {
  const r = TWEAK_RANGE[key]
  const row = document.createElement('label')
  row.className = 'tweaks-row'
  const tip = TWEAK_TOOLTIP[key]
  row.title = tip

  const name = document.createElement('span')
  name.className = 'tweaks-name'
  name.textContent = TWEAK_DISPLAY_NAME[key] ?? key
  name.title = tip

  const range = document.createElement('input')
  range.type = 'range'
  range.min = String(r.min)
  range.max = String(r.max)
  range.step = String(r.step)
  range.title = tip

  const num = document.createElement('input')
  num.type = 'number'
  num.min = String(r.min)
  num.max = String(r.max)
  num.step = String(r.step)
  num.title = tip

  function syncRow() {
    const v = gameConfig[key]
    range.value = String(v)
    num.value = String(v)
  }

  function applyValue(raw: number) {
    const clamped = Math.min(r.max, Math.max(r.min, raw))
    gameConfig[key] = clamped
    syncRow()
    syncSceneFromConfig()
    onConfigChanged?.()
  }

  range.addEventListener('input', () => applyValue(Number.parseFloat(range.value)))
  num.addEventListener('change', () => applyValue(Number.parseFloat(num.value)))

  rows.push({ key, range, num })
  row.appendChild(name)
  row.appendChild(range)
  row.appendChild(num)
  syncRow()
  return row
}

export function mountTweaksPanel(host: HTMLElement, hooks: TweaksPanelHooks): {
  dispose: () => void
  syncBooleanToggles: () => void
} {
  let open = false
  const rows: RowInput[] = []

  const panel = document.createElement('aside')
  panel.className = 'tweaks-panel'
  panel.setAttribute('aria-label', 'Dev tweaks')
  panel.hidden = true

  const header = document.createElement('div')
  header.className = 'tweaks-panel-header'
  const title = document.createElement('strong')
  title.textContent = 'Tweaks'
  const sub = document.createElement('span')
  sub.className = 'tweaks-panel-sub'
  sub.textContent =
    'T or − opens · Category menu (The Player + Projectile + others) · hover any row for a tip · Esc closes'
  header.appendChild(title)
  header.appendChild(sub)
  panel.appendChild(header)

  type BoolRow = { cb: HTMLInputElement; spec: DebugBoolToggle }
  const boolRows: BoolRow[] = []

  function syncBooleanToggles() {
    for (const br of boolRows) {
      br.cb.checked = br.spec.get()
    }
  }

  function syncSceneFromConfig() {
    hooks.camera.fov = gameConfig.cameraFov
    hooks.camera.near = gameConfig.cameraNear
    hooks.camera.far = gameConfig.cameraFar
    hooks.camera.updateProjectionMatrix()
    hooks.controls.pointerSpeed = gameConfig.mouseSensitivity
    hooks.ambient.intensity = gameConfig.ambientIntensity
    hooks.sun.intensity = gameConfig.sunIntensity
  }

  const body = document.createElement('div')
  body.className = 'tweaks-panel-body'

  if (hooks.debugBoolToggles?.length) {
    const details = document.createElement('details')
    details.className = 'tweaks-category'
    details.open = true
    const summary = document.createElement('summary')
    summary.className = 'tweaks-category-summary'
    summary.textContent = 'Debug'
    details.appendChild(summary)

    const dbgBody = document.createElement('div')
    dbgBody.className = 'tweaks-category-body tweaks-category-body--debug'

    for (const spec of hooks.debugBoolToggles) {
      const lab = document.createElement('label')
      lab.className = 'tweaks-row tweaks-row-bool'

      const cb = document.createElement('input')
      cb.type = 'checkbox'
      cb.checked = spec.get()

      cb.addEventListener('change', () => {
        spec.set(cb.checked)
        spec.onChange?.()
        hooks.onConfigChanged?.()
      })

      const name = document.createElement('span')
      name.className = 'tweaks-name'
      name.textContent = spec.label

      lab.appendChild(cb)
      lab.appendChild(name)
      dbgBody.appendChild(lab)
      boolRows.push({ cb, spec })
    }
    details.appendChild(dbgBody)
    body.appendChild(details)
  }

  const nav = document.createElement('div')
  nav.className = 'tweaks-section-nav'
  const navLab = document.createElement('label')
  navLab.className = 'tweaks-section-nav-label'
  navLab.setAttribute('for', 'tweaks-section-select')
  navLab.textContent = 'Category'
  const navSel = document.createElement('select')
  navSel.id = 'tweaks-section-select'
  navSel.className = 'tweaks-section-select'
  navSel.setAttribute('aria-label', 'Tweak category')
  for (const section of TWEAK_SECTIONS) {
    const opt = document.createElement('option')
    opt.value = section.id
    opt.textContent = section.title
    navSel.appendChild(opt)
  }
  nav.appendChild(navLab)
  nav.appendChild(navSel)
  body.appendChild(nav)

  const sectionPanels = new Map<string, HTMLElement>()
  const defaultSectionId = TWEAK_SECTIONS[0]?.id ?? ''
  for (const section of TWEAK_SECTIONS) {
    const panel = document.createElement('div')
    panel.className = 'tweaks-section-panel'
    panel.dataset.section = section.id
    panel.hidden = section.id !== defaultSectionId

    for (const key of section.keys) {
      panel.appendChild(appendConfigRow(key, rows, syncSceneFromConfig, hooks.onConfigChanged))
    }
    sectionPanels.set(section.id, panel)
    body.appendChild(panel)
  }

  navSel.value = defaultSectionId
  navSel.addEventListener('change', () => {
    const id = navSel.value
    for (const [sid, el] of sectionPanels) {
      el.hidden = sid !== id
    }
  })

  panel.appendChild(body)

  const actions = document.createElement('div')
  actions.className = 'tweaks-panel-actions'
  const resetBtn = document.createElement('button')
  resetBtn.type = 'button'
  resetBtn.textContent = 'Reset defaults'
  resetBtn.addEventListener('click', () => {
    resetGameConfig()
    for (const row of rows) {
      const v = gameConfig[row.key]
      row.range.value = String(v)
      row.num.value = String(v)
    }
    syncSceneFromConfig()
    hooks.onConfigChanged?.()
  })
  actions.appendChild(resetBtn)

  const copyBtn = document.createElement('button')
  copyBtn.type = 'button'
  copyBtn.textContent = 'Copy current tweaks as code'
  copyBtn.addEventListener('click', () => {
    const changed = rows.filter((row) => Math.abs(gameConfig[row.key] - defaultGameConfig[row.key]) > 1e-9)
    const source = changed.length ? changed : rows
    const lines = source.map((row) => `  ${row.key}: ${formatTweakValue(gameConfig[row.key])},`)
    const snippet = `// Paste into defaultGameConfig in src/gameConfig.ts\n{\n${lines.join('\n')}\n}`
    const onCopied = () => {
      copyBtn.textContent = 'Copied tweaks'
      window.setTimeout(() => {
        copyBtn.textContent = 'Copy current tweaks as code'
      }, 1400)
    }
    const fallbackCopy = () => {
      const ta = document.createElement('textarea')
      ta.value = snippet
      ta.setAttribute('readonly', 'true')
      ta.style.position = 'fixed'
      ta.style.left = '-9999px'
      document.body.appendChild(ta)
      ta.select()
      try {
        document.execCommand('copy')
        onCopied()
      } finally {
        ta.remove()
      }
    }
    if (navigator.clipboard?.writeText) {
      void navigator.clipboard.writeText(snippet).then(onCopied).catch(fallbackCopy)
    } else {
      fallbackCopy()
    }
  })
  actions.appendChild(copyBtn)

  if (hooks.onPracticeWithDummy) {
    const practiceBtn = document.createElement('button')
    practiceBtn.type = 'button'
    practiceBtn.textContent = 'Practice with Dummy'
    practiceBtn.addEventListener('click', () => {
      void (async () => {
        await hooks.onPracticeWithDummy!()
        setOpen(false)
      })()
    })
    actions.appendChild(practiceBtn)
  }

  const debugRoomBtn = document.createElement('button')
  debugRoomBtn.type = 'button'
  debugRoomBtn.className = 'tweaks-debug-room-btn'
  function refreshDebugRoomBtnLabel() {
    debugRoomBtn.textContent =
      gameConfig.debugRoomActive >= 0.5 ? 'Exit Debug Room' : 'Enter Debug Room'
  }
  refreshDebugRoomBtnLabel()
  debugRoomBtn.addEventListener('click', () => {
    const next = gameConfig.debugRoomActive >= 0.5 ? 0 : 1
    gameConfig.debugRoomActive = next
    /* Sync any matching slider row so its UI stays consistent. */
    for (const row of rows) {
      if (row.key === 'debugRoomActive') {
        row.range.value = String(next)
        row.num.value = String(next)
      }
    }
    refreshDebugRoomBtnLabel()
    hooks.onConfigChanged?.()
  })
  actions.appendChild(debugRoomBtn)

  panel.appendChild(actions)

  host.appendChild(panel)

  function setOpen(next: boolean) {
    open = next
    panel.hidden = !open
    hooks.onToggle(open)
    if (open) {
      hooks.controls.unlock()
      syncBooleanToggles()
    }
    syncSceneFromConfig()
  }

  function toggle() {
    setOpen(!open)
  }

  function onGlobalKeyDown(e: KeyboardEvent) {
    const openTweaks =
      e.code === 'KeyT' || e.code === 'Minus' || e.code === 'NumpadSubtract'
    if (openTweaks && hooks.blockToggle?.()) {
      return
    }
    if (openTweaks && !isTypingTarget(e.target)) {
      e.preventDefault()
      toggle()
      return
    }
    if (open && e.code === 'Escape') {
      e.preventDefault()
      setOpen(false)
    }
  }

  window.addEventListener('keydown', onGlobalKeyDown, true)

  syncSceneFromConfig()

  function dispose() {
    window.removeEventListener('keydown', onGlobalKeyDown, true)
    panel.remove()
  }

  return { dispose, syncBooleanToggles }
}
