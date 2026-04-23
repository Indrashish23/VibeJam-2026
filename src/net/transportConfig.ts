/**
 * Multiplayer transport: PartyKit cloud, or a self-hosted listen relay (LAN listen server).
 *
 * Set `VITE_PVP_RELAY_URL=ws://HOST:PORT` — WebSocket connects there with `?room=ROOM_ID`;
 * traffic is relayed peer-to-peer through that process (no PartyKit account required).
 */

import { getPartyKitHost } from './partyKitHost'

export function getPvpRelayWsBase(): string | null {
  const raw = import.meta.env.VITE_PVP_RELAY_URL?.trim()
  return raw || null
}

/** Online lobby allowed: listen relay URL and/or PartyKit host (see `getPartyKitHost`). */
export function isMultiplayerTransportConfigured(): boolean {
  if (getPvpRelayWsBase()) return true
  return getPartyKitHost() != null
}

/**
 * Dedicated listen server (`npm run pvp:listen`) validates hits & match outcome.
 * PartyKit relay remains client-predicted for hits unless you deploy an authoritative worker.
 */
export function isAuthoritativeListenServer(): boolean {
  return !!getPvpRelayWsBase()
}
