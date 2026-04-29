/**
 * Vibe Jam 2026 webring INBOUND portal handler.
 *
 * Spec: when a player arrives with `?portal=true`, the receiving game must load
 * instantly (no username/lobby gate). Optional forwarded params include
 * `username`, `color`, `speed`, `ref`, plus `avatar_url`, `team`, `hp`, etc. —
 * all optional. We apply what we can to the local session and short-circuit the
 * boot flow to drop the player straight into a smart-bot match.
 *
 * `?ref=` (where they came from) is *not* re-used as the outgoing exit-portal
 * `ref` — the outgoing portal always sends *this* game's host as `ref` so the
 * next hop can return here. We do, however, stash the inbound `color` so the
 * exit-portal URL forwards the same hue (useful for color-themed webring games).
 */
import { savePlayerName } from './playerName'
import { randomRoomId, type LobbyResult } from './lobbyGate'

const PORTAL_COLOR_STORAGE_KEY = 'vibejam_portal_color'
const PORTAL_REF_STORAGE_KEY = 'vibejam_portal_ref'

export type PortalEntry = {
  username: string | null
  color: string | null
  speed: number | null
  ref: string | null
  hp: number | null
}

/** @returns parsed portal params if `?portal=true` is present, else null. */
export function parsePortalEntry(): PortalEntry | null {
  let url: URL
  try {
    url = new URL(location.href)
  } catch {
    return null
  }
  const flag = url.searchParams.get('portal')
  if (flag !== 'true' && flag !== '1') return null

  const numOrNull = (raw: string | null): number | null => {
    if (raw === null) return null
    const v = Number(raw)
    return Number.isFinite(v) ? v : null
  }

  return {
    username: url.searchParams.get('username') || null,
    color: url.searchParams.get('color') || null,
    speed: numOrNull(url.searchParams.get('speed')),
    ref: url.searchParams.get('ref') || null,
    hp: numOrNull(url.searchParams.get('hp')),
  }
}

/**
 * Apply the inbound params to the local session: set the display name (used by HUD,
 * scoreboard, network hello), and stash color/ref for the outgoing portal builder.
 *
 * Always treated as best-effort: every param is optional and may be missing or junk.
 */
export function applyPortalEntry(entry: PortalEntry): void {
  if (entry.username && entry.username.trim()) {
    savePlayerName(entry.username.trim().slice(0, 32))
  }
  try {
    if (entry.color) sessionStorage.setItem(PORTAL_COLOR_STORAGE_KEY, entry.color)
    if (entry.ref) sessionStorage.setItem(PORTAL_REF_STORAGE_KEY, entry.ref)
  } catch {
    /* sessionStorage may be blocked; fall through. */
  }
}

/** @returns a `LobbyResult` that boots straight into a smart-bot match without UI. */
export function buildPortalAutoBotLobbyResult(): LobbyResult {
  const roomId = randomRoomId()
  const shortCode = roomId.replace(/^vj-/, '')
  return {
    mode: 'online',
    role: 'host',
    roomId,
    shortCode,
    intent: 'vsBot',
    startWithSmartBot: true,
    mapId: 'arena',
  }
}

/** Hide the lobby and username gates immediately so the user never sees them flash. */
export function hideLobbyAndUsernameOverlays(): void {
  const lobby = document.getElementById('lobby-overlay') as HTMLDivElement | null
  if (lobby) lobby.hidden = true
  const username = document.getElementById('username-overlay') as HTMLDivElement | null
  if (username) username.hidden = true
  const queue = document.getElementById('queue-overlay') as HTMLDivElement | null
  if (queue) queue.hidden = true
}
