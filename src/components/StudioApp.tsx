import React, { useState, useEffect, useCallback } from 'react';
import { AlertTriangle } from 'lucide-react';
import { StudioLayout } from './layout/StudioLayout';
import { ProjectOverviewView } from './project/ProjectOverviewView';
import { MediaManager } from './media/MediaManager';
import { MontageView } from './montage/MontageView';
import { ExportView } from './export/ExportView';
import { SettingsDiagnosticsView } from './settings/SettingsDiagnosticsView';
import { AiAssistantModal } from './ai/AiAssistantModal';
import { VoiceRecorderModal } from './VoiceRecorderModal';
import { SoundscapeStudioModal } from './audio/SoundscapeStudioModal';
import { AiWeddingDirectorModal } from './director/AiWeddingDirectorModal';
import { 
  AiChronologicalMergeModal, 
  DirectorMergeOptions 
} from './director/AiChronologicalMergeModal';
import { SOUNDSCAPE_PRESETS, soundscapeGenerator } from '../core/audio/soundscapeGenerator';
import { WeddingNarrativeModal } from './director/WeddingNarrativeModal';
import { ProjectHealthPanel } from './director/ProjectHealthPanel';
import { QuickActionsBar } from './director/QuickActionsBar';
import { TemplateGalleryModal } from './templates/TemplateGalleryModal';
import type { ProjectTemplate } from '../types/template';
import { useProject } from '../hooks/useProject';
import { useAuth } from '../lib/firebase/AuthContext';
import { saveProject, loadProject, deleteProjectFromCloud } from '../lib/firebase/api';
import { onFirestoreConnectionChange, isFirestoreConnected } from '../lib/firebase/config';
import { useStudioToast } from './common/ToastContext';
import { probeVideoMetadata } from '../core/media/metadataProber';
import { urlRegistry } from '../core/media/urlRegistry';
import { localIndexedDB } from '../core/storage/indexedDBProvider';
import { videoExportService } from '../core/export/videoExportService';
import type { MediaClip, TimelineItem, AudioTrackItem, TextLayer, WeddingChapter, ClipCategory } from '../types/project';

export function StudioApp() {
  const [activeTab, setActiveTab] = useState<string>('project');
  const [isAiModalOpen, setIsAiModalOpen] = useState(false);
  const [isDirectorModalOpen, setIsDirectorModalOpen] = useState(false);
  const [isChronologicalModalOpen, setIsChronologicalModalOpen] = useState(false);
  const [chronologicalClips, setChronologicalClips] = useState<MediaClip[]>([]);
  const [isWeddingNarrativeModalOpen, setIsWeddingNarrativeModalOpen] = useState(false);
  const [isHealthPanelOpen, setIsHealthPanelOpen] = useState(false);
  const [isVoiceRecorderOpen, setIsVoiceRecorderOpen] = useState(false);
  const [isSoundscapeModalOpen, setIsSoundscapeModalOpen] = useState(false);
  const [isTemplateGalleryOpen, setIsTemplateGalleryOpen] = useState(false);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [isProcessingFiles, setIsProcessingFiles] = useState(false);
  
  const { 
    project, 
    addMediaClips, 
    updateMediaClip, 
    removeMediaClip,
    removeMediaClips,
    relinkMediaSource,
    addTimelineItem,
    addTimelineItems,
    updateTimelineItem,
    removeTimelineItem,
    removeTimelineItems,
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
  const [gpuWarningHint, setGpuWarningHint] = useState<string | null>(null);
  const toast = useStudioToast();

  // Probe GPU hardware acceleration support on startup
  useEffect(() => {
    async function checkGpuSupport() {
      try {
        const caps = await videoExportService.getDiagnostics();
        const hasGpu = Boolean(
          caps.webCodecsSupported &&
          caps.videoEncoderSupported &&
          (caps.hevcHardware || caps.av1Hardware || caps.vp9Hardware || caps.h264Supported)
        );
        if (!hasGpu) {
          setGpuWarningHint(
            'Brak aktywnej akceleracji sprzętowej GPU w przeglądarce (WebCodecs / MediaRecorder). Włącz opcję "Używaj akceleracji sprzętowej, gdy jest dostępna" w ustawieniach przeglądarki (np. chrome://settings/system dla Chrome/Edge lub Ustawienia -> System w Safari), aby przyspieszyć renderowanie 10x i zapobiec błędom eksportu.'
          );
        } else {
          setGpuWarningHint(null);
        }
      } catch (err) {
        console.warn('[StudioApp] GPU capability check:', err);
      }
    }
    checkGpuSupport();
  }, []);

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

        // Persist media blob in IndexedDB for reliable offline rendering & exports
        try {
          await localIndexedDB.saveMediaBlob(clipId, file);
        } catch (idbErr) {
          console.warn(`[StudioApp] Error saving media blob ${clipId}:`, idbErr);
        }

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

  const handleBatchAddToTimeline = useCallback((clipsToAdd: MediaClip[]) => {
    if (!clipsToAdd || clipsToAdd.length === 0) return;
    const lastItem = project.timelineItems[project.timelineItems.length - 1];
    let start = lastItem ? lastItem.timelineStart + lastItem.duration : 0;

    const newItems: TimelineItem[] = clipsToAdd.map((clip, idx) => {
      const duration = Math.max(0.2, clip.duration);
      const item: TimelineItem = {
        id: `ti_${Date.now()}_${idx}_${Math.random().toString(36).substring(2, 6)}`,
        clipId: clip.id,
        trackId: 'v1',
        sourceStart: 0,
        sourceEnd: duration,
        timelineStart: start,
        duration: duration,
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
      start += duration;
      return item;
    });

    addTimelineItems(newItems);
    toast.showSuccess(`Pomyślnie dodano ${newItems.length} filmów do montażu.`);
    setActiveTab('montage');
  }, [project.timelineItems, addTimelineItems, toast]);

  const handleBatchRemoveMediaClips = useCallback((ids: string[]) => {
    if (!ids || ids.length === 0) return;
    removeMediaClips(ids);
  }, [removeMediaClips]);

  const handleApplyChronologicalMerge = useCallback(async (
    items: { clip: MediaClip; smartTitle: string; subtitleCaption: string; category: ClipCategory; transition: string; trimStart: number; trimEnd: number; emotion?: string; timeOfDay?: string }[],
    options?: DirectorMergeOptions
  ) => {
    if (!items || items.length === 0) return;

    let start = 0;
    const newTimelineItems: TimelineItem[] = [];
    const newTextLayers: TextLayer[] = [];
    const updatedMediaMap = new Map<string, Partial<MediaClip>>();
    const newChapters: WeddingChapter[] = [];

    const applyTransitions = options ? options.applyTransitions : true;
    const includeSubtitles = options ? options.includeSubtitles : true;
    const includeIntro = options ? options.includeIntroTitleCard : true;
    const includeScenes = options ? options.includeSceneTitles : true;
    const includeOutro = options ? options.includeOutroTitleCard : true;

    let lastCategory: string | null = null;
    let lastTimeOfDay: string | null = null;

    // 2. Determine soundtrack and its BPM for sync
    let musicBpm = 72; // Default
    let selectedPresetId = options?.soundtrackPresetId || 'golden_hour_piano';
    
    const existingMusic = project.audioTracks.find(t => t.volume > 0.3);
    if (existingMusic) {
      // Try to find BPM if it's one of our presets
      const preset = SOUNDSCAPE_PRESETS.find(p => existingMusic.name.includes(p.title));
      if (preset) musicBpm = preset.bpm;
    } else if (options?.includeSoundtrack) {
      const preset = SOUNDSCAPE_PRESETS.find(p => p.id === selectedPresetId) || SOUNDSCAPE_PRESETS[0];
      musicBpm = preset.bpm;
    }

    const beatDuration = 60 / musicBpm;
    const transitionDuration = Math.max(0.3, Math.min(1.5, beatDuration)); // Match 1 beat or half beat

    items.forEach((item, idx) => {
      // UNRESTRICTED DURATION & NATURAL MONTAGE:
      // Zero artificial limits - preserves full speech, vows, dance or smart cuts
      const rawDuration = (item.trimEnd > item.trimStart) 
        ? (item.trimEnd - item.trimStart) 
        : (item.clip.duration || 10);
      
      let clipDuration = rawDuration;
      if (options?.applySmartTrim) {
        if (options?.pacing === 'fast') {
          // Fast highlights: keep between 4s and 8s
          clipDuration = Math.min(8.0, Math.max(3.0, rawDuration));
        } else if (options?.pacing === 'slow') {
          // Slow emotional pacing: keep full natural length
          clipDuration = rawDuration;
        } else {
          // Cinematic / Natural: keep natural length without artificial cutoff
          clipDuration = rawDuration;
        }
      }
      
      const effectiveTrimEnd = item.trimStart + clipDuration;

      const isFirstItem = idx === 0;
      const isLastItem = idx === items.length - 1;
      const isNewCategory = lastCategory !== item.category;
      const isNewTimeOfDay = lastTimeOfDay !== item.timeOfDay;
      
      lastCategory = item.category;
      lastTimeOfDay = item.timeOfDay;

      const transitionType = applyTransitions
        ? ((item.transition as any) || (isFirstItem ? 'dip_black' : 'dissolve'))
        : 'cut';
      
      // I.2 GENEROWANIE KART I PODPISÓW
      let itemTitleCard = undefined;
      let hasActiveTitleCard = false;

      if (isFirstItem && includeIntro) {
        hasActiveTitleCard = true;
        itemTitleCard = {
          enabled: true,
          text: options?.introTitle || `ŚLUB: ${project.name || 'WSPOMNIENIA'}`,
          subtitle: options?.introSubtitle || `${new Date().toLocaleDateString('pl-PL')} • Smart Montage AI`,
          duration: options?.introDuration || 4.0,
          style: (options?.introStyle as any) || 'liturgical',
          backgroundColor: 'gradient',
          cardType: 'intro' as const
        };
      } else if (includeScenes && (isNewCategory || isNewTimeOfDay)) {
        // Only show scene card on major transitions (Category or Time of Day change) for "Maximal Quality"
        hasActiveTitleCard = true;
        const timeLabel = item.timeOfDay ? ` [${item.timeOfDay.replace('_', ' ').toUpperCase()}]` : '';
        itemTitleCard = {
          enabled: true,
          text: item.smartTitle,
          subtitle: `${item.subtitleCaption}${timeLabel}`,
          duration: 3.0,
          style: 'cinematic' as const,
          backgroundColor: 'gradient',
          cardType: 'scene' as const
        };
      }

      // Determine Outro Card on the final item
      let itemOutroCard = undefined;
      if (isLastItem && includeOutro) {
        itemOutroCard = {
          enabled: true,
          text: options?.outroTitle || 'FINAŁ',
          subtitle: options?.outroSubtitle || 'Dziękujemy za bycie częścią naszej historii. Joanna & Piotr.',
          duration: 4.5,
          style: 'elegant' as const,
          backgroundColor: 'gradient',
          cardType: 'outro' as const
        };
      }

      const tItem: TimelineItem = {
        id: `ti_${Date.now()}_${idx}_${Math.random().toString(36).substring(2, 6)}`,
        clipId: item.clip.id,
        trackId: 'v1',
        sourceStart: item.trimStart,
        sourceEnd: effectiveTrimEnd,
        timelineStart: start,
        duration: clipDuration,
        speed: 1,
        volume: 1,
        fadeIn: transitionDuration, 
        fadeOut: transitionDuration,
        muted: false,
        scale: 1,
        rotation: 0,
        fitMode: 'fit',
        transitionIn: transitionType,
        transitionDuration: applyTransitions ? transitionDuration : 0,
        titleCard: itemTitleCard,
        outroCard: itemOutroCard
      };
      newTimelineItems.push(tItem);

      // Add floating "Time of Day" badge as TextLayer if it's a new time of day but not a full title card
      if (item.timeOfDay && isNewTimeOfDay && !hasActiveTitleCard) {
        newTextLayers.push({
          id: `tl_time_${Date.now()}_${idx}`,
          text: item.timeOfDay.replace('_', ' ').toUpperCase(),
          type: 'title',
          style: 'minimalist',
          timelineStart: start + 0.5,
          duration: 3.0,
          position: { x: 0.1, y: 0.1 },
          fontSize: 14,
          color: '#FDE047',
          backgroundColor: 'transparent',
          animation: 'slide',
          fontWeight: '800'
        });
      }

      // Add subtitle text layer
      if (includeSubtitles && item.subtitleCaption && item.subtitleCaption.trim()) {
        const subtitleOffset = hasActiveTitleCard ? (itemTitleCard?.duration || 3.0) : 0.4;
        const subDuration = Math.max(2.0, Math.min(5.0, clipDuration - subtitleOffset));
        newTextLayers.push({
          id: `tl_${Date.now()}_${idx}`,
          text: item.subtitleCaption,
          type: 'caption',
          style: 'cinematic',
          timelineStart: Number((start + subtitleOffset).toFixed(2)),
          duration: Number(subDuration.toFixed(2)),
          position: { x: 0.5, y: 0.88 },
          fontSize: 18,
          color: '#FFFFFF',
          backgroundColor: 'rgba(0,0,0,0.7)',
          animation: 'fade',
          fontWeight: '600'
        });
      }

      // Collect chapter marker if category changed
      if (options?.generateChapters && isNewCategory && item.category !== 'unassigned') {
        newChapters.push({
          id: `chap_${Date.now()}_${idx}`,
          chapterKey: item.category as any,
          name: item.smartTitle,
          startTime: start,
          endTime: start + clipDuration,
          description: item.subtitleCaption
        });
      }

      updatedMediaMap.set(item.clip.id, {
        category: item.category,
        name: item.smartTitle,
        comment: item.subtitleCaption,
        analysis: {
          ...item.clip.analysis,
          emotion: item.emotion as any,
          timeOfDay: item.timeOfDay as any
        } as any
      });

      start += clipDuration;
    });

    // Update media library items with smart titles & categories
    const updatedLibrary = project.mediaLibrary.map(clip => {
      const update = updatedMediaMap.get(clip.id);
      if (update) {
        return { ...clip, ...update };
      }
      return clip;
    });

    // Sound handling: only generate background soundtrack if explicitly requested by user
    let updatedAudioTracks: AudioTrackItem[] = [];
    if (options?.includeSoundtrack) {
      try {
        const presetId = options.soundtrackPresetId || 'golden_hour_piano';
        const { file, duration } = await soundscapeGenerator.generateTrackFile(presetId);
        const trackId = `track_soundscape_${Date.now()}`;
        try {
          await localIndexedDB.saveMediaBlob(trackId, file);
        } catch {}
        const objectUrl = urlRegistry.create(file);
        updatedAudioTracks.push({
          id: trackId,
          name: presetId === 'altar_procession' ? '♫ Droga do Ołtarza (Dzwony & Chóry)' : '♫ Złoty Zmierzch (Fortepian & Smyczki)',
          file,
          objectUrl,
          duration,
          sourceStart: 0,
          sourceEnd: duration,
          timelineStart: 0,
          volume: 0.85,
          fadeIn: 2.0,
          fadeOut: 2.5
        });
      } catch (audioErr) {
        console.warn('[StudioApp] Auto soundtrack generation failed:', audioErr);
      }
    } else {
      // Keep only user-recorded voiceovers if any, otherwise keep audioTracks empty for 100% original audio
      updatedAudioTracks = (project.audioTracks || []).filter(t => t.trackType === 'voiceover');
    }

    const updatedSettings = {
      ...(project.settings || {}),
      colorGrade: (options?.colorGrade && options.colorGrade !== 'none') 
        ? options.colorGrade 
        : (project.settings?.colorGrade || 'golden_hour'),
      outroCard: includeOutro ? {
        enabled: true,
        text: options?.outroTitle || 'PODZIĘKOWANIA',
        subtitle: options?.outroSubtitle || 'Z całego serca dziękujemy Rodzicom za dar życia i miłość, Świadkom za pomoc i wsparcie, oraz wszystkim wspaniałym Gościom za modlitwę, radość i wspólne świętowanie. Joanna & Piotr • 14.09.2024',
        duration: options?.outroDuration || 4.0,
        style: 'elegant' as const,
        backgroundColor: 'gradient',
        cardType: 'outro' as const
      } : project.settings?.outroCard,
      audioDucking: true,
      duckingIntensity: 65,
      audioBalance: {
        musicVolume: 0.85,
        clipVolume: 1.0,
        duckingEnabled: true,
        duckingAmount: 0.65
      }
    };

    pushState({
      ...project,
      mediaLibrary: updatedLibrary,
      timelineItems: newTimelineItems,
      audioTracks: updatedAudioTracks,
      textLayers: newTextLayers,
      chapters: newChapters.length > 0 ? newChapters : project.chapters,
      settings: updatedSettings as any,
      updatedAt: new Date().toISOString()
    });

    const destinationTab = options?.targetTab || 'montage';
    setActiveTab(destinationTab);
  }, [project, pushState]);

  const handleApplyTemplate = useCallback((
    template: ProjectTemplate,
    options: { applySettingsOnly: boolean; generateChapters: boolean; applyTitleCards: boolean }
  ) => {
    const s = template.structure;
    const updatedSettings = {
      ...(project.settings || {}),
      colorGrade: s.colorGrade || project.settings?.colorGrade || 'golden_hour',
      resolution: s.resolution || project.settings?.resolution || '1080p',
      fps: s.fps || project.settings?.fps || 30,
      fitMode: s.fitMode || project.settings?.fitMode || 'fit',
    };

    if (options.applyTitleCards) {
      if (s.introCard) (updatedSettings as any).introCard = s.introCard;
      if (s.outroCard) (updatedSettings as any).outroCard = s.outroCard;
    }

    let updatedChapters = project.chapters;
    if (options.generateChapters && s.chapters && s.chapters.length > 0) {
      let currentStart = 0;
      updatedChapters = s.chapters.map((ch, idx) => {
        const dur = ch.targetDurationSec || 60;
        const start = currentStart;
        const end = start + dur;
        currentStart = end;
        return {
          id: `ch_${Date.now()}_${idx}`,
          chapterKey: (ch.chapterKey as ClipCategory) || 'ceremony',
          name: ch.name,
          startTime: start,
          endTime: end,
          description: ch.description || ''
        };
      });
    }

    pushState({
      ...project,
      settings: updatedSettings as any,
      chapters: updatedChapters,
      updatedAt: new Date().toISOString()
    });

    // Switch to montage tab to see the new structure/chapters
    setActiveTab('montage');

    toast.showSuccess(`✨ Zastosowano szablon "${template.title}" do projektu!`);
  }, [project, pushState, toast]);

  const handleOneClickDirectorCut = useCallback(async (selectedClips?: MediaClip[]) => {
    const clipsToUse = (selectedClips && selectedClips.length > 0) ? selectedClips : project.mediaLibrary;
    if (!clipsToUse || clipsToUse.length === 0) {
      toast.showWarning('Dodaj filmy do projektu, aby reżyser AI mógł je scalić.');
      return;
    }

    toast.showInfo('🚀 AI przygotowuje zaawansowany scenariusz Smart Montage (analiza nastroju i pory dnia)...');

    let sequencedItems: any[] = [];
    const isMostlyVertical = clipsToUse.filter(c => c.orientation === 'portrait').length > clipsToUse.length / 2;

    const defaultOptions: DirectorMergeOptions = {
      includeIntroTitleCard: true,
      introTitle: `FILM ŚLUBNY: ${project.name || 'WSPOMNIENIA'}`,
      introSubtitle: new Date().toLocaleDateString('pl-PL'),
      introDuration: 3.5,
      introStyle: 'liturgical',
      includeOutroTitleCard: true,
      outroTitle: 'DZIĘKUJEMY',
      outroSubtitle: 'Z całego serca dziękujemy wszystkim gościom za wspólną celebrację naszej miłości.',
      outroDuration: 4.0,
      includeSceneTitles: true,
      includeSubtitles: true,
      applyTransitions: true,
      applySmartTrim: true,
      colorGrade: 'golden_hour',
      generateChapters: true,
      includeSoundtrack: false,
      soundtrackPresetId: 'altar_procession',
      targetTab: 'montage'
    };

    // Update project resolution if mostly vertical
    if (isMostlyVertical && project.settings?.targetResolution !== '720p' && !project.settings?.resolution?.includes('vertical')) {
      pushState({
        ...project,
        settings: {
          ...project.settings,
          resolution: 'vertical_1080p',
          targetResolution: '1080p',
          aspectRatio: '9:16'
        } as any
      });
    }

    try {
      // 1. Call the advanced sequencing API
      const response = await fetch('/api/smart-chronological-sequencing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clips: clipsToUse.map(c => ({
            id: c.id,
            name: c.name,
            duration: c.duration,
            capturedAt: c.capturedAt || c.createdAt,
            tags: c.tags,
            comment: c.comment
          })),
          pacing: 'cinematic',
          coupleNames: project.name || 'Nowożeńcy',
          weddingDate: ''
        })
      });

      if (!response.ok) throw new Error('API Error');
      const data = await response.json();
      
      const clipMap = new Map(clipsToUse.map(c => [c.id, c]));
      sequencedItems = (data.orderedSequence || []).map((item: any) => {
        const clip = clipMap.get(item.clipId);
        if (!clip) return null;
        return {
          clip,
          smartTitle: item.smartTitle,
          subtitleCaption: item.subtitleCaption,
          category: item.category as ClipCategory,
          emotion: item.emotion,
          timeOfDay: item.timeOfDay,
          transition: item.transition,
          trimStart: item.trimStart,
          trimEnd: item.trimEnd
        };
      }).filter(Boolean);
    } catch (err) {
      console.warn('[Smart Montage] Fallback to local sequencing:', err);
      // Fallback: Local chronological sort (previous logic)
      const sorted = [...clipsToUse].sort((a, b) => {
        const tA = new Date(a.capturedAt || a.createdAt || 0).getTime();
        const tB = new Date(b.capturedAt || b.createdAt || 0).getTime();
        if (tA !== tB) return tA - tB;
        const catA = a.category || 'unassigned';
        const catB = b.category || 'unassigned';
        if (catA !== catB) return catA.localeCompare(catB);
        return (a.name || '').localeCompare(b.name || '', undefined, { numeric: true, sensitivity: 'base' });
      });

      const categoriesList: ClipCategory[] = ['preparations', 'ceremony', 'congratulations', 'first_dance', 'toast', 'party', 'cake', 'ending'];
      sequencedItems = sorted.map((c, idx) => {
        const catIdx = Math.min(categoriesList.length - 1, Math.floor((idx / sorted.length) * categoriesList.length));
        return {
          clip: c,
          smartTitle: c.name || `Scena ${idx + 1}`,
          subtitleCaption: `Ujęcie ślubne – ${c.name}`,
          category: c.category && c.category !== 'unassigned' ? c.category : categoriesList[catIdx],
          transition: idx === 0 ? 'dip_black' : 'dissolve',
          trimStart: 0,
          trimEnd: c.duration
        };
      });
    }

    if (sequencedItems.length > 0) {
      await handleApplyChronologicalMerge(sequencedItems, defaultOptions);
      toast.showSuccess('✨ Inteligentny montaż Smart Montage zakończony sukcesem!');
    }
  }, [project, handleApplyChronologicalMerge, toast]);

  const handleMagicProduce = useCallback(async () => {
    if (project.mediaLibrary.length === 0) {
      toast.showWarning('Dodaj filmy do projektu, aby reżyser AI mógł je scalić i wyeksportować.');
      return;
    }

    if (gpuWarningHint) {
      toast.showWarning(`⚠️ ${gpuWarningHint}`);
    }

    toast.showInfo('🚀 Uruchamiam Magiczną Produkcję (1-Kliknięcie): Reżyseria Smart AI...');
    
    // 1. Run the one-click director cut (now upgraded to AI Smart Montage)
    await handleOneClickDirectorCut();
    
    // 2. Switch to export tab
    setActiveTab('export');
    
    // 3. Inform the user and potentially auto-navigate
    toast.showSuccess('✨ Inteligentny montaż zakończony. Twój film jest gotowy do finalnego wygenerowania!');
  }, [project, handleOneClickDirectorCut, toast, gpuWarningHint]);

  const handleApplyCaptionsToLibrary = useCallback((updates: { id: string; name: string; category: ClipCategory; comment: string; tags: string[] }[]) => {
    const updateMap = new Map<string, { name: string; category: ClipCategory; comment: string; tags: string[] }>();
    updates.forEach(u => updateMap.set(u.id, u));

    const updatedLibrary = project.mediaLibrary.map(clip => {
      const u = updateMap.get(clip.id);
      if (u) {
        return {
          ...clip,
          name: u.name,
          category: u.category,
          comment: u.comment,
          tags: Array.from(new Set([...(clip.tags || []), ...(u.tags || [])]))
        };
      }
      return clip;
    });

    pushState({
      ...project,
      mediaLibrary: updatedLibrary,
      updatedAt: new Date().toISOString()
    });
  }, [project, pushState]);

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

  const handleSoundscapeAdd = useCallback((track: AudioTrackItem) => {
    addAudioTrack(track);
    toast.showSuccess(`Ścieżka muzyczna "${track.name}" została pomyślnie wygenerowana i dodana do osi czasu!`);
    setIsSoundscapeModalOpen(false);
    setActiveTab('montage');
  }, [addAudioTrack, toast]);

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
        onOpenSoundscapes={() => setIsSoundscapeModalOpen(true)}
        onOpenTemplateGallery={() => setIsTemplateGalleryOpen(true)}
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
              onOpenChronologicalModal={() => setIsChronologicalModalOpen(true)}
              onOpenWeddingNarrativeModal={() => setIsWeddingNarrativeModalOpen(true)}
              onOpenSoundscapes={() => setIsSoundscapeModalOpen(true)}
              onOpenTemplateGallery={() => setIsTemplateGalleryOpen(true)}
              onMagicProduce={handleMagicProduce}
            />
          </div>

          {/* GPU Hardware Acceleration Warning Banner */}
          {gpuWarningHint && (
            <div className="shrink-0 w-full p-3.5 sm:p-4 rounded-2xl bg-amber-950/40 border border-amber-500/50 text-amber-200 text-xs flex items-start sm:items-center justify-between gap-3 shadow-lg animate-fadeIn">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center shrink-0 text-amber-400">
                  <AlertTriangle className="w-4 h-4 animate-pulse" />
                </div>
                <div>
                  <span className="font-bold text-amber-300 block text-xs sm:text-sm">⚠️ Wykryto Brak Akceleracji GPU (WebCodecs / MediaRecorder)</span>
                  <p className="text-amber-100/90 text-xs mt-0.5 leading-relaxed">{gpuWarningHint}</p>
                </div>
              </div>
              <button 
                onClick={() => setActiveTab('export')}
                className="shrink-0 px-3 py-1.5 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 text-xs font-semibold transition-colors cursor-pointer"
              >
                Konfiguruj Eksport
              </button>
            </div>
          )}

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
                }}
                onUpdateClip={updateMediaClip}
                onRemoveClip={(id) => {
                  removeMediaClip(id);
                }}
                onAddToTimeline={handleAddToTimeline}
                onBatchAddToTimeline={handleBatchAddToTimeline}
                onBatchRemoveClips={handleBatchRemoveMediaClips}
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
                onOpenChronologicalModal={(selected) => {
                  setChronologicalClips(selected && selected.length > 0 ? selected : project.mediaLibrary);
                  setIsChronologicalModalOpen(true);
                }}
                onQuickApplyDirectorCut={handleOneClickDirectorCut}
                onNavigateToExport={() => setActiveTab('export')}
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

      {/* AI Smart Chronological Sequencing & Auto-Captioning Modal */}
      <AiChronologicalMergeModal
        isOpen={isChronologicalModalOpen}
        onClose={() => setIsChronologicalModalOpen(false)}
        clips={chronologicalClips.length > 0 ? chronologicalClips : project.mediaLibrary}
        onApplyToTimeline={handleApplyChronologicalMerge}
        onApplyCaptionsToLibrary={handleApplyCaptionsToLibrary}
        onOpenQuickMerge={() => setActiveTab('export')}
      />

      {/* Wedding Narrative Builder Modal */}
      <WeddingNarrativeModal
        isOpen={isWeddingNarrativeModalOpen}
        onClose={() => setIsWeddingNarrativeModalOpen(false)}
        project={project}
        onApplyProject={(updated) => {
          pushState(updated);
          setActiveTab('montage');
        }}
      />

      {/* Voiceover Recorder Modal */}
      <VoiceRecorderModal 
        isOpen={isVoiceRecorderOpen}
        onClose={() => setIsVoiceRecorderOpen(false)}
        onSaveVoiceover={handleVoiceoverSave}
        defaultText="Głos lektora i narracja do filmu..."
      />

      {/* AI Soundscape & Music Studio Modal */}
      <SoundscapeStudioModal
        isOpen={isSoundscapeModalOpen}
        onClose={() => setIsSoundscapeModalOpen(false)}
        onAddAudioTrack={handleSoundscapeAdd}
        audioDuckingEnabled={project.audioSettings?.duckingEnabled ?? true}
        onToggleAudioDucking={(enabled) => {
          pushState({
            ...project,
            audioSettings: {
              ...project.audioSettings,
              duckingEnabled: enabled,
              duckingAmount: project.audioSettings?.duckingAmount ?? 0.35,
              musicVolume: project.audioSettings?.musicVolume ?? 0.85,
              voiceVolume: project.audioSettings?.voiceVolume ?? 1.2,
              originalAudioVolume: project.audioSettings?.originalAudioVolume ?? 1.0
            }
          });
        }}
      />

      {/* Template Gallery Modal (Firebase Cloud Storage & Preset Structures) */}
      <TemplateGalleryModal
        isOpen={isTemplateGalleryOpen}
        onClose={() => setIsTemplateGalleryOpen(false)}
        project={project}
        onApplyTemplate={handleApplyTemplate}
      />
    </>
  );
}
