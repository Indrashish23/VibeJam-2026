/**
 * Persistent win/loss + “monkey career” rank (client-only, `localStorage`).
 */

const LS_W = 'vibejam_career_wins'
const LS_L = 'vibejam_career_losses'

export type PlayerCareerRecord = { wins: number; losses: number }

function safeReadInt(key: string): number {
  try {
    const t = localStorage.getItem(key)
    if (t == null) return 0
    const n = parseInt(t, 10)
    return Number.isFinite(n) && n >= 0 ? n : 0
  } catch {
    return 0
  }
}

function safeWrite(key: string, n: number): void {
  try {
    localStorage.setItem(key, String(Math.max(0, Math.floor(n))))
  } catch {
    /* private mode / quota */
  }
}

export function readPlayerRecord(): PlayerCareerRecord {
  return { wins: safeReadInt(LS_W), losses: safeReadInt(LS_L) }
}

export function writePlayerRecord(r: PlayerCareerRecord): void {
  safeWrite(LS_W, r.wins)
  safeWrite(LS_L, r.losses)
}

/** After a complete match (ring-out) — not forfeits / lobby cancels. */
export function bumpPlayerRecord(outcome: 'win' | 'lose'): PlayerCareerRecord {
  const r = readPlayerRecord()
  if (outcome === 'win') r.wins += 1
  else r.losses += 1
  writePlayerRecord(r)
  return r
}

/** Rank title from lifetime wins (losses reserved for future tie-break copy). */
export function monkeyRankTitle(wins: number, _losses: number): string {
  const w = Math.max(0, wins)
  if (w >= 80) return 'Mythic Ape Overlord'
  if (w >= 60) return 'Grand Banana'
  if (w >= 45) return 'King of the Canopy'
  if (w >= 32) return 'Silverback Aspirant'
  if (w >= 24) return 'Orangutan Rising'
  if (w >= 16) return 'Treetop Tactician'
  if (w >= 10) return 'Branch Manager'
  if (w >= 6) return 'Howler-in-Training'
  if (w >= 3) return 'Banyan Climber'
  if (w >= 1) return 'Curious Capuchin'
  return 'Fledgling Gibbon'
}
