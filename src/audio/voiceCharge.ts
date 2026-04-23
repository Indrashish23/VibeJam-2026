import type { PerspectiveCamera } from 'three'
import { Vector3 } from 'three'
import { gameConfig } from '../gameConfig'

const _listenerPos = new Vector3()
const _listenerFwd = new Vector3()
const _listenerUp = new Vector3(0, 1, 0)

export type MicStatus = 'pending' | 'ok' | 'denied'

/**
 * Microphone RMS → charge meter + MediaRecorder capture for playback on hit.
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

  /** Smoothed display charge 0..can exceed 1 for overload UI */
  private smoothedCharge = 0

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
    this.stopRecorderSilently()
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

  /** Call when LMB pressed — begins recording blob for hit playback. */
  startChargeRecording(): void {
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
      const rec = this.recorder
      if (!rec || rec.state === 'inactive') {
        this.recorder = null
        resolve(new Blob())
        return
      }
      rec.onstop = () => {
        const blob = new Blob(this.recordChunks, {
          type: this.recordingMime || 'audio/webm',
        })
        this.recordChunks = []
        this.recorder = null
        resolve(blob)
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
   * Integrate smoothed charge from RMS while holding; call each frame while charging.
   * Returns normalized charge (can exceed 1 when screaming hard — UI overload).
   */
  tickChargeMeter(delta: number, charging: boolean): number {
    const raw = this.sampleRms()
    const sens = Math.max(0.05, gameConfig.voiceChargeSensitivity)
    const scale = Math.max(0.1, gameConfig.voiceChargeRmsScale)
    const target = Math.min(2.2, raw * sens * scale)

    const atk = gameConfig.voiceChargeAttack
    const rel = gameConfig.voiceChargeRelease
    const k = Math.exp(-(charging ? atk : rel) * delta)
    this.smoothedCharge = this.smoothedCharge * k + target * (1 - k)

    return this.smoothedCharge
  }

  resetChargeMeter(): void {
    this.smoothedCharge = 0
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
      return await this.ctx.decodeAudioData(copy)
    } catch {
      return null
    }
  }

  /** Short fallback when decode fails — simple blip. */
  playFallbackHitSound(): void {
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
    src.start()
  }

  playBuffer(buf: AudioBuffer | null): void {
    const c = this.ctx
    if (!c || !buf) {
      this.playFallbackHitSound()
      return
    }
    try {
      const src = c.createBufferSource()
      src.buffer = buf
      src.connect(c.destination)
      src.start()
    } catch {
      this.playFallbackHitSound()
    }
  }

  /** Shooter-only replay: fades out so the clip is not held after one play (GC-friendly). */
  playBufferFading(buf: AudioBuffer | null): void {
    const c = this.ctx
    if (!c || !buf) {
      this.playFallbackHitSound()
      return
    }
    try {
      const fadeSec = Math.max(0.12, gameConfig.voiceShooterReplayFadeSec)
      const fadeDur = Math.min(fadeSec, Math.max(0.18, buf.duration * 0.95))
      const src = c.createBufferSource()
      const gain = c.createGain()
      src.buffer = buf
      const t0 = c.currentTime
      gain.gain.setValueAtTime(0.85, t0)
      gain.gain.linearRampToValueAtTime(0, t0 + fadeDur)
      src.connect(gain)
      gain.connect(c.destination)
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
  ): void {
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
      src.connect(panner)
      panner.connect(c.destination)
      src.onended = () => {
        try {
          src.disconnect()
          panner.disconnect()
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
