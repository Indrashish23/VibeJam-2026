/** Browser-safe blob ↔ base64 for voice clips over WebSocket JSON. */

export function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => {
      const s = r.result as string
      const i = s.indexOf(',')
      resolve(i >= 0 ? s.slice(i + 1) : s)
    }
    r.onerror = () => reject(r.error)
    r.readAsDataURL(blob)
  })
}

export function base64ToBlob(b64: string, mime: string): Blob {
  const bin = atob(b64)
  const len = bin.length
  const bytes = new Uint8Array(len)
  for (let i = 0; i < len; i++) bytes[i] = bin.charCodeAt(i)
  return new Blob([bytes], { type: mime || 'audio/webm' })
}

/* --- Binary frame codec for voice-shot audio ----------------------------------
 *
 * Avoids base64 + JSON.stringify/parse on the megabyte-class audio payloads that
 * otherwise land on the main thread per shot (the `voiceShotAudio` JSON path).
 *
 * Frame layout:
 *   [u8 magic = 0xA1]
 *   [u8 mimeCode]            // see MIME_CODES below
 *   [u8 shotIdLen]           // 1..255 bytes
 *   [shotIdLen bytes]        // ASCII shotId
 *   [audio bytes...]         // remainder is the raw clip (webm/opus or wav)
 */

const FRAME_MAGIC_VOICE_SHOT_AUDIO = 0xa1

const MIME_CODES: Record<string, number> = {
  'audio/webm': 1,
  'audio/webm;codecs=opus': 1,
  'audio/ogg': 2,
  'audio/ogg;codecs=opus': 2,
  'audio/mp4': 3,
  'audio/wav': 4,
}

const MIME_FROM_CODE: Record<number, string> = {
  1: 'audio/webm',
  2: 'audio/ogg',
  3: 'audio/mp4',
  4: 'audio/wav',
}

function mimeToCode(mime: string): number {
  return MIME_CODES[mime] ?? 0
}

function mimeFromCode(code: number): string {
  return MIME_FROM_CODE[code] ?? 'audio/webm'
}

export type VoiceShotAudioFrame = {
  shotId: string
  mime: string
  bytes: Uint8Array
}

/** Encode an audio clip + shotId into a compact binary frame ready for `dc.send`. */
export function encodeVoiceShotAudioFrame(
  shotId: string,
  mime: string,
  audio: Uint8Array,
): ArrayBuffer {
  const idBytes = new TextEncoder().encode(shotId)
  if (idBytes.length === 0 || idBytes.length > 255) {
    throw new Error('voiceShotAudio: shotId must be 1..255 bytes')
  }
  const headerLen = 3 + idBytes.length
  const out = new Uint8Array(headerLen + audio.byteLength)
  out[0] = FRAME_MAGIC_VOICE_SHOT_AUDIO
  out[1] = mimeToCode(mime)
  out[2] = idBytes.length
  out.set(idBytes, 3)
  out.set(audio, headerLen)
  return out.buffer
}

/** Returns null if the buffer doesn't look like a voiceShotAudio frame. */
export function decodeVoiceShotAudioFrame(buf: ArrayBuffer): VoiceShotAudioFrame | null {
  if (buf.byteLength < 4) return null
  const view = new Uint8Array(buf)
  if (view[0] !== FRAME_MAGIC_VOICE_SHOT_AUDIO) return null
  const mimeCode = view[1]
  const idLen = view[2]
  const headerLen = 3 + idLen
  if (idLen === 0 || buf.byteLength < headerLen) return null
  const shotId = new TextDecoder().decode(view.subarray(3, headerLen))
  const bytes = view.subarray(headerLen)
  return { shotId, mime: mimeFromCode(mimeCode), bytes }
}

export function isVoiceShotAudioFrame(buf: ArrayBuffer): boolean {
  if (buf.byteLength < 4) return false
  return new Uint8Array(buf, 0, 1)[0] === FRAME_MAGIC_VOICE_SHOT_AUDIO
}
