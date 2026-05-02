/**
 * WebRTC **star** topology for N-player FFA: session host maintains one data channel per remote;
 * guests keep a single channel to the session host. The host relays game frames between peers.
 * Signaling uses {@link RTC_ROUTE_KEY} to multiplex ICE/SDP across multiple RTCPeerConnections.
 */

import { createWebRtcGameChannel, type SignalSend, type WebRtcGameApi } from './webrtcGame'

export const RTC_ROUTE_KEY = 'rtcRoute'

function routeFromSignal(data: Record<string, unknown>): string | undefined {
  const r = data[RTC_ROUTE_KEY]
  return typeof r === 'string' && r.length > 0 ? r : undefined
}

export function createWebRtcStarTransport(opts: {
  localFighterId: string
  sessionHostFighterId: string
  remotePeers: readonly string[]
  isSessionHost: boolean
  signalSend: SignalSend
  onGameJsonString: (raw: string) => void
  onGameBinary?: (bytes: ArrayBuffer) => void
  onChannelOpen: () => void
  includeProximityVoip: boolean
  onRemoteVoipStream?: (stream: MediaStream) => void
}): WebRtcGameApi {
  const remotes = [...opts.remotePeers]
  if (remotes.length === 0) throw new Error('[webrtcStar] remotePeers empty')

  /** 2-player path: identical to legacy `createWebRtcGameChannel` (no routing fields). */
  if (remotes.length === 1) {
    const role = opts.isSessionHost ? 'host' : 'guest'
    return createWebRtcGameChannel({
      role,
      signalSend: opts.signalSend,
      onGameJsonString: opts.onGameJsonString,
      onGameBinary: opts.onGameBinary,
      onChannelOpen: opts.onChannelOpen,
      includeProximityVoip: opts.includeProximityVoip,
      onRemoteVoipStream: opts.onRemoteVoipStream,
    })
  }

  if (!opts.isSessionHost) {
    throw new Error('[webrtcStar] guests must have exactly one remote peer (the session host)')
  }

  type Link = { peerId: string; api: WebRtcGameApi }
  const links: Link[] = []
  let disposed = false
  let channelOpenFired = false

  function maybeFireOpen(): void {
    if (channelOpenFired || disposed) return
    if (links.every((l) => l.api.channel?.readyState === 'open')) {
      channelOpenFired = true
      opts.onChannelOpen()
    }
  }

  function relayFromPeer(sourcePeer: string, raw: string): void {
    for (const { peerId, api } of links) {
      if (peerId === sourcePeer) continue
      try {
        const o = JSON.parse(raw) as Record<string, unknown>
        api.sendGameJson(o)
      } catch {
        /* ignore */
      }
    }
    opts.onGameJsonString(raw)
  }

  for (const peerId of remotes) {
    const api = createWebRtcGameChannel({
      role: 'host',
      signalSend: (obj) => opts.signalSend({ ...obj, [RTC_ROUTE_KEY]: peerId }),
      onGameJsonString: (raw) => relayFromPeer(peerId, raw),
      onGameBinary: opts.onGameBinary
        ? (buf) => {
            for (const { peerId: pid, api: a } of links) {
              if (pid === peerId) continue
              a.sendGameBinary(buf)
            }
            opts.onGameBinary?.(buf)
          }
        : undefined,
      onChannelOpen: maybeFireOpen,
      /* VOIP across multiple PCs is deferred; gameplay DCs carry pose/shots. */
      includeProximityVoip: false,
    })
    links.push({ peerId, api })
  }

  return {
    get channel() {
      return links.find((l) => l.api.channel?.readyState === 'open')?.api.channel ?? null
    },
    handleSignal: async (data: Record<string, unknown>) => {
      const peer = routeFromSignal(data)
      if (!peer) return false
      const link = links.find((l) => l.peerId === peer)
      return link ? link.api.handleSignal(data) : false
    },
    hostStartHandshake: async () => {
      for (const l of links) await l.api.hostStartHandshake()
    },
    sendGameJson: (obj: Record<string, unknown>) => {
      const payload = {
        ...obj,
        fromFighterId:
          typeof obj.fromFighterId === 'string' ? obj.fromFighterId : opts.localFighterId,
      }
      for (const { api } of links) {
        try {
          api.sendGameJson(payload)
        } catch {
          /* ignore */
        }
      }
    },
    sendGameBinary: (bytes: ArrayBuffer | Uint8Array) => {
      let ok = false
      for (const { api } of links) {
        if (api.sendGameBinary(bytes)) ok = true
      }
      return ok
    },
    attachLocalProximityVoipTrack: () => false,
    setLocalVoipGameRecordingBlock: (_blocked: boolean) => {},
    dispose: () => {
      disposed = true
      for (const l of links) {
        try {
          l.api.dispose()
        } catch {
          /* ignore */
        }
      }
      links.length = 0
    },
  }
}
