import { urlRegistry } from './urlRegistry';

/**
 * ThumbnailCache
 * High performance, memory-safe in-memory and blob cache for video thumbnails.
 * Prevents redundant video seeking and decoding on UI re-renders.
 */
class ThumbnailCache {
  private cache = new Map<string, string>();
  private stripCache = new Map<string, string[]>();

  get(key: string): string | undefined {
    return this.cache.get(key);
  }

  set(key: string, url: string): void {
    this.cache.set(key, url);
  }

  has(key: string): boolean {
    return this.cache.has(key);
  }

  getStrip(key: string): string[] | undefined {
    return this.stripCache.get(key);
  }

  setStrip(key: string, urls: string[]): void {
    this.stripCache.set(key, urls);
  }

  clear(): void {
    this.cache.clear();
    this.stripCache.clear();
  }

  /**
   * Generates a high quality thumbnail from a video element, intelligently avoiding pure black/dark intro frames
   */
  async captureOptimalThumbnail(video: HTMLVideoElement, duration: number): Promise<{ url: string; blob: Blob } | null> {
    const canvas = document.createElement('canvas');
    const width = 360;
    const height = Math.max(180, Math.round((video.videoHeight / (video.videoWidth || 1)) * width));
    canvas.width = width;
    canvas.height = height;

    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) return null;

    // Potential sample points: 15%, 35%, 55%, 1s
    const candidateTimes = [
      Math.min(Math.max(0.5, duration * 0.15), Math.max(0.2, duration - 0.2)),
      Math.min(Math.max(1.0, duration * 0.35), Math.max(0.2, duration - 0.2)),
      Math.min(Math.max(1.5, duration * 0.55), Math.max(0.2, duration - 0.2))
    ];

    for (const targetTime of candidateTimes) {
      video.currentTime = targetTime;
      await new Promise<void>((r) => {
        const onSeek = () => {
          video.removeEventListener('seeked', onSeek);
          r();
        };
        video.addEventListener('seeked', onSeek);
        setTimeout(r, 600);
      });

      ctx.drawImage(video, 0, 0, width, height);

      // Check luminance on downscaled 16x16 center sample
      const sample = ctx.getImageData(Math.floor(width / 4), Math.floor(height / 4), Math.floor(width / 2), Math.floor(height / 2));
      const data = sample.data;
      let totalLum = 0;
      const count = data.length / 4;
      for (let i = 0; i < data.length; i += 4) {
        totalLum += (data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114);
      }
      const avgLum = totalLum / count;

      // If brightness is greater than threshold, frame is good!
      if (avgLum > 18 || targetTime === candidateTimes[candidateTimes.length - 1]) {
        break;
      }
    }

    return new Promise((resolve) => {
      canvas.toBlob((blob) => {
        if (!blob) {
          resolve(null);
          return;
        }
        const url = urlRegistry.create(blob);
        resolve({ url, blob });
      }, 'image/jpeg', 0.82);
    });
  }
}

export const thumbnailCache = new ThumbnailCache();
