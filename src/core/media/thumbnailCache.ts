import { urlRegistry } from './urlRegistry';

export interface ThumbnailCacheEntry {
  url: string;
  blob?: Blob;
  lastUsed: number;
  sizeBytes: number;
  isRegisteredBlob: boolean;
}

export interface ThumbnailRequestOptions {
  width?: number;
  height?: number;
  quality?: number;
  priority?: 'high' | 'normal' | 'low';
}

/**
 * ThumbnailCache
 * High performance, memory-bounded LRU cache for video thumbnails and timeline filmstrips.
 * Features:
 * - Strict memory bounds with LRU eviction and automatic URL revocation via urlRegistry
 * - Concurrency-limited background extraction queue (max 2 concurrent decoders) to prevent hardware decoder starvation
 * - In-flight request deduplication to prevent duplicate seeking for the same frame
 * - Specialized lightweight timeline thumbnails (160x90 WebP/JPEG, ~3-4KB) for smooth 60fps scrolling
 */
class ThumbnailCache {
  // LRU cache for individual frame thumbnails: key format `${clipId}_${Math.round(timestamp * 2) / 2}`
  private cache = new Map<string, ThumbnailCacheEntry>();
  
  // Cache for multi-frame filmstrips: key format `${clipId}_strip_${startSec}_${durationSec}_${count}`
  private stripCache = new Map<string, { urls: string[]; lastUsed: number }>();

  // In-flight extraction promises to prevent duplicate work
  private pendingExtractions = new Map<string, Promise<string | null>>();

  // Concurrency limiter for video extraction
  private activeWorkers = 0;
  private readonly MAX_CONCURRENT_EXTRACTIONS = 2;
  private queue: Array<() => Promise<void>> = [];

  // Memory bounds (LRU eviction triggers when these are exceeded)
  private readonly MAX_CACHE_ENTRIES = 150;
  private readonly MAX_CACHE_BYTES = 25 * 1024 * 1024; // 25 MB max memory
  private currentSizeBytes = 0;

  get(key: string): string | undefined {
    const entry = this.cache.get(key);
    if (entry) {
      entry.lastUsed = Date.now();
      return entry.url;
    }
    return undefined;
  }

  set(key: string, url: string, blob?: Blob, isRegisteredBlob: boolean = false): void {
    const estimatedSize = blob ? blob.size : 4096; // ~4KB per compressed thumbnail
    
    // Evict if limits exceeded
    this.ensureCapacity(estimatedSize);

    this.cache.set(key, {
      url,
      blob,
      lastUsed: Date.now(),
      sizeBytes: estimatedSize,
      isRegisteredBlob
    });
    this.currentSizeBytes += estimatedSize;
  }

  has(key: string): boolean {
    return this.cache.has(key);
  }

  getStrip(key: string): string[] | undefined {
    const entry = this.stripCache.get(key);
    if (entry) {
      entry.lastUsed = Date.now();
      return entry.urls;
    }
    return undefined;
  }

  setStrip(key: string, urls: string[]): void {
    if (this.stripCache.size > 50) {
      // Evict oldest strip
      let oldestKey: string | null = null;
      let oldestTime = Infinity;
      for (const [k, v] of this.stripCache.entries()) {
        if (v.lastUsed < oldestTime) {
          oldestTime = v.lastUsed;
          oldestKey = k;
        }
      }
      if (oldestKey) this.stripCache.delete(oldestKey);
    }
    this.stripCache.set(key, { urls, lastUsed: Date.now() });
  }

  /**
   * Memory management: Evicts oldest entries when entry count or byte size exceeds limits
   */
  private ensureCapacity(neededBytes: number): void {
    while (
      (this.cache.size >= this.MAX_CACHE_ENTRIES || (this.currentSizeBytes + neededBytes) > this.MAX_CACHE_BYTES) &&
      this.cache.size > 0
    ) {
      let oldestKey: string | null = null;
      let oldestTime = Infinity;

      for (const [key, entry] of this.cache.entries()) {
        if (entry.lastUsed < oldestTime) {
          oldestTime = entry.lastUsed;
          oldestKey = key;
        }
      }

      if (oldestKey) {
        const entry = this.cache.get(oldestKey);
        if (entry) {
          this.currentSizeBytes = Math.max(0, this.currentSizeBytes - entry.sizeBytes);
          if (entry.isRegisteredBlob && entry.url) {
            try {
              urlRegistry.release(entry.url);
            } catch (e) {
              // ignore
            }
          }
          this.cache.delete(oldestKey);
        }
      } else {
        break;
      }
    }
  }

  /**
   * Generates a cache key for a specific clip and timestamp (quantized to 0.5s intervals)
   */
  getThumbnailKey(clipId: string, timestampSec: number): string {
    const quantized = Math.max(0, Math.round(timestampSec * 2) / 2);
    return `${clipId}_t${quantized.toFixed(1)}`;
  }

  /**
   * Retrieves an already cached thumbnail if available without initiating extraction
   */
  getCachedThumbnail(clipId: string, timestampSec: number): string | null {
    const key = this.getThumbnailKey(clipId, timestampSec);
    return this.get(key) || null;
  }

  /**
   * Asynchronously retrieves or generates a thumbnail at a specific timestamp for a clip.
   * Concurrency-safe, deduplicated, and memory-bounded.
   */
  async getOrRequestThumbnail(
    clipId: string,
    timestampSec: number,
    getMediaUrl: () => Promise<string | null>,
    options?: ThumbnailRequestOptions
  ): Promise<string | null> {
    const key = this.getThumbnailKey(clipId, timestampSec);
    const existing = this.get(key);
    if (existing) return existing;

    // Check if extraction is already in progress for this key
    if (this.pendingExtractions.has(key)) {
      return this.pendingExtractions.get(key)!;
    }

    const extractionPromise = this.scheduleExtraction(async () => {
      try {
        const mediaUrl = await getMediaUrl();
        if (!mediaUrl) return null;

        // If it's an image clip or data URL, we don't need video seeking
        if (mediaUrl.startsWith('data:image/') || /\.(jpe?g|png|webp|gif)$/i.test(mediaUrl)) {
          this.set(key, mediaUrl, undefined, false);
          return mediaUrl;
        }

        const thumb = await this.extractFrameFromVideoUrl(mediaUrl, timestampSec, options);
        if (thumb) {
          this.set(key, thumb.url, thumb.blob, true);
          return thumb.url;
        }
        return null;
      } catch (err) {
        return null;
      } finally {
        this.pendingExtractions.delete(key);
      }
    });

    this.pendingExtractions.set(key, extractionPromise);
    return extractionPromise;
  }

  /**
   * Generates or fetches a multi-frame filmstrip for timeline clips
   */
  async getOrRequestTimelineStrip(
    clipId: string,
    sourceStart: number,
    duration: number,
    getMediaUrl: () => Promise<string | null>,
    count: number = 3
  ): Promise<string[]> {
    const stripKey = `${clipId}_strip_${sourceStart.toFixed(1)}_${duration.toFixed(1)}_${count}`;
    const cachedStrip = this.getStrip(stripKey);
    if (cachedStrip) return cachedStrip;

    const timestamps: number[] = [];
    const step = duration / Math.max(1, count);
    for (let i = 0; i < count; i++) {
      timestamps.push(sourceStart + (step * (i + 0.5)));
    }

    const results = await Promise.all(
      timestamps.map(t => this.getOrRequestThumbnail(clipId, t, getMediaUrl, { width: 140, height: 80, quality: 0.65 }))
    );

    const validUrls = results.filter((url): url is string => Boolean(url));
    if (validUrls.length > 0) {
      this.setStrip(stripKey, validUrls);
    }
    return validUrls;
  }

  /**
   * Queues an extraction task respecting max concurrency
   */
  private scheduleExtraction<T>(task: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const runner = async () => {
        this.activeWorkers++;
        try {
          const res = await task();
          resolve(res);
        } catch (e) {
          reject(e);
        } finally {
          this.activeWorkers--;
          this.processQueue();
        }
      };

      if (this.activeWorkers < this.MAX_CONCURRENT_EXTRACTIONS) {
        runner();
      } else {
        this.queue.push(runner);
      }
    });
  }

  private processQueue(): void {
    if (this.queue.length > 0 && this.activeWorkers < this.MAX_CONCURRENT_EXTRACTIONS) {
      const next = this.queue.shift();
      if (next) next();
    }
  }

  /**
   * Core frame extractor from video URL: handles offscreen video lifecycle, seeking, and canvas capture
   */
  private async extractFrameFromVideoUrl(
    mediaUrl: string,
    timestampSec: number,
    options?: ThumbnailRequestOptions
  ): Promise<{ url: string; blob: Blob } | null> {
    const targetW = options?.width || 160;
    const targetH = options?.height || 90;
    const quality = options?.quality || 0.68;

    return new Promise((resolve) => {
      let isSettled = false;
      const video = document.createElement('video');
      video.muted = true;
      video.playsInline = true;
      video.crossOrigin = 'anonymous';
      video.preload = 'metadata';

      const cleanup = () => {
        if (isSettled) return;
        isSettled = true;
        video.removeAttribute('src');
        video.load();
      };

      const timeoutId = setTimeout(() => {
        cleanup();
        resolve(null);
      }, 4500);

      video.onloadedmetadata = () => {
        const safeTime = Math.max(0.05, Math.min(timestampSec, Math.max(0.1, (video.duration || 10) - 0.1)));
        video.currentTime = safeTime;
      };

      video.onseeked = () => {
        try {
          const canvas = document.createElement('canvas');
          const aspect = (video.videoHeight || 9) / (video.videoWidth || 16);
          canvas.width = targetW;
          canvas.height = Math.round(targetW * aspect) || targetH;

          const ctx = canvas.getContext('2d', { alpha: false, desynchronized: true });
          if (!ctx) {
            clearTimeout(timeoutId);
            cleanup();
            resolve(null);
            return;
          }

          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

          canvas.toBlob((blob) => {
            clearTimeout(timeoutId);
            cleanup();
            if (blob) {
              const url = urlRegistry.create(blob);
              resolve({ url, blob });
            } else {
              resolve(null);
            }
          }, 'image/webp', quality);
        } catch (e) {
          clearTimeout(timeoutId);
          cleanup();
          resolve(null);
        }
      };

      video.onerror = () => {
        clearTimeout(timeoutId);
        cleanup();
        resolve(null);
      };

      video.src = mediaUrl;
    });
  }

  /**
   * Backward-compatible high quality thumbnail capture for metadataProber
   */
  async captureOptimalThumbnail(video: HTMLVideoElement, duration: number): Promise<{ url: string; blob: Blob } | null> {
    const canvas = document.createElement('canvas');
    const width = 360;
    const height = Math.max(180, Math.round((video.videoHeight / (video.videoWidth || 1)) * width));
    canvas.width = width;
    canvas.height = height;

    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) return null;

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

      const sample = ctx.getImageData(Math.floor(width / 4), Math.floor(height / 4), Math.floor(width / 2), Math.floor(height / 2));
      const data = sample.data;
      let totalLum = 0;
      const count = data.length / 4;
      for (let i = 0; i < data.length; i += 4) {
        totalLum += (data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114);
      }
      const avgLum = totalLum / count;

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

  /**
   * Release all cached blobs and clear queues
   */
  clear(): void {
    for (const [, entry] of this.cache.entries()) {
      if (entry.isRegisteredBlob && entry.url) {
        try {
          urlRegistry.release(entry.url);
        } catch (e) {
          // ignore
        }
      }
    }
    this.cache.clear();
    this.stripCache.clear();
    this.pendingExtractions.clear();
    this.queue = [];
    this.currentSizeBytes = 0;
  }
}

export const thumbnailCache = new ThumbnailCache();
