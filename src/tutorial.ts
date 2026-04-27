/**
 * HOWL first-tab tutorial controller (offline only).
 *
 * Persistence is per-tab via `sessionStorage` so a fresh browser tab always
 * replays the tutorial; refreshing the same tab keeps the dismissed state.
 * The Replay buttons (lobby + Tweaks panel) clear the flag and re-enter here.
 *
 * State machine (linear; Skip aborts at any point):
 *   welcome  → modal "Welcome to HOWL"
 *   charge   → in-game prompt; advance when voice charge crosses fire threshold
 *   release  → in-game prompt; advance when a successful shot is fired
 *   lesson   → bumps dummy to 150% and waits for the next shot OR a ringout
 *   complete → modal "You're ready to play HOWL"
 *
 * The module owns the overlay DOM (see #tutorial-overlay in index.html) and
 * polls game state via the small `TutorialApi` injected by main.ts. It never
 * imports from main.ts directly to keep the module side-effect free for tests.
 */

export const TUTORIAL_DONE_KEY = 'vibejam_tutorial_done_v1'

/** True when the per-tab "tutorial done" flag is unset. */
export function isTutorialPending(): boolean {
  try {
    return sessionStorage.getItem(TUTORIAL_DONE_KEY) !== '1'
  } catch {
    /* sessionStorage may be blocked → behave as "pending" so user still sees it. */
    return true
  }
}

/** Mark the per-tab tutorial as done so it does not auto-run again this tab. */
export function markTutorialDone(): void {
  try {
    sessionStorage.setItem(TUTORIAL_DONE_KEY, '1')
  } catch {
    /* ignore */
  }
}

/** Clear the per-tab "tutorial done" flag (used by Replay Tutorial buttons). */
export function clearTutorialDone(): void {
  try {
    sessionStorage.removeItem(TUTORIAL_DONE_KEY)
  } catch {
    /* ignore */
  }
  /* Best-effort cleanup of the legacy localStorage key from earlier builds. */
  try {
    localStorage.removeItem(TUTORIAL_DONE_KEY)
  } catch {
    /* ignore */
  }
}

/** Game-state surface the tutorial polls + asks main.ts to mutate. */
export interface TutorialApi {
  /** Smoothed voice charge value, 0..1. */
  getCharge(): number
  /** Threshold a shot needs to release (gameConfig.voiceMinChargeToFire). */
  getMinChargeToFire(): number
  /** Total successful voice shots fired this session (monotonic). */
  getVoiceShotsFired(): number
  /** Total bot ringouts this session (monotonic). */
  getBotRingouts(): number
  /** Bump bot damage % so the next clean shot will obviously launch them. */
  setEnemyPercent(value: number): void
  /** Release pointer-lock for modal interaction. */
  unlockPointer(): void
  /** Re-acquire pointer-lock after a modal closes (best-effort; no throw). */
  lockPointer(): void
}

let activeAbort: AbortController | null = null

type DomRefs = {
  overlay: HTMLElement
  modal: HTMLElement
  modalTitle: HTMLElement
  modalBody: HTMLElement
  modalCta: HTMLButtonElement
  prompt: HTMLElement
  promptText: HTMLElement
  skipBtn: HTMLButtonElement
}

function getDom(): DomRefs | null {
  const overlay = document.getElementById('tutorial-overlay')
  const modal = document.getElementById('tutorial-modal')
  const modalTitle = document.getElementById('tutorial-modal-title')
  const modalBody = document.getElementById('tutorial-modal-body')
  const modalCta = document.getElementById('tutorial-modal-cta') as HTMLButtonElement | null
  const prompt = document.getElementById('tutorial-prompt')
  const promptText = document.getElementById('tutorial-prompt-text')
  const skipBtn = document.getElementById('tutorial-skip') as HTMLButtonElement | null
  if (
    !overlay ||
    !modal ||
    !modalTitle ||
    !modalBody ||
    !modalCta ||
    !prompt ||
    !promptText ||
    !skipBtn
  ) {
    return null
  }
  return { overlay, modal, modalTitle, modalBody, modalCta, prompt, promptText, skipBtn }
}

function showModal(
  dom: DomRefs,
  title: string,
  body: string,
  ctaLabel: string,
  signal: AbortSignal,
): Promise<boolean> {
  dom.modalTitle.textContent = title
  dom.modalBody.textContent = body
  dom.modalCta.textContent = ctaLabel
  dom.modal.hidden = false
  return new Promise((resolve) => {
    if (signal.aborted) {
      dom.modal.hidden = true
      return resolve(false)
    }
    const onClick = () => {
      cleanup()
      dom.modal.hidden = true
      resolve(true)
    }
    const onAbort = () => {
      cleanup()
      dom.modal.hidden = true
      resolve(false)
    }
    const cleanup = () => {
      dom.modalCta.removeEventListener('click', onClick)
      signal.removeEventListener('abort', onAbort)
    }
    dom.modalCta.addEventListener('click', onClick)
    signal.addEventListener('abort', onAbort, { once: true })
    /* Move keyboard focus so users can press Enter / Space to advance. */
    try {
      dom.modalCta.focus({ preventScroll: true })
    } catch {
      /* ignore */
    }
  })
}

function setPrompt(dom: DomRefs, text: string, opts?: { flash?: boolean }): void {
  dom.promptText.textContent = text
  dom.prompt.classList.toggle('tutorial-prompt--flash', !!opts?.flash)
  dom.prompt.hidden = false
}

function hidePrompt(dom: DomRefs): void {
  dom.prompt.hidden = true
  dom.prompt.classList.remove('tutorial-prompt--flash')
}

/** Resolves true when `predicate()` is satisfied, or false if aborted. */
function waitFor(predicate: () => boolean, signal: AbortSignal): Promise<boolean> {
  return new Promise((resolve) => {
    if (signal.aborted) return resolve(false)
    let raf = 0
    const onAbort = () => {
      cancelAnimationFrame(raf)
      resolve(false)
    }
    const tick = () => {
      if (signal.aborted) return resolve(false)
      try {
        if (predicate()) {
          signal.removeEventListener('abort', onAbort)
          return resolve(true)
        }
      } catch {
        signal.removeEventListener('abort', onAbort)
        return resolve(false)
      }
      raf = requestAnimationFrame(tick)
    }
    signal.addEventListener('abort', onAbort, { once: true })
    raf = requestAnimationFrame(tick)
  })
}

/**
 * Run the tutorial flow start-to-finish (or until skipped). Always marks the
 * per-tab "done" flag on completion or skip; only an *external* re-entry
 * (Replay button calling `startTutorial` again) leaves the flag untouched.
 */
export async function startTutorial(api: TutorialApi): Promise<void> {
  /* Cancel any currently-running tutorial run before starting fresh. */
  const previous = activeAbort
  if (previous) previous.abort()

  const abort = new AbortController()
  activeAbort = abort
  const signal = abort.signal

  const dom = getDom()
  if (!dom) {
    activeAbort = null
    return
  }

  let skipped = false
  let completed = false
  const onSkip = () => {
    skipped = true
    abort.abort()
  }
  dom.skipBtn.hidden = false
  dom.skipBtn.addEventListener('click', onSkip)
  dom.overlay.hidden = false

  try {
    /* 1) Welcome modal — pointer must be free for the user to click "Next". */
    api.unlockPointer()
    const welcomed = await showModal(
      dom,
      'Welcome to HOWL',
      'A game about using your voice to knock opponents off the stage.',
      'Next',
      signal,
    )
    if (!welcomed) return
    api.lockPointer()

    /* 2) Charge instruction (latched: success on first crossing). */
    setPrompt(
      dom,
      'Hold Left Mouse Button and scream to charge up a powerful shot.',
      { flash: true },
    )
    const reached = await waitFor(
      () => api.getCharge() >= api.getMinChargeToFire(),
      signal,
    )
    if (!reached) return

    /* 3) Release instruction. */
    setPrompt(dom, 'Release LMB to unleash the shot!')
    const releaseBaseline = api.getVoiceShotsFired()
    const fired = await waitFor(
      () => api.getVoiceShotsFired() > releaseBaseline,
      signal,
    )
    if (!fired) return

    /* 4) Damage / knockback lesson — bump the dummy and feel the launch. */
    api.setEnemyPercent(150)
    setPrompt(
      dom,
      'Higher damage = bigger launch. The dummy is at 150% — your next clean shot will fling them off the stage.',
    )
    const lessonShots = api.getVoiceShotsFired()
    const lessonRingouts = api.getBotRingouts()
    const lessonAdvanced = await waitFor(
      () =>
        api.getVoiceShotsFired() > lessonShots ||
        api.getBotRingouts() > lessonRingouts,
      signal,
    )
    if (!lessonAdvanced) return

    /* 5) Completion. */
    hidePrompt(dom)
    api.unlockPointer()
    const closed = await showModal(
      dom,
      "You're ready to play HOWL!",
      'Replay this any time from the lobby button or the Tweaks panel (T).',
      'Continue',
      signal,
    )
    completed = closed
    api.lockPointer()
  } finally {
    dom.skipBtn.removeEventListener('click', onSkip)
    dom.overlay.hidden = true
    dom.modal.hidden = true
    hidePrompt(dom)
    if (activeAbort === abort) activeAbort = null
    /* Mark done on natural completion or explicit skip; an *external* abort
     * (Replay button calling startTutorial again) leaves the flag alone so the
     * fresh run can finish the dismissal itself. */
    if (completed || skipped) markTutorialDone()
  }
}
