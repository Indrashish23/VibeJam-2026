import { rmsToDbfs } from './charge';

export type MicLevels = { rms: number; dbfs: number };

export type MicPipeline = {
  /** Resume AudioContext if suspended (call from user gesture). */
  resume: () => Promise<void>;
  /** One analyser read per call. */
  getLevels: () => MicLevels;
  dispose: () => void;
};

function rmsFromTimeDomain(data: Float32Array): number {
  let sum = 0;
  for (let i = 0; i < data.length; i++) {
    const x = data[i]!;
    sum += x * x;
  }
  return Math.sqrt(sum / data.length);
}

/**
 * Opens default mic, AnalyserNode only (no output to speakers).
 * Caller should invoke `resume()` from a user gesture if needed.
 */
export async function createMicPipeline(): Promise<MicPipeline | null> {
  if (!navigator.mediaDevices?.getUserMedia) {
    return null;
  }
  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  } catch {
    return null;
  }

  const ctx = new AudioContext();
  const source = ctx.createMediaStreamSource(stream);
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 2048;
  analyser.smoothingTimeConstant = 0.65;
  source.connect(analyser);
  const td = new Float32Array(analyser.fftSize);

  return {
    resume: () => ctx.resume(),
    getLevels: () => {
      analyser.getFloatTimeDomainData(td);
      const rms = rmsFromTimeDomain(td);
      return { rms, dbfs: rmsToDbfs(rms) };
    },
    dispose: () => {
      source.disconnect();
      analyser.disconnect();
      stream.getTracks().forEach((t) => t.stop());
      void ctx.close();
    },
  };
}
