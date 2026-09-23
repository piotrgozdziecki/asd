import { MediaClip } from '../../types/project';
import { urlRegistry } from './urlRegistry';
import { localIndexedDB } from '../storage/indexedDBProvider';

/**
 * Robustly resolves a playable/renderable URL for a media clip.
 * 1. Uses in-memory clip.file if available.
 * 2. Preserves active blob, http, https, data, or relative API paths.
 * 3. Restores File & Blob from IndexedDB if needed.
 * 4. Falls back to proxyUrl for video clips.
 * 5. Falls back to thumbnailUrl ONLY for image clips (never for videos).
 */
export async function resolveClipMediaUrl(clip: MediaClip, preferProxy: boolean = false): Promise<string | null> {
  if (!clip) return null;

  // If proxy is explicitly requested (e.g. for lightweight editing/playback) and ready
  if (preferProxy && clip.proxyUrl && clip.proxyUrl.startsWith('blob:')) {
    return clip.proxyUrl;
  }

  // 1. If clip has a live File, ensure objectUrl is active and return it
  if (clip.file) {
    if (!clip.objectUrl || !urlRegistry.isAlive(clip.objectUrl) || clip.objectUrl.startsWith('blob:null') || clip.objectUrl.trim() === '') {
      clip.objectUrl = urlRegistry.create(clip.file);
    }
    return clip.objectUrl;
  }

  let urlToUse = clip.objectUrl || '';

  // If it's a Google Drive stream URL, dynamically inject the fresh access token from sessionStorage
  if (urlToUse && urlToUse.includes('/api/drive/stream/')) {
    const currentToken = typeof window !== 'undefined' ? sessionStorage.getItem('gdrive_access_token') : null;
    if (currentToken) {
      try {
        const urlObj = new URL(urlToUse, typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000');
        urlObj.searchParams.set('accessToken', currentToken);
        urlToUse = urlObj.pathname + urlObj.search;
      } catch (e) {
        console.warn('[mediaResolver] Failed to append fresh token:', e);
      }
    }
    return urlToUse;
  }

  // 2. If urlToUse is external, data URL, or relative API path, it's immediately valid
  if (urlToUse && (
    urlToUse.startsWith('http://') ||
    urlToUse.startsWith('https://') ||
    urlToUse.startsWith('data:') ||
    urlToUse.startsWith('/')
  )) {
    return urlToUse;
  }

  // 3. If objectUrl is an existing blob: URL, verify it is still alive
  if (clip.objectUrl && clip.objectUrl.startsWith('blob:') && !clip.objectUrl.includes('null')) {
    if (urlRegistry.isAlive(clip.objectUrl)) {
      return clip.objectUrl;
    }
  }

  // 4. Try loading from IndexedDB with guaranteed MIME type
  try {
    const blob = await localIndexedDB.getMediaBlob(clip.id);
    if (blob && blob.size > 0) {
      const mime = (blob.type && (blob.type.startsWith('video/') || blob.type.startsWith('image/'))) 
        ? blob.type 
        : (clip.type === 'image' ? 'image/jpeg' : 'video/mp4');
      const typedBlob = new Blob([blob], { type: mime });
      const file = new File([typedBlob], clip.name || (clip.type === 'image' ? 'photo.jpg' : 'video.mp4'), {
        type: mime
      });
      const freshUrl = urlRegistry.create(file);
      clip.file = file;
      clip.objectUrl = freshUrl;
      return freshUrl;
    }
  } catch (e) {
    console.warn(`[mediaResolver] Could not restore blob for clip ${clip.id}:`, e);
  }

  // 5. If it's a Google Drive file with driveFileId, construct stream URL
  if (clip.driveFileId) {
    const token = typeof window !== 'undefined' ? sessionStorage.getItem('gdrive_access_token') : null;
    const driveStream = `/api/drive/stream/${clip.driveFileId}${token ? `?accessToken=${encodeURIComponent(token)}` : ''}`;
    clip.objectUrl = driveStream;
    return driveStream;
  }

  // 6. For video clips: fall back to proxyUrl if original file is inaccessible
  if (clip.type === 'video' && clip.proxyUrl && clip.proxyUrl.startsWith('blob:')) {
    console.warn(`[mediaResolver] Using proxyUrl as fallback for video: ${clip.name}`);
    return clip.proxyUrl;
  }

  // 7. For image clips ONLY: fall back to thumbnailUrl
  if (clip.type === 'image' && clip.thumbnailUrl && clip.thumbnailUrl.length > 0) {
    return clip.thumbnailUrl;
  }

  return null;
}
