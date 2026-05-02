/**
 * FFA / multi-fighter session limits. PartyKit room capacity is not hard-limited here—this caps
 * roster size and spawn slots client-side.
 */
const raw = typeof import.meta.env.VITE_MAX_FIGHTERS === 'string' ? import.meta.env.VITE_MAX_FIGHTERS : ''
const parsed = Number.parseInt(raw, 10)
export const MAX_FIGHTERS =
  Number.isFinite(parsed) && parsed >= 2 && parsed <= 8 ? parsed : 4

export type FighterId = string

/** One row in the authoritative session roster (after `sessionRoster` sync). */
export type SessionFighter = {
  fighterId: FighterId
  displayName: string
  /** Lobby role when the player joined (session creator vs joiner). */
  lobbyRole: 'host' | 'guest'
}
