/**
 * Background Audio Waveform Generator with in-memory caching
 */

const waveformCache = new Map<string, number[]>();

export async function getOrGenerateWaveform(
  sourceUrlOrBlob: string | Blob,
  cacheKey: string,
  samplesCount: number = 64
): Promise<number[]> {
  if (waveformCache.has(cacheKey)) {
    return waveformCache.get(cacheKey)!;
  }

  try {
    let arrayBuffer: ArrayBuffer;
    if (typeof sourceUrlOrBlob === 'string') {
      const resp = await fetch(sourceUrlOrBlob);
      arrayBuffer = await resp.arrayBuffer();
    } else {
      arrayBuffer = await sourceUrlOrBlob.arrayBuffer();
    }

    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextClass) return generateSyntheticWaveform(samplesCount);

    const audioCtx = new AudioContextClass();
    const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
    const rawData = audioBuffer.getChannelData(0); // Use first channel
    const blockSize = Math.floor(rawData.length / samplesCount);
    const filteredData: number[] = [];

    for (let i = 0; i < samplesCount; i++) {
      const blockStart = blockSize * i;
      let sum = 0;
      for (let j = 0; j < blockSize; j++) {
        sum += Math.abs(rawData[blockStart + j]);
      }
      filteredData.push(sum / blockSize);
    }

    // Normalize 0.05 to 1.0
    const maxVal = Math.max(0.01, ...filteredData);
    const normalized = filteredData.map(v => Math.max(0.1, v / maxVal));

    audioCtx.close().catch(() => {});
    waveformCache.set(cacheKey, normalized);
    return normalized;
  } catch (err) {
    console.warn('[WaveformGenerator] Audio decode failed for waveform, fallback to envelope:', err);
    const fallback = generateSyntheticWaveform(samplesCount);
    waveformCache.set(cacheKey, fallback);
    return fallback;
  }
}

function generateSyntheticWaveform(samplesCount: number): number[] {
  const result: number[] = [];
  for (let i = 0; i < samplesCount; i++) {
    const v = 0.3 + 0.5 * Math.abs(Math.sin(i * 0.35) * Math.cos(i * 0.15));
    result.push(Math.max(0.15, Math.min(1.0, v)));
  }
  return result;
}
