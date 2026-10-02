/**
 * LOCAL-ONLY API - No Firebase/Cloud sync
 * Projects are stored exclusively in IndexedDB on the device
 */

import type { ProjectState } from '../../types/project';
import { localIndexedDB } from '../../core/storage/indexedDBProvider';
import { sanitizeProjectForStorage, migrateProjectToLatest } from '../../core/validation/projectMigration';

// Mock Firebase functions - all operations are local
export async function saveProject(project: ProjectState): Promise<void> {
  const sanitized = sanitizeProjectForStorage(project);
  await localIndexedDB.saveProjectDraft(sanitized);
}

export async function loadProject(projectId: string): Promise<ProjectState | null> {
  const project = await localIndexedDB.loadProjectDraft(projectId);
  return project ? migrateProjectToLatest(project) : null;
}

export async function deleteProjectFromCloud(projectId: string = 'main-project'): Promise<void> {
  await localIndexedDB.deleteProjectDraft(projectId);
}

export async function listProjects(): Promise<Array<{ id: string; name: string; updatedAt: string }>> {
  return localIndexedDB.listProjectDrafts();
}
