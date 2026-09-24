import { RenderResult, RenderOptions } from './renderTypes';
import { localIndexedDB } from '../storage/indexedDBProvider';

export interface RenderCheckpointData {
  projectId: string;
  currentFrame: number;
  totalFrames: number;
  percent: number;
  stage: string;
  options: RenderOptions;
  statusMessage?: string;
  timestamp: number;
}

class RenderPersistenceManager {
  private beforeUnloadHandler: ((e: BeforeUnloadEvent) => void) | null = null;
  private isProtected = false;

  /**
   * Activates browser unload protection (prompts confirmation on F5 / Tab close)
   */
  enableUnloadProtection(getMessage?: () => string) {
    if (typeof window === 'undefined' || this.isProtected) return;

    this.beforeUnloadHandler = (e: BeforeUnloadEvent) => {
      const msg = getMessage 
        ? getMessage() 
        : 'Trwa renderowanie filmu ślubnego! Opuszczenie lub odświeżenie strony przerwie proces tworzenia filmu.';
      e.preventDefault();
      e.returnValue = msg;
      return msg;
    };

    window.addEventListener('beforeunload', this.beforeUnloadHandler);
    this.isProtected = true;
  }

  /**
   * Deactivates browser unload protection
   */
  disableUnloadProtection() {
    if (typeof window === 'undefined' || !this.isProtected) return;

    if (this.beforeUnloadHandler) {
      window.removeEventListener('beforeunload', this.beforeUnloadHandler);
      this.beforeUnloadHandler = null;
    }
    this.isProtected = false;
  }

  /**
   * Periodically saves in-progress render checkpoint
   */
  async saveCheckpoint(checkpoint: RenderCheckpointData): Promise<void> {
    try {
      await localIndexedDB.saveRenderCheckpoint(checkpoint);
    } catch (e) {
      console.warn('[renderPersistence] Failed saving checkpoint:', e);
    }
  }

  /**
   * Checks if a previous render was interrupted
   */
  async getInterruptedCheckpoint(projectId: string): Promise<RenderCheckpointData | null> {
    try {
      const cp = await localIndexedDB.getRenderCheckpoint(projectId);
      if (cp && cp.currentFrame > 0 && cp.percent < 100) {
        return cp as RenderCheckpointData;
      }
      return null;
    } catch (e) {
      return null;
    }
  }

  /**
   * Clears checkpoint when render finishes or is cancelled
   */
  async clearCheckpoint(projectId: string): Promise<void> {
    try {
      await localIndexedDB.clearRenderCheckpoint(projectId);
    } catch (e) {}
  }

  /**
   * Saves completed master movie blob to persistent IndexedDB
   */
  async saveCompletedMovie(projectId: string, result: RenderResult, options?: RenderOptions): Promise<void> {
    try {
      await localIndexedDB.saveMasterRenderBlob(projectId, result.blob, {
        fileName: result.fileName,
        duration: result.duration,
        width: result.width,
        height: result.height,
        sizeBytes: result.sizeBytes,
        mimeType: result.mimeType,
        resolution: options?.resolution,
        aspectRatio: options?.aspectRatio,
        verifiedPlayable: result.verifiedPlayable,
        diagnostics: result.diagnostics
      });
    } catch (e) {
      console.warn('[renderPersistence] Failed persisting master movie blob:', e);
    }
  }

  /**
   * Restores previously rendered movie from IndexedDB (e.g. after page refresh)
   */
  async restoreCompletedMovie(projectId: string): Promise<RenderResult | null> {
    try {
      const saved = await localIndexedDB.getMasterRenderBlob(projectId);
      if (!saved || !saved.blob || saved.blob.size === 0) {
        return null;
      }

      const meta = saved.meta || {};
      const blobUrl = URL.createObjectURL(saved.blob);

      return {
        blob: saved.blob,
        mimeType: meta.mimeType || 'video/mp4',
        duration: meta.duration || 0,
        width: meta.width || 1920,
        height: meta.height || 1080,
        sizeBytes: saved.blob.size,
        fileName: meta.fileName || 'Wedding_Film_Master.mp4',
        blobUrl,
        verifiedPlayable: meta.verifiedPlayable ?? true,
        diagnostics: {
          restoredFromCache: true,
          cachedAt: saved.createdAt,
          ...meta.diagnostics
        }
      };
    } catch (e) {
      console.warn('[renderPersistence] Could not restore master movie:', e);
      return null;
    }
  }

  /**
   * Deletes persisted master movie
   */
  async clearCompletedMovie(projectId: string): Promise<void> {
    try {
      await localIndexedDB.clearMasterRenderBlob(projectId);
    } catch (e) {}
  }
}

export const renderPersistence = new RenderPersistenceManager();
