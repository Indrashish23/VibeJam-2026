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
