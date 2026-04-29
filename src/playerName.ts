/** Per-tab (sessionStorage) so each tab can use a different display name when hosting/joining. */
export const PLAYER_NAME_STORAGE_KEY = 'vibejam_player_name'

export function readStoredPlayerName(): string | null {
  try {
    const v = sessionStorage.getItem(PLAYER_NAME_STORAGE_KEY)?.trim()
    return v || null
  } catch {
    return null
  }
}

export function savePlayerName(name: string): void {
  try {
    sessionStorage.setItem(PLAYER_NAME_STORAGE_KEY, name)
  } catch {
    /* quota */
  }
}

const RIVAL_ADJECTIVES = [
  'Swift',
  'Mystic',
  'Turbo',
  'Silent',
  'Wild',
  'Cosmic',
  'Pixel',
  'Nova',
  'Golden',
  'Cyber',
] as const
const RIVAL_NOUNS = [
  'Monkey',
  'Ape',
  'Rival',
  'Ace',
  'Drifter',
  'Champion',
  'Striker',
  'Viper',
] as const

/** Display name for the AI opponent in online smart-opponent sessions (not a real player). */
export function randomLobbyRivalName(): string {
  const a = RIVAL_ADJECTIVES[Math.floor(Math.random() * RIVAL_ADJECTIVES.length)]!
  const b = RIVAL_NOUNS[Math.floor(Math.random() * RIVAL_NOUNS.length)]!
  const n = Math.floor(Math.random() * 899) + 100
  return `${a}${b}${n}`
}
