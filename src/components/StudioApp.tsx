import React, { useState, useEffect, useCallback } from 'react';
import { StudioLayout } from './layout/StudioLayout';
import { ProjectOverviewView } from './project/ProjectOverviewView';
import { MediaManager } from './media/MediaManager';
import { MontageView } from './montage/MontageView';
import { ExportView } from './export/ExportView';
import { SettingsDiagnosticsView } from './settings/SettingsDiagnosticsView';
import { AiAssistantModal } from './ai/AiAssistantModal';
import { VoiceRecorderModal } from './VoiceRecorderModal';
import { AiWeddingDirectorModal } from './director/AiWeddingDirectorModal';
import { ProjectHealthPanel } from './director/ProjectHealthPanel';
import { QuickActionsBar } from './director/QuickActionsBar';
import { useProject } from '../hooks/useProject';
import { useAuth } from '../lib/firebase/AuthContext';
import { saveProject, loadProject, deleteProjectFromCloud } from '../lib/firebase/api';
import { onFirestoreConnectionChange, isFirestoreConnected } from '../lib/firebase/config';
import { useStudioToast } from './common/ToastContext';
import { probeVideoMetadata } from '../core/media/metadataProber';
import { urlRegistry } from '../core/media/urlRegistry';
import type { MediaClip, TimelineItem, AudioTrackItem, TextLayer, WeddingChapter } from '../types/project';

export function StudioApp() {
  const [activeTab, setActiveTab] = useState<string>('project');
  const [isAiModalOpen, setIsAiModalOpen] = useState(false);
  const [isDirectorModalOpen, setIsDirectorModalOpen] = useState(false);
  const [isHealthPanelOpen, setIsHealthPanelOpen] = useState(false);
  const [isVoiceRecorderOpen, setIsVoiceRecorderOpen] = useState(false);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [isProcessingFiles, setIsProcessingFiles] = useState(false);
  
  const { 
    project, 
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
    addMarker,
    removeMarker,
    addTextLayer,
    updateTextLayer,
    removeTextLayer,
    addAudioTrack,
    updateAudioTrack,
    removeAudioTrack,
    undo,
    redo,
    canUndo,
    canRedo,
    hasUnsavedChanges,
    recoveryAvailable,
    restoreRecoveredProject,
    dismissRecovery,
    pushState,
    verifyAndRepairAllClipDurations,
    clearFavorites,
    clearAllMedia,
    resetToCleanProject
  } = useProject();
  
  const { user, loading: authLoading, login } = useAuth();
  const [isSaving, setIsSaving] = useState(false);
  const [isDbConnected, setIsDbConnected] = useState(true);
  const toast = useStudioToast();

  // Sync DB connection status
  useEffect(() => {
    setIsDbConnected(isFirestoreConnected);
    return onFirestoreConnectionChange((status: boolean) => setIsDbConnected(status));
  }, []);

  const handleResetProject = useCallback(async () => {
    try {
      urlRegistry.releaseAll();
      await resetToCleanProject();
      if (user) {
        await deleteProjectFromCloud('main-project');
      }
      setActiveTab('project');
      toast.showSuccess("Projekt został zresetowany do stanu początkowego.");
    } catch (err) {
      console.error("Failed to reset project:", err);
    }
  }, [resetToCleanProject, user, toast]);

  const handleClearCache = useCallback(() => {
    urlRegistry.releaseAll();
    toast.showSuccess("Pamięć podręczna została pomyślnie wyczyszczona.");
  }, [toast]);

  // Initial load
  useEffect(() => {
    async function initLoad() {
      if (user && !hasLoaded) {
        try {
          const loadedProject = await loadProject('main-project');
          if (loadedProject) {
            pushState(loadedProject);
          } else {
            pushState({ ...project, id: 'main-project' });
          }
          setHasLoaded(true);
        } catch (err) {
          console.error("Failed to load project from cloud:", err);
          setHasLoaded(true);
        }
      } else if (!authLoading && !user) {
        setHasLoaded(true);
      }
    }
    initLoad();
  }, [user, authLoading, hasLoaded]);

  // Keyboard Shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
        return;
      }

      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && (e.key === 'z' || e.key === 'Z')) {
        e.preventDefault();
        if (canUndo) undo();
        return;
      }

      if (((e.ctrlKey || e.metaKey) && (e.key === 'y' || e.key === 'Y')) || 
          ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 'z' || e.key === 'Z'))) {
        e.preventDefault();
        if (canRedo) redo();
        return;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [canUndo, canRedo, undo, redo]);

  // Save Project
  const handleSave = async () => {
    if (!user) {
      toast.showWarning("Zaloguj się, aby zsynchronizować projekt w chmurze.");
      login();
      return;
    }
    setIsSaving(true);
    try {
      await saveProject({ ...project, id: 'main-project' });
      toast.showSuccess("Projekt został pomyślnie zsynchronizowany z chmurą!");
    } catch (err: any) {
      toast.showError("Błąd podczas zapisywania w chmurze: " + (err?.message || "Nieznany błąd"));
    } finally {
      setIsSaving(false);
    }
  };

  // Add files from device
  const handleAddFiles = useCallback(async (files: FileList | File[]) => {
    const fileArray = Array.from(files);
    if (fileArray.length === 0) return;

    setIsProcessingFiles(true);
    const newClips: MediaClip[] = [];

    for (let i = 0; i < fileArray.length; i++) {
      const file = fileArray[i];
      try {
        const meta = await probeVideoMetadata(file);
        const clipId = `clip_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
        const objectUrl = urlRegistry.create(file);

        const clip: MediaClip = {
          id: clipId,
          file,
          objectUrl,
          type: 'video',
          name: file.name,
          duration: meta.duration,
          width: meta.width,
          height: meta.height,
          aspectRatio: meta.aspectRatio,
          orientation: meta.orientation,
          fps: meta.fps,
          hasAudio: meta.hasAudio,
          size: file.size,
          thumbnailUrl: meta.thumbnailUrl,
          category: 'unassigned',
          status: 'READY',
          isFavorite: false,
          tags: [],
          createdAt: new Date().toISOString()
        };
        newClips.push(clip);
      } catch (e: any) {
        console.error(`Błąd wczytywania ${file.name}:`, e);
        toast.showError(`"${file.name}": Ten film nie może zostać przetworzony w tym środowisku (${e.message || 'Nieobsługiwany format'}).`);
      }
    }

    if (newClips.length > 0) {
      // Create sequence timeline items automatically
      let start = project.timelineItems.length > 0
        ? project.timelineItems[project.timelineItems.length - 1].timelineStart + project.timelineItems[project.timelineItems.length - 1].duration
        : 0;

      const newTimelineItems: TimelineItem[] = newClips.map((clip, idx) => {
        const item: TimelineItem = {
          id: `ti_${Date.now()}_${idx}_${Math.random().toString(36).substring(2, 6)}`,
          clipId: clip.id,
          trackId: 'v1',
          sourceStart: 0,
          sourceEnd: clip.duration,
          timelineStart: start,
          duration: clip.duration,
          speed: 1,
          volume: 1,
          fadeIn: 0,
          fadeOut: 0,
          muted: false,
          scale: 1,
          rotation: 0,
          fitMode: 'fit'
        };
        start += clip.duration;
        return item;
      });

      pushState({
        ...project,
        mediaLibrary: [...project.mediaLibrary, ...newClips],
        timelineItems: [...project.timelineItems, ...newTimelineItems]
      });

      toast.showSuccess(`Pomyślnie dodano ${newClips.length} filmów do projektu.`);
      setActiveTab('media');
    }

    setIsProcessingFiles(false);
  }, [project, pushState, toast]);

  // Resequence timeline clips order
  const handleMoveTimelineItemOrder = useCallback((fromIndex: number, toIndex: number) => {
    const sorted = [...project.timelineItems].sort((a, b) => a.timelineStart - b.timelineStart);
    if (fromIndex < 0 || fromIndex >= sorted.length || toIndex < 0 || toIndex >= sorted.length) return;
    
    const [item] = sorted.splice(fromIndex, 1);
    sorted.splice(toIndex, 0, item);

    let currentStart = 0;
    const resequenced = sorted.map(i => {
      const updated = { ...i, timelineStart: currentStart };
      currentStart += i.duration;
      return updated;
    });

    pushState({
      ...project,
      timelineItems: resequenced
    });
  }, [project, pushState]);

  const handleAddToTimeline = (clip: MediaClip, customRange?: { start: number; end: number }) => {
    const lastItem = project.timelineItems[project.timelineItems.length - 1];
    const newStartTime = lastItem ? lastItem.timelineStart + lastItem.duration : 0;
    
    const sourceStart = customRange ? Math.max(0, customRange.start) : 0;
    const sourceEnd = customRange ? Math.min(clip.duration, customRange.end) : clip.duration;
    const duration = Math.max(0.2, sourceEnd - sourceStart);
    
    const newItem: TimelineItem = {
      id: `ti_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
      clipId: clip.id,
      trackId: 'v1',
      sourceStart,
      sourceEnd,
      timelineStart: newStartTime,
      duration,
      speed: 1,
      volume: 1,
      fadeIn: 0,
      fadeOut: 0,
      muted: false,
      scale: 1,
      rotation: 0,
      fitMode: 'fit',
      transitionIn: 'cut'
    };
    
    addTimelineItem(newItem);
    setActiveTab('montage');
  };

  const handleVoiceoverSave = (audioBlob: Blob, audioUrl: string, durationSeconds: number) => {
    const lastAudio = project.audioTracks[project.audioTracks.length - 1];
    const start = lastAudio ? lastAudio.timelineStart + lastAudio.duration : 0;

    const newVoiceTrack: AudioTrackItem = {
      id: `vo_${Date.now()}`,
      name: `Lektor / Dźwięk (${durationSeconds}s)`,
      objectUrl: audioUrl,
      duration: Math.max(1, durationSeconds),
      sourceStart: 0,
      sourceEnd: Math.max(1, durationSeconds),
      timelineStart: start,
      volume: 1.2,
      fadeIn: 0.5,
      fadeOut: 0.8
    };

    addAudioTrack(newVoiceTrack);
    setActiveTab('montage');
  };

  const handleProjectNameChange = (name: string) => {
    pushState({
      ...project,
      name,
      updatedAt: new Date().toISOString()
    });
  };

  return (
    <>
      <StudioLayout
        activeTab={activeTab}
        onTabChange={setActiveTab}
        projectName={project.name}
        onProjectNameChange={handleProjectNameChange}
        isSaving={isSaving}
        onSave={handleSave}
        hasUnsavedChanges={hasUnsavedChanges}
        canUndo={canUndo}
        canRedo={canRedo}
        onUndo={undo}
        onRedo={redo}
        recoveryAvailable={!!recoveryAvailable}
        onRestoreRecovery={restoreRecoveredProject}
        onDismissRecovery={() => {
          dismissRecovery();
          if (user) {
            deleteProjectFromCloud('main-project').catch(() => {});
          }
        }}
        onResetProject={handleResetProject}
        onOpenAiAssistant={() => setIsAiModalOpen(true)}
        onOpenDirector={() => setIsDirectorModalOpen(true)}
        onToggleHealthPanel={() => setIsHealthPanelOpen(!isHealthPanelOpen)}
        isHealthPanelOpen={isHealthPanelOpen}
        onOpenVoiceRecorder={() => setIsVoiceRecorderOpen(true)}
        isDbConnected={isDbConnected}
      >
        <div className="flex-1 w-full min-h-0 overflow-y-auto overflow-x-hidden relative custom-scrollbar flex flex-col gap-3 p-2 sm:p-4 md:p-6 max-w-full">
          
          {/* Quick Actions Bar */}
          <div className="shrink-0 w-full max-w-full">
            <QuickActionsBar
              project={project}
              onUpdateProject={pushState}
              onOpenDirectorModal={() => setIsDirectorModalOpen(true)}
              onNavigateToExport={() => setActiveTab('export')}
            />
          </div>

          {/* Project Health Floating Drawer */}
          {isHealthPanelOpen && (
            <div className="shrink-0">
              <ProjectHealthPanel 
                project={project}
                onApplyFixedProject={pushState}
                onOpenFullReport={() => setActiveTab('export')}
              />
            </div>
          )}

          {/* TAB 1: PROJEKT (Start Screen & Overview) */}
          {activeTab === 'project' && (
            <div className="min-h-full h-full px-1 md:px-0">
              <ProjectOverviewView
                project={project}
                onNavigateTab={setActiveTab}
                onAddFiles={handleAddFiles}
                onResetProject={handleResetProject}
                onClearCache={handleClearCache}
                isProcessing={isProcessingFiles}
              />
            </div>
          )}

          {/* TAB 2: MEDIA (Media Library & Clip Cards) */}
          {activeTab === 'media' && (
            <div className="min-h-full h-full px-1 md:px-0">
              <MediaManager 
                clips={project.mediaLibrary}
                onAddClips={(newClips) => {
                  addMediaClips(newClips);
                  // Ensure timeline is also populated
                  const start = project.timelineItems.length > 0
                    ? project.timelineItems[project.timelineItems.length - 1].timelineStart + project.timelineItems[project.timelineItems.length - 1].duration
                    : 0;
                  const newItems: TimelineItem[] = newClips.map((c, i) => ({
                    id: `ti_${Date.now()}_${i}`,
                    clipId: c.id,
                    trackId: 'v1',
                    sourceStart: 0,
                    sourceEnd: c.duration,
                    timelineStart: start + (i * c.duration),
                    duration: c.duration,
                    speed: 1,
                    volume: 1,
                    fadeIn: 0,
                    fadeOut: 0,
                    muted: false,
                    scale: 1,
                    rotation: 0,
                    fitMode: 'fit'
                  }));
                  pushState({
                    ...project,
                    mediaLibrary: [...project.mediaLibrary, ...newClips],
                    timelineItems: [...project.timelineItems, ...newItems]
                  });
                }}
                onUpdateClip={updateMediaClip}
                onRemoveClip={(id) => {
                  removeMediaClip(id);
                  // Also remove from timeline
                  const filteredTimeline = project.timelineItems.filter(i => i.clipId !== id);
                  let t = 0;
                  const resequenced = filteredTimeline.map(item => {
                    const up = { ...item, timelineStart: t };
                    t += item.duration;
                    return up;
                  });
                  pushState({
                    ...project,
                    mediaLibrary: project.mediaLibrary.filter(c => c.id !== id),
                    timelineItems: resequenced
                  });
                }}
                onAddToTimeline={handleAddToTimeline}
                onEditClip={(clip) => {
                  handleAddToTimeline(clip);
                  setActiveTab('montage');
                }}
                onMoveClipOrder={handleMoveTimelineItemOrder}
                onRelinkSource={relinkMediaSource}
                onVerifyDurations={verifyAndRepairAllClipDurations}
                onClearFavorites={clearFavorites}
                onClearAllMedia={handleResetProject}
                onResetProject={handleResetProject}
              />
            </div>
          )}

          {/* TAB 3: MONTAŻ (Pro Montage & Sequence Editor) */}
          {activeTab === 'montage' && (
            <div className="h-full rounded-2xl overflow-hidden shadow-2xl border border-[#2A2824]">
              <MontageView 
                project={project}
                onUpdateTimelineItem={updateTimelineItem}
                onDeleteTimelineItem={removeTimelineItem}
                onMoveTimelineItemOrder={handleMoveTimelineItemOrder}
                onNavigateTab={setActiveTab}
              />
            </div>
          )}

          {/* TAB 4: EKSPORT (Final ISO MP4 Export) */}
          {activeTab === 'export' && (
            <div className="h-full rounded-2xl overflow-hidden shadow-2xl border border-[#2A2824]">
              <ExportView 
                project={project} 
                onUpdateProject={pushState}
                onNavigateTab={setActiveTab}
              />
            </div>
          )}

          {/* TAB 5: USTAWIENIA & DIAGNOSTYKA */}
          {activeTab === 'settings' && (
            <div className="h-full rounded-2xl overflow-hidden shadow-2xl border border-[#2A2824]">
              <SettingsDiagnosticsView 
                project={project}
                onUpdateProject={pushState}
                onClearCache={handleClearCache}
                onResetProject={handleResetProject}
              />
            </div>
          )}

        </div>
      </StudioLayout>
      
      {/* AI Assistant Modal */}
      <AiAssistantModal 
        project={project}
        isOpen={isAiModalOpen}
        onClose={() => setIsAiModalOpen(false)}
        onApplyUpdatedProject={(updated) => {
          pushState(updated);
          setActiveTab('montage');
        }}
      />

      {/* AI Wedding Director Modal */}
      <AiWeddingDirectorModal
        isOpen={isDirectorModalOpen}
        onClose={() => setIsDirectorModalOpen(false)}
        project={project}
        onApplyProject={(updated) => {
          pushState(updated);
          setActiveTab('montage');
        }}
        onUpdateClipAnalysis={(clipId, analysis) => {
          updateMediaClip(clipId, { analysis });
        }}
      />

      {/* Voiceover Recorder Modal */}
      <VoiceRecorderModal 
        isOpen={isVoiceRecorderOpen}
        onClose={() => setIsVoiceRecorderOpen(false)}
        onSaveVoiceover={handleVoiceoverSave}
        defaultText="Głos lektora i narracja do filmu..."
      />
    </>
  );
}
