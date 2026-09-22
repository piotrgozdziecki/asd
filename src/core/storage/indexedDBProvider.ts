import { ProjectState } from '../../types/project';
import { IStorageProvider, StorageUsageStats } from './storageTypes';
import { migrateProjectToLatest, sanitizeProjectForStorage } from '../validation/projectMigration';

const DB_NAME = 'wedding_studio_db';
const DB_VERSION = 1;

const STORES = {
  PROJECTS: 'projects',
  MEDIA_BLOBS: 'media_blobs',
  PREVIEW_CACHE: 'preview_cache'
};

export class IndexedDBStorageProvider implements IStorageProvider {
  id = 'indexed_db';
  name = 'Pamięć lokalna urządzenia (IndexedDB)';

  private dbPromise: Promise<IDBDatabase> | null = null;

  private getDB(): Promise<IDBDatabase> {
    if (this.dbPromise) return this.dbPromise;

    this.dbPromise = new Promise((resolve, reject) => {
      if (typeof window === 'undefined' || !window.indexedDB) {
        reject(new Error('IndexedDB nie jest obsługiwany w tej przeglądarce.'));
        return;
      }

      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = (event) => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORES.PROJECTS)) {
          db.createObjectStore(STORES.PROJECTS, { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains(STORES.MEDIA_BLOBS)) {
          db.createObjectStore(STORES.MEDIA_BLOBS, { keyPath: 'clipId' });
        }
        if (!db.objectStoreNames.contains(STORES.PREVIEW_CACHE)) {
          db.createObjectStore(STORES.PREVIEW_CACHE, { keyPath: 'key' });
        }
      };

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error('Błąd otwierania IndexedDB'));
    });

    return this.dbPromise;
  }

  async saveProjectDraft(project: ProjectState): Promise<void> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      try {
        const tx = db.transaction(STORES.PROJECTS, 'readwrite');
        const store = tx.objectStore(STORES.PROJECTS);
        
        // Clean project state before saving to avoid cyclic references or raw Blobs in JSON
        const serialized = sanitizeProjectForStorage(project);

        const req = store.put(serialized);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      } catch (err) {
        reject(err);
      }
    });
  }

  async loadProjectDraft(id: string = 'main-project'): Promise<ProjectState | null> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORES.PROJECTS, 'readonly');
      const store = tx.objectStore(STORES.PROJECTS);
      const req = store.get(id);

      req.onsuccess = () => {
        if (!req.result) {
          resolve(null);
          return;
        }
        try {
          const migrated = migrateProjectToLatest(req.result);
          resolve(migrated);
        } catch (err) {
          console.error('Error migrating loaded project from IDB:', err);
          resolve(null);
        }
      };
      req.onerror = () => reject(req.error);
    });
  }

  async listProjectDrafts(): Promise<{ id: string; name: string; updatedAt: string }[]> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORES.PROJECTS, 'readonly');
      const store = tx.objectStore(STORES.PROJECTS);
      const req = store.getAll();

      req.onsuccess = () => {
        const list = (req.result || []).map((p: any) => ({
          id: p.id,
          name: p.name || 'Bez nazwy',
          updatedAt: p.updatedAt || p.createdAt || new Date().toISOString()
        }));
        resolve(list);
      };
      req.onerror = () => reject(req.error);
    });
  }

  async deleteProjectDraft(id: string): Promise<void> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORES.PROJECTS, 'readwrite');
      const store = tx.objectStore(STORES.PROJECTS);
      const req = store.delete(id);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }

  async saveMediaBlob(clipId: string, blob: Blob): Promise<void> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORES.MEDIA_BLOBS, 'readwrite');
      const store = tx.objectStore(STORES.MEDIA_BLOBS);
      const req = store.put({ clipId, blob, updatedAt: Date.now() });
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }

  async getMediaBlob(clipId: string): Promise<Blob | null> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORES.MEDIA_BLOBS, 'readonly');
      const store = tx.objectStore(STORES.MEDIA_BLOBS);
      const req = store.get(clipId);
      req.onsuccess = () => resolve(req.result ? req.result.blob : null);
      req.onerror = () => reject(req.error);
    });
  }

  async deleteMediaBlob(clipId: string): Promise<void> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORES.MEDIA_BLOBS, 'readwrite');
      const store = tx.objectStore(STORES.MEDIA_BLOBS);
      const req = store.delete(clipId);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }

  async deleteMediaBlobsForClips(clipIds: string[]): Promise<void> {
    if (!clipIds || clipIds.length === 0) return;
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORES.MEDIA_BLOBS, 'readwrite');
      const store = tx.objectStore(STORES.MEDIA_BLOBS);
      for (const id of clipIds) {
        store.delete(id);
      }
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  async clearAllMediaBlobs(): Promise<void> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORES.MEDIA_BLOBS, 'readwrite');
      const store = tx.objectStore(STORES.MEDIA_BLOBS);
      const req = store.clear();
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }

  async savePreviewCache(key: string, blob: Blob): Promise<void> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORES.PREVIEW_CACHE, 'readwrite');
      const store = tx.objectStore(STORES.PREVIEW_CACHE);
      const req = store.put({ key, blob, createdAt: Date.now() });
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }

  async getPreviewCache(key: string): Promise<Blob | null> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORES.PREVIEW_CACHE, 'readonly');
      const store = tx.objectStore(STORES.PREVIEW_CACHE);
      const req = store.get(key);
      req.onsuccess = () => resolve(req.result ? req.result.blob : null);
      req.onerror = () => reject(req.error);
    });
  }

  async clearPreviewCache(): Promise<void> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORES.PREVIEW_CACHE, 'readwrite');
      const store = tx.objectStore(STORES.PREVIEW_CACHE);
      const req = store.clear();
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }

  async getStorageStats(): Promise<StorageUsageStats> {
    let quotaBytes = 1024 * 1024 * 1024; // Default 1GB estimate
    let usedBytes = 0;

    if (typeof navigator !== 'undefined' && navigator.storage && navigator.storage.estimate) {
      try {
        const est = await navigator.storage.estimate();
        if (est.quota) quotaBytes = est.quota;
        if (est.usage) usedBytes = est.usage;
      } catch (e) {
        console.warn('Storage estimate not supported', e);
      }
    }

    // Read draft counts and preview cache size
    let projectCount = 0;
    let mediaBlobCount = 0;
    try {
      const db = await this.getDB();
      const pTx = db.transaction(STORES.PROJECTS, 'readonly');
      const pReq = pTx.objectStore(STORES.PROJECTS).count();
      projectCount = await new Promise(res => { pReq.onsuccess = () => res(pReq.result || 0); });

      const mTx = db.transaction(STORES.MEDIA_BLOBS, 'readonly');
      const mReq = mTx.objectStore(STORES.MEDIA_BLOBS).count();
      mediaBlobCount = await new Promise(res => { mReq.onsuccess = () => res(mReq.result || 0); });
    } catch (e) {
      // Non-blocking
    }

    const availableBytes = Math.max(0, quotaBytes - usedBytes);
    const percentUsed = quotaBytes > 0 ? (usedBytes / quotaBytes) * 100 : 0;

    return {
      quotaBytes,
      usedBytes,
      availableBytes,
      percentUsed,
      projectCount,
      mediaBlobCount,
      previewCacheBytes: 0,
      mediaBytes: usedBytes
    };
  }
}

export const localIndexedDB = new IndexedDBStorageProvider();
