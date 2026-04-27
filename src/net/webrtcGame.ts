/**
 * WebRTC data channel for game JSON (voice shots, poses) + optional full-duplex proximity voice.
 * Signaling over the same socket (rtcOffer, rtcAnswer, rtcIce); browsers use STUN.
 */

export type SignalSend = (obj: Record<string, unknown>) => void

export type WebRtcGameApi = {
  readonly channel: RTCDataChannel | null
  handleSignal: (data: Record<string, unknown>) => Promise<boolean>
  hostStartHandshake: () => Promise<void>
  sendGameJson: (obj: Record<string, unknown>) => void
  /**
   * Send a binary frame (e.g. voice-shot audio) over the RTC data channel without
   * paying for `JSON.stringify` + base64 encoding. Returns `true` if dispatched, `false`
   * when the channel isn't open (caller should fall back to a JSON path).
   */
  sendGameBinary: (bytes: ArrayBuffer | Uint8Array) => boolean
  /**
   * Send a **clone** of the same mic the game uses (not the main track, so we can mute for peer
   * during voice-shot recording without breaking MediaRecorder).
   */
  attachLocalProximityVoipTrack: (track: MediaStreamTrack) => boolean
  setLocalVoipGameRecordingBlock: (blocked: boolean) => void
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
  /**
   * Binary frame received over the data channel. Used to avoid JSON.stringify + base64 on
   * large payloads like voice-shot audio. Optional: callers without binary support stay
   * compatible (frame is dropped silently).
   */
  onGameBinary?: (bytes: ArrayBuffer) => void
  onChannelOpen: () => void
  /** If true, add m=audio; clone mic attached later. */
  includeProximityVoip: boolean
  onRemoteVoipStream?: (stream: MediaStream) => void
}): WebRtcGameApi {
  const pc = new RTCPeerConnection(ICE)
  let dc: RTCDataChannel | null = null
  let hostOfferSent = false

  let localVoipTrack: MediaStreamTrack | null = null
  let localVoipBlocked = false
  const hostAudioTrans: RTCRtpTransceiver | null = opts.includeProximityVoip
    ? pc.addTransceiver('audio', { direction: 'sendrecv' })
    : null

  function setLocalTrackEnabledToPeer() {
    if (localVoipTrack) {
      /* Block = voice-shot recording — peer hears nothing (clone is muted, main mic still records). */
      localVoipTrack.enabled = !localVoipBlocked
    }
  }

  function attachLocalProximityVoipTrack(track: MediaStreamTrack): boolean {
    if (!opts.includeProximityVoip) return false
    if (localVoipTrack) {
      try {
        localVoipTrack.stop()
      } catch {
        /* ignore */
      }
    }
    localVoipTrack = track
    setLocalTrackEnabledToPeer()
    try {
      if (opts.role === 'host' && hostAudioTrans) {
        void hostAudioTrans.sender.replaceTrack(localVoipTrack)
        return true
      }
      let g: RTCRtpTransceiver | undefined = pc
        .getTransceivers()
        .find(
          (t) =>
            t.sender &&
            t.receiver &&
            (t.receiver.track === null || t.receiver.track.kind === 'audio'),
        )
      if (!g) {
        g = pc
          .getTransceivers()
          .find((t) => t.sender && t.receiver && t.currentDirection && t.currentDirection !== 'inactive')
      }
      if (!g) g = pc.getTransceivers().find((t) => t.sender && t.receiver)
      if (g?.sender) {
        void g.sender.replaceTrack(localVoipTrack)
        return true
      }
    } catch {
      /* replaceTrack can fail on odd states */
    }
    try {
      track.stop()
    } catch {
      /* ignore */
    }
    localVoipTrack = null
    return false
  }

  function setLocalVoipGameRecordingBlock(blocked: boolean): void {
    localVoipBlocked = blocked
    setLocalTrackEnabledToPeer()
  }

  function attachDc(channel: RTCDataChannel): void {
    dc = channel
    channel.binaryType = 'arraybuffer'
    channel.onopen = () => opts.onChannelOpen()
    channel.onmessage = (ev) => {
      const data = ev.data
      if (typeof data === 'string') {
        opts.onGameJsonString(data)
        return
      }
      if (!opts.onGameBinary) return
      if (data instanceof ArrayBuffer) {
        opts.onGameBinary(data)
        return
      }
      /* Some browsers/builds may still hand back a Blob even with binaryType='arraybuffer';
       * cheap async path keeps the main thread free of huge base64 work. */
      const maybeBlob = data as Blob | undefined
      if (maybeBlob && typeof maybeBlob.arrayBuffer === 'function') {
        void maybeBlob.arrayBuffer().then((buf) => opts.onGameBinary?.(buf))
      }
    }
  }

  if (opts.role === 'host') {
    attachDc(pc.createDataChannel('game', { ordered: true }))
  } else {
    pc.ondatachannel = (ev) => attachDc(ev.channel)
  }

  if (opts.includeProximityVoip) {
    pc.ontrack = (ev) => {
      if (ev.track.kind !== 'audio') return
      const st = ev.streams[0] ?? new MediaStream([ev.track])
      opts.onRemoteVoipStream?.(st)
    }
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

  function sendGameBinary(bytes: ArrayBuffer | Uint8Array): boolean {
    if (dc?.readyState !== 'open') return false
    try {
      /* Pass the ArrayBuffer directly so the runtime doesn't allocate a Blob copy. */
      const payload =
        bytes instanceof Uint8Array
          ? bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)
          : bytes
      dc.send(payload as ArrayBuffer)
      return true
    } catch {
      return false
    }
  }

  function dispose(): void {
    try {
      if (localVoipTrack) {
        localVoipTrack.stop()
        localVoipTrack = null
      }
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
    sendGameBinary,
    attachLocalProximityVoipTrack,
    setLocalVoipGameRecordingBlock,
    dispose,
  }
}
