import { MediaClip } from '../../types/project';
import { urlRegistry } from './urlRegistry';
import { localIndexedDB } from '../storage/indexedDBProvider';

/**
 * Robustly resolves a playable/renderable URL for a media clip.
 * 1. Uses in-memory clip.file if available.
 * 2. Checks if clip.objectUrl is valid (http, https, data, or active blob).
 * 3. Restores File & Blob from IndexedDB if needed.
 * 4. Falls back to thumbnailUrl or null.
 */
export async function resolveClipMediaUrl(clip: MediaClip, preferProxy: boolean = false): Promise<string | null> {
  if (!clip) return null;

  // If proxy is explicitly requested (e.g. for lightweight editing/playback) and ready
  if (preferProxy && clip.proxyUrl && clip.proxyUrl.startsWith('blob:')) {
    return clip.proxyUrl;
  }

  // 1. If clip has a live File, ensure objectUrl is active and return it
  if (clip.file) {
    if (!clip.objectUrl || clip.objectUrl.startsWith('blob:null')) {
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

  // 3. If objectUrl is a blob: URL, verify if it's still alive
  if (clip.objectUrl && clip.objectUrl.startsWith('blob:')) {
    try {
      const res = await fetch(clip.objectUrl, { method: 'HEAD' });
      if (res.ok || res.type === 'basic' || res.status === 200) {
        return clip.objectUrl;
      }
    } catch {
      // Blob URL expired/revoked
      clip.objectUrl = '';
    }
  }

  // 4. Try loading from IndexedDB
  try {
    const blob = await localIndexedDB.getMediaBlob(clip.id);
    if (blob && blob.size > 0) {
      const file = new File([blob], clip.name || 'video.mp4', {
        type: blob.type || (clip.type === 'image' ? 'image/jpeg' : 'video/mp4')
      });
      const freshUrl = urlRegistry.create(file);
      clip.file = file;
      clip.objectUrl = freshUrl;
      return freshUrl;
    }
  } catch (e) {
    console.warn(`[mediaResolver] Could not restore blob for clip ${clip.id}:`, e);
  }

  // 5. Fallback to thumbnailUrl
  if (clip.thumbnailUrl && clip.thumbnailUrl.length > 0) {
    return clip.thumbnailUrl;
  }

  return null;
}
