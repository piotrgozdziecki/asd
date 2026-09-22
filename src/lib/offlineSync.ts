import { saveStoryToFirestore } from './firebase';
import { safeStringify, safeParse } from './safeJson';

export interface PendingDirectorNote {
  id: string;
  userId: string;
  storyTitle: string;
  storyConcept?: string;
  musicSuggestion?: string;
  voiceover?: string;
  timeline: { time: string; elementName: string; action: string; directorNote?: string }[];
  updatedAt: string;
}

const LOCAL_STORAGE_KEY = 'wedding_pending_director_notes_queue';
const DB_NAME = 'WeddingStoryboardSyncDB';
const DB_VERSION = 1;
const STORE_NAME = 'pendingNotes';

function openSyncDB(): Promise<IDBDatabase | null> {
  if (typeof window === 'undefined' || !('indexedDB' in window)) {
    return Promise.resolve(null);
  }
  return new Promise((resolve) => {
    try {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = (e: any) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        }
      };
      request.onsuccess = (e: any) => resolve(e.target.result);
      request.onerror = () => resolve(null);
    } catch (_) {
      resolve(null);
    }
  });
}

/**
 * Rejestruje żądanie Background Sync w Service Workerze dla tagu 'sync-director-notes'
 */
export async function registerBackgroundSyncTag(): Promise<boolean> {
  if (typeof window !== 'undefined' && 'serviceWorker' in navigator && 'SyncManager' in window) {
    try {
      const registration = await navigator.serviceWorker.ready;
      await (registration as any).sync.register('sync-director-notes');
      console.log('[Background Sync] Zarejestrowano zadanie tła: sync-director-notes');
      return true;
    } catch (err) {
      console.warn('[Background Sync] Rejestracja w Service Workerze:', err);
    }
  }
  return false;
}

/**
 * Zapisuje notatki reżyserskie w lokalnej kolejce offline (IndexedDB + LocalStorage) i inicjuje Background Sync
 */
export async function queueDirectorNoteForSync(item: PendingDirectorNote): Promise<void> {
  // 1. Zapis w LocalStorage (backup)
  try {
    const currentQueueRaw = localStorage.getItem(LOCAL_STORAGE_KEY);
    let queue: PendingDirectorNote[] = currentQueueRaw ? safeParse<PendingDirectorNote[]>(currentQueueRaw, []) : [];
    queue = queue.filter(q => q.id !== item.id);
    queue.push(item);
    localStorage.setItem(LOCAL_STORAGE_KEY, safeStringify(queue));
  } catch (err) {
    console.warn('[Offline Queue] Błąd zapisywania w LocalStorage:', err);
  }

  // 2. Zapis w IndexedDB
  const db = await openSyncDB();
  if (db) {
    try {
      const tx = db.transaction([STORE_NAME], 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      store.put(item);
    } catch (err) {
      console.warn('[Offline Queue] Błąd zapisywania w IndexedDB:', err);
    }
  }

  // 3. Wysłanie sygnału Background Sync do Service Workera
  await registerBackgroundSyncTag();
}

/**
 * Pobiera zaległe notatki reżyserskie oczekujące na synchronizację z chmurą
 */
export async function getPendingDirectorNotes(): Promise<PendingDirectorNote[]> {
  const db = await openSyncDB();
  if (db) {
    try {
      const items = await new Promise<PendingDirectorNote[]>((resolve) => {
        const tx = db.transaction([STORE_NAME], 'readonly');
        const store = tx.objectStore(STORE_NAME);
        const req = store.getAll();
        req.onsuccess = () => resolve(req.result || []);
        req.onerror = () => resolve([]);
      });
      if (items.length > 0) return items;
    } catch (_) {}
  }

  try {
    const currentQueueRaw = localStorage.getItem(LOCAL_STORAGE_KEY);
    return currentQueueRaw ? safeParse<PendingDirectorNote[]>(currentQueueRaw, []) : [];
  } catch (_) {
    return [];
  }
}

/**
 * Czyszczenie kolejki po pomyślnej wysyłce do Firestore
 */
export async function clearPendingDirectorNotes(): Promise<void> {
  try {
    localStorage.removeItem(LOCAL_STORAGE_KEY);
  } catch (_) {}

  const db = await openSyncDB();
  if (db) {
    try {
      const tx = db.transaction([STORE_NAME], 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      store.clear();
    } catch (_) {}
  }
}

/**
 * Przesyła zgromadzone notatki reżyserskie z kolejki offline do bazy Firestore
 */
export async function syncPendingNotesToFirestore(activeUserId?: string): Promise<{ syncedCount: number; errors: string[] }> {
  const pending = await getPendingDirectorNotes();
  if (!pending || pending.length === 0) {
    return { syncedCount: 0, errors: [] };
  }

  console.log(`[Background Sync] Przetwarzanie ${pending.length} zaległych szkiców notatek reżyserskich...`);
  let syncedCount = 0;
  const errors: string[] = [];

  for (const item of pending) {
    const userIdToUse = item.userId || activeUserId;
    if (!userIdToUse) {
      console.warn(`[Background Sync] Brak ID użytkownika dla pamiątki '${item.storyTitle}'.`);
      continue;
    }

    try {
      await saveStoryToFirestore(userIdToUse, {
        id: item.id,
        title: item.storyTitle,
        concept: item.storyConcept || 'Scenariusz weselny',
        musicSuggestion: item.musicSuggestion || '',
        timeline: item.timeline,
        voiceover: item.voiceover || ''
      });
      syncedCount++;
    } catch (err: any) {
      console.error(`[Background Sync] Błąd przesłania do Firestore dla ${item.id}:`, err);
      errors.push(err.message || String(err));
    }
  }

  if (syncedCount > 0) {
    await clearPendingDirectorNotes();
  }

  return { syncedCount, errors };
}
