/**
 * WebRTC data channel for game JSON (voice shots, poses) after SDP exchange over the signaling socket.
 * No separate listen process — browsers connect peer-to-peer (STUN; TURN may be needed for some NATs).
 */

export type SignalSend = (obj: Record<string, unknown>) => void

export type WebRtcGameApi = {
  readonly channel: RTCDataChannel | null
  handleSignal: (data: Record<string, unknown>) => Promise<boolean>
  hostStartHandshake: () => Promise<void>
  sendGameJson: (obj: Record<string, unknown>) => void
  dispose: () => void
}

const ICE: RTCConfiguration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ],
}

export function createWebRtcGameChannel(opts: {
  role: 'host' | 'guest'
  signalSend: SignalSend
  onGameJsonString: (raw: string) => void
  onChannelOpen: () => void
}): WebRtcGameApi {
  const pc = new RTCPeerConnection(ICE)
  let dc: RTCDataChannel | null = null
  let hostOfferSent = false

  function attachDc(channel: RTCDataChannel): void {
    dc = channel
    channel.binaryType = 'arraybuffer'
    channel.onopen = () => opts.onChannelOpen()
    channel.onmessage = (ev) => {
      if (typeof ev.data === 'string') opts.onGameJsonString(ev.data)
    }
  }

  if (opts.role === 'host') {
    attachDc(pc.createDataChannel('game', { ordered: true }))
  } else {
    pc.ondatachannel = (ev) => attachDc(ev.channel)
  }

  pc.onicecandidate = (ev) => {
    if (ev.candidate) {
      opts.signalSend({
        type: 'rtcIce',
        candidate: ev.candidate.toJSON(),
      })
    }
  }

  async function handleSignal(data: Record<string, unknown>): Promise<boolean> {
    const t = data.type as string | undefined
    try {
      if (t === 'rtcIce' && data.candidate && typeof data.candidate === 'object') {
        await pc.addIceCandidate(new RTCIceCandidate(data.candidate as RTCIceCandidateInit))
        return true
      }
      if (opts.role === 'guest' && t === 'rtcOffer' && typeof data.sdp === 'string') {
        await pc.setRemoteDescription(new RTCSessionDescription({ type: 'offer', sdp: data.sdp }))
        const ans = await pc.createAnswer()
        await pc.setLocalDescription(ans)
        opts.signalSend({
          type: 'rtcAnswer',
          sdp: pc.localDescription!.sdp ?? '',
        })
        return true
      }
      if (opts.role === 'host' && t === 'rtcAnswer' && typeof data.sdp === 'string') {
        await pc.setRemoteDescription(new RTCSessionDescription({ type: 'answer', sdp: data.sdp }))
        return true
      }
    } catch {
      /* ignore malformed rtc */
    }
    return false
  }

  async function hostStartHandshake(): Promise<void> {
    if (opts.role !== 'host' || hostOfferSent) return
    hostOfferSent = true
    const offer = await pc.createOffer()
    await pc.setLocalDescription(offer)
    opts.signalSend({
      type: 'rtcOffer',
      sdp: pc.localDescription!.sdp ?? '',
    })
  }

  function sendGameJson(obj: Record<string, unknown>): void {
    const s = JSON.stringify(obj)
    if (dc?.readyState === 'open') {
      try {
        dc.send(s)
        return
      } catch {
        /* fallback below */
      }
    }
    opts.signalSend(obj)
  }

  function dispose(): void {
    try {
      dc?.close()
    } catch {
      /* ignore */
    }
    try {
      pc.close()
    } catch {
      /* ignore */
    }
    dc = null
  }

  return {
    get channel() {
      return dc
    },
    handleSignal,
    hostStartHandshake,
    sendGameJson,
    dispose,
  }
}
