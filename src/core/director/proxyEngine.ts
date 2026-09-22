import { MediaClip } from '../../types/project';
import { localIndexedDB } from '../storage/indexedDBProvider';
import { urlRegistry } from '../media/urlRegistry';
import { resolveClipMediaUrl } from '../media/mediaResolver';

export interface ProxyProgressCallback {
  (progressPercent: number, statusMessage: string): void;
}

/**
 * Generates a lightweight 540p proxy video for preview and editing.
 * Reduces memory usage and CPU load when editing dozens of 4K/1080p clips.
 */
export async function generateClipProxy(
  clip: MediaClip,
  signal?: AbortSignal,
  onProgress?: (progress: number) => void
): Promise<{ blob: Blob; url: string }> {
  // Check if proxy already cached in IndexedDB
  const cacheKey = `proxy_${clip.id}`;
  try {
    const cachedBlob = await localIndexedDB.getPreviewCache(cacheKey);
    if (cachedBlob && cachedBlob.size > 0) {
      const url = urlRegistry.create(cachedBlob);
      return { blob: cachedBlob, url };
    }
  } catch (e) {
    console.warn('Cache lookup failed for proxy:', e);
  }

  // If clip is image or audio, proxy is simply the original or resized image
  if (clip.type === 'image' || clip.type === 'audio') {
    const origUrl = await resolveClipMediaUrl(clip);
    if (!origUrl) throw new Error('Nie można załadować pliku');
    const res = await fetch(origUrl);
    const blob = await res.blob();
    return { blob, url: origUrl };
  }

  // Resolve source video URL (always original)
  const sourceUrl = await resolveClipMediaUrl(clip);
  if (!sourceUrl) {
    throw new Error(`Brak pliku źródłowego dla klipu "${clip.name}"`);
  }

  return new Promise<{ blob: Blob; url: string }>((resolve, reject) => {
    const video = document.createElement('video');
    video.src = sourceUrl;
    video.muted = true;
    video.playsInline = true;
    video.crossOrigin = 'anonymous';

    const isPortrait = clip.height > clip.width;
    const targetWidth = isPortrait ? 540 : 960;
    const targetHeight = isPortrait ? 960 : 540;

    const canvas = document.createElement('canvas');
    canvas.width = targetWidth;
    canvas.height = targetHeight;
    const ctx = canvas.getContext('2d');

    if (!ctx) {
      reject(new Error('Nie można utworzyć kontekstu 2D Canvas'));
      return;
    }

    let recorder: MediaRecorder | null = null;
    const chunks: Blob[] = [];
    let isCancelled = false;
    let animId: number | null = null;

    const cleanup = () => {
      if (animId) cancelAnimationFrame(animId);
      video.pause();
      video.removeAttribute('src');
      video.load();
    };

    if (signal) {
      signal.addEventListener('abort', () => {
        isCancelled = true;
        cleanup();
        reject(new Error('Generowanie proxy zostało anulowane'));
      });
    }

    video.onloadedmetadata = () => {
      if (isCancelled) return;

      const duration = Math.max(0.5, clip.duration || video.duration);
      // Canvas capture stream at 24fps
      const stream = canvas.captureStream(24);

      // Try preferred lightweight mime types
      let mimeType = 'video/webm;codecs=vp8';
      if (!MediaRecorder.isTypeSupported(mimeType)) {
        mimeType = 'video/webm';
      }
      if (!MediaRecorder.isTypeSupported(mimeType)) {
        mimeType = '';
      }

      try {
        recorder = new MediaRecorder(stream, {
          mimeType: mimeType || undefined,
          videoBitsPerSecond: 800_000 // 800 kbps for lightweight proxy
        });
      } catch {
        recorder = new MediaRecorder(stream);
      }

      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) chunks.push(e.data);
      };

      recorder.onstop = async () => {
        cleanup();
        const proxyBlob = new Blob(chunks, { type: chunks[0]?.type || 'video/webm' });
        try {
          await localIndexedDB.savePreviewCache(cacheKey, proxyBlob);
        } catch (e) {
          console.warn('Failed to persist proxy to IndexedDB:', e);
        }
        const proxyUrl = urlRegistry.create(proxyBlob);
        resolve({ blob: proxyBlob, url: proxyUrl });
      };

      recorder.start(100);

      // Playback loop to draw frames into canvas
      video.currentTime = 0;
      video.playbackRate = 2.0; // 2x speed for fast proxy generation
      video.play().catch(() => {});

      const drawLoop = () => {
        if (isCancelled) return;

        if (video.ended || video.currentTime >= duration) {
          if (recorder && recorder.state === 'recording') {
            recorder.stop();
          }
          return;
        }

        ctx.drawImage(video, 0, 0, targetWidth, targetHeight);

        if (onProgress) {
          const p = Math.min(99, Math.round((video.currentTime / duration) * 100));
          onProgress(p);
        }

        animId = requestAnimationFrame(drawLoop);
      };

      animId = requestAnimationFrame(drawLoop);
    };

    video.onerror = () => {
      cleanup();
      reject(new Error(`Nie udało się odtworzyć wideo do wygenerowania proxy`));
    };
  });
}

/**
 * Ensures a clip has a ready proxy, checking IndexedDB cache first.
 */
export async function ensureClipProxy(clip: MediaClip): Promise<string | null> {
  const cacheKey = `proxy_${clip.id}`;
  try {
    const cachedBlob = await localIndexedDB.getPreviewCache(cacheKey);
    if (cachedBlob && cachedBlob.size > 0) {
      return urlRegistry.create(cachedBlob);
    }
  } catch (e) {
    console.warn('Failed to check proxy cache:', e);
  }

  // Generate proxy if not found
  try {
    const { url } = await generateClipProxy(clip);
    return url;
  } catch (err) {
    console.warn(`Could not generate proxy for ${clip.name}, falling back to original:`, err);
    return null;
  }
}

/**
 * Batch generates lightweight proxies for all video clips.
 */
export async function batchGenerateProxies(
  clips: MediaClip[],
  signal?: AbortSignal,
  onProgress?: ProxyProgressCallback
): Promise<{ successCount: number; failedCount: number }> {
  let successCount = 0;
  let failedCount = 0;

  const videoClips = clips.filter(c => c.type === 'video');
  const total = videoClips.length;

  for (let i = 0; i < total; i++) {
    if (signal?.aborted) {
      throw new Error('Generowanie proxy zostało przerwane');
    }

    const clip = videoClips[i];
    const overallPercent = Math.round((i / total) * 100);

    if (onProgress) {
      onProgress(overallPercent, `Generowanie proxy [${i + 1}/${total}]: "${clip.name}" (540p)`);
    }

    try {
      const { url } = await generateClipProxy(clip, signal, (clipPercent) => {
        if (onProgress) {
          const finePercent = Math.round(((i + (clipPercent / 100)) / total) * 100);
          onProgress(finePercent, `Generowanie proxy [${i + 1}/${total}]: "${clip.name}" (${clipPercent}%)`);
        }
      });
      clip.proxyUrl = url;
      clip.isProxyReady = true;
      successCount++;
    } catch (err) {
      console.warn(`Proxy failed for ${clip.name}:`, err);
      failedCount++;
    }
  }

  if (onProgress) {
    onProgress(100, `Zakończono: ${successCount} proxy wygenerowane.`);
  }

  return { successCount, failedCount };
}
