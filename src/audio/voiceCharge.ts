import type { PerspectiveCamera } from 'three'
import { Vector3 } from 'three'
import { postProcessVoiceDecodeBuffer } from './voiceBufferPostProcess'
import { gameConfig } from '../gameConfig'

const _listenerPos = new Vector3()
const _listenerFwd = new Vector3()
const _listenerUp = new Vector3(0, 1, 0)

export type MicStatus = 'pending' | 'ok' | 'denied'

/**
 * Microphone → **charge** meter (0–1, not raw voice level on the bar) + MediaRecorder for hit playback.
 * Louder RMS increases charge faster while `wantRise` (e.g. LMB held). After `voiceSilenceBeforeDecaySec`
 * of quiet mic, charge decays at `voiceChargeDecayPerSec`.
 */
export class VoiceChargeManager {
  status: MicStatus = 'pending'

  private stream: MediaStream | null = null
  private ctx: AudioContext | null = null
  private analyser: AnalyserNode | null = null
  private freqData: Uint8Array | null = null

  private recorder: MediaRecorder | null = null
  private recordChunks: BlobPart[] = []
  private recordingMime = ''
  private recordCapTimer: ReturnType<typeof setTimeout> | null = null

  /** Stops previous clip graph when starting a new one. */
  private voicePlaybackCleanup: (() => void)[] = []

  /** Accumulated fire charge 0..1 (bar shows this, not instantaneous RMS). */
  private charge = 0
  /** Seconds of continuous quiet mic while charge > 0. */
  private quietAcc = 0

  /** Request mic; sets status ok/denied. */
  async ensureMic(): Promise<boolean> {
    if (this.status === 'ok' && this.stream) return true
    if (!navigator.mediaDevices?.getUserMedia) {
      this.status = 'denied'
      return false
    }
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      })
      this.ctx = new AudioContext()
      const src = this.ctx.createMediaStreamSource(this.stream)
      this.analyser = this.ctx.createAnalyser()
      this.analyser.fftSize = 2048
      this.analyser.smoothingTimeConstant = 0.35
      src.connect(this.analyser)
      this.freqData = new Uint8Array(this.analyser.fftSize)
      this.status = 'ok'
      return true
    } catch {
      this.disposeStreamOnly()
      this.status = 'denied'
      return false
    }
  }

  resumeAudio(): void {
    void this.ctx?.resume()
  }

  private disposeStreamOnly(): void {
    if (this.stream) {
      for (const t of this.stream.getTracks()) t.stop()
      this.stream = null
    }
    this.analyser = null
    this.freqData = null
    if (this.ctx) {
      void this.ctx.close()
      this.ctx = null
    }
  }

  dispose(): void {
    this.clearRecordCapTimer()
    this.stopRecorderSilently()
    this.recordChunks = []
    this.stopVoiceClipPlayback()
    this.disposeStreamOnly()
    this.status = 'pending'
  }

  private pickRecorderMime(): string {
    const preferred = [
      'audio/webm;codecs=opus',
      'audio/webm',
      'audio/ogg;codecs=opus',
      'audio/mp4',
    ]
    for (const m of preferred) {
      if (MediaRecorder.isTypeSupported(m)) return m
    }
    return ''
  }

  private clearRecordCapTimer(): void {
    if (this.recordCapTimer != null) {
      clearTimeout(this.recordCapTimer)
      this.recordCapTimer = null
    }
  }

  /** Hard-stop recording at voiceRecordMaxSec; chunks finalized when LMB releases (inactive + chunks). */
  private capRecordingDuration(): void {
    this.recordCapTimer = null
    const rec = this.recorder
    if (!rec || rec.state === 'inactive') return
    try {
      rec.stop()
    } catch {
      this.recorder = null
    }
  }

  /** True when `MediaRecorder` is actively recording a charge (mic stream + recorder started). */
  isChargeRecordingNow(): boolean {
    return this.recorder !== null && this.recorder.state === 'recording'
  }

  /**
   * Independent copy of the live mic for WebRTC proximity voice (separate from MediaRecorder).
   * The original used for the charge can stay enabled while the clone is muted to peer.
   */
  cloneAudioTrackForVoip(): MediaStreamTrack | null {
    const t = this.stream?.getAudioTracks()[0]
    return t ? t.clone() : null
  }

  /** Call when LMB pressed — begins recording blob for hit playback. */
  startChargeRecording(): void {
    this.clearRecordCapTimer()
    this.recordChunks = []
    if (!this.stream) return
    this.stopRecorderSilently()
    const mime = this.pickRecorderMime()
    try {
      this.recordingMime = mime
      this.recorder = mime
        ? new MediaRecorder(this.stream, { mimeType: mime })
        : new MediaRecorder(this.stream)
      this.recorder.ondataavailable = (e) => {
        if (e.data.size > 0) this.recordChunks.push(e.data)
      }
      this.recorder.start(120)
      const sec = Math.max(0.5, gameConfig.voiceRecordMaxSec)
      this.recordCapTimer = window.setTimeout(() => this.capRecordingDuration(), sec * 1000)
    } catch {
      this.recorder = null
    }
  }

  private stopRecorderSilently(): void {
    if (this.recorder && this.recorder.state !== 'inactive') {
      try {
        this.recorder.stop()
      } catch {
        /* ignore */
      }
    }
    this.recorder = null
  }

  /** Call on LMB release — returns blob for decode (may be empty). */
  finishChargeRecording(): Promise<Blob> {
    return new Promise((resolve) => {
      this.clearRecordCapTimer()

      const finalizeFromChunks = (): Blob => {
        const blob = new Blob(this.recordChunks, {
          type: this.recordingMime || 'audio/webm',
        })
        this.recordChunks = []
        this.recorder = null
        return blob
      }

      const rec = this.recorder
      if (!rec) {
        resolve(this.recordChunks.length > 0 ? finalizeFromChunks() : new Blob())
        return
      }
      if (rec.state === 'inactive') {
        resolve(this.recordChunks.length > 0 ? finalizeFromChunks() : new Blob())
        return
      }
      rec.onstop = () => {
        resolve(finalizeFromChunks())
      }
      try {
        rec.stop()
      } catch {
        this.recorder = null
        resolve(new Blob())
      }
    })
  }

  /** Raw RMS estimate 0..~1 from analyser. */
  sampleRms(): number {
    if (!this.analyser || !this.freqData) return 0
    this.analyser.getByteTimeDomainData(
      this.freqData as unknown as Uint8Array<ArrayBuffer>,
    )
    let sum = 0
    for (let i = 0; i < this.freqData.length; i++) {
      const z = (this.freqData[i] - 128) / 128
      sum += z * z
    }
    return Math.sqrt(sum / this.freqData.length)
  }

  /**
   * @param wantRise — LMB held and gameplay allows building charge (mic not blocked).
   */
  tickChargeAccum(delta: number, wantRise: boolean): number {
    const raw = this.sampleRms()
    const threshold = Math.max(1e-5, gameConfig.voiceSilenceRmsThreshold)
    const loud = raw >= threshold

    if (loud) {
      this.quietAcc = 0
    } else {
      this.quietAcc += delta
    }

    const silenceNeed = Math.max(0.05, gameConfig.voiceSilenceBeforeDecaySec)
    if (this.charge > 1e-6 && this.quietAcc >= silenceNeed) {
      const decay = Math.max(0, gameConfig.voiceChargeDecayPerSec) * delta
      this.charge = Math.max(0, this.charge - decay)
      if (this.charge < 1e-6) {
        this.charge = 0
        this.quietAcc = 0
      }
    }

    if (wantRise) {
      const sens = Math.max(0.05, gameConfig.voiceChargeSensitivity)
      const scale = Math.max(0.1, gameConfig.voiceChargeRmsScale)
      const loudness = Math.min(1, Math.min(2.2, raw * sens * scale))
      const risePerSec = Math.max(0.02, gameConfig.voiceChargeRisePerSec)
      this.charge = Math.min(1, this.charge + risePerSec * loudness * delta)
    }

    return this.charge
  }

  getCharge(): number {
    return this.charge
  }

  resetChargeMeter(): void {
    this.charge = 0
    this.quietAcc = 0
  }

  getAudioContext(): AudioContext | null {
    return this.ctx
  }

  /** Decode recorded blob to AudioBuffer for playback on hit; returns null if decode fails. */
  async decodeRecording(blob: Blob): Promise<AudioBuffer | null> {
    if (!blob.size || !this.ctx) return null
    try {
      const ab = await blob.arrayBuffer()
      const copy = ab.slice(0)
      const raw = await this.ctx.decodeAudioData(copy)
      return postProcessVoiceDecodeBuffer(this.ctx, raw)
    } catch {
      return null
    }
  }

  /** Stop any in-progress voice clip (new shot / new hit replaces previous). */
  stopVoiceClipPlayback(): void {
    for (const fn of this.voicePlaybackCleanup) {
      try {
        fn()
      } catch {
        /* ignore */
      }
    }
    this.voicePlaybackCleanup = []
  }

  private trackPlayback(cleanup: () => void): void {
    this.voicePlaybackCleanup.push(cleanup)
  }

  /** Hit / spatial / replay delivery: Web Audio playback rate (pitch + speed; chipmunk when &gt;1). */
  private applyVoiceDeliveryRate(src: AudioBufferSourceNode): void {
    const r = gameConfig.voiceDeliveryPlaybackRate
    src.playbackRate.value = Math.max(0.5, Math.min(2.6, r))
  }

  private voiceClipOutGain(
    c: AudioContext,
    options?: { victimHitReceive?: boolean },
  ): GainNode {
    const g = c.createGain()
    const base = Math.max(0, Math.min(4, gameConfig.voiceClipPlaybackGainMul))
    const extra = options?.victimHitReceive
      ? Math.max(0, Math.min(3, gameConfig.voiceClipVictimReceiveGainMul))
      : 1
    g.gain.value = Math.min(8, base * extra)
    return g
  }

  /** Short fallback when decode fails — simple blip. */
  playFallbackHitSound(): void {
    this.stopVoiceClipPlayback()
    const c = this.ctx
    if (!c) return
    const dur = 0.09
    const rate = c.sampleRate
    const n = Math.floor(rate * dur)
    const buf = c.createBuffer(1, n, rate)
    const d = buf.getChannelData(0)
    for (let i = 0; i < n; i++) {
      const t = i / rate
      d[i] = Math.sin(t * 880 * Math.PI * 2) * (1 - t / dur) * 0.35
    }
    const src = c.createBufferSource()
    src.buffer = buf
    src.connect(c.destination)
    this.trackPlayback(() => {
      try {
        src.stop(0)
      } catch {
        /* ignore */
      }
      try {
        src.disconnect()
      } catch {
        /* ignore */
      }
    })
    src.start()
  }

  playBuffer(buf: AudioBuffer | null): void {
    this.stopVoiceClipPlayback()
    const c = this.ctx
    if (!c || !buf) {
      this.playFallbackHitSound()
      return
    }
    try {
      const src = c.createBufferSource()
      src.buffer = buf
      this.applyVoiceDeliveryRate(src)
      const out = this.voiceClipOutGain(c)
      src.connect(out)
      out.connect(c.destination)
      this.trackPlayback(() => {
        try {
          src.stop(0)
        } catch {
          /* ignore */
        }
        try {
          src.disconnect()
          out.disconnect()
        } catch {
          /* ignore */
        }
      })
      src.start()
    } catch {
      this.playFallbackHitSound()
    }
  }

  /** Pistol mode: play a slice of an existing AudioBuffer without copying samples. */
  playBufferSlice(buf: AudioBuffer | null, offsetSec: number, durationSec: number): void {
    this.stopVoiceClipPlayback()
    const c = this.ctx
    if (!c || !buf) {
      this.playFallbackHitSound()
      return
    }
    try {
      const src = c.createBufferSource()
      src.buffer = buf
      this.applyVoiceDeliveryRate(src)
      const out = this.voiceClipOutGain(c)
      src.connect(out)
      out.connect(c.destination)
      this.trackPlayback(() => {
        try {
          src.stop(0)
        } catch {
          /* ignore */
        }
        try {
          src.disconnect()
          out.disconnect()
        } catch {
          /* ignore */
        }
      })
      const off = Math.max(0, Math.min(buf.duration, offsetSec))
      const dur = Math.max(0.01, Math.min(buf.duration - off, durationSec))
      src.start(0, off, dur)
    } catch {
      this.playFallbackHitSound()
    }
  }

  /** Pistol mode (spatial): play a slice positioned in world space; same rolloff knobs as `playBufferSpatialAt`. */
  playBufferSliceSpatialAt(
    buf: AudioBuffer | null,
    offsetSec: number,
    durationSec: number,
    soundWorld: Vector3,
    camera: PerspectiveCamera,
  ): void {
    this.stopVoiceClipPlayback()
    const c = this.ctx
    if (!c || !buf) {
      this.playFallbackHitSound()
      return
    }
    try {
      camera.getWorldPosition(_listenerPos)
      camera.getWorldDirection(_listenerFwd)
      _listenerFwd.normalize()

      const listener = c.listener
      listener.positionX.value = _listenerPos.x
      listener.positionY.value = _listenerPos.y
      listener.positionZ.value = _listenerPos.z
      listener.forwardX.value = _listenerFwd.x
      listener.forwardY.value = _listenerFwd.y
      listener.forwardZ.value = _listenerFwd.z
      listener.upX.value = _listenerUp.x
      listener.upY.value = _listenerUp.y
      listener.upZ.value = _listenerUp.z

      const panner = c.createPanner()
      panner.panningModel = 'HRTF'
      panner.distanceModel = 'inverse'
      panner.refDistance = gameConfig.voiceHitRefDistance
      panner.maxDistance = gameConfig.voiceHitMaxDistance
      panner.rolloffFactor = gameConfig.voiceHitRolloff
      panner.coneInnerAngle = 360
      panner.coneOuterAngle = 360
      panner.setPosition(soundWorld.x, soundWorld.y, soundWorld.z)

      const src = c.createBufferSource()
      src.buffer = buf
      this.applyVoiceDeliveryRate(src)
      src.connect(panner)
      const out = this.voiceClipOutGain(c)
      panner.connect(out)
      out.connect(c.destination)
      this.trackPlayback(() => {
        try {
          src.stop(0)
        } catch {
          /* ignore */
        }
        try {
          src.disconnect()
          panner.disconnect()
          out.disconnect()
        } catch {
          /* ignore */
        }
      })
      src.onended = () => {
        try {
          src.disconnect()
          panner.disconnect()
          out.disconnect()
        } catch {
          /* ignore */
        }
      }
      const off = Math.max(0, Math.min(buf.duration, offsetSec))
      const dur = Math.max(0.01, Math.min(buf.duration - off, durationSec))
      src.start(0, off, dur)
    } catch {
      this.playFallbackHitSound()
    }
  }

  /** Shooter-only replay: fades gain to zero over this many seconds (capped vs clip length). */
  playBufferFading(buf: AudioBuffer | null): void {
    this.stopVoiceClipPlayback()
    const c = this.ctx
    if (!c || !buf) {
      this.playFallbackHitSound()
      return
    }
    try {
      const fadeSec = Math.max(0.12, gameConfig.voiceShooterReplayFadeSec)
      const src = c.createBufferSource()
      this.applyVoiceDeliveryRate(src)
      const maxWall = buf.duration / Math.max(0.2, src.playbackRate.value)
      const fadeDur = Math.min(fadeSec, Math.max(0.18, maxWall * 0.95))
      const gain = c.createGain()
      src.buffer = buf
      const t0 = c.currentTime
      const mul = Math.max(0, Math.min(4, gameConfig.voiceClipPlaybackGainMul))
      gain.gain.setValueAtTime(0.85 * mul, t0)
      gain.gain.linearRampToValueAtTime(0, t0 + fadeDur)
      src.connect(gain)
      gain.connect(c.destination)
      this.trackPlayback(() => {
        try {
          src.stop(0)
        } catch {
          /* ignore */
        }
        try {
          src.disconnect()
          gain.disconnect()
        } catch {
          /* ignore */
        }
      })
      src.onended = () => {
        try {
          src.disconnect()
          gain.disconnect()
        } catch {
          /* ignore */
        }
      }
      src.start()
    } catch {
      this.playFallbackHitSound()
    }
  }

  /**
   * Play a hit clip in world space with distance rolloff (victim / bystanders).
   * Updates the Web Audio listener from the camera, then spatialize the source at `soundWorld`.
   */
  playBufferSpatialAt(
    buf: AudioBuffer | null,
    soundWorld: Vector3,
    camera: PerspectiveCamera,
    playOpts?: { victimHitReceive?: boolean },
  ): void {
    this.stopVoiceClipPlayback()
    const c = this.ctx
    if (!c || !buf) {
      this.playFallbackHitSound()
      return
    }
    try {
      camera.getWorldPosition(_listenerPos)
      camera.getWorldDirection(_listenerFwd)
      _listenerFwd.normalize()

      const listener = c.listener
      listener.positionX.value = _listenerPos.x
      listener.positionY.value = _listenerPos.y
      listener.positionZ.value = _listenerPos.z
      listener.forwardX.value = _listenerFwd.x
      listener.forwardY.value = _listenerFwd.y
      listener.forwardZ.value = _listenerFwd.z
      listener.upX.value = _listenerUp.x
      listener.upY.value = _listenerUp.y
      listener.upZ.value = _listenerUp.z

      const panner = c.createPanner()
      panner.panningModel = 'HRTF'
      panner.distanceModel = 'inverse'
      panner.refDistance = gameConfig.voiceHitRefDistance
      panner.maxDistance = gameConfig.voiceHitMaxDistance
      panner.rolloffFactor = gameConfig.voiceHitRolloff
      panner.coneInnerAngle = 360
      panner.coneOuterAngle = 360
      panner.setPosition(soundWorld.x, soundWorld.y, soundWorld.z)

      const src = c.createBufferSource()
      src.buffer = buf
      this.applyVoiceDeliveryRate(src)
      src.connect(panner)
      const out = this.voiceClipOutGain(c, playOpts)
      panner.connect(out)
      out.connect(c.destination)
      this.trackPlayback(() => {
        try {
          src.stop(0)
        } catch {
          /* ignore */
        }
        try {
          src.disconnect()
          panner.disconnect()
          out.disconnect()
        } catch {
          /* ignore */
        }
      })
      src.onended = () => {
        try {
          src.disconnect()
          panner.disconnect()
          out.disconnect()
        } catch {
          /* ignore */
        }
      }
      src.start()
    } catch {
      this.playFallbackHitSound()
    }
  }
}

/**
 * Pistol mode: extract a slice of an AudioBuffer as a 16-bit PCM WAV blob.
 * `decodeAudioData` accepts WAV in all major browsers, so this is safe to send across PartyKit
 * via the existing `voiceShot` payload (mime: 'audio/wav').
 */
export function audioBufferSliceToWavBlob(
  buf: AudioBuffer,
  offsetSec: number,
  durationSec: number,
): Blob {
  const sampleRate = buf.sampleRate
  const channels = Math.max(1, Math.min(2, buf.numberOfChannels))
  const startFrame = Math.max(0, Math.min(buf.length, Math.floor(offsetSec * sampleRate)))
  const endFrame = Math.max(
    startFrame + 1,
    Math.min(buf.length, startFrame + Math.floor(durationSec * sampleRate)),
  )
  const frames = endFrame - startFrame

  const channelData: Float32Array[] = []
  for (let ch = 0; ch < channels; ch++) {
    channelData.push(buf.getChannelData(ch))
  }

  const blockAlign = channels * 2 // 16-bit PCM
  const byteRate = sampleRate * blockAlign
  const dataBytes = frames * blockAlign
  const bufferBytes = 44 + dataBytes
  const ab = new ArrayBuffer(bufferBytes)
  const view = new DataView(ab)

  function writeStr(offset: number, s: string) {
    for (let i = 0; i < s.length; i++) view.setUint8(offset + i, s.charCodeAt(i))
  }

  writeStr(0, 'RIFF')
  view.setUint32(4, bufferBytes - 8, true)
  writeStr(8, 'WAVE')
  writeStr(12, 'fmt ')
  view.setUint32(16, 16, true) // PCM fmt chunk size
  view.setUint16(20, 1, true) // PCM format
  view.setUint16(22, channels, true)
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, byteRate, true)
  view.setUint16(32, blockAlign, true)
  view.setUint16(34, 16, true) // bits per sample
  writeStr(36, 'data')
  view.setUint32(40, dataBytes, true)

  let p = 44
  for (let i = 0; i < frames; i++) {
    const src = startFrame + i
    for (let ch = 0; ch < channels; ch++) {
      let s = channelData[ch][src] ?? 0
      if (s > 1) s = 1
      else if (s < -1) s = -1
      view.setInt16(p, s < 0 ? s * 0x8000 : s * 0x7fff, true)
      p += 2
    }
  }

  return new Blob([ab], { type: 'audio/wav' })
}
