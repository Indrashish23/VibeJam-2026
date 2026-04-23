/** PartyKit WebSocket host (no protocol). E.g. `localhost:1999` dev or `*.partykit.dev` prod. */
export function getPartyKitHost(): string | null {
  const env = import.meta.env.VITE_PARTYKIT_HOST?.trim()
  if (env) return env

  if (typeof window !== 'undefined') {
    const w = (window as unknown as { __PARTYKIT_HOST?: string }).__PARTYKIT_HOST?.trim()
    if (w) return w
  }

  /** Local `npm run party:dev` uses port 1999 — enables lobby without `.env.local`. */
  if (import.meta.env.DEV) return 'localhost:1999'

  return null
}
