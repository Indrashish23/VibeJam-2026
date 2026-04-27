/** Persisted positions for draggable Tweaks panel + gameplay HUD overlays (launch % / charge wedge). */

const LS = {
  tweaksPanel: 'vibejam_tweaks_panel_rect',
  percentHud: 'vibejam_hud_percent_rect',
  chargeHud: 'vibejam_hud_charge_rect',
} as const

export type HudRectKey = keyof typeof LS

export type SavedRectPx = {
  left: number
  top: number
}

function parseSaved(raw: string | null): SavedRectPx | null {
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
    return parseSaved(localStorage.getItem(LS[key]))
  } catch {
    return null
  }
}

function saveRect(key: HudRectKey, rect: SavedRectPx): void {
  try {
    localStorage.setItem(LS[key], JSON.stringify(rect))
  } catch {
    /* ignore */
  }
}

/** Tweaks panel uses fixed positioning vs viewport (screen px). */
function clampFixedPanel(panel: HTMLElement, left: number, top: number, pad = 8): SavedRectPx {
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
  const pos = clampFixedPanel(panel, rect.left, rect.top)
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
    localStorage.removeItem(LS.tweaksPanel)
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
    const next = clampFixedPanel(panel, originLeft + dx, originTop + dy)
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
    saveRect('tweaksPanel', clampFixedPanel(panel, r.left, r.top))
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

/** Scale factor from CSS transform on `#hud-viewport` (visual/client ratio). */
function viewportAxisScale(vp: HTMLElement): { sx: number; sy: number } {
  const cr = vp.getBoundingClientRect()
  const sx = vp.clientWidth > 0 ? cr.width / vp.clientWidth : 1
  const sy = vp.clientHeight > 0 ? cr.height / vp.clientHeight : 1
  return { sx, sy }
}

function clampInHudViewport(el: HTMLElement, vp: HTMLElement, left: number, top: number): SavedRectPx {
  const maxL = Math.max(0, vp.clientWidth - el.offsetWidth)
  const maxT = Math.max(0, vp.clientHeight - el.offsetHeight)
  return {
    left: Math.max(0, Math.min(left, maxL)),
    top: Math.max(0, Math.min(top, maxT)),
  }
}

/** Saved coords are layout-space px inside `#hud-viewport` (pre-transform). */
export function restoreHudElementPosition(el: HTMLElement | null, key: 'percentHud' | 'chargeHud'): void {
  if (!el) return
  const saved = loadSavedRect(key)
  if (!saved) return
  const vp = el.offsetParent as HTMLElement | null
  if (!vp) return
  const pos = clampInHudViewport(el, vp, saved.left, saved.top)
  el.style.position = 'absolute'
  el.style.left = `${pos.left}px`
  el.style.top = `${pos.top}px`
  el.style.right = 'auto'
  el.style.bottom = 'auto'
}

export function clearSavedHudElementPosition(key: 'percentHud' | 'chargeHud'): void {
  try {
    localStorage.removeItem(LS[key])
  } catch {
    /* */
  }
}

function clearElementPosition(el: HTMLElement | null): void {
  if (!el) return
  el.style.left = ''
  el.style.top = ''
  el.style.right = ''
  el.style.bottom = ''
  el.style.position = ''
}

export function resetGameplayHudLayout(percentEl: HTMLElement | null, chargeEl: HTMLElement | null): void {
  clearSavedHudElementPosition('percentHud')
  clearSavedHudElementPosition('chargeHud')
  clearElementPosition(percentEl)
  clearElementPosition(chargeEl)
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
    const { sx: axisX, sy: axisY } = viewportAxisScale(vp)
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
      const pos = clampInHudViewport(el!, vp, startLeft, startTop)
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
    const { sx: axisX, sy: axisY } = viewportAxisScale(vp)
    const dx = (e.clientX - sx) / axisX
    const dy = (e.clientY - sy) / axisY
    const next = clampInHudViewport(el, vp, startLeft + dx, startTop + dy)
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
    const { sx: axisX, sy: axisY } = viewportAxisScale(vp)
    const er = el.getBoundingClientRect()
    const vr = vp.getBoundingClientRect()
    const left = (er.left - vr.left) / axisX
    const top = (er.top - vr.top) / axisY
    const snapped = clampInHudViewport(el, vp, left, top)
    el.style.left = `${snapped.left}px`
    el.style.top = `${snapped.top}px`
    saveRect(key, snapped)
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
