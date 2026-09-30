import { AudioResampler, STANDARD_RENDER_SAMPLE_RATE } from './audioResampler';
import { soundscapeGenerator, SOUNDSCAPE_PRESETS } from './soundscapeGenerator';

/**
 * Universal, rock-solid Audio Decoder and Fallback Synthesizer for video export and rendering.
 * Safely decodes audio from ArrayBuffers, Blobs, Files, and URLs using standard AudioContext.
 * Ensures the export pipeline ALWAYS has a valid, synchronized 48kHz Stereo audio stream.
 */
export class SafeAudioDecoder {
  /**
   * Safely decodes an ArrayBuffer or Blob into an AudioBuffer resampled to 48kHz Stereo.
   * Uses an isolated standard AudioContext instance to avoid OfflineAudioContext decoding bugs.
   */
  static async decodeTo48kStereo(
    masterCtx: BaseAudioContext | OfflineAudioContext,
    arrayBuffer: ArrayBuffer
  ): Promise<AudioBuffer | null> {
    if (!arrayBuffer || arrayBuffer.byteLength === 0) return null;

    const AudioCtxClass = typeof window !== 'undefined'
      ? (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)
      : null;

    if (!AudioCtxClass) return null;

    let decodeCtx: AudioContext | null = null;
    try {
      decodeCtx = new AudioCtxClass({ sampleRate: STANDARD_RENDER_SAMPLE_RATE });
      // Detach-safe buffer slice
      const copy = arrayBuffer.slice(0);
      const rawDecoded = await decodeCtx.decodeAudioData(copy);
      if (!rawDecoded || rawDecoded.length === 0) return null;

      return AudioResampler.resampleTo48kStereo(masterCtx, rawDecoded, STANDARD_RENDER_SAMPLE_RATE);
    } catch (err) {
      console.warn('[SafeAudioDecoder] Audio decode failed:', err);
      return null;
    } finally {
      if (decodeCtx) {
        try {
          await decodeCtx.close();
        } catch {}
      }
    }
  }

  /**
   * Generates a foundational 48kHz stereo wedding soundscape AudioBuffer.
   * Guarantees that exported videos are NEVER silent and always contain
   * a harmonious, emotional wedding audio foundation.
   */
  static async createFoundationalWeddingSoundtrack(
    masterCtx: BaseAudioContext | OfflineAudioContext,
    durationSeconds: number,
    presetId: string = 'altar_procession'
  ): Promise<AudioBuffer> {
    const totalSamples = Math.max(1, Math.ceil(durationSeconds * STANDARD_RENDER_SAMPLE_RATE));
    try {
      const preset = SOUNDSCAPE_PRESETS.find(p => p.id === presetId) || SOUNDSCAPE_PRESETS[0];
      const wavBlob = await soundscapeGenerator.generateSoundscapeWav(preset, Math.max(5, durationSeconds));
      if (wavBlob && wavBlob.size > 0) {
        const arrayBuf = await wavBlob.arrayBuffer();
        const decoded = await this.decodeTo48kStereo(masterCtx, arrayBuf);
        if (decoded && decoded.length > 0) {
          return decoded;
        }
      }
    } catch (err) {
      console.warn('[SafeAudioDecoder] Soundscape synthesis fallback:', err);
    }

    // Fallback: Warm harmonic ambient drone (A 432Hz + E 648Hz + C# 540Hz) with gentle fade
    const buffer = masterCtx.createBuffer(2, totalSamples, STANDARD_RENDER_SAMPLE_RATE);
    const ch0 = buffer.getChannelData(0);
    const ch1 = buffer.getChannelData(1);

    const f1 = 432.0;
    const f2 = 648.0;
    const f3 = 540.0;

    for (let i = 0; i < totalSamples; i++) {
      const t = i / STANDARD_RENDER_SAMPLE_RATE;
      // Gentle envelope: fade in over 2s, fade out over 2s
      let env = 1.0;
      if (t < 2.0) env = t / 2.0;
      else if (t > durationSeconds - 2.0) env = Math.max(0, (durationSeconds - t) / 2.0);

      // Low volume soothing harmonic ambience (~-24dB)
      const sampleL = (Math.sin(2 * Math.PI * f1 * t) * 0.03 + Math.sin(2 * Math.PI * f3 * t) * 0.02) * env;
      const sampleR = (Math.sin(2 * Math.PI * f2 * t) * 0.025 + Math.sin(2 * Math.PI * f3 * t) * 0.02) * env;

      ch0[i] = sampleL;
      ch1[i] = sampleR;
    }

    return buffer;
  }
}
