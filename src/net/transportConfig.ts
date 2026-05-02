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
 * Appended to lobby errors when online is blocked in a **production** bundle (EXE / shipped
 * web). Dev uses `localhost:1999` fallback — prod does not; `VITE_*` must be set at build time.
 */
export function multiplayerTransportMissingHint(): string {
  if (!import.meta.env.PROD) return ''
  return ' For online play: add `Assets/Config/partykit-host.txt` next to the EXE (one line, your PartyKit host, no https://), **or** set `VITE_PARTYKIT_HOST` in `.env.production` and rebuild. See `docs/desktop-build.md`.'
}

/**
 * Dedicated listen server (`npm run pvp:listen`) validates hits & match outcome.
 * PartyKit relay remains client-predicted for hits unless you deploy an authoritative worker.
 */
export function isAuthoritativeListenServer(): boolean {
  return !!getPvpRelayWsBase()
}
