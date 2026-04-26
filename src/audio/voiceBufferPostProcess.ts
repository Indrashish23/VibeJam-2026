import { gameConfig } from '../gameConfig'

/**
 * Picks "sound wave" segments: drops low-RMS (ambient/room) windows, concatenates the rest.
 * Falls back to a simple start/end trim if gating finds nothing.
 */
export function postProcessVoiceDecodeBuffer(
  ctx: BaseAudioContext,
  buf: AudioBuffer,
): AudioBuffer {
  if (buf.length < 256 || gameConfig.voiceClipExtractToActiveSound < 0.5) {
    return buf
  }
  const ratio = Math.max(0.04, Math.min(0.55, gameConfig.voiceClipExtractRmsRatio))
  const sr = buf.sampleRate
  const chN = Math.max(1, Math.min(2, buf.numberOfChannels))
  const n = buf.getChannelData(0).length

  const winS = Math.max(128, Math.floor(sr * 0.012))
  const hop = Math.max(1, Math.floor(winS * 0.5))
  const nWin = Math.max(0, 1 + Math.floor((n - winS) / hop))
  if (nWin < 2) return buf

  const rms: number[] = new Array(nWin)
  for (let wi = 0; wi < nWin; wi++) {
    const s0 = wi * hop
    if (s0 + winS > n) {
      rms[wi] = 0
      continue
    }
    let sum = 0
    for (let j = 0; j < winS; j++) {
      for (let c = 0; c < chN; c++) {
        const z = buf.getChannelData(c)[s0 + j]!
        sum += z * z
      }
    }
    rms[wi] = Math.sqrt(sum / (winS * chN))
  }

  let peak = 0
  for (const r of rms) {
    if (r > peak) peak = r
  }
  if (peak < 1e-5) return buf
  const th = peak * ratio
  const minWins = 2
  const active = rms.map((r) => r > th)
  type Run = { a: number; b: number }
  const runs: Run[] = []
  let i = 0
  while (i < active.length) {
    if (!active[i]) {
      i++
      continue
    }
    const a = i
    let b = i
    while (b + 1 < active.length && active[b + 1]!) b++
    if (b - a + 1 >= minWins) runs.push({ a, b })
    i = b + 1
  }

  const pad = Math.max(0, Math.floor(sr * 0.03))
  const segs: { s0: number; s1: number }[] = []
  for (const r of runs) {
    let s0 = r.a * hop
    let s1 = r.b * hop + winS
    s0 = Math.max(0, s0 - pad)
    s1 = Math.min(n, s1 + pad)
    if (s1 > s0) segs.push({ s0, s1 })
  }
  if (segs.length === 0) return simpleEdgeAbsTrim(ctx, buf, chN)

  if (segs.length === 1) {
    const out = copyTimeRange(ctx, buf, segs[0]!.s0, segs[0]!.s1)
    return out.duration >= 0.08 ? out : buf
  }

  const out = concatTimeRanges(ctx, buf, segs, chN)
  if (out && out.length >= 64) return out
  return buf
}

function copyTimeRange(ctx: BaseAudioContext, buf: AudioBuffer, s0: number, s1: number): AudioBuffer {
  const chN = Math.max(1, Math.min(2, buf.numberOfChannels))
  const len = Math.max(0, s1 - s0)
  const out = ctx.createBuffer(chN, len, buf.sampleRate)
  for (let c = 0; c < chN; c++) {
    out.getChannelData(c).set(buf.getChannelData(c).subarray(s0, s0 + len))
  }
  return out
}

function simpleEdgeAbsTrim(ctx: BaseAudioContext, buf: AudioBuffer, chN: number): AudioBuffer {
  const n = buf.getChannelData(0).length
  let m = 0
  for (let c = 0; c < chN; c++) {
    const d = buf.getChannelData(c)
    for (let i = 0; i < n; i++) {
      const a = Math.abs(d[i]!)
      if (a > m) m = a
    }
  }
  const th = Math.max(1e-5, m * 0.07)
  let a0 = 0
  let a1 = n - 1
  for (; a0 < n; a0++) {
    let hit = false
    for (let c = 0; c < chN && !hit; c++) {
      if (Math.abs(buf.getChannelData(c)[a0]!) > th) hit = true
    }
    if (hit) break
  }
  for (; a1 > a0; a1--) {
    let hit = false
    for (let c = 0; c < chN && !hit; c++) {
      if (Math.abs(buf.getChannelData(c)[a1]!) > th) hit = true
    }
    if (hit) break
  }
  if (a1 - a0 < 64) return buf
  return copyTimeRange(ctx, buf, a0, a1 + 1)
}

function concatTimeRanges(
  ctx: BaseAudioContext,
  src: AudioBuffer,
  segs: { s0: number; s1: number }[],
  chN: number,
): AudioBuffer | null {
  let tot = 0
  for (const { s0, s1 } of segs) tot += s1 - s0
  if (tot < 32) return null
  const out = ctx.createBuffer(chN, tot, src.sampleRate)
  for (let c = 0; c < chN; c++) {
    const o = out.getChannelData(c)
    const from = src.getChannelData(c)
    let w = 0
    for (const { s0, s1 } of segs) {
      const L = s1 - s0
      o.set(from.subarray(s0, s1), w)
      w += L
    }
  }
  return out
}
