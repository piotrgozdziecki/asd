import React, { useState, useEffect, useCallback } from 'react';
import { StudioLayout } from './layout/StudioLayout';
import { MediaManager } from './media/MediaManager';
import { EditorView } from './editor/EditorView';
import { ExportView } from './export/ExportView';
import { PreviewView } from './preview/PreviewView';
import { QuickMontageView } from './quickmontage/QuickMontageView';
import { ChaptersManager } from './chapters/ChaptersManager';
import { AiAssistantModal } from './ai/AiAssistantModal';
import { VoiceRecorderModal } from './VoiceRecorderModal';
import { AiWeddingDirectorModal } from './director/AiWeddingDirectorModal';
import { ProjectHealthPanel } from './director/ProjectHealthPanel';
import { QuickActionsBar } from './director/QuickActionsBar';
import { useProject } from '../hooks/useProject';
import { useAuth } from '../lib/firebase/AuthContext';
import { saveProject, loadProject, deleteProjectFromCloud } from '../lib/firebase/api';
import { onFirestoreConnectionChange, isFirestoreConnected } from '../lib/firebase/config';
import type { MediaClip, TimelineItem, AudioTrackItem, TextLayer, WeddingChapter } from '../types/project';

export function StudioApp() {
  const [activeTab, setActiveTab] = useState<string>('media');
  const [isAiModalOpen, setIsAiModalOpen] = useState(false);
  const [isDirectorModalOpen, setIsDirectorModalOpen] = useState(false);
  const [isHealthPanelOpen, setIsHealthPanelOpen] = useState(false);
  const [isVoiceRecorderOpen, setIsVoiceRecorderOpen] = useState(false);
  const [hasLoaded, setHasLoaded] = useState(false);
  
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

  // Sync DB connection status
  useEffect(() => {
    setIsDbConnected(isFirestoreConnected);
    return onFirestoreConnectionChange((status: boolean) => setIsDbConnected(status));
  }, []);

  const handleResetProject = useCallback(async () => {
    try {
      await resetToCleanProject();
      if (user) {
        await deleteProjectFromCloud('main-project');
      }
    } catch (err) {
      console.error("Failed to reset project:", err);
    }
  }, [resetToCleanProject, user]);

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

  // Global Keyboard Shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger when user is typing in input or textarea
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
        return;
      }

      // Ctrl+Z: Undo
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && (e.key === 'z' || e.key === 'Z')) {
        e.preventDefault();
        if (canUndo) undo();
        return;
      }

      // Ctrl+Y or Ctrl+Shift+Z: Redo
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

  const handleSave = async () => {
    if (!user) {
      alert("Zaloguj się, aby zsynchronizować projekt w chmurze.");
      login();
      return;
    }
    setIsSaving(true);
    try {
      await saveProject({ ...project, id: 'main-project' });
    } catch (err: any) {
      alert("Błąd podczas zapisywania w chmurze: " + err?.message);
    } finally {
      setIsSaving(false);
    }
  };

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
      transitionIn: 'cut'
    };
    
    addTimelineItem(newItem);
    setActiveTab('timeline');
  };

  const handleVoiceoverSave = (audioBlob: Blob, audioUrl: string, durationSeconds: number) => {
    const lastAudio = project.audioTracks[project.audioTracks.length - 1];
    const start = lastAudio ? lastAudio.timelineStart + lastAudio.duration : 0;

    const newVoiceTrack: AudioTrackItem = {
      id: `vo_${Date.now()}`,
      name: `Lektor / Przysięga (${durationSeconds}s)`,
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
    setActiveTab('timeline');
  };

  const handleProjectNameChange = (name: string) => {
    pushState({
      ...project,
      name,
      updatedAt: new Date().toISOString()
    });
  };

  const handleUpdateChapters = (chapters: WeddingChapter[]) => {
    pushState({
      ...project,
      chapters,
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
        <div className="flex-1 w-full h-full p-2 sm:p-4 md:p-6 overflow-y-auto overflow-x-hidden relative custom-scrollbar flex flex-col gap-3">
          
          {/* Quick Actions Bar - Director Suite */}
          <div className="shrink-0 mt-14 md:mt-0">
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

          {/* TAB 1: Media Library */}
          {activeTab === 'media' && (
            <div className="min-h-full h-full px-1 md:px-0">
              <MediaManager 
                clips={project.mediaLibrary}
                onAddClips={addMediaClips}
                onUpdateClip={updateMediaClip}
                onRemoveClip={removeMediaClip}
                onAddToTimeline={handleAddToTimeline}
                onRelinkSource={relinkMediaSource}
                onVerifyDurations={verifyAndRepairAllClipDurations}
                onClearFavorites={clearFavorites}
                onClearAllMedia={handleResetProject}
                onResetProject={handleResetProject}
              />
            </div>
          )}

          {/* TAB 2: Quick Montage & Stitching Studio */}
          {activeTab === 'quick' && (
            <div className="h-full rounded-2xl overflow-hidden shadow-2xl border border-[#2A2824] mt-14 md:mt-0">
              <QuickMontageView 
                project={project}
                onApplyMontage={(newState, targetTab = 'preview') => {
                  pushState(newState);
                  setActiveTab(targetTab);
                }}
                onSwitchToProMode={() => setActiveTab('timeline')}
              />
            </div>
          )}
          
          {/* TAB 3: Pro Timeline Editor */}
          {activeTab === 'timeline' && (
            <div className="h-full rounded-2xl overflow-hidden shadow-2xl border border-[#2A2824] mt-14 md:mt-0">
              <EditorView 
                project={project}
                onUpdateTimelineItem={updateTimelineItem}
                onSplitTimelineItem={splitTimelineItem}
                onDuplicateTimelineItem={duplicateTimelineItem}
                onDeleteTimelineItem={removeTimelineItem}
                onMoveTimelineItem={moveTimelineItem}
                onAddMarker={addMarker}
                onDeleteMarker={removeMarker}
                onAddTextLayer={addTextLayer}
                onUpdateTextLayer={updateTextLayer}
                onDeleteTextLayer={removeTextLayer}
                onAddAudioTrack={addAudioTrack}
                onUpdateAudioTrack={updateAudioTrack}
                onDeleteAudioTrack={removeAudioTrack}
              />
            </div>
          )}

          {/* TAB 4: Wedding Chapters */}
          {activeTab === 'chapters' && (
            <div className="h-full rounded-2xl overflow-hidden shadow-2xl border border-[#2A2824] mt-14 md:mt-0 max-w-4xl mx-auto">
              <ChaptersManager 
                project={project}
                onUpdateChapters={handleUpdateChapters}
                onAddTextLayer={addTextLayer}
                onSeek={(time) => {
                  setActiveTab('preview');
                }}
              />
            </div>
          )}

          {/* TAB 5: Preview */}
          {activeTab === 'preview' && (
            <div className="h-full rounded-2xl overflow-hidden shadow-2xl border border-[#2A2824] mt-14 md:mt-0">
              <PreviewView project={project} />
            </div>
          )}

          {/* TAB 6: Export & Drive */}
          {activeTab === 'export' && (
            <div className="h-full rounded-2xl overflow-hidden shadow-2xl border border-[#2A2824]">
              <ExportView project={project} />
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
          setActiveTab('preview');
        }}
      />

      {/* AI Wedding Director Modal */}
      <AiWeddingDirectorModal
        isOpen={isDirectorModalOpen}
        onClose={() => setIsDirectorModalOpen(false)}
        project={project}
        onApplyProject={(updated) => {
          pushState(updated);
          setActiveTab('timeline');
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
        defaultText="Ślubuję Ci miłość, wierność i uczciwość małżeńską, oraz że Cię nie opuszczę aż do śmierci..."
      />
    </>
  );
}
