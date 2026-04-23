import PartySocket from 'partysocket'
import { getPartyKitHost } from './partyKitHost'
import { getPvpRelayWsBase } from './transportConfig'

export type MultiplayerWire = WebSocket | PartySocket

/**
 * Listen relay: one process, many rooms (`?room=`). Messages are echoed to peers in the same room
 * (same behaviour as PartyKit broadcast excluding sender).
 *
 * PartyKit: WebSocket to `wss://{host}/parties/main/{roomId}` via partysocket.
 */
export function createMultiplayerSocket(roomId: string): MultiplayerWire {
  const relay = getPvpRelayWsBase()
  if (relay) {
    const sep = relay.includes('?') ? '&' : '?'
    const url = `${relay}${sep}room=${encodeURIComponent(roomId)}`
    return new WebSocket(url)
  }

  const host = getPartyKitHost()
  if (!host) {
    throw new Error('No multiplayer transport: set VITE_PVP_RELAY_URL or VITE_PARTYKIT_HOST')
  }

  return new PartySocket({ host, room: roomId })
}
