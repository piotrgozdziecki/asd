import { ClipOrientation } from '../../types/project';
import { urlRegistry } from './urlRegistry';
import { thumbnailCache } from './thumbnailCache';

export interface ProbedMediaMetadata {
  duration: number;
  width: number;
  height: number;
  orientation: ClipOrientation;
  aspectRatio: string;
  fps: number;
  hasAudio: boolean;
  thumbnailUrl?: string;
  thumbnailBlob?: Blob;
  size: number;
}

/**
 * Calculates simplified aspect ratio string like "16:9", "9:16", "4:3", "1:1"
 */
export function calculateAspectRatioString(width: number, height: number): string {
  if (!width || !height) return '16:9';
  const ratio = width / height;

  if (Math.abs(ratio - 16 / 9) < 0.08) return '16:9';
  if (Math.abs(ratio - 9 / 16) < 0.08) return '9:16';
  if (Math.abs(ratio - 4 / 3) < 0.08) return '4:3';
  if (Math.abs(ratio - 3 / 4) < 0.08) return '3:4';
  if (Math.abs(ratio - 1) < 0.08) return '1:1';
  if (Math.abs(ratio - 21 / 9) < 0.1) return '21:9';

  return ratio > 1 ? '16:9' : '9:16';
}

/**
 * Generates a fast compressed thumbnail and probes exact metadata from video
 */
export async function probeVideoMetadata(fileOrBlobOrUrl: Blob | File | string, knownSize?: number): Promise<ProbedMediaMetadata> {
  const isStringUrl = typeof fileOrBlobOrUrl === 'string';
  const objectUrl = isStringUrl ? fileOrBlobOrUrl : urlRegistry.create(fileOrBlobOrUrl);
  const fileSize = isStringUrl ? (knownSize || 0) : fileOrBlobOrUrl.size;

  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.muted = true;
    video.playsInline = true;
    if (typeof objectUrl === 'string' && (objectUrl.startsWith('http://') || objectUrl.startsWith('https://') || objectUrl.startsWith('/'))) {
      video.crossOrigin = 'anonymous';
    }

    const timeoutId = setTimeout(() => {
      cleanup();
      reject(new Error('Przekroczono limit czasu analizy pliku wideo (nieobsługiwany kodek lub uszkodzony plik).'));
    }, 15000);

    const cleanup = () => {
      clearTimeout(timeoutId);
      video.onloadedmetadata = null;
      video.onseeked = null;
      video.onerror = null;
      video.src = '';
      video.load();
      if (!isStringUrl) {
        urlRegistry.release(objectUrl);
      }
    };

    video.onerror = () => {
      cleanup();
      reject(new Error(`Nie udało się odtworzyć kodeka wideo dla pliku.`));
    };

    // Helper to resolve real finite duration (handles Chromium Infinity bug on WebM / streamed MP4)
    const resolveFiniteDuration = async (): Promise<number> => {
      const rawDur = video.duration;
      if (typeof rawDur === 'number' && Number.isFinite(rawDur) && !isNaN(rawDur) && rawDur > 0) {
        return rawDur;
      }

      return new Promise<number>((res) => {
        let isDone = false;
        const complete = (val: number) => {
          if (!isDone) {
            isDone = true;
            video.removeEventListener('timeupdate', onTime);
            res(val);
          }
        };

        const onTime = () => {
          const testDur = video.duration;
          if (Number.isFinite(testDur) && !isNaN(testDur) && testDur > 0) {
            complete(testDur);
          } else {
            try {
              if (video.seekable && video.seekable.length > 0) {
                const end = video.seekable.end(video.seekable.length - 1);
                if (Number.isFinite(end) && end > 0) {
                  complete(end);
                  return;
                }
              }
            } catch (e) {}
          }
        };

        video.addEventListener('timeupdate', onTime);
        
        // Use a more conservative seek for large files or problematic containers
        try {
          // Instead of 1e10, we try to seek to a very large number that is still within reason
          // or rely on the browser's ability to find the end via seekable
          video.currentTime = 999999; 
        } catch (e) {
          complete(10);
        }

        setTimeout(() => {
          try {
            if (video.seekable && video.seekable.length > 0) {
              const end = video.seekable.end(video.seekable.length - 1);
              if (Number.isFinite(end) && end > 0) {
                complete(end);
                return;
              }
            }
          } catch (e) {}
          const durCheck = video.duration;
          complete(Number.isFinite(durCheck) && !isNaN(durCheck) && durCheck > 0 ? durCheck : 10);
        }, 2000);
      });
    };

    video.onloadedmetadata = async () => {
      const width = video.videoWidth || 1920;
      const height = video.videoHeight || 1080;
      const resolvedDuration = await resolveFiniteDuration();
      const duration = Math.max(0.1, Math.round(resolvedDuration * 10) / 10);
      const orientation: ClipOrientation = height > width ? 'portrait' : (width === height ? 'square' : 'landscape');
      const aspectRatio = calculateAspectRatioString(width, height);

      // Web Audio / HTML5 audio check
      const hasAudio = (video as any).mozHasAudio !== undefined 
        ? (video as any).mozHasAudio 
        : Boolean((video as any).audioTracks?.length || (video as any).webkitAudioDecodedByteCount !== 0);

      // Capture high-quality non-black thumbnail via intelligent cache
      try {
        const thumbResult = await thumbnailCache.captureOptimalThumbnail(video, duration);
        cleanup();
        resolve({
          duration,
          width,
          height,
          orientation,
          aspectRatio,
          fps: 30,
          hasAudio,
          thumbnailUrl: thumbResult?.url,
          thumbnailBlob: thumbResult?.blob,
          size: fileSize
        });
      } catch (e) {
        cleanup();
        resolve({
          duration,
          width,
          height,
          orientation,
          aspectRatio,
          fps: 30,
          hasAudio,
          size: fileSize
        });
      }
    };

    video.src = objectUrl;
  });
}

/**
 * Probes photo/image metadata and generates thumbnail
 */
export async function probeImageMetadata(fileOrBlob: Blob | File): Promise<ProbedMediaMetadata> {
  const objectUrl = urlRegistry.create(fileOrBlob);

  return new Promise((resolve, reject) => {
    const img = new Image();
    const timeoutId = setTimeout(() => {
      cleanup();
      reject(new Error('Przekroczono limit czasu analizy zdjęcia.'));
    }, 8000);

    const cleanup = () => {
      clearTimeout(timeoutId);
      img.onload = null;
      img.onerror = null;
      urlRegistry.release(objectUrl);
    };

    img.onerror = () => {
      cleanup();
      reject(new Error('Nie udało się wczytać pliku graficznego.'));
    };

    img.onload = () => {
      const width = img.naturalWidth || 1920;
      const height = img.naturalHeight || 1080;
      const duration = 5; // Default 5 seconds for photo on timeline
      const orientation: ClipOrientation = height > width ? 'portrait' : (width === height ? 'square' : 'landscape');
      const aspectRatio = calculateAspectRatioString(width, height);

      // Create compressed thumbnail
      const canvas = document.createElement('canvas');
      const thumbWidth = 320;
      const thumbHeight = Math.round((height / width) * thumbWidth);
      canvas.width = thumbWidth;
      canvas.height = thumbHeight;

      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(img, 0, 0, thumbWidth, thumbHeight);
        canvas.toBlob((thumbBlob) => {
          let thumbUrl: string | undefined = undefined;
          if (thumbBlob) {
            thumbUrl = urlRegistry.create(thumbBlob);
          }
          cleanup();
          resolve({
            duration,
            width,
            height,
            orientation,
            aspectRatio,
            fps: 30,
            hasAudio: false,
            thumbnailUrl: thumbUrl,
            thumbnailBlob: thumbBlob || undefined,
            size: fileOrBlob.size
          });
        }, 'image/jpeg', 0.75);
      } else {
        cleanup();
        resolve({
          duration,
          width,
          height,
          orientation,
          aspectRatio,
          fps: 30,
          hasAudio: false,
          size: fileOrBlob.size
        });
      }
    };

    img.src = objectUrl;
  });
}
