import { useState, useCallback, useRef, useEffect } from 'react';
import type { 
  ProjectState, 
  MediaClip, 
  TimelineItem, 
  AudioTrackItem, 
  TextLayer, 
  TimelineMarker,
  WeddingChapter,
  TimelineTrack
} from '../types/project';
import { createInitialProject, migrateProjectToLatest, sanitizeProjectForStorage } from '../core/validation/projectMigration';
import { localIndexedDB } from '../core/storage/indexedDBProvider';
import { urlRegistry } from '../core/media/urlRegistry';
import { resolveClipMediaUrl } from '../core/media/mediaResolver';
import { probeVideoMetadata, calculateAspectRatioString } from '../core/media/metadataProber';

export function useProject(initialState?: ProjectState) {
  const [project, setProject] = useState<ProjectState>(() => {
    return initialState ? migrateProjectToLatest(initialState) : createInitialProject();
  });

  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);
  const [recoveryAvailable, setRecoveryAvailable] = useState<ProjectState | null>(null);

  // Undo/Redo stacks (lightweight snapshots without large binary blobs)
  const historyRef = useRef<ProjectState[]>([project]);
  const pointerRef = useRef<number>(0);
  const isInternalUpdateRef = useRef<boolean>(false);

  // Autosave timer
  const autosaveTimerRef = useRef<any>(null);

  // Restore IndexedDB media blobs for clips missing valid objectUrl/file
  const restoreMediaBlobs = useCallback(async (proj: ProjectState): Promise<ProjectState> => {
    if (!proj.mediaLibrary || proj.mediaLibrary.length === 0) return proj;

    let modified = false;
    const updatedClips = await Promise.all(
      proj.mediaLibrary.map(async clip => {
        // If clip has file and valid objectUrl, keep it (or recreate URL if expired)
        if (clip.file) {
          if (!clip.objectUrl || !urlRegistry.isAlive(clip.objectUrl)) {
            clip.objectUrl = urlRegistry.create(clip.file);
            modified = true;
          }
          return clip;
        }

        // Try restoring blob from IndexedDB
        try {
          const blob = await localIndexedDB.getMediaBlob(clip.id);
          if (blob && blob.size > 0) {
            const mime = (blob.type && (blob.type.startsWith('video/') || blob.type.startsWith('image/'))) 
              ? blob.type 
              : (clip.type === 'image' ? 'image/jpeg' : 'video/mp4');
            const typedBlob = new Blob([blob], { type: mime });
            const restoredFile = new File([typedBlob], clip.name || (clip.type === 'image' ? 'photo.jpg' : 'video.mp4'), { type: mime });
            const freshUrl = urlRegistry.create(restoredFile);
            modified = true;
            return {
              ...clip,
              file: restoredFile,
              objectUrl: freshUrl,
              thumbnailUrl: clip.thumbnailUrl || freshUrl
            };
          }
        } catch (e) {
          console.warn(`Failed to restore blob for clip ${clip.id}:`, e);
        }

        return clip;
      })
    );

    if (modified) {
      return {
        ...proj,
        mediaLibrary: updatedClips
      };
    }
    return proj;
  }, []);

  const pushState = useCallback((newState: ProjectState) => {
    // Preserve active in-memory File objects and valid objectUrls in React state
    setProject(prevProject => {
      const prevClipsMap = new Map((prevProject?.mediaLibrary || []).map(c => [c.id, c]));
      const stateWithFiles: ProjectState = {
        ...newState,
        mediaLibrary: (newState.mediaLibrary || []).map(clip => {
          const existing = prevClipsMap.get(clip.id);
          const fileToKeep = clip.file || existing?.file;
          let urlToKeep = clip.objectUrl || existing?.objectUrl;
          
          if (!urlToKeep && fileToKeep) {
            try {
              urlToKeep = urlRegistry.create(fileToKeep);
            } catch (e) {}
          }

          return {
            ...clip,
            file: fileToKeep,
            objectUrl: urlToKeep
          };
        })
      };

      const sanitized = sanitizeProjectForStorage(stateWithFiles);

      const currentPointer = pointerRef.current;
      const history = historyRef.current;
      const newHistory = history.slice(0, currentPointer + 1);
      newHistory.push(sanitized);

      if (newHistory.length > 50) {
        newHistory.shift();
      }

      historyRef.current = newHistory;
      pointerRef.current = newHistory.length - 1;

      // Debounced autosave (1500ms)
      if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);
      autosaveTimerRef.current = setTimeout(async () => {
        try {
          await localIndexedDB.saveProjectDraft(sanitized);
          setHasUnsavedChanges(false);
          setLastSavedAt(new Date().toLocaleTimeString());
        } catch (err) {
          console.warn('Autosave failed:', err);
        }
      }, 1500);

      return stateWithFiles;
    });

    setHasUnsavedChanges(true);
  }, []);

  // Initial recovery check on mount
  useEffect(() => {
    let isMounted = true;
    localIndexedDB.loadProjectDraft('main-project').then(async savedProject => {
      if (!isMounted || !savedProject) return;
      if (savedProject.timelineItems.length > 0 || savedProject.mediaLibrary.length > 0) {
        const fullyRestored = await restoreMediaBlobs(savedProject);
        if (!isMounted) return;

        // Never force-feed old/unwanted clips into user's active session silently!
        // Instead, show the recovery choice banner so the user can restore or discard.
        setRecoveryAvailable(fullyRestored);
      }
    }).catch(() => {});

    return () => {
      isMounted = false;
      if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);
    };
  }, [restoreMediaBlobs]);

  const restoreRecoveredProject = useCallback(() => {
    if (!recoveryAvailable) return;
    setProject(recoveryAvailable);
    historyRef.current = [recoveryAvailable];
    pointerRef.current = 0;
    setRecoveryAvailable(null);
    setHasUnsavedChanges(false);
  }, [recoveryAvailable]);

  const dismissRecovery = useCallback(async () => {
    const draft = recoveryAvailable;
    setRecoveryAvailable(null);
    try {
      await localIndexedDB.deleteProjectDraft('main-project');
      if (draft && draft.mediaLibrary) {
        const clipIds = draft.mediaLibrary.map(c => c.id);
        await localIndexedDB.deleteMediaBlobsForClips(clipIds);
      }
    } catch (err) {
      console.warn('Failed to clear old draft on dismiss:', err);
    }
  }, [recoveryAvailable]);

  const undo = useCallback(() => {
    if (pointerRef.current > 0) {
      pointerRef.current -= 1;
      const targetState = historyRef.current[pointerRef.current];
      setProject(targetState);
      setHasUnsavedChanges(true);
    }
  }, []);

  const redo = useCallback(() => {
    if (pointerRef.current < historyRef.current.length - 1) {
      pointerRef.current += 1;
      const targetState = historyRef.current[pointerRef.current];
      setProject(targetState);
      setHasUnsavedChanges(true);
    }
  }, []);

  // Media Library Actions
  const addMediaClips = useCallback((clips: MediaClip[]) => {
    // Filter out clips that already exist in the library by ID to prevent duplicate keys
    const existingIds = new Set(project.mediaLibrary.map(c => c.id));
    const uniqueNewClips = clips.filter(c => !existingIds.has(c.id));
    
    if (uniqueNewClips.length === 0) return;

    pushState({
      ...project,
      mediaLibrary: [...project.mediaLibrary, ...uniqueNewClips]
    });
  }, [project, pushState]);

  const updateMediaClip = useCallback((id: string, updates: Partial<MediaClip>) => {
    pushState({
      ...project,
      mediaLibrary: project.mediaLibrary.map(clip => 
        clip.id === id ? { ...clip, ...updates } : clip
      )
    });
  }, [project, pushState]);

  const removeMediaClip = useCallback((id: string) => {
    const targetClip = project.mediaLibrary.find(c => c.id === id);
    if (targetClip?.objectUrl) {
      urlRegistry.release(targetClip.objectUrl);
    }
    
    // Also clean up from IndexedDB
    localIndexedDB.deleteMediaBlob(id).catch(() => {});

    pushState({
      ...project,
      mediaLibrary: project.mediaLibrary.filter(clip => clip.id !== id),
      timelineItems: project.timelineItems.filter(item => item.clipId !== id)
    });
  }, [project, pushState]);

  /**
   * Re-link a missing media source without losing timeline position or cuts
   */
  const relinkMediaSource = useCallback((clipId: string, newFile: File) => {
    const objectUrl = urlRegistry.create(newFile);
    pushState({
      ...project,
      mediaLibrary: project.mediaLibrary.map(clip => {
        if (clip.id !== clipId) return clip;
        return {
          ...clip,
          file: newFile,
          objectUrl,
          status: 'used',
          missingReason: undefined
        };
      })
    });
  }, [project, pushState]);

  /**
   * Probes and verifies true video duration across all clips in project.
   * Fixes clips that defaulted to 10s (e.g. from Google Drive or unprobed files)
   * and adjusts matching timeline items.
   */
  const verifyAndRepairAllClipDurations = useCallback(async (): Promise<{
    checked: number;
    updated: number;
    details: { name: string; oldDuration: number; newDuration: number }[];
  }> => {
    const videoClips = project.mediaLibrary.filter(c => c.type === 'video');
    if (videoClips.length === 0) {
      return { checked: 0, updated: 0, details: [] };
    }

    const updates: { clipId: string; oldDuration: number; newDuration: number; width?: number; height?: number }[] = [];

    for (const clip of videoClips) {
      try {
        const url = await resolveClipMediaUrl(clip);
        if (!url) continue;

        const meta = await probeVideoMetadata(url, clip.size);
        if (meta && meta.duration && Number.isFinite(meta.duration)) {
          const diff = Math.abs(clip.duration - meta.duration);
          // If duration differs by > 0.3s or clip duration was the placeholder 10s
          if (diff > 0.3 || clip.duration === 10) {
            updates.push({
              clipId: clip.id,
              oldDuration: clip.duration,
              newDuration: meta.duration,
              width: meta.width,
              height: meta.height
            });
          }
        }
      } catch (err) {
        console.warn(`[verifyClipDurations] Could not probe clip ${clip.name}:`, err);
      }
    }

    if (updates.length > 0) {
      const updateMap = new Map(updates.map(u => [u.clipId, u]));

      const updatedMediaLibrary = project.mediaLibrary.map(clip => {
        const u = updateMap.get(clip.id);
        if (!u) return clip;
        return {
          ...clip,
          duration: u.newDuration,
          width: u.width || clip.width,
          height: u.height || clip.height,
          aspectRatio: (u.width && u.height) ? calculateAspectRatioString(u.width, u.height) : clip.aspectRatio
        };
      });

      const updatedTimelineItems = project.timelineItems.map(item => {
        const u = updateMap.get(item.clipId);
        if (!u) return item;
        // If the timeline item was covering full clip or was at placeholder 10s
        if (Math.abs(item.sourceEnd - u.oldDuration) < 0.2 || item.sourceEnd === 10) {
          const newDuration = Math.max(0.5, (u.newDuration - item.sourceStart) / (item.speed || 1));
          return {
            ...item,
            sourceEnd: u.newDuration,
            duration: newDuration
          };
        }
        return item;
      });

      pushState({
        ...project,
        mediaLibrary: updatedMediaLibrary,
        timelineItems: updatedTimelineItems
      });
    }

    return {
      checked: videoClips.length,
      updated: updates.length,
      details: updates.map(u => {
        const clip = videoClips.find(c => c.id === u.clipId);
        return {
          name: clip?.name || 'Wideo',
          oldDuration: u.oldDuration,
          newDuration: u.newDuration
        };
      })
    };
  }, [project, pushState]);

  const clearFavorites = useCallback(() => {
    pushState({
      ...project,
      mediaLibrary: project.mediaLibrary.map(clip => ({ ...clip, isFavorite: false }))
    });
  }, [project, pushState]);

  const clearAllMedia = useCallback(async (): Promise<ProjectState> => {
    const clipIds = project.mediaLibrary.map(clip => {
      if (clip.objectUrl) urlRegistry.release(clip.objectUrl);
      return clip.id;
    });
    
    try {
      if (clipIds.length > 0) {
        await localIndexedDB.deleteMediaBlobsForClips(clipIds);
      }
      await localIndexedDB.deleteProjectDraft('main-project');
    } catch (e) {}

    const cleared: ProjectState = {
      ...project,
      mediaLibrary: [],
      timelineItems: [], // Clear timeline too as clips are gone
      audioTracks: [] // Clear audio tracks too
    };

    setRecoveryAvailable(null);
    pushState(cleared);

    try {
      await localIndexedDB.saveProjectDraft(sanitizeProjectForStorage(cleared));
    } catch (e) {}

    return cleared;
  }, [project, pushState]);

  const resetToCleanProject = useCallback(async (): Promise<ProjectState> => {
    const clipIds = project.mediaLibrary.map(clip => {
      if (clip.objectUrl) urlRegistry.release(clip.objectUrl);
      return clip.id;
    });

    const fresh = createInitialProject();
    setProject(fresh);
    historyRef.current = [fresh];
    pointerRef.current = 0;
    setRecoveryAvailable(null);
    setHasUnsavedChanges(false);

    try {
      if (clipIds.length > 0) {
        await localIndexedDB.deleteMediaBlobsForClips(clipIds);
      }
      await localIndexedDB.deleteProjectDraft('main-project');
      await localIndexedDB.saveProjectDraft(sanitizeProjectForStorage(fresh));
    } catch (err) {
      console.warn('Failed to wipe draft for fresh project:', err);
    }

    return fresh;
  }, [project]);

  // Timeline Actions
  const addTimelineItem = useCallback((item: TimelineItem) => {
    pushState({
      ...project,
      timelineItems: [...project.timelineItems, item]
    });
  }, [project, pushState]);

  const updateTimelineItem = useCallback((id: string, updates: Partial<TimelineItem>) => {
    pushState({
      ...project,
      timelineItems: project.timelineItems.map(item => 
        item.id === id ? { ...item, ...updates } : item
      )
    });
  }, [project, pushState]);

  const removeTimelineItem = useCallback((id: string) => {
    pushState({
      ...project,
      timelineItems: project.timelineItems.filter(item => item.id !== id)
    });
  }, [project, pushState]);

  const duplicateTimelineItem = useCallback((id: string) => {
    const item = project.timelineItems.find(i => i.id === id);
    if (!item) return;

    const newItem: TimelineItem = {
      ...item,
      id: `ti_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      timelineStart: item.timelineStart + item.duration + 0.1
    };

    pushState({
      ...project,
      timelineItems: [...project.timelineItems, newItem]
    });
  }, [project, pushState]);

  const moveTimelineItem = useCallback((id: string, newStart: number) => {
    pushState({
      ...project,
      timelineItems: project.timelineItems.map(item => {
        if (item.id !== id) return item;
        return {
          ...item,
          timelineStart: Math.max(0, newStart)
        };
      })
    });
  }, [project, pushState]);

  const splitTimelineItem = useCallback((id: string, splitAtSourceTime: number) => {
    const itemIndex = project.timelineItems.findIndex(i => i.id === id);
    if (itemIndex === -1) return;
    
    const item = project.timelineItems[itemIndex];
    if (splitAtSourceTime <= item.sourceStart || splitAtSourceTime >= item.sourceEnd) return;

    const speed = item.speed || 1;
    const duration1 = (splitAtSourceTime - item.sourceStart) / speed;
    const duration2 = (item.sourceEnd - splitAtSourceTime) / speed;

    const newItems = [...project.timelineItems];
    
    // First segment
    newItems[itemIndex] = {
      ...item,
      sourceEnd: splitAtSourceTime,
      duration: duration1
    };

    // Second segment
    const secondHalf: TimelineItem = {
      ...item,
      id: `ti_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      sourceStart: splitAtSourceTime,
      timelineStart: item.timelineStart + duration1,
      duration: duration2
    };

    newItems.splice(itemIndex + 1, 0, secondHalf);
    
    pushState({
      ...project,
      timelineItems: newItems
    });
  }, [project, pushState]);

  // Track Actions
  const updateTrack = useCallback((trackId: string, updates: Partial<TimelineTrack>) => {
    pushState({
      ...project,
      tracks: project.tracks.map(t => t.id === trackId ? { ...t, ...updates } : t)
    });
  }, [project, pushState]);

  // Marker Actions
  const addMarker = useCallback((marker: TimelineMarker) => {
    pushState({
      ...project,
      markers: [...project.markers, marker]
    });
  }, [project, pushState]);

  const removeMarker = useCallback((id: string) => {
    pushState({
      ...project,
      markers: project.markers.filter(m => m.id !== id)
    });
  }, [project, pushState]);

  // Chapter Actions
  const updateChapter = useCallback((id: string, updates: Partial<WeddingChapter>) => {
    pushState({
      ...project,
      chapters: project.chapters.map(c => c.id === id ? { ...c, ...updates } : c)
    });
  }, [project, pushState]);

  // Text Layer Actions
  const addTextLayer = useCallback((layer: TextLayer) => {
    pushState({
      ...project,
      textLayers: [...project.textLayers, layer]
    });
  }, [project, pushState]);

  const updateTextLayer = useCallback((id: string, updates: Partial<TextLayer>) => {
    pushState({
      ...project,
      textLayers: project.textLayers.map(item => 
        item.id === id ? { ...item, ...updates } : item
      )
    });
  }, [project, pushState]);

  const removeTextLayer = useCallback((id: string) => {
    pushState({
      ...project,
      textLayers: project.textLayers.filter(item => item.id !== id)
    });
  }, [project, pushState]);

  // Audio Track Actions
  const addAudioTrack = useCallback((track: AudioTrackItem) => {
    pushState({
      ...project,
      audioTracks: [...project.audioTracks, track]
    });
  }, [project, pushState]);

  const updateAudioTrack = useCallback((id: string, updates: Partial<AudioTrackItem>) => {
    pushState({
      ...project,
      audioTracks: project.audioTracks.map(item => 
        item.id === id ? { ...item, ...updates } : item
      )
    });
  }, [project, pushState]);

  const removeAudioTrack = useCallback((id: string) => {
    pushState({
      ...project,
      audioTracks: project.audioTracks.filter(item => item.id !== id)
    });
  }, [project, pushState]);

  const loadProject = useCallback((newProject: ProjectState) => {
    const migrated = migrateProjectToLatest(newProject);
    setProject(migrated);
    historyRef.current = [migrated];
    pointerRef.current = 0;
    setHasUnsavedChanges(false);
  }, []);

  return {
    project,
    setProject,
    loadProject,
    hasUnsavedChanges,
    lastSavedAt,
    recoveryAvailable,
    restoreRecoveredProject,
    dismissRecovery,
    addMediaClips,
    updateMediaClip,
    removeMediaClip,
    relinkMediaSource,
    addTimelineItem,
    updateTimelineItem,
    removeTimelineItem,
    duplicateTimelineItem,
    moveTimelineItem,
    splitTimelineItem,
    updateTrack,
    addMarker,
    removeMarker,
    updateChapter,
    addTextLayer,
    updateTextLayer,
    removeTextLayer,
    addAudioTrack,
    updateAudioTrack,
    removeAudioTrack,
    undo,
    redo,
    canUndo: pointerRef.current > 0,
    canRedo: pointerRef.current < historyRef.current.length - 1,
    pushState,
    verifyAndRepairAllClipDurations,
    clearFavorites,
    clearAllMedia,
    resetToCleanProject
  };
}
