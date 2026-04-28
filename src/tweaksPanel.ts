import type { PerspectiveCamera } from 'three'
import type { PointerLockControls } from 'three/addons/controls/PointerLockControls.js'
import { defaultGameConfig, gameConfig, resetGameConfig, type GameConfigKey } from './gameConfig'
import { TWEAK_DISPLAY_NAME, TWEAK_RANGE, TWEAK_SECTIONS, TWEAK_TOOLTIP } from './tweakRanges'

/* === Draggable Tweaks + HUD (localStorage) — was src/hudLayout.ts; inlined so deploys always resolve. */

const _hudLayoutLS = {
  tweaksPanel: 'vibejam_tweaks_panel_rect',
  percentHud: 'vibejam_hud_percent_rect',
  chargeHud: 'vibejam_hud_charge_rect',
} as const

export type HudRectKey = keyof typeof _hudLayoutLS

export type SavedRectPx = {
  left: number
  top: number
}

function _parseHudSaved(raw: string | null): SavedRectPx | null {
  if (!raw) return null
  try {
    const j = JSON.parse(raw) as { left?: number; top?: number }
    if (typeof j.left !== 'number' || typeof j.top !== 'number') return null
    const left = Math.round(j.left)
    const top = Math.round(j.top)
    if (!Number.isFinite(left) || !Number.isFinite(top)) return null
    return { left, top }
  } catch {
    return null
  }
}

export function loadSavedRect(key: HudRectKey): SavedRectPx | null {
  try {
    return _parseHudSaved(localStorage.getItem(_hudLayoutLS[key]))
  } catch {
    return null
  }
}

function _saveHudRect(key: HudRectKey, rect: SavedRectPx): void {
  try {
    localStorage.setItem(_hudLayoutLS[key], JSON.stringify(rect))
  } catch {
    /* ignore */
  }
}

function _clampFixedPanel(panel: HTMLElement, left: number, top: number, pad = 8): SavedRectPx {
  const vw = window.innerWidth
  const vh = window.innerHeight
  const w = panel.offsetWidth || 160
  const h = panel.offsetHeight || 120
  const l = Math.max(pad, Math.min(left, vw - w - pad))
  const t = Math.max(pad, Math.min(top, vh - h - pad))
  return { left: l, top: t }
}

export function applyTweaksPanelDocked(panel: HTMLElement): void {
  panel.style.position = 'fixed'
  panel.style.left = ''
  panel.style.bottom = 'auto'
  panel.style.margin = '0'
  panel.style.right = '0.75rem'
  panel.style.top = '0.75rem'
  panel.classList.add('tweaks-panel--floating')
}

export function applyTweaksPanelFloated(panel: HTMLElement, rect: SavedRectPx): void {
  const pos = _clampFixedPanel(panel, rect.left, rect.top)
  panel.style.position = 'fixed'
  panel.style.right = 'auto'
  panel.style.bottom = 'auto'
  panel.style.margin = '0'
  panel.style.left = `${pos.left}px`
  panel.style.top = `${pos.top}px`
  panel.classList.add('tweaks-panel--floating')
}

export function restoreTweaksPanelPosition(panel: HTMLElement): void {
  const saved = loadSavedRect('tweaksPanel')
  if (saved) applyTweaksPanelFloated(panel, saved)
  else applyTweaksPanelDocked(panel)
}

export function clearTweaksPanelPosition(): void {
  try {
    localStorage.removeItem(_hudLayoutLS.tweaksPanel)
  } catch {
    /* */
  }
}

export function attachTweaksPanelDrag(panel: HTMLElement, dragHandle: HTMLElement): () => void {
  let dragging = false
  let sx = 0
  let sy = 0
  let originLeft = 0
  let originTop = 0

  function readOrigin(): void {
    const r = panel.getBoundingClientRect()
    originLeft = r.left
    originTop = r.top
  }

  function onDown(e: PointerEvent) {
    if (e.button !== 0) return
    e.preventDefault()
    readOrigin()
    sx = e.clientX
    sy = e.clientY
    dragging = true
    dragHandle.setPointerCapture(e.pointerId)
    panel.classList.add('tweaks-panel--dragging')
  }

  function onMove(e: PointerEvent) {
    if (!dragging) return
    const dx = e.clientX - sx
    const dy = e.clientY - sy
    const next = _clampFixedPanel(panel, originLeft + dx, originTop + dy)
    panel.style.position = 'fixed'
    panel.style.right = 'auto'
    panel.style.bottom = 'auto'
    panel.style.margin = '0'
    panel.style.left = `${next.left}px`
    panel.style.top = `${next.top}px`
    panel.classList.add('tweaks-panel--floating')
  }

  function onUp(e: PointerEvent) {
    if (!dragging) return
    dragging = false
    panel.classList.remove('tweaks-panel--dragging')
    try {
      dragHandle.releasePointerCapture(e.pointerId)
    } catch {
      /* */
    }
    const r = panel.getBoundingClientRect()
    _saveHudRect('tweaksPanel', _clampFixedPanel(panel, r.left, r.top))
  }

  dragHandle.addEventListener('pointerdown', onDown)
  window.addEventListener('pointermove', onMove)
  window.addEventListener('pointerup', onUp)
  window.addEventListener('pointercancel', onUp)

  return () => {
    dragHandle.removeEventListener('pointerdown', onDown)
    window.removeEventListener('pointermove', onMove)
    window.removeEventListener('pointerup', onUp)
    window.removeEventListener('pointercancel', onUp)
  }
}

function _viewportAxisScale(vp: HTMLElement): { sx: number; sy: number } {
  const cr = vp.getBoundingClientRect()
  const sx = vp.clientWidth > 0 ? cr.width / vp.clientWidth : 1
  const sy = vp.clientHeight > 0 ? cr.height / vp.clientHeight : 1
  return { sx, sy }
}

function _clampInHudViewport(el: HTMLElement, vp: HTMLElement, left: number, top: number): SavedRectPx {
  const maxL = Math.max(0, vp.clientWidth - el.offsetWidth)
  const maxT = Math.max(0, vp.clientHeight - el.offsetHeight)
  return {
    left: Math.max(0, Math.min(left, maxL)),
    top: Math.max(0, Math.min(top, maxT)),
  }
}

export function restoreHudElementPosition(el: HTMLElement | null, key: 'percentHud' | 'chargeHud'): void {
  if (!el) return
  const saved = loadSavedRect(key)
  if (!saved) return
  const vp = el.offsetParent as HTMLElement | null
  if (!vp) return
  const pos = _clampInHudViewport(el, vp, saved.left, saved.top)
  el.style.position = 'absolute'
  el.style.left = `${pos.left}px`
  el.style.top = `${pos.top}px`
  el.style.right = 'auto'
  el.style.bottom = 'auto'
}

function _clearSavedHudElementPosition(key: 'percentHud' | 'chargeHud'): void {
  try {
    localStorage.removeItem(_hudLayoutLS[key])
  } catch {
    /* */
  }
}

function _clearElementPosition(el: HTMLElement | null): void {
  if (!el) return
  el.style.left = ''
  el.style.top = ''
  el.style.right = ''
  el.style.bottom = ''
  el.style.position = ''
}

export function resetGameplayHudLayout(percentEl: HTMLElement | null, chargeEl: HTMLElement | null): void {
  _clearSavedHudElementPosition('percentHud')
  _clearSavedHudElementPosition('chargeHud')
  _clearElementPosition(percentEl)
  _clearElementPosition(chargeEl)
}

export function attachHudOverlayDrag(
  el: HTMLElement | null,
  key: 'percentHud' | 'chargeHud',
  opts: { active: () => boolean },
): () => void {
  if (!el) return () => {}

  let dragging = false
  let sx = 0
  let sy = 0
  let startLeft = 0
  let startTop = 0

  function snapshotLayoutOrigin(vp: HTMLElement): void {
    const { sx: axisX, sy: axisY } = _viewportAxisScale(vp)
    const er = el!.getBoundingClientRect()
    const vr = vp.getBoundingClientRect()
    startLeft = (er.left - vr.left) / axisX
    startTop = (er.top - vr.top) / axisY
  }

  function onDown(e: PointerEvent) {
    if (e.button !== 0) return
    if (!opts.active()) return
    e.preventDefault()
    e.stopPropagation()

    const vp = el!.offsetParent as HTMLElement | null
    if (!vp) return

    if (el!.style.position !== 'absolute' || el!.style.left === '' || el!.style.top === '') {
      el!.style.position = 'absolute'
      snapshotLayoutOrigin(vp)
      el!.style.right = 'auto'
      el!.style.bottom = 'auto'
      const pos = _clampInHudViewport(el!, vp, startLeft, startTop)
      el!.style.left = `${pos.left}px`
      el!.style.top = `${pos.top}px`
    } else {
      startLeft = parseFloat(el!.style.left) || 0
      startTop = parseFloat(el!.style.top) || 0
    }

    sx = e.clientX
    sy = e.clientY
    dragging = true
    el!.setPointerCapture(e.pointerId)
  }

  function onMove(e: PointerEvent) {
    if (!dragging || !el) return
    if (!opts.active()) {
      dragging = false
      return
    }
    const vp = el.offsetParent as HTMLElement | null
    if (!vp) return
    const { sx: axisX, sy: axisY } = _viewportAxisScale(vp)
    const dx = (e.clientX - sx) / axisX
    const dy = (e.clientY - sy) / axisY
    const next = _clampInHudViewport(el, vp, startLeft + dx, startTop + dy)
    el.style.left = `${next.left}px`
    el.style.top = `${next.top}px`
    el.style.right = 'auto'
    el.style.bottom = 'auto'
  }

  function onUp(e: PointerEvent) {
    if (!dragging || !el) return
    dragging = false
    try {
      el.releasePointerCapture(e.pointerId)
    } catch {
      /* */
    }
    const vp = el.offsetParent as HTMLElement | null
    if (!vp) return
    const { sx: axisX, sy: axisY } = _viewportAxisScale(vp)
    const er = el.getBoundingClientRect()
    const vr = vp.getBoundingClientRect()
    const left = (er.left - vr.left) / axisX
    const top = (er.top - vr.top) / axisY
    const snapped = _clampInHudViewport(el, vp, left, top)
    el.style.left = `${snapped.left}px`
    el.style.top = `${snapped.top}px`
    _saveHudRect(key, snapped)
  }

  el.addEventListener('pointerdown', onDown)
  window.addEventListener('pointermove', onMove)
  window.addEventListener('pointerup', onUp)
  window.addEventListener('pointercancel', onUp)

  return () => {
    el.removeEventListener('pointerdown', onDown)
    window.removeEventListener('pointermove', onMove)
    window.removeEventListener('pointerup', onUp)
    window.removeEventListener('pointercancel', onUp)
  }
}

/* === /hud layout === */

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
  syncVisualsFromConfig?: () => void
  onToggle: (open: boolean) => void
  /** Called after any slider / reset / debug-toggle edit (debounce in main). */
  onConfigChanged?: () => void
  /**
   * Sliders listed here update `gameConfig` and visuals but do not trigger round-reset debounce
   * (pure UI / presentation).
   */
  keysThatSkipRoundReset?: readonly GameConfigKey[]
  blockToggle?: () => boolean
  debugBoolToggles?: DebugBoolToggle[]
  /** Online lobby (waiting): start local dummy round without leaving the room. */
  onPracticeWithDummy?: () => void | Promise<void>
  /** Online host (waiting): practice vs smart AI, replicated when WebRTC is up. */
  onSoloVsBot?: () => void | Promise<void>
  /** Gameplay section: apply a dev knockback to the local player (for testing hit FX). */
  onTriggerKnockbackDev?: () => void
  /** Re-run the HOWL tutorial in-session (clears the tutorial-done flag and starts fresh). */
  onReplayTutorial?: () => void | Promise<void>
  /** Reset stored launch-% + charge wedge positions (Tweaks → Reset HUD positions). */
  onResetHudLayout?: () => void
}

type RowInput = { key: GameConfigKey; range: HTMLInputElement; num: HTMLInputElement | null }

/** Sliders for 0–1 with tick marks only: no number field (Tweaks Sound). */
const TWEAK_RANGE_ONLY_KEYS = new Set<GameConfigKey>([
  'bgmVolume',
  'sfxTweakVolumeMul',
  'footstepVolumeMul',
  'jumpSfxVolumeMul',
  'landSfxVolumeMul',
])

function formatTweakValue(v: number): string {
  if (Number.isInteger(v)) return String(v)
  return Number(v.toFixed(6)).toString()
}

function appendConfigRow(
  key: GameConfigKey,
  rows: RowInput[],
  syncSceneFromConfig: () => void,
  onConfigChanged: (() => void) | undefined,
  skipRoundReset: boolean,
): HTMLElement {
  const r = TWEAK_RANGE[key]
  const row = document.createElement('label')
  const hideNum = TWEAK_RANGE_ONLY_KEYS.has(key)
  row.className = hideNum ? 'tweaks-row tweaks-row--range-only' : 'tweaks-row'
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

  const num: HTMLInputElement | null = hideNum
    ? null
    : (() => {
        const n = document.createElement('input')
        n.type = 'number'
        n.min = String(r.min)
        n.max = String(r.max)
        n.step = String(r.step)
        n.title = tip
        return n
      })()
  if (hideNum) {
    range.setAttribute('list', 'tweak-ticks-01')
  }

  function refreshAllRowsForKey(targetKey: GameConfigKey): void {
    for (const row of rows) {
      if (row.key !== targetKey) continue
      const v = gameConfig[targetKey]
      row.range.value = String(v)
      if (row.num) row.num.value = String(v)
    }
  }

  function applyValue(raw: number) {
    const clamped = Math.min(r.max, Math.max(r.min, raw))
    gameConfig[key] = clamped
    refreshAllRowsForKey(key)
    syncSceneFromConfig()
    if (!skipRoundReset) onConfigChanged?.()
  }

  range.addEventListener('input', () => applyValue(Number.parseFloat(range.value)))
  num?.addEventListener('change', () => applyValue(Number.parseFloat(num.value)))

  rows.push({ key, range, num })
  row.appendChild(name)
  row.appendChild(range)
  if (num) row.appendChild(num)
  refreshAllRowsForKey(key)
  return row
}

export function mountTweaksPanel(host: HTMLElement, hooks: TweaksPanelHooks): {
  dispose: () => void
  syncBooleanToggles: () => void
} {
  let open = false
  const rows: RowInput[] = []
  const skipRoundResetKeys = new Set<GameConfigKey>(hooks.keysThatSkipRoundReset ?? [])

  const panel = document.createElement('aside')
  panel.className = 'tweaks-panel'
  panel.setAttribute('aria-label', 'Dev tweaks')
  panel.hidden = true

  const tick01 = document.createElement('datalist')
  tick01.id = 'tweak-ticks-01'
  for (let i = 0; i <= 10; i++) {
    const o = document.createElement('option')
    o.value = i === 0 ? '0' : i === 10 ? '1' : (i * 0.1).toFixed(1)
    tick01.appendChild(o)
  }
  panel.appendChild(tick01)

  const header = document.createElement('div')
  header.className = 'tweaks-panel-header'
  const dragRow = document.createElement('div')
  dragRow.className = 'tweaks-panel-drag-row'
  const dragHandle = document.createElement('div')
  dragHandle.className = 'tweaks-panel-drag-handle'
  dragHandle.setAttribute('aria-label', 'Move panel')
  dragHandle.title = 'Drag to move · position is saved'
  dragHandle.textContent = '⠿'
  const title = document.createElement('strong')
  title.className = 'tweaks-panel-title'
  title.textContent = 'Tweaks'
  const dockBtn = document.createElement('button')
  dockBtn.type = 'button'
  dockBtn.className = 'tweaks-panel-dock-btn'
  dockBtn.title = 'Snap panel to top-right corner (clears saved position)'
  dockBtn.setAttribute('aria-label', 'Dock tweaks panel')
  dockBtn.textContent = 'Dock'
  dockBtn.addEventListener('click', () => {
    clearTweaksPanelPosition()
    applyTweaksPanelDocked(panel)
  })
  dragRow.appendChild(dragHandle)
  dragRow.appendChild(title)
  dragRow.appendChild(dockBtn)
  const sub = document.createElement('span')
  sub.className = 'tweaks-panel-sub'
  sub.textContent =
    'T or − opens · drag ⠿ to move · Category: Gameplay, Voice, UI, … · hover for tips · Esc closes'
  header.appendChild(dragRow)
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
    hooks.sun.position.set(gameConfig.sunPosX, gameConfig.sunPosY, gameConfig.sunPosZ)
    hooks.syncVisualsFromConfig?.()
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
  let projectileModeSel: HTMLSelectElement | null = null
  for (const section of TWEAK_SECTIONS) {
    const panel = document.createElement('div')
    panel.className = 'tweaks-section-panel'
    panel.dataset.section = section.id
    panel.hidden = section.id !== defaultSectionId

    for (const key of section.keys) {
      panel.appendChild(
        appendConfigRow(
          key,
          rows,
          syncSceneFromConfig,
          hooks.onConfigChanged,
          skipRoundResetKeys.has(key),
        ),
      )
    }
    sectionPanels.set(section.id, panel)
    body.appendChild(panel)
  }

  const gameplayPanelEarly = sectionPanels.get('thePlayer')
  let pistolModeCb: HTMLInputElement | null = null
  let pistolModeCbInSection: HTMLInputElement | null = null
  /**
   * Both the gameplay-top-of-tab checkbox and the in-section pistol-mode checkbox mutate the same
   * `voicePistolModeEnabled` key; this keeps them visually in sync when either is flipped.
   */
  function syncPistolModeCheckboxes(): void {
    const on = gameConfig.voicePistolModeEnabled >= 0.5
    if (pistolModeCb) pistolModeCb.checked = on
    if (pistolModeCbInSection) pistolModeCbInSection.checked = on
  }
  if (gameplayPanelEarly) {
    const wrap = document.createElement('div')
    wrap.className = 'tweaks-row tweaks-row-select'
    const name = document.createElement('span')
    name.className = 'tweaks-name'
    name.textContent = 'Projectile delivery'
    name.title =
      '0 = ballistic cube. 1 = instant head scan from mouth along aim. 2 = scan ray from camera (eye).'
    const sel = document.createElement('select')
    sel.className = 'tweaks-projectile-mode-select'
    sel.title = name.title
    sel.setAttribute('aria-label', 'Projectile delivery mode')
    const modes: { v: number; label: string }[] = [
      { v: 0, label: 'Ballistic projectile' },
      { v: 1, label: 'Head scan (mouth ray)' },
      { v: 2, label: 'Head scan (eye ray)' },
    ]
    for (const m of modes) {
      const opt = document.createElement('option')
      opt.value = String(m.v)
      opt.textContent = m.label
      sel.appendChild(opt)
    }
    sel.value = String(Math.max(0, Math.min(2, Math.round(gameConfig.voiceProjectileMode))))
    sel.addEventListener('change', () => {
      const v = Math.max(0, Math.min(2, Math.round(Number.parseFloat(sel.value))))
      gameConfig.voiceProjectileMode = v
      hooks.onConfigChanged?.()
    })
    projectileModeSel = sel
    wrap.appendChild(name)
    wrap.appendChild(sel)
    gameplayPanelEarly.insertBefore(wrap, gameplayPanelEarly.firstChild)

    /* Pistol mode toggle — sits above the projectile dropdown so it's the very first row in Gameplay. */
    const pistolWrap = document.createElement('label')
    pistolWrap.className = 'tweaks-row tweaks-row-bool'
    pistolWrap.title =
      'Experimental: hold RMB to shout-charge a magazine, click LMB to fire each pre-loaded snippet (no charge per shot). Recharge only when empty.'
    const pistolCb = document.createElement('input')
    pistolCb.type = 'checkbox'
    pistolCb.checked = gameConfig.voicePistolModeEnabled >= 0.5
    pistolCb.addEventListener('change', () => {
      gameConfig.voicePistolModeEnabled = pistolCb.checked ? 1 : 0
      syncPistolModeCheckboxes()
      hooks.onConfigChanged?.()
    })
    const pistolName = document.createElement('span')
    pistolName.className = 'tweaks-name'
    pistolName.textContent = 'Pistol mode (experimental)'
    pistolName.title = pistolWrap.title
    pistolWrap.appendChild(pistolCb)
    pistolWrap.appendChild(pistolName)
    pistolModeCb = pistolCb
    gameplayPanelEarly.insertBefore(pistolWrap, gameplayPanelEarly.firstChild)
  }

  /* Mirror checkbox inside the Pistol section so the toggle lives alongside its tweaks too. */
  const pistolPanelEl = sectionPanels.get('pistol')
  if (pistolPanelEl) {
    const wrap = document.createElement('label')
    wrap.className = 'tweaks-row tweaks-row-bool'
    wrap.title =
      'Experimental: hold RMB to shout-charge a magazine, click LMB to fire each pre-loaded snippet (no charge per shot). Recharge only when empty.'
    const cb = document.createElement('input')
    cb.type = 'checkbox'
    cb.checked = gameConfig.voicePistolModeEnabled >= 0.5
    cb.addEventListener('change', () => {
      gameConfig.voicePistolModeEnabled = cb.checked ? 1 : 0
      syncPistolModeCheckboxes()
      hooks.onConfigChanged?.()
    })
    const name = document.createElement('span')
    name.className = 'tweaks-name'
    name.textContent = 'Pistol mode enabled'
    name.title = wrap.title
    wrap.appendChild(cb)
    wrap.appendChild(name)
    pistolModeCbInSection = cb
    pistolPanelEl.insertBefore(wrap, pistolPanelEl.firstChild)
  }

  if (hooks.onTriggerKnockbackDev) {
    const knockPanel = sectionPanels.get('knockback') ?? sectionPanels.get('thePlayer')
    if (knockPanel) {
      const wrap = document.createElement('div')
      wrap.className = 'tweaks-section-dev-row'
      const btn = document.createElement('button')
      btn.type = 'button'
      btn.className = 'tweaks-dev-action-btn'
      btn.textContent = 'Trigger knockback'
      btn.title = 'Applies an authoritative melee knock to you (tests stun overlay + invuln).'
      btn.addEventListener('click', () => {
        hooks.onTriggerKnockbackDev?.()
      })
      wrap.appendChild(btn)
      knockPanel.appendChild(wrap)
    }
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
      if (row.num) row.num.value = String(v)
    }
    if (projectileModeSel) {
      projectileModeSel.value = String(
        Math.max(0, Math.min(2, Math.round(gameConfig.voiceProjectileMode))),
      )
    }
    syncPistolModeCheckboxes()
    syncSceneFromConfig()
    hooks.onConfigChanged?.()
  })
  actions.appendChild(resetBtn)

  if (hooks.onResetHudLayout) {
    const resetHudBtn = document.createElement('button')
    resetHudBtn.type = 'button'
    resetHudBtn.className = 'tweaks-panel-reset-hud-btn'
    resetHudBtn.textContent = 'Reset HUD positions'
    resetHudBtn.title =
      'Clear saved positions for launch % + charge wedge (browser only). Tweaks sliders (inset, scale) stay as set.'
    resetHudBtn.addEventListener('click', () => {
      hooks.onResetHudLayout?.()
    })
    actions.appendChild(resetHudBtn)
  }

  const copyBtn = document.createElement('button')
  copyBtn.type = 'button'
  copyBtn.textContent = 'Copy current tweaks as code'
  copyBtn.addEventListener('click', () => {
    const changed = rows.filter((row) => Math.abs(gameConfig[row.key] - defaultGameConfig[row.key]) > 1e-9)
    const source = changed.length ? changed : rows
    const seen = new Set<GameConfigKey>()
    const lines: string[] = []
    for (const row of source) {
      if (seen.has(row.key)) continue
      seen.add(row.key)
      lines.push(`  ${row.key}: ${formatTweakValue(gameConfig[row.key])},`)
    }
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

  if (hooks.onSoloVsBot) {
    const soloBotBtn = document.createElement('button')
    soloBotBtn.type = 'button'
    soloBotBtn.textContent = 'Solo vs Bot'
    soloBotBtn.addEventListener('click', () => {
      void (async () => {
        await hooks.onSoloVsBot!()
        setOpen(false)
      })()
    })
    actions.appendChild(soloBotBtn)
  }

  if (hooks.onReplayTutorial) {
    const tutorialBtn = document.createElement('button')
    tutorialBtn.type = 'button'
    tutorialBtn.textContent = 'Replay Tutorial'
    tutorialBtn.title = 'Run the HOWL tutorial again from the start.'
    tutorialBtn.addEventListener('click', () => {
      void (async () => {
        await hooks.onReplayTutorial!()
        setOpen(false)
      })()
    })
    actions.appendChild(tutorialBtn)
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
        if (row.num) row.num.value = String(next)
      }
    }
    refreshDebugRoomBtnLabel()
    hooks.onConfigChanged?.()
  })
  actions.appendChild(debugRoomBtn)

  panel.appendChild(actions)

  host.appendChild(panel)

  restoreTweaksPanelPosition(panel)
  const disposeTweaksDrag = attachTweaksPanelDrag(panel, dragHandle)

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
    disposeTweaksDrag()
    panel.remove()
  }

  return { dispose, syncBooleanToggles }
}
