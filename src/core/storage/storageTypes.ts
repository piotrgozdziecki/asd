import { ProjectState } from '../../types/project';

export interface StorageUsageStats {
  quotaBytes: number;
  usedBytes: number;
  availableBytes: number;
  percentUsed: number;
  projectCount: number;
  mediaBlobCount: number;
  previewCacheBytes: number;
  mediaBytes: number;
}

export interface IStorageProvider {
  id: string;
  name: string;
  
  saveProjectDraft(project: ProjectState): Promise<void>;
  loadProjectDraft(id?: string): Promise<ProjectState | null>;
  listProjectDrafts(): Promise<{ id: string; name: string; updatedAt: string }[]>;
  deleteProjectDraft(id: string): Promise<void>;
  
  saveMediaBlob(clipId: string, blob: Blob): Promise<void>;
  getMediaBlob(clipId: string): Promise<Blob | null>;
  deleteMediaBlob(clipId: string): Promise<void>;

  savePreviewCache(key: string, blob: Blob): Promise<void>;
  getPreviewCache(key: string): Promise<Blob | null>;
  clearPreviewCache(): Promise<void>;

  getStorageStats(): Promise<StorageUsageStats>;
}
