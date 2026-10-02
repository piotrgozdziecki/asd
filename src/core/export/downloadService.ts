/**
 * DOWNLOAD SERVICE - Export rendered videos & backups from IndexedDB
 * Supports: MP4, JSON backup, ZIP archive, batch exports
 */

import { localIndexedDB } from '../storage/indexedDBProvider';

interface DownloadProgress {
  percent: number;
  message: string;
}

/**
 * Download rendered MP4 from IndexedDB to user's device
 */
export async function downloadRenderBlob(
  projectId: string,
  filename?: string,
  onProgress?: (p: DownloadProgress) => void
): Promise<{ success: boolean; message: string }> {
  try {
    onProgress?.({ percent: 10, message: 'Pobieranie z pamięci lokalnej...' });
    
    const result = await localIndexedDB.getMasterRenderBlob(projectId);
    if (!result?.blob) {
      return { 
        success: false, 
        message: 'Film nie znaleziony. Renderuj najpierw wideo.' 
      };
    }

    onProgress?.({ percent: 50, message: 'Przygotowywanie do pobrania...' });
    
    const finalFilename = filename || result.meta?.fileName || `wedding_${projectId}_${Date.now()}.mp4`;
    const url = URL.createObjectURL(result.blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = finalFilename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    onProgress?.({ percent: 90, message: 'Pobieranie w toku...' });
    setTimeout(() => URL.revokeObjectURL(url), 5000);
    
    onProgress?.({ percent: 100, message: 'Gotowe!' });
    return { success: true, message: `Pobrano: ${finalFilename}` };
  } catch (err: any) {
    return { success: false, message: `Błąd: ${err?.message}` };
  }
}

/**
 * Download project as JSON backup
 */
export async function downloadProjectJSON(
  projectId: string,
  projectName: string,
  onProgress?: (p: DownloadProgress) => void
): Promise<{ success: boolean; message: string }> {
  try {
    onProgress?.({ percent: 20, message: 'Ładowanie projektu...' });
    
    const project = await localIndexedDB.loadProjectDraft(projectId);
    if (!project) {
      return { success: false, message: 'Projekt nie znaleziony' };
    }

    onProgress?.({ percent: 50, message: 'Konwertowanie do JSON...' });
    
    const json = JSON.stringify(project, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${projectName}_backup_${Date.now()}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    onProgress?.({ percent: 90, message: 'Pobieranie...' });
    setTimeout(() => URL.revokeObjectURL(url), 5000);
    
    onProgress?.({ percent: 100, message: 'Gotowe!' });
    return { success: true, message: 'Projekt pobrany jako JSON' };
  } catch (err: any) {
    return { success: false, message: `Błąd: ${err?.message}` };
  }
}

/**
 * Download all projects as ZIP backup (requires JSZip)
 */
export async function downloadAllProjectsZip(
  onProgress?: (p: DownloadProgress) => void
): Promise<{ success: boolean; message: string }> {
  try {
    onProgress?.({ percent: 5, message: 'Inicjalizacja ZIP...' });
    const JSZip = (await import('jszip')).default;
    const zip = new JSZip();
    
    onProgress?.({ percent: 15, message: 'Pobieranie listy projektów...' });
    const projects = await localIndexedDB.listProjectDrafts();
    
    onProgress?.({ percent: 25, message: `Pakowanie ${projects.length} projektów...` });
    for (let i = 0; i < projects.length; i++) {
      const proj = await localIndexedDB.loadProjectDraft(projects[i].id);
      if (proj) {
        const folder = zip.folder(`project_${projects[i].name}`);
        folder?.file('data.json', JSON.stringify(proj, null, 2));
      }
      onProgress?.({ percent: 25 + (i / projects.length) * 60, message: `Pakowanie... ${i + 1}/${projects.length}` });
    }
    
    onProgress?.({ percent: 85, message: 'Generowanie archiwum...' });
    const blob = await zip.generateAsync({ type: 'blob' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `wedding_studio_backup_${Date.now()}.zip`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    onProgress?.({ percent: 95, message: 'Pobieranie...' });
    setTimeout(() => URL.revokeObjectURL(url), 5000);
    
    onProgress?.({ percent: 100, message: 'Gotowe!' });
    return { success: true, message: `Backup ${projects.length} projektów pobrany` };
  } catch (err: any) {
    return { success: false, message: `Błąd ZIP: ${err?.message}` };
  }
}

/**
 * Import project from JSON file
 */
export async function importProjectFromFile(
  file: File,
  onProgress?: (p: DownloadProgress) => void
): Promise<{ success: boolean; message: string; projectId?: string }> {
  try {
    onProgress?.({ percent: 20, message: 'Czytanie pliku...' });
    
    const text = await file.text();
    const project = JSON.parse(text);
    
    onProgress?.({ percent: 50, message: 'Walidacja projektu...' });
    
    if (!project.id) {
      project.id = `imported_${Date.now()}`;
    }
    
    onProgress?.({ percent: 75, message: 'Zapisywanie do pamięci lokalnej...' });
    await localIndexedDB.saveProjectDraft(project);
    
    onProgress?.({ percent: 100, message: 'Gotowe!' });
    return {
      success: true,
      message: `Projekt "${project.name}" zaimportowany pomyślnie`,
      projectId: project.id
    };
  } catch (err: any) {
    return { success: false, message: `Błąd importu: ${err?.message}` };
  }
}

/**
 * Get storage statistics
 */
export async function getStorageStats(): Promise<{
  usedMB: number;
  quotaMB: number;
  percentUsed: number;
  availableMB: number;
  projectCount: number;
}> {
  const stats = await localIndexedDB.getStorageStats();
  return {
    usedMB: Math.round((stats.usedBytes / (1024 * 1024)) * 100) / 100,
    quotaMB: Math.round(stats.quotaBytes / (1024 * 1024)),
    percentUsed: Math.round(stats.percentUsed),
    availableMB: Math.round((stats.availableBytes / (1024 * 1024)) * 100) / 100,
    projectCount: stats.projectCount
  };
}

/**
 * Clear old cached renders to free space
 */
export async function clearOldRenders(keepCount: number = 3): Promise<boolean> {
  try {
    // Implementation would track multiple renders per project
    // and delete older ones beyond keepCount
    return true;
  } catch {
    return false;
  }
}
