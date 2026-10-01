import { MediaClip, AudioTrackItem } from '../../types/project';
import { urlRegistry } from './urlRegistry';
import { localIndexedDB } from '../storage/indexedDBProvider';

/**
 * Converts a remote/external URL to a local Blob URL, keeping it strictly in CORS-safe space.
 * Caches in IndexedDB automatically to prevent redundant network requests and network errors.
 */
export async function convertToLocalBlobUrl(
  url: string, 
  id: string, 
  name: string, 
  type: 'video' | 'image' | 'audio'
): Promise<string> {
  if (!url) return '';
  if (url.startsWith('blob:') || url.startsWith('data:')) {
    return url;
  }

  try {
    const isGDrive = url.includes('googleapis.com') || url.includes('/api/drive/stream/');
    const headers: HeadersInit = {};
    if (isGDrive) {
      const token = typeof window !== 'undefined' ? sessionStorage.getItem('gdrive_access_token') : null;
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }
    }

    const response = await fetch(url, {
      method: 'GET',
      headers,
      mode: 'cors',
      credentials: 'omit'
    });

    if (response.ok) {
      const blob = await response.blob();
      if (blob && blob.size > 0) {
        let mime = blob.type;
        if (!mime || mime === 'application/octet-stream') {
          if (type === 'image') mime = 'image/jpeg';
          else if (type === 'audio') mime = 'audio/mp3';
          else mime = 'video/mp4';
        }
        const typedBlob = new Blob([blob], { type: mime });
        const file = new File([typedBlob], name, { type: mime });
        const localUrl = urlRegistry.create(file);

        // Save to IndexedDB so subsequent sessions can load locally instantly
        try {
          await localIndexedDB.saveMediaBlob(id, typedBlob);
        } catch (idbErr) {
          console.warn(`[mediaResolver] Failed to cache local blob in IDB for ${id}:`, idbErr);
        }

        return localUrl;
      }
    }
  } catch (err) {
    console.warn(`[mediaResolver] Failed to convert remote source to local blob URL: ${url}`, err);
  }

  return url;
}

export async function resolveClipMediaUrl(clip: MediaClip, preferProxy: boolean = false): Promise<string | null> {
  const rawUrl = await resolveRawClipMediaUrl(clip, preferProxy);
  if (!rawUrl) return null;
  return await convertToLocalBlobUrl(rawUrl, clip.id, clip.name || 'video.mp4', clip.type || 'video');
}

export async function resolveRawClipMediaUrl(clip: MediaClip, preferProxy: boolean = false): Promise<string | null> {
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

  // 3. If objectUrl is an existing blob: URL and alive in registry, use it immediately
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

  // 4.5. If existing objectUrl was a blob: URL and IndexedDB had no copy, keep the blob URL rather than dropping to null
  if (clip.objectUrl && clip.objectUrl.startsWith('blob:') && !clip.objectUrl.includes('null')) {
    return clip.objectUrl;
  }

  // 5. If it's a Google Drive file with driveFileId, fetch directly in the browser to bypass server-side network timeouts
  if (clip.driveFileId) {
    const token = typeof window !== 'undefined' ? sessionStorage.getItem('gdrive_access_token') : null;
    if (token && typeof window !== 'undefined') {
      try {
        console.log(`[mediaResolver] Attempting direct client-side download for Google Drive file: ${clip.driveFileId} (${clip.name})`);
        
        // Check if we already have it in IndexedDB
        let blob = await localIndexedDB.getMediaBlob(clip.id);
        
        if (!blob || blob.size === 0) {
          console.log(`[mediaResolver] File not found in local cache. Downloading from Google Drive API directly...`);
          const response = await fetch(`https://www.googleapis.com/drive/v3/files/${clip.driveFileId}?alt=media`, {
            headers: {
              Authorization: `Bearer ${token}`
            }
          });
          
          if (!response.ok) {
            throw new Error(`Google Drive API responded with status ${response.status}: ${response.statusText}`);
          }
          
          blob = await response.blob();
          
          if (blob && blob.size > 0) {
            // Save to IndexedDB so we don't have to download it again
            await localIndexedDB.saveMediaBlob(clip.id, blob);
            console.log(`[mediaResolver] Successfully cached Google Drive file ${clip.driveFileId} in IndexedDB.`);
          }
        }
        
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
      } catch (err) {
        console.error(`[mediaResolver] Direct client-side Google Drive fetch/cache failed, falling back to server-side stream:`, err);
      }
    }

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

export async function resolveAudioTrackUrl(track: AudioTrackItem): Promise<string | null> {
  const rawUrl = await resolveRawAudioTrackUrl(track);
  if (!rawUrl) return null;
  return await convertToLocalBlobUrl(rawUrl, track.id, track.name || 'audio.mp3', 'audio');
}

export async function resolveRawAudioTrackUrl(track: AudioTrackItem): Promise<string | null> {
  if (!track) return null;

  // 1. In-memory File
  if (track.file) {
    if (!track.objectUrl || !urlRegistry.isAlive(track.objectUrl) || track.objectUrl.startsWith('blob:null')) {
      track.objectUrl = urlRegistry.create(track.file);
    }
    return track.objectUrl;
  }

  // 2. Existing valid blob or remote URL
  if (track.objectUrl) {
    if (track.objectUrl.startsWith('blob:') && !track.objectUrl.includes('null')) {
      if (urlRegistry.isAlive(track.objectUrl)) {
        return track.objectUrl;
      }
    } else if (
      track.objectUrl.startsWith('http://') ||
      track.objectUrl.startsWith('https://') ||
      track.objectUrl.startsWith('data:')
    ) {
      return track.objectUrl;
    }
  }

  // 3. Check IndexedDB
  try {
    const blob = await localIndexedDB.getMediaBlob(track.id);
    if (blob && blob.size > 0) {
      const mime = blob.type || 'audio/mp3';
      const file = new File([blob], track.name || 'audio.mp3', { type: mime });
      const freshUrl = urlRegistry.create(file);
      track.file = file;
      track.objectUrl = freshUrl;
      return freshUrl;
    }
  } catch (e) {
    console.warn(`[mediaResolver] Could not restore audio blob for track ${track.id}:`, e);
  }

  // 4. Google Drive direct client-side download if applicable
  if (track.driveFileId) {
    const token = typeof window !== 'undefined' ? sessionStorage.getItem('gdrive_access_token') : null;
    if (token && typeof window !== 'undefined') {
      try {
        const response = await fetch(`https://www.googleapis.com/drive/v3/files/${track.driveFileId}?alt=media`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (response.ok) {
          const blob = await response.blob();
          if (blob && blob.size > 0) {
            await localIndexedDB.saveMediaBlob(track.id, blob);
            const file = new File([blob], track.name || 'audio.mp3', { type: blob.type || 'audio/mp3' });
            const freshUrl = urlRegistry.create(file);
            track.file = file;
            track.objectUrl = freshUrl;
            return freshUrl;
          }
        }
      } catch (err) {
        console.warn(`[mediaResolver] Could not download audio from Google Drive for track ${track.name}:`, err);
      }
    }
  }

  return track.objectUrl || null;
}

/**
 * Safely retrieves ArrayBuffer for audio decoding (from File, IndexedDB, or URL).
 */
export async function getMediaArrayBuffer(id: string, file?: File | Blob, url?: string): Promise<ArrayBuffer | null> {
  if (file) {
    try {
      return await file.arrayBuffer();
    } catch {}
  }
  // Try IndexedDB
  try {
    const blob = await localIndexedDB.getMediaBlob(id);
    if (blob && blob.size > 0) {
      return await blob.arrayBuffer();
    }
  } catch {}
  // Try URL fetch
  if (url) {
    try {
      const res = await fetch(url);
      if (res.ok) {
        return await res.arrayBuffer();
      }
    } catch {}
  }
  return null;
}
