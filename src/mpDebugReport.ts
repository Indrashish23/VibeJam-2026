/** Enable with `?mpdebug=1`, `?debug=1`, or localStorage `vibejam_mpdebug` = `1`. */

export const MP_DEBUG_LS_KEY = 'vibejam_mpdebug'

export function isMpDebugMode(): boolean {
  if (import.meta.env.DEV) return true
  try {
    if (typeof localStorage !== 'undefined' && localStorage.getItem(MP_DEBUG_LS_KEY) === '1')
      return true
    const u = new URLSearchParams(window.location.search)
    return u.get('debug') === '1' || u.get('mpdebug') === '1'
  } catch {
    return false
  }
}

/** Call once at startup: persists mp debug flag and strips params from URL. */
export function bootstrapMpDebugUrl(): void {
  try {
    const params = new URLSearchParams(window.location.search)
    let touch = false
    if (params.get('mpdebug') === '1' || params.get('debug') === '1') {
      localStorage.setItem(MP_DEBUG_LS_KEY, '1')
      touch = true
    }
    if (touch || params.has('mpdebug') || params.has('debug')) {
      params.delete('mpdebug')
      params.delete('debug')
      const qs = params.toString()
      window.history.replaceState(
        {},
        '',
        `${window.location.pathname}${qs ? `?${qs}` : ''}${window.location.hash}`,
      )
    }
  } catch {
    /* ignore */
  }
}

export type MpDiagSnapshot = {
  mpPhase?: string
  lobbyRole?: string
  lobbyOnline?: boolean
  wsReady?: number
  rtcDc?: string
  authPvp?: boolean
  browserHost?: boolean
  listenRelay?: boolean
  partyKitEnv?: string
  partyKitRuntime?: string | null
  cam?: { x: number; y: number; z: number }
  scoresYou?: number
  scoresOpp?: number
}
