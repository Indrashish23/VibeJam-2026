/** Session-only override when Vercel env was not set at build time (no redeploy needed). */
export const SESSION_PARTYKIT_HOST_KEY = 'vibejam_partykit_host'

/** PartyKit WebSocket host (no protocol). E.g. `localhost:1999` dev or `*.partykit.dev` prod. */
export function getPartyKitHost(): string | null {
  const env = import.meta.env.VITE_PARTYKIT_HOST?.trim()
  if (env) return env

  try {
    const ses =
      typeof sessionStorage !== 'undefined'
        ? sessionStorage.getItem(SESSION_PARTYKIT_HOST_KEY)?.trim()
        : ''
    if (ses) return ses
  } catch {
    /* private mode */
  }

  if (typeof window !== 'undefined') {
    const w = (window as unknown as { __PARTYKIT_HOST?: string }).__PARTYKIT_HOST?.trim()
    if (w) return w
  }

  /** Local `npm run party:dev` uses port 1999 — enables lobby without `.env.local`. */
  if (import.meta.env.DEV) return 'localhost:1999'

  return null
}

/** Strip protocol and trailing slash; persist for this tab session. */
export function setPartyKitHostSession(raw: string): void {
  const t = raw
    .trim()
    .replace(/^wss?:\/\//i, '')
    .replace(/^https?:\/\//i, '')
    .replace(/\/$/, '')
  try {
    if (typeof sessionStorage !== 'undefined') {
      if (t) sessionStorage.setItem(SESSION_PARTYKIT_HOST_KEY, t)
      else sessionStorage.removeItem(SESSION_PARTYKIT_HOST_KEY)
    }
  } catch {
    /* ignore */
  }
}
