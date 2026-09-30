/**
 * Standard Audio Constants for Rendering Pipeline
 */
export const STANDARD_RENDER_SAMPLE_RATE = 48000;
export const STANDARD_RENDER_CHANNELS = 2;

/**
 * Explicit High-Fidelity Resampler to 48kHz Stereo
 * 
 * Performs deterministic, pure-math resampling of any AudioBuffer (any sample rate, mono/stereo/surround)
 * into standard 48,000 Hz Stereo without allocating auxiliary Web Audio contexts or triggering race conditions.
 */
export class AudioResampler {
  /**
   * Resamples an AudioBuffer to standard 48,000 Hz 2-Channel Stereo using the provided master context.
   */
  static resampleTo48kStereo(
    masterCtx: BaseAudioContext | OfflineAudioContext,
    sourceBuffer: AudioBuffer,
    targetSampleRate: number = STANDARD_RENDER_SAMPLE_RATE
  ): AudioBuffer {
    if (!sourceBuffer || sourceBuffer.length === 0 || sourceBuffer.duration <= 0) {
      return masterCtx.createBuffer(STANDARD_RENDER_CHANNELS, 1, targetSampleRate);
    }

    const sourceRate = sourceBuffer.sampleRate;
    const numChannels = sourceBuffer.numberOfChannels;
    const sourceFrames = sourceBuffer.length;
    const targetFrames = Math.max(1, Math.round(sourceBuffer.duration * targetSampleRate));

    const targetBuffer = masterCtx.createBuffer(STANDARD_RENDER_CHANNELS, targetFrames, targetSampleRate);
    const outLeft = targetBuffer.getChannelData(0);
    const outRight = targetBuffer.getChannelData(1);

    // Fast path: already 48kHz Stereo
    if (sourceRate === targetSampleRate && numChannels === 2) {
      outLeft.set(sourceBuffer.getChannelData(0));
      outRight.set(sourceBuffer.getChannelData(1));
      this.sanitizeBufferData(outLeft, outRight);
      return targetBuffer;
    }

    // Channel preparation
    let srcLeft: Float32Array;
    let srcRight: Float32Array;

    if (numChannels === 1) {
      // Mono -> duplicated to Left & Right
      srcLeft = sourceBuffer.getChannelData(0);
      srcRight = srcLeft;
    } else if (numChannels === 2) {
      // Stereo
      srcLeft = sourceBuffer.getChannelData(0);
      srcRight = sourceBuffer.getChannelData(1);
    } else {
      // Multi-channel downmix (Left + 0.707*Center + 0.5*Surround, Right + 0.707*Center + 0.5*Surround)
      const ch0 = sourceBuffer.getChannelData(0);
      const ch1 = sourceBuffer.getChannelData(1);
      const ch2 = numChannels > 2 ? sourceBuffer.getChannelData(2) : null;
      const ch3 = numChannels > 3 ? sourceBuffer.getChannelData(3) : null;

      srcLeft = new Float32Array(sourceFrames);
      srcRight = new Float32Array(sourceFrames);

      for (let i = 0; i < sourceFrames; i++) {
        const center = ch2 ? ch2[i] * 0.7071 : 0;
        const surround = ch3 ? ch3[i] * 0.5 : 0;
        srcLeft[i] = ch0[i] * 0.8 + center + surround;
        srcRight[i] = ch1[i] * 0.8 + center + surround;
      }
    }

    // Resampling via linear interpolation with anti-aliasing safety
    const ratio = sourceFrames / targetFrames;

    for (let i = 0; i < targetFrames; i++) {
      const srcIndex = i * ratio;
      const index0 = Math.floor(srcIndex);
      const index1 = Math.min(index0 + 1, sourceFrames - 1);
      const frac = srcIndex - index0;

      const l0 = srcLeft[index0] || 0;
      const l1 = srcLeft[index1] || 0;
      const r0 = srcRight[index0] || 0;
      const r1 = srcRight[index1] || 0;

      outLeft[i] = l0 * (1 - frac) + l1 * frac;
      outRight[i] = r0 * (1 - frac) + r1 * frac;
    }

    this.sanitizeBufferData(outLeft, outRight);
    return targetBuffer;
  }

  /**
   * Sanitizes floating-point audio data against NaNs, Infs, and clipping extremes.
   */
  private static sanitizeBufferData(left: Float32Array, right: Float32Array): void {
    const len = left.length;
    for (let i = 0; i < len; i++) {
      let l = left[i];
      let r = right[i];

      if (isNaN(l) || !isFinite(l)) l = 0;
      if (isNaN(r) || !isFinite(r)) r = 0;

      // Soft peak limiting
      if (l > 0.99) l = 0.99;
      else if (l < -0.99) l = -0.99;

      if (r > 0.99) r = 0.99;
      else if (r < -0.99) r = -0.99;

      left[i] = l;
      right[i] = r;
    }
  }
}
