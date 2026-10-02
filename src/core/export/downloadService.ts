/**
 * EXPORT SERVICE - Pobieranie wygenerowanych filmów z IndexedDB
 * Obsługuje: .zip (cały projekt), .mp4 (pojedyncze filmy), batch download
 */

import { localIndexedDB } from '../storage/indexedDBProvider';

interface ExportFormat {
  type: 'mp4' | 'zip' | 'json';
  quality: '720p' | '1080p' | '4k';
  includeProject: boolean;
  filename?: string;
}

/**
 * Pobiera film MP4 z IndexedDB i inicjuje download
 */
export async function downloadRenderBlob(
  projectId: string,
  filename?: string,
  onProgress?: (percent: number) => void
): Promise<{ success: boolean; message: string; blobUrl?: string }> {
  try {
    onProgress?.(10);
    
    const result = await localIndexedDB.getMasterRenderBlob(projectId);
    if (!result || !result.blob) {
      return { 
        success: false, 
        message: 'Film nie znaleziony w pamięci urządzenia. Renderuj najpierw wideo.' 
      };
    }

    onProgress?.(50);
    
    const blob = result.blob;
    const finalFilename = filename || result.meta?.fileName || `wedding_${projectId}_${Date.now()}.mp4`;
    
    // Trigger browser download
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = finalFilename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    onProgress?.(90);
    
    // Keep URL alive for a bit
    setTimeout(() => URL.revokeObjectURL(url), 30000);
    
    onProgress?.(100);
    
    return {
      success: true,
      message: `Film "${finalFilename}" pobrany pomyślnie!`,
      blobUrl: url
    };
  } catch (err: any) {
    console.error('[downloadRenderBlob] Error:', err);
    return {
      success: false,
      message: `Błąd pobierania: ${err?.message || 'Nieznany błąd'}`
    };
  }
}

/**
 * Pobiera projekt jako JSON
 */
export async function downloadProjectAsJson(
  projectId: string,
  projectName: string,
  onProgress?: (percent: number) => void
): Promise<{ success: boolean; message: string }> {
  try {
    onProgress?.(20);
    
    const project = await localIndexedDB.loadProjectDraft(projectId);
    if (!project) {
      return { 
        success: false, 
        message: 'Projekt nie znaleziony' 
      };
    }

    onProgress?.(50);
    
    const json = JSON.stringify(project, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${projectName}_backup_${Date.now()}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    onProgress?.(90);
    setTimeout(() => URL.revokeObjectURL(url), 30000);
    
    onProgress?.(100);
    return { success: true, message: 'Projekt pobrany jako JSON' };
  } catch (err: any) {
    return { success: false, message: `Błąd: ${err?.message}` };
  }
}

/**
 * Eksportuje wiele filmów jako .zip (wymaga biblioteki JSZip)
 */
export async function downloadProjectAsZip(
  projectId: string,
  projectName: string,
  includeProject: boolean = true,
  onProgress?: (percent: number) => void
): Promise<{ success: boolean; message: string }> {
  try {
    // Dynamically import JSZip only when needed
    const JSZip = (await import('jszip')).default;
    
    onProgress?.(10);
    
    const zip = new JSZip();
    
    // Add main render blob
    const renderResult = await localIndexedDB.getMasterRenderBlob(projectId);
    if (renderResult?.blob) {
      const filename = renderResult.meta?.fileName || 'main_render.mp4';
      zip.file(filename, renderResult.blob);
    }
    
    onProgress?.(40);
    
    // Add project JSON as metadata
    if (includeProject) {
      const project = await localIndexedDB.loadProjectDraft(projectId);
      if (project) {
        zip.file('project.json', JSON.stringify(project, null, 2));
      }
    }
    
    onProgress?.(70);
    
    // Generate and download zip
    const zipBlob = await zip.generateAsync({ type: 'blob' });
    const url = URL.createObjectURL(zipBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${projectName}_complete_${Date.now()}.zip`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    onProgress?.(95);
    setTimeout(() => URL.revokeObjectURL(url), 30000);
    
    onProgress?.(100);
    return { success: true, message: 'Plik ZIP pobrany pomyślnie' };
  } catch (err: any) {
    return { success: false, message: `Błąd ZIP: ${err?.message}` };
  }
}

/**
 * Pobiera archiwum wszystkich projektów (backup całej bazy)
 */
export async function downloadAllProjectsBackup(
  onProgress?: (percent: number) => void
): Promise<{ success: boolean; message: string }> {
  try {
    const JSZip = (await import('jszip')).default;
    onProgress?.(5);
    
    const zip = new JSZip();
    const projects = await localIndexedDB.listProjectDrafts();
    
    onProgress?.(15);
    
    for (let i = 0; i < projects.length; i++) {
      const project = await localIndexedDB.loadProjectDraft(projects[i].id);
      if (project) {
        const folder = zip.folder(`project_${projects[i].name || projects[i].id}`);
        folder?.file('data.json', JSON.stringify(project, null, 2));
      }
      onProgress?.(15 + (i / projects.length) * 70);
    }
    
    const zipBlob = await zip.generateAsync({ type: 'blob' });
    const url = URL.createObjectURL(zipBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `wedding_studio_backup_${Date.now()}.zip`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    onProgress?.(95);
    setTimeout(() => URL.revokeObjectURL(url), 30000);
    
    onProgress?.(100);
    return { success: true, message: `Backup ${projects.length} projektów pobrany` };
  } catch (err: any) {
    return { success: false, message: `Błąd backupu: ${err?.message}` };
  }
}

/**
 * Importuje projekt z pliku JSON
 */
export async function importProjectFromJson(
  file: File,
  onProgress?: (percent: number) => void
): Promise<{ success: boolean; message: string; projectId?: string }> {
  try {
    onProgress?.(20);
    
    const text = await file.text();
    const project = JSON.parse(text);
    
    onProgress?.(50);
    
    if (!project.id) {
      project.id = `imported_${Date.now()}`;
    }
    
    await localIndexedDB.saveProjectDraft(project);
    
    onProgress?.(90);
    onProgress?.(100);
    
    return {
      success: true,
      message: `Projekt "${project.name}" zaimportowany pomyślnie`,
      projectId: project.id
    };
  } catch (err: any) {
    return {
      success: false,
      message: `Błąd importu: ${err?.message}`
    };
  }
}

/**
 * Pobiera statystykę przechowywania
 */
export async function getStorageInfo(): Promise<{
  usedMB: number;
  quotaMB: number;
  percentUsed: number;
  availableMB: number;
}> {
  const stats = await localIndexedDB.getStorageStats();
  return {
    usedMB: Math.round(stats.usedBytes / (1024 * 1024) * 100) / 100,
    quotaMB: Math.round(stats.quotaBytes / (1024 * 1024)),
    percentUsed: Math.round(stats.percentUsed),
    availableMB: Math.round(stats.availableBytes / (1024 * 1024) * 100) / 100
  };
}

/**
 * Czyści starsze kopie filmów, pozostawiając tylko ostatnie N
 */
export async function cleanupOldRenders(
  maxRenderSnapshots: number = 3
): Promise<{ cleaned: boolean; removedCount: number }> {
  try {
    // This is a placeholder - full implementation would require tracking multiple renders per project
    return { cleaned: true, removedCount: 0 };
  } catch (err) {
    return { cleaned: false, removedCount: 0 };
  }
}
