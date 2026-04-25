import { createMultiplayerSocket, type MultiplayerWire } from './multiplayerSocket'

/** Shared PartyKit / relay room used only for lightweight public-lobby listings (not gameplay). */
export const DIRECTORY_ROOM_ID = 'vj-public-directory'

const STALE_MS = 32_000

export type PublicLobbyListing = {
  roomId: string
  shortCode: string
  hostName: string
  lastTs: number
}

type DirHostPing = {
  type: 'dirHostPing'
  roomId: string
  shortCode: string
  hostName: string
  ts: number
}

function isDirHostPing(raw: unknown): raw is DirHostPing {
  if (!raw || typeof raw !== 'object') return false
  const o = raw as Record<string, unknown>
  return (
    o.type === 'dirHostPing' &&
    typeof o.roomId === 'string' &&
    typeof o.shortCode === 'string' &&
    typeof o.hostName === 'string' &&
    typeof o.ts === 'number'
  )
}

/**
 * Ephemeral WebSocket to the directory room: hosts announce open public lobbies;
 * browsers merge pings and show a joinable list (same relay semantics as match rooms).
 */
export class PublicLobbyDirectoryClient {
  private socket: MultiplayerWire | null = null
  private readonly listings = new Map<string, PublicLobbyListing>()
  private onListings: (list: PublicLobbyListing[]) => void

  constructor(onListings: (list: PublicLobbyListing[]) => void) {
    this.onListings = onListings
  }

  private pruneAndEmit(): void {
    const now = Date.now()
    for (const [k, v] of this.listings) {
      if (now - v.lastTs > STALE_MS) this.listings.delete(k)
    }
    this.onListings([...this.listings.values()].sort((a, b) => b.lastTs - a.lastTs))
  }

  connect(): void {
    if (this.socket) return
    const ws = createMultiplayerSocket(DIRECTORY_ROOM_ID)
    this.socket = ws
    ws.addEventListener('message', (ev: Event) => {
      const me = ev as MessageEvent
      if (typeof me.data !== 'string') return
      let data: unknown
      try {
        data = JSON.parse(me.data) as unknown
      } catch {
        return
      }
      if (!isDirHostPing(data)) return
      this.listings.set(data.roomId, {
        roomId: data.roomId,
        shortCode: data.shortCode,
        hostName: data.hostName,
        lastTs: data.ts,
      })
      this.pruneAndEmit()
    })
    ws.addEventListener('open', () => this.pruneAndEmit())
  }

  disconnect(): void {
    if (!this.socket) return
    try {
      this.socket.close()
    } catch {
      /* ignore */
    }
    this.socket = null
  }

  /** Drop stale rows (no ping recently); call from a timer while the browser UI is open. */
  pruneStaleNow(): void {
    this.pruneAndEmit()
  }

  /** Host calls while waiting for a guest (throttled by caller, e.g. every 4s). */
  sendHostPing(roomId: string, shortCode: string, hostName: string): void {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) return
    const ts = Date.now()
    this.socket.send(
      JSON.stringify({
        type: 'dirHostPing',
        roomId,
        shortCode,
        hostName,
        ts,
      } satisfies DirHostPing),
    )
    /* Echo locally so this tab’s list updates immediately when browsing + hosting from same machine is rare; harmless for host-only. */
    this.listings.set(roomId, { roomId, shortCode, hostName, lastTs: ts })
    this.pruneAndEmit()
  }
}
