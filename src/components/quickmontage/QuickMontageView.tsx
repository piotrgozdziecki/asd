import React, { useState, useMemo } from 'react';
import { 
  Wand2, 
  Film, 
  Clock, 
  Sparkles, 
  Check, 
  ArrowRight, 
  Star,
  CheckCircle2,
  Tv,
  CheckCircle,
  Play,
  Download,
  Scissors,
  Layers,
  ChevronRight,
  ChevronDown,
  Volume2,
  Calendar,
  Eye,
  Trash2,
  Plus,
  RefreshCw,
  Music,
  Bookmark,
  Smartphone,
  Sliders,
  AlertCircle
} from 'lucide-react';
import type { ProjectState, MediaClip, TimelineItem, TextLayer, WeddingChapter, ClipCategory, TransitionType, FitMode } from '../../types/project';
import { WEDDING_CHAPTER_DEFINITIONS } from '../chapters/ChaptersManager';

interface QuickMontageViewProps {
  project: ProjectState;
  onApplyMontage: (newProjectState: ProjectState, targetTab?: 'preview' | 'export' | 'timeline') => void;
  onSwitchToProMode: () => void;
}

export type TrimmingMode = 'full' | 'teaser' | 'highlights' | 'smart_mix';
export type TransitionChoice = 'crossfade' | 'dip_black' | 'cut';
export type AspectRatioChoice = 'fit' | 'fill';

export function QuickMontageView({ 
  project, 
  onApplyMontage, 
  onSwitchToProMode 
}: QuickMontageViewProps) {
  // Navigation tabs within Montage Studio
  const [activeStep, setActiveStep] = useState<'definition' | 'processing' | 'assembly'>('definition');

  // Stage activation status (e.g. user can toggle chapters on/off)
  const [activeStageKeys, setActiveStageKeys] = useState<Record<string, boolean>>(() => {
    const initial: Record<string, boolean> = {};
    WEDDING_CHAPTER_DEFINITIONS.forEach(def => {
      initial[def.key] = true;
    });
    return initial;
  });

  // Local clip category mapping (clipId -> ClipCategory)
  const [clipCategories, setClipCategories] = useState<Record<string, ClipCategory>>(() => {
    const initial: Record<string, ClipCategory> = {};
    project.mediaLibrary.forEach(c => {
      initial[c.id] = c.category || 'unassigned';
    });
    return initial;
  });

  // Selected clips
  const [selectedClipIds, setSelectedClipIds] = useState<string[]>(() => 
    project.mediaLibrary.map(c => c.id)
  );

  // Step 2: Processing ("Przerabianie") Options
  const [trimmingMode, setTrimmingMode] = useState<TrimmingMode>('full');
  const [aspectRatioChoice, setAspectRatioChoice] = useState<AspectRatioChoice>('fit');
  const [transitionChoice, setTransitionChoice] = useState<TransitionChoice>('crossfade');
  
  // Titles & Personalization
  const [coupleNames, setCoupleNames] = useState<string>('Joanna & Piotr');
  const [weddingDate, setWeddingDate] = useState<string>('14.09.2024');
  const [includeIntroTitle, setIncludeIntroTitle] = useState<boolean>(true);
  const [includeChapterCards, setIncludeChapterCards] = useState<boolean>(true);
  const [includeOutroTitle, setIncludeOutroTitle] = useState<boolean>(true);

  // Audio adjustments
  const [cameraVolume, setCameraVolume] = useState<number>(1.0);
  const [audioDucking, setAudioDucking] = useState<boolean>(true);

  // Status message
  const [actionNotification, setActionNotification] = useState<string | null>(null);

  // Helper: show transient feedback
  const showNotification = (msg: string) => {
    setActionNotification(msg);
    setTimeout(() => setActionNotification(null), 5000);
  };

  // Group media by stage
  const clipsByStage = useMemo(() => {
    const grouped: Record<string, MediaClip[]> = {};
    WEDDING_CHAPTER_DEFINITIONS.forEach(def => {
      grouped[def.key] = [];
    });
    grouped['unassigned'] = [];

    project.mediaLibrary.forEach(clip => {
      const cat = clipCategories[clip.id] || clip.category || 'unassigned';
      if (grouped[cat]) {
        grouped[cat].push(clip);
      } else {
        grouped['unassigned'].push(clip);
      }
    });

    return grouped;
  }, [project.mediaLibrary, clipCategories]);

  // Unassigned clips count
  const unassignedCount = useMemo(() => {
    return clipsByStage['unassigned']?.length || 0;
  }, [clipsByStage]);

  // Active stages count
  const activeStagesCount = useMemo(() => {
    return WEDDING_CHAPTER_DEFINITIONS.filter(d => activeStageKeys[d.key]).length;
  }, [activeStageKeys]);

  // Toggle stage on/off
  const toggleStage = (stageKey: string) => {
    setActiveStageKeys(prev => ({
      ...prev,
      [stageKey]: !prev[stageKey]
    }));
  };

  // Update a single clip's category
  const handleAssignClipToStage = (clipId: string, newStage: ClipCategory) => {
    setClipCategories(prev => ({
      ...prev,
      [clipId]: newStage
    }));
  };

  // 1-Click Auto-Categorize Chronologically
  const handleAutoChronologyDistribution = () => {
    if (project.mediaLibrary.length === 0) return;

    // Sort all media by timestamp (capturedAt or createdAt)
    const sorted = [...project.mediaLibrary].sort((a, b) => {
      const timeA = new Date(a.capturedAt || a.createdAt).getTime();
      const timeB = new Date(b.capturedAt || b.createdAt).getTime();
      return timeA - timeB;
    });

    const activeDefinitions = WEDDING_CHAPTER_DEFINITIONS.filter(d => activeStageKeys[d.key]);
    if (activeDefinitions.length === 0) {
      alert("Włącz co najmniej jeden etap scenariusza weselnego.");
      return;
    }

    const updated: Record<string, ClipCategory> = {};
    sorted.forEach((clip, idx) => {
      // Proportional distribution across active chapters
      const stageIdx = Math.min(
        activeDefinitions.length - 1,
        Math.floor((idx / sorted.length) * activeDefinitions.length)
      );
      const stageKey = activeDefinitions[stageIdx].key as ClipCategory;
      updated[clip.id] = stageKey;
    });

    setClipCategories(updated);
    showNotification(`⚡ Pomyślnie dopasowano ${sorted.length} ujęć do ${activeDefinitions.length} etapów wesela wg osi czasu dnia ślubu!`);
  };

  // Toggle clip selection in montage
  const toggleClipSelection = (clipId: string) => {
    setSelectedClipIds(prev => 
      prev.includes(clipId) ? prev.filter(id => id !== clipId) : [...prev, clipId]
    );
  };

  const handleSelectAllClips = () => {
    setSelectedClipIds(project.mediaLibrary.map(c => c.id));
  };

  const handleSelectFavoritesOnly = () => {
    const favs = project.mediaLibrary.filter(c => c.isFavorite).map(c => c.id);
    if (favs.length > 0) {
      setSelectedClipIds(favs);
      showNotification(`Wybrano ${favs.length} ulubionych ujęć.`);
    } else {
      alert("Brak klipów oznaczonych gwiazdką (Ulubione). Oznacz najpierw ulubione ujęcia w bibliotece.");
    }
  };

  // Calculate estimated duration based on trimming mode and active clips
  const estimatedTotalDuration = useMemo(() => {
    let total = 0;
    const activeDefs = WEDDING_CHAPTER_DEFINITIONS.filter(d => activeStageKeys[d.key]);

    activeDefs.forEach(def => {
      const stageClips = (clipsByStage[def.key] || []).filter(c => selectedClipIds.includes(c.id));
      stageClips.forEach(c => {
        const rawDur = typeof c.duration === 'number' && !isNaN(c.duration) && c.duration > 0 ? c.duration : 5;
        if (trimmingMode === 'full') {
          total += rawDur;
        } else if (trimmingMode === 'teaser') {
          total += Math.min(rawDur, 4);
        } else if (trimmingMode === 'highlights') {
          total += Math.min(rawDur, 12);
        } else if (trimmingMode === 'smart_mix') {
          if (['ceremony', 'first_dance', 'toast'].includes(def.key)) {
            total += rawDur;
          } else {
            total += Math.min(rawDur, 7);
          }
        }
      });
    });

    // Add intro/outro
    if (includeIntroTitle) total += 4.5;
    if (includeOutroTitle) total += 4;

    return Math.round(total);
  }, [clipsByStage, selectedClipIds, activeStageKeys, trimmingMode, includeIntroTitle, includeOutroTitle]);

  const formatDurationDisplay = (totalSec: number) => {
    const mins = Math.floor(totalSec / 60);
    const secs = Math.floor(totalSec % 60);
    if (mins === 0) return `${secs} sek.`;
    return `${mins} min ${secs} sek.`;
  };

  // Build the complete stitched sequence
  const handleGlueAndAssemble = (targetTab: 'preview' | 'export' | 'timeline' = 'preview') => {
    const activeDefs = WEDDING_CHAPTER_DEFINITIONS.filter(d => activeStageKeys[d.key]);
    
    // Gather clips in strict definition order
    const sequenceClips: { clip: MediaClip; stageKey: string; stageTitle: string }[] = [];
    activeDefs.forEach(def => {
      const stageClips = (clipsByStage[def.key] || []).filter(c => selectedClipIds.includes(c.id));
      // Sort stage clips chronologically
      const sortedStageClips = [...stageClips].sort((a, b) => {
        const tA = new Date(a.capturedAt || a.createdAt).getTime();
        const tB = new Date(b.capturedAt || b.createdAt).getTime();
        return tA - tB;
      });
      sortedStageClips.forEach(c => {
        sequenceClips.push({
          clip: c,
          stageKey: def.key,
          stageTitle: def.defaultTitle || def.label
        });
      });
    });

    if (sequenceClips.length === 0) {
      showNotification("Brak zaznaczonych ujęć w aktywnych etapach scenariusza. Przypisz i zaznacz ujęcia przed sklejeniem filmu.");
      return;
    }

    // Transitions settings
    let transType: TransitionType = 'fade';
    let transDuration = 0.8;
    let fadeDuration = 0.8;

    if (transitionChoice === 'dip_black') {
      transType = 'dip_black';
      transDuration = 0.6;
      fadeDuration = 0.6;
    } else if (transitionChoice === 'cut') {
      transType = 'cut';
      transDuration = 0;
      fadeDuration = 0;
    }

    let currentTime = 0;
    const newTimelineItems: TimelineItem[] = [];
    const newTextLayers: TextLayer[] = [];
    const newChapters: WeddingChapter[] = [];

    // 1. Intro Title Card
    if (includeIntroTitle) {
      newTextLayers.push({
        id: `text_intro_${Date.now()}`,
        text: coupleNames,
        type: 'title',
        style: 'elegant',
        timelineStart: 0.5,
        duration: 4.5,
        position: { x: 0.5, y: 0.45 },
        fontSize: 2.8,
        color: '#F2EFE8',
        backgroundColor: 'rgba(0,0,0,0.45)'
      });

      if (weddingDate) {
        newTextLayers.push({
          id: `text_date_${Date.now()}`,
          text: weddingDate,
          type: 'date',
          style: 'minimalist',
          timelineStart: 1.5,
          duration: 3.5,
          position: { x: 0.5, y: 0.65 },
          fontSize: 1.4,
          color: '#D4AF37'
        });
      }
    }

    // 2. Continuous, Gapless Assembly of All Clips
    let currentChapterKey: string | null = null;
    let currentChapterStart = 0;

    sequenceClips.forEach((entry, idx) => {
      const clip = entry.clip;
      const rawDur = typeof clip.duration === 'number' && !isNaN(clip.duration) && clip.duration > 0 
        ? clip.duration 
        : 5;

      // Determine trimming duration
      let itemDur = rawDur;
      let srcStart = 0;
      let srcEnd = rawDur;

      if (trimmingMode === 'teaser') {
        const targetLen = Math.min(rawDur, 4);
        srcStart = Math.max(0, (rawDur - targetLen) / 2);
        srcEnd = srcStart + targetLen;
        itemDur = targetLen;
      } else if (trimmingMode === 'highlights') {
        const targetLen = Math.min(rawDur, 12);
        srcStart = Math.max(0, (rawDur - targetLen) / 3);
        srcEnd = srcStart + targetLen;
        itemDur = targetLen;
      } else if (trimmingMode === 'smart_mix') {
        if (['ceremony', 'first_dance', 'toast'].includes(entry.stageKey)) {
          srcStart = 0;
          srcEnd = rawDur;
          itemDur = rawDur;
        } else {
          const targetLen = Math.min(rawDur, 7);
          srcStart = Math.max(0, (rawDur - targetLen) / 2);
          srcEnd = srcStart + targetLen;
          itemDur = targetLen;
        }
      }

      // Determine Fit Mode (Clean framing without image multiplication)
      const calculatedFitMode: FitMode = aspectRatioChoice === 'fill' ? 'fill' : 'fit';

      // Chapter change detection & Chapter Title Card
      if (currentChapterKey !== entry.stageKey) {
        if (currentChapterKey) {
          const prevDef = WEDDING_CHAPTER_DEFINITIONS.find(d => d.key === currentChapterKey);
          newChapters.push({
            id: `chap_${Date.now()}_${newChapters.length}`,
            chapterKey: currentChapterKey as any,
            name: prevDef?.label || 'Rozdział',
            startTime: currentChapterStart,
            endTime: currentTime,
            description: prevDef?.desc
          });
        }

        currentChapterKey = entry.stageKey;
        currentChapterStart = currentTime;

        // Insert chapter title card
        if (includeChapterCards) {
          newTextLayers.push({
            id: `text_chap_${Date.now()}_${newChapters.length}`,
            text: entry.stageTitle,
            type: 'chapter',
            style: 'elegant',
            timelineStart: currentTime + 0.3,
            duration: 3.5,
            position: { x: 0.5, y: 0.5 },
            fontSize: 2.2,
            color: '#F2EFE8',
            backgroundColor: 'rgba(0,0,0,0.4)'
          });
        }
      }

      // Add timeline item
      newTimelineItems.push({
        id: `ti_${Date.now()}_${idx}_${Math.random().toString(36).substring(2, 6)}`,
        clipId: clip.id,
        trackId: 'v1',
        sourceStart: srcStart,
        sourceEnd: srcEnd,
        timelineStart: currentTime,
        duration: itemDur,
        speed: 1,
        volume: cameraVolume,
        fadeIn: fadeDuration,
        fadeOut: fadeDuration,
        muted: false,
        scale: 1,
        rotation: 0,
        fitMode: calculatedFitMode,
        transitionIn: transType,
        transitionOut: transType,
        transitionDuration: transDuration
      });

      currentTime += itemDur;

      // Last item chapter close
      if (idx === sequenceClips.length - 1 && currentChapterKey) {
        const def = WEDDING_CHAPTER_DEFINITIONS.find(d => d.key === currentChapterKey);
        newChapters.push({
          id: `chap_${Date.now()}_${newChapters.length}`,
          chapterKey: currentChapterKey as any,
          name: def?.label || 'Rozdział',
          startTime: currentChapterStart,
          endTime: currentTime,
          description: def?.desc
        });
      }
    });

    // 3. Outro Title Card
    if (includeOutroTitle && currentTime > 5) {
      newTextLayers.push({
        id: `text_outro_${Date.now()}`,
        text: `Dziękujemy za wspólne chwile • ${coupleNames}`,
        type: 'caption',
        style: 'elegant',
        timelineStart: Math.max(0, currentTime - 4),
        duration: 4,
        position: { x: 0.5, y: 0.8 },
        fontSize: 1.6,
        color: '#D4AF37',
        backgroundColor: 'rgba(0,0,0,0.5)'
      });
    }

    // 4. Update MediaLibrary clip categories for persistence
    const updatedMediaLibrary = project.mediaLibrary.map(clip => ({
      ...clip,
      category: clipCategories[clip.id] || clip.category || 'unassigned'
    }));

    const newProjectState: ProjectState = {
      ...project,
      mediaLibrary: updatedMediaLibrary,
      timelineItems: newTimelineItems,
      textLayers: newTextLayers,
      chapters: newChapters,
      settings: {
        ...project.settings,
        fitMode: aspectRatioChoice === 'fill' ? 'fill' : 'fit',
        audioBalance: {
          musicVolume: 0.8,
          clipVolume: cameraVolume
        }
      },
      updatedAt: new Date().toISOString()
    };

    onApplyMontage(newProjectState, targetTab);
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-[#0A0A0A] text-[#F2EFE8] overflow-hidden">
      
      {/* Top Banner & Notification Bar */}
      <div className="border-b border-[#2A2824] bg-gradient-to-r from-[#141310] via-[#101010] to-[#141310] px-4 sm:px-6 py-3.5 sm:py-4 flex flex-col md:flex-row items-start md:items-center justify-between gap-3 sm:gap-4 shrink-0">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-[#D4AF37]/15 border border-[#D4AF37]/40 text-[#D4AF37] font-mono text-[10px] font-bold uppercase tracking-wider">
              <Sparkles className="w-3 h-3" /> Reżyser Scenariusza & Sklejanie
            </span>
            <span className="text-xs text-[#777] hidden sm:inline">•</span>
            <span className="text-xs text-[#AAA69D]">
              {selectedClipIds.length} ujęć w {activeStagesCount} etapach wesela
            </span>
          </div>
          <h2 className="font-serif-luxury text-lg sm:text-xl md:text-2xl font-bold text-white tracking-wide flex items-center gap-2">
            <span>Kompletny Montaż Filmu Ślubnego</span>
          </h2>
        </div>

        {/* Step Navigation Tabs */}
        <div className="flex items-center gap-1.5 bg-[#141414] p-1 rounded-xl border border-[#2A2824] text-xs overflow-x-auto max-w-full no-scrollbar">
          <button
            onClick={() => setActiveStep('definition')}
            className={`px-3 py-1.5 rounded-lg font-medium transition-all cursor-pointer flex items-center gap-1.5 ${
              activeStep === 'definition' 
                ? 'bg-[#D4AF37] text-black font-bold shadow-md' 
                : 'text-[#AAA69D] hover:text-white'
            }`}
          >
            <Bookmark className="w-3.5 h-3.5" />
            <span>1. Definicja Scenariusza</span>
          </button>
          
          <button
            onClick={() => setActiveStep('processing')}
            className={`px-3 py-1.5 rounded-lg font-medium transition-all cursor-pointer flex items-center gap-1.5 ${
              activeStep === 'processing' 
                ? 'bg-[#D4AF37] text-black font-bold shadow-md' 
                : 'text-[#AAA69D] hover:text-white'
            }`}
          >
            <Scissors className="w-3.5 h-3.5" />
            <span>2. Przerabianie & Styl</span>
          </button>

          <button
            onClick={() => setActiveStep('assembly')}
            className={`px-3 py-1.5 rounded-lg font-medium transition-all cursor-pointer flex items-center gap-1.5 ${
              activeStep === 'assembly' 
                ? 'bg-[#D4AF37] text-black font-bold shadow-md' 
                : 'text-[#AAA69D] hover:text-white'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>3. Sklejanie w Ciąg</span>
          </button>
        </div>
      </div>

      {/* Notification toast */}
      {actionNotification && (
        <div className="bg-[#1C180A] border-b border-[#D4AF37]/50 text-[#F2EFE8] px-6 py-2.5 text-xs flex items-center justify-between shrink-0 shadow-lg">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-[#D4AF37] shrink-0" />
            <span>{actionNotification}</span>
          </div>
          <button onClick={() => setActionNotification(null)} className="text-stone-400 hover:text-white text-xs cursor-pointer">
            ✕
          </button>
        </div>
      )}

      {/* Main Tab Content */}
      <div className="flex-1 overflow-y-auto custom-scrollbar p-4 md:p-6 space-y-6">
        
        {/* ================= STEP 1: DEFINICJA SCENARIUSZA ================= */}
        {activeStep === 'definition' && (
          <div className="max-w-5xl mx-auto space-y-6">
            
            {/* Action Card: Chronology auto-dispatcher */}
            <div className="bg-[#141414] border border-[#2A2824] rounded-2xl p-5 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 shadow-xl">
              <div className="space-y-1 max-w-xl">
                <div className="flex items-center gap-2">
                  <Bookmark className="w-4 h-4 text-[#D4AF37]" />
                  <h3 className="font-serif-luxury font-bold text-base text-white">
                    Działanie wg Oficjalnej Definicji Ślubnej
                  </h3>
                </div>
                <p className="text-xs text-[#AAA69D]">
                  Film układany jest w spójną historię zgodnie z 10 kanonicznymi etapami ceremonii i wesela. Kliknij poniżej, aby automatycznie uporządkować ujęcia wg godzin ich nagrania.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2.5 shrink-0">
                <button
                  onClick={handleAutoChronologyDistribution}
                  className="bg-[#D4AF37] hover:bg-[#FDE047] text-black font-bold text-xs px-4 py-2.5 rounded-xl shadow-lg flex items-center gap-2 cursor-pointer transition-transform hover:scale-105"
                  title="Odczytuje daty i godziny nagrań z plików i układa ujęcia od przygotowań do oczepin"
                >
                  <Sparkles className="w-4 h-4 text-black" />
                  <span>⚡ Rozmieść wg chronologii dnia ślubu</span>
                </button>

                <div className="flex items-center gap-2 text-xs bg-[#1A1A1A] p-1 rounded-lg border border-[#2A2824]">
                  <button onClick={handleSelectAllClips} className="text-[#D4AF37] px-2.5 py-1 hover:underline cursor-pointer">
                    Zaznacz wszystkie ({project.mediaLibrary.length})
                  </button>
                  <span className="text-[#333]">|</span>
                  <button onClick={handleSelectFavoritesOnly} className="text-amber-400 px-2.5 py-1 hover:underline cursor-pointer flex items-center gap-1">
                    <Star className="w-3 h-3 fill-amber-400" /> Tylko ulubione
                  </button>
                </div>
              </div>
            </div>

            {/* Unassigned Clips Queue */}
            {unassignedCount > 0 && (
              <div className="bg-[#1A1412] border border-amber-600/40 rounded-2xl p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 text-amber-400" />
                    <h4 className="text-xs font-bold text-amber-200">
                      Poczekalnia ujęć nieprzypisanych ({unassignedCount})
                    </h4>
                  </div>
                  <span className="text-[11px] text-[#AAA69D]">
                    Wybierz etap wesela z listy na karcie ujęcia, lub kliknij "⚡ Rozmieść wg chronologii"
                  </span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-2.5 max-h-48 overflow-y-auto custom-scrollbar pr-1">
                  {clipsByStage['unassigned']?.map(clip => (
                    <div key={clip.id} className="bg-[#121212] border border-[#2A2824] rounded-lg p-2 space-y-1.5 text-[11px]">
                      <div className="aspect-video bg-black rounded overflow-hidden relative">
                        {clip.thumbnailUrl ? (
                          <img src={clip.thumbnailUrl} alt={clip.name} className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-white/20"><Film className="w-4 h-4" /></div>
                        )}
                        <span className="absolute bottom-1 right-1 bg-black/80 px-1 rounded text-[9px] font-mono">
                          {Math.round(clip.duration)}s
                        </span>
                      </div>
                      <p className="truncate font-medium text-white text-[10px]" title={clip.name}>{clip.name}</p>
                      
                      <select
                        value={clipCategories[clip.id] || 'unassigned'}
                        onChange={(e) => handleAssignClipToStage(clip.id, e.target.value as any)}
                        className="w-full bg-[#1F1F1F] border border-[#333] text-[10px] text-[#D4AF37] rounded px-1 py-1 focus:outline-none cursor-pointer"
                      >
                        <option value="unassigned">Przypisz do...</option>
                        {WEDDING_CHAPTER_DEFINITIONS.map(def => (
                          <option key={def.key} value={def.key}>{def.label}</option>
                        ))}
                      </select>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Stages Grid */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-mono uppercase tracking-wider text-[#AAA69D]">
                  Etapy Scenariusza Ślubnego ({activeStagesCount}/10 aktywnych)
                </h3>
                <span className="text-[11px] text-[#777]">
                  Możesz wyłączyć etapy, których nie zarejestrowano na weselu
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {WEDDING_CHAPTER_DEFINITIONS.map((def, idx) => {
                  const isActive = activeStageKeys[def.key];
                  const stageClips = clipsByStage[def.key] || [];
                  const totalStageSec = stageClips.reduce((sum, c) => sum + (c.duration || 0), 0);

                  return (
                    <div 
                      key={def.key}
                      className={`border rounded-2xl p-4 transition-all space-y-3 ${
                        isActive 
                          ? 'bg-[#121212] border-[#2A2824]' 
                          : 'bg-[#0E0E0E] border-[#1C1C1C] opacity-50'
                      }`}
                    >
                      {/* Stage Header */}
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-start gap-3">
                          <input 
                            type="checkbox"
                            checked={isActive}
                            onChange={() => toggleStage(def.key)}
                            className="mt-1 accent-[#D4AF37] cursor-pointer"
                            id={`stage_check_${def.key}`}
                          />
                          <div>
                            <div className="flex items-center gap-2">
                              <span 
                                className="w-2.5 h-2.5 rounded-full shrink-0" 
                                style={{ backgroundColor: def.color }} 
                              />
                              <label 
                                htmlFor={`stage_check_${def.key}`} 
                                className="font-serif-luxury font-bold text-sm text-white cursor-pointer"
                              >
                                {def.defaultTitle || def.label}
                              </label>
                            </div>
                            <p className="text-[11px] text-[#AAA69D] mt-0.5">{def.desc}</p>
                          </div>
                        </div>

                        <div className="text-right shrink-0">
                          <span className="inline-flex items-center gap-1 font-mono text-[10px] bg-[#1A1A1A] px-2 py-0.5 rounded border border-[#2A2824] text-[#D4AF37]">
                            {stageClips.length} ujęć ({formatDurationDisplay(totalStageSec)})
                          </span>
                        </div>
                      </div>

                      {/* Stage Clips Strip */}
                      {isActive && (
                        <div className="pt-2 border-t border-[#1F1F1F]">
                          {stageClips.length === 0 ? (
                            <div className="p-3 rounded-lg border border-dashed border-[#222] text-center text-[11px] text-[#666]">
                              Brak ujęć w tym etapie. Użyj przycisku chronologii lub przypisz ujęcia ręcznie.
                            </div>
                          ) : (
                            <div className="flex items-center gap-2 overflow-x-auto custom-scrollbar pb-1.5">
                              {stageClips.map(clip => {
                                const isChecked = selectedClipIds.includes(clip.id);
                                const isPortrait = clip.orientation === 'portrait' || (clip.height > clip.width);

                                return (
                                  <div 
                                    key={clip.id}
                                    className={`relative shrink-0 w-28 bg-[#181818] border rounded-lg overflow-hidden group transition-all ${
                                      isChecked ? 'border-[#D4AF37]/60' : 'border-[#262626] opacity-60'
                                    }`}
                                  >
                                    <div className="aspect-video bg-black relative">
                                      {clip.thumbnailUrl ? (
                                        <img src={clip.thumbnailUrl} alt={clip.name} className="w-full h-full object-cover" />
                                      ) : (
                                        <div className="w-full h-full flex items-center justify-center text-white/20"><Film className="w-4 h-4" /></div>
                                      )}
                                      
                                      <input 
                                        type="checkbox"
                                        checked={isChecked}
                                        onChange={() => toggleClipSelection(clip.id)}
                                        className="absolute top-1 left-1 accent-[#D4AF37] cursor-pointer"
                                        title="Zaznacz ujęcie do filmu"
                                      />

                                      {isPortrait && (
                                        <span className="absolute top-1 right-1 bg-black/80 text-[8px] font-mono font-bold px-1 rounded text-sky-400">
                                          PION
                                        </span>
                                      )}

                                      <span className="absolute bottom-1 right-1 bg-black/80 text-[9px] font-mono px-1 rounded text-white">
                                        {Math.round(clip.duration)}s
                                      </span>
                                    </div>

                                    <div className="p-1.5">
                                      <p className="truncate text-[10px] text-[#CCC] font-medium" title={clip.name}>
                                        {clip.name}
                                      </p>
                                      
                                      <div className="flex items-center justify-between mt-1">
                                        <select
                                          value={def.key}
                                          onChange={(e) => handleAssignClipToStage(clip.id, e.target.value as any)}
                                          className="bg-transparent text-[9px] text-[#888] hover:text-white cursor-pointer focus:outline-none w-20 truncate"
                                          title="Przenieś to ujęcie do innego etapu"
                                        >
                                          {WEDDING_CHAPTER_DEFINITIONS.map(d => (
                                            <option key={d.key} value={d.key}>{d.label}</option>
                                          ))}
                                          <option value="unassigned">Poczekalnia</option>
                                        </select>

                                        {clip.isFavorite && <Star className="w-2.5 h-2.5 fill-amber-400 text-amber-400 shrink-0" />}
                                      </div>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Next Step Action */}
            <div className="flex justify-end pt-4">
              <button
                onClick={() => setActiveStep('processing')}
                className="luxury-btn-primary px-6 py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider flex items-center gap-2 cursor-pointer shadow-lg"
              >
                <span>Przejdź do: 2. Przerabianie & Styl</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>

          </div>
        )}

        {/* ================= STEP 2: PRZERABIANIE & STYLIZACJA ================= */}
        {activeStep === 'processing' && (
          <div className="max-w-4xl mx-auto space-y-6">
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              
              {/* Option 1: Trimming & Pacing */}
              <div className="p-5 bg-[#121212] border border-[#2A2824] rounded-2xl space-y-4">
                <div className="flex items-center gap-2">
                  <Scissors className="w-4 h-4 text-[#D4AF37]" />
                  <h3 className="font-serif-luxury font-bold text-sm text-white">
                    Przycinanie Długości & Rytm Ujęć
                  </h3>
                </div>
                <p className="text-[11px] text-[#AAA69D]">
                  Zdecyduj, jak silnik ma przetworzyć i przyciąć ujęcia w spójnym ciągu.
                </p>

                <div className="space-y-2">
                  {[
                    {
                      id: 'full',
                      label: '100% Oryginalna Długość (Pełny Dokument)',
                      desc: 'Żadne ujęcie nie jest skracane ani o sekundę. Pełna pamiątka całego dnia.',
                      badge: 'Bez cięć'
                    },
                    {
                      id: 'teaser',
                      label: 'Kinowy Teaser / Skrót (2 - 4 minuty)',
                      desc: 'Dynamiczne esencje (3-4 sekundy z każdego ujęcia z łagodnym wejściem/wyjściem).',
                      badge: 'Teledysk'
                    },
                    {
                      id: 'highlights',
                      label: 'Złoty Skrót Weselny / Highlights (6 - 12 minut)',
                      desc: 'Zbalansowane wycinki najważniejszych momentów (do 12 sekund na ujęcie).',
                      badge: 'Polecane'
                    },
                    {
                      id: 'smart_mix',
                      label: 'Miks Adaptacyjny (Pełna Ceremonia + Skrót Zabawy)',
                      desc: 'Ceremonia, Pierwszy Taniec i Toasty w 100% pełnej długości, reszta w skrótach 7s.',
                      badge: 'Inteligentny'
                    }
                  ].map(opt => (
                    <div
                      key={opt.id}
                      onClick={() => setTrimmingMode(opt.id as any)}
                      className={`p-3 rounded-xl border text-xs cursor-pointer transition-all ${
                        trimmingMode === opt.id
                          ? 'border-[#D4AF37] bg-[#1F1C16] text-white shadow-md'
                          : 'border-[#222] bg-[#161616] text-[#888] hover:border-[#333]'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-bold">{opt.label}</span>
                        <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-black/50 border border-white/10 text-[#D4AF37]">
                          {opt.badge}
                        </span>
                      </div>
                      <p className="text-[11px] text-[#AAA69D] mt-1">{opt.desc}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Option 2: Aspect Ratio & Framing */}
              <div className="p-5 bg-[#121212] border border-[#2A2824] rounded-2xl space-y-4">
                <div className="flex items-center gap-2">
                  <Smartphone className="w-4 h-4 text-[#D4AF37]" />
                  <h3 className="font-serif-luxury font-bold text-sm text-white">
                    Format Kadrowania
                  </h3>
                </div>
                <p className="text-[11px] text-[#AAA69D]">
                  Wybierz sposób prezentacji ujęć bez modyfikacji i bez sztucznego powielania obrazu w tle.
                </p>

                <div className="space-y-2">
                  {[
                    {
                      id: 'fit',
                      label: 'Dopasuj do ekranu (Fit - Zachowaj pełny kadr)',
                      desc: 'Wyświetla oryginalny, pełny kadr wideo bez żadnych przycięć ani zniekształceń.',
                      badge: 'Domyślny'
                    },
                    {
                      id: 'fill',
                      label: 'Wypełnij kadr (Fill)',
                      desc: 'Wypełnia cały ekran 16:9 z delikatnym przycięciem brzegów.',
                      badge: 'Pełny ekran'
                    }
                  ].map(opt => (
                    <div
                      key={opt.id}
                      onClick={() => setAspectRatioChoice(opt.id as any)}
                      className={`p-3 rounded-xl border text-xs cursor-pointer transition-all ${
                        aspectRatioChoice === opt.id
                          ? 'border-[#D4AF37] bg-[#1F1C16] text-white shadow-md'
                          : 'border-[#222] bg-[#161616] text-[#888] hover:border-[#333]'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-bold">{opt.label}</span>
                        <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-black/50 border border-white/10 text-[#D4AF37]">
                          {opt.badge}
                        </span>
                      </div>
                      <p className="text-[11px] text-[#AAA69D] mt-1">{opt.desc}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Option 3: Transitions */}
              <div className="p-5 bg-[#121212] border border-[#2A2824] rounded-2xl space-y-4">
                <div className="flex items-center gap-2">
                  <Layers className="w-4 h-4 text-[#D4AF37]" />
                  <h3 className="font-serif-luxury font-bold text-sm text-white">
                    Płynne Przejścia Między Ujęciami
                  </h3>
                </div>

                <div className="space-y-2">
                  {[
                    { id: 'crossfade', label: '💫 Płynne Przenikanie (Crossfade 0.8s)', desc: 'Organiczne, filmowe łączenie scen bez szarpnięć.' },
                    { id: 'dip_black', label: '🌑 Ściemnienie do czerni (Dip to Black 0.6s)', desc: 'Eleganckie wygaszanie scen i oddzielanie etapów wesela.' },
                    { id: 'cut', label: '⚡ Klasyczne Cięcie Montażowe (Hard Cut)', desc: 'Dynamiczny montaż teledyskowy w rytm muzyki.' }
                  ].map(t => (
                    <div
                      key={t.id}
                      onClick={() => setTransitionChoice(t.id as any)}
                      className={`p-2.5 rounded-xl border text-xs cursor-pointer transition-all ${
                        transitionChoice === t.id
                          ? 'border-[#D4AF37] bg-[#1F1C16] text-white shadow-md'
                          : 'border-[#222] bg-[#161616] text-[#888] hover:border-[#333]'
                      }`}
                    >
                      <div className="font-bold">{t.label}</div>
                      <div className="text-[10px] text-[#AAA69D] mt-0.5">{t.desc}</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Option 5: Titles and Personalization */}
              <div className="p-5 bg-[#121212] border border-[#2A2824] rounded-2xl space-y-4 md:col-span-2">
                <div className="flex items-center gap-2">
                  <Bookmark className="w-4 h-4 text-[#D4AF37]" />
                  <h3 className="font-serif-luxury font-bold text-sm text-white">
                    Personalizacja, Plansze Rozdziałów i Dźwięk
                  </h3>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-mono uppercase tracking-wider text-[#AAA69D]">Imiona Pary Młodej</label>
                    <input 
                      type="text" 
                      value={coupleNames} 
                      onChange={(e) => setCoupleNames(e.target.value)} 
                      placeholder="np. Joanna & Piotr"
                      className="w-full bg-[#181818] border border-[#2A2824] rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-[#D4AF37]"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[10px] font-mono uppercase tracking-wider text-[#AAA69D]">Data Ślubu</label>
                    <input 
                      type="text" 
                      value={weddingDate} 
                      onChange={(e) => setWeddingDate(e.target.value)} 
                      placeholder="np. 14.09.2024"
                      className="w-full bg-[#181818] border border-[#2A2824] rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-[#D4AF37]"
                    />
                  </div>
                </div>

                {/* Checkbox Toggles */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2 text-xs text-[#AAA69D]">
                  <label className="flex items-center gap-2 cursor-pointer bg-[#181818] p-2.5 rounded-xl border border-[#2A2824]">
                    <input 
                      type="checkbox" 
                      checked={includeIntroTitle} 
                      onChange={(e) => setIncludeIntroTitle(e.target.checked)} 
                      className="accent-[#D4AF37]"
                    />
                    <span>Plansza powitalna intro</span>
                  </label>

                  <label className="flex items-center gap-2 cursor-pointer bg-[#181818] p-2.5 rounded-xl border border-[#2A2824]">
                    <input 
                      type="checkbox" 
                      checked={includeChapterCards} 
                      onChange={(e) => setIncludeChapterCards(e.target.checked)} 
                      className="accent-[#D4AF37]"
                    />
                    <span>Napisy rozdziałów (np. Sakrament)</span>
                  </label>

                  <label className="flex items-center gap-2 cursor-pointer bg-[#181818] p-2.5 rounded-xl border border-[#2A2824]">
                    <input 
                      type="checkbox" 
                      checked={includeOutroTitle} 
                      onChange={(e) => setIncludeOutroTitle(e.target.checked)} 
                      className="accent-[#D4AF37]"
                    />
                    <span>Plansza końcowa z podziękowaniem</span>
                  </label>
                </div>
              </div>

            </div>

            {/* Navigation buttons */}
            <div className="flex items-center justify-between pt-4">
              <button
                onClick={() => setActiveStep('definition')}
                className="px-4 py-2.5 rounded-xl border border-[#2A2824] bg-[#161616] text-[#AAA69D] hover:text-white text-xs font-medium cursor-pointer"
              >
                ← Wróć do: 1. Definicja Scenariusza
              </button>

              <button
                onClick={() => setActiveStep('assembly')}
                className="luxury-btn-primary px-6 py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider flex items-center gap-2 cursor-pointer shadow-lg"
              >
                <span>Przejdź do: 3. Sklejanie w Ciąg</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>

          </div>
        )}

        {/* ================= STEP 3: SKLEJANIE W JEDEN SPÓJNY CIĄG ================= */}
        {activeStep === 'assembly' && (
          <div className="max-w-4xl mx-auto space-y-6">
            
            {/* Final Assembly Summary Card */}
            <div className="bg-gradient-to-r from-[#171510] via-[#1A1812] to-[#171510] border border-[#D4AF37]/50 rounded-2xl p-6 shadow-2xl space-y-4">
              <div className="flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-[#D4AF37]" />
                <h3 className="font-serif-luxury font-bold text-lg text-white">
                  Gotowy do Bezszwowego Sklejenia w Jeden Spójny Ciąg
                </h3>
              </div>
              <p className="text-xs text-[#AAA69D]">
                Wszystkie ujęcia zostaną połączone w 100% ciągły strumień wideo na osi czasu bez ani jednej luki, z płynnymi przejściami, adaptacją formatu pionowego i planszami rozdziałów.
              </p>

              {/* Specs Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2">
                <div className="bg-black/50 border border-white/10 rounded-xl p-3 text-center">
                  <div className="text-[10px] uppercase font-mono text-[#888]">Łączny Czas Filmu</div>
                  <div className="text-base font-mono font-bold text-[#D4AF37] mt-0.5">
                    {formatDurationDisplay(estimatedTotalDuration)}
                  </div>
                </div>

                <div className="bg-black/50 border border-white/10 rounded-xl p-3 text-center">
                  <div className="text-[10px] uppercase font-mono text-[#888]">Ujęć w Sekwencji</div>
                  <div className="text-base font-mono font-bold text-white mt-0.5">
                    {selectedClipIds.length} scen
                  </div>
                </div>

                <div className="bg-black/50 border border-white/10 rounded-xl p-3 text-center">
                  <div className="text-[10px] uppercase font-mono text-[#888]">Etapy Definicji</div>
                  <div className="text-base font-mono font-bold text-sky-400 mt-0.5">
                    {activeStagesCount} rozdziałów
                  </div>
                </div>
              </div>
            </div>

            {/* Sequence Flow Visualizer */}
            <div className="p-5 bg-[#121212] border border-[#2A2824] rounded-2xl space-y-3">
              <h4 className="text-xs font-mono uppercase tracking-wider text-[#AAA69D] flex items-center gap-1.5">
                <Film className="w-3.5 h-3.5 text-[#D4AF37]" />
                Kolejność Rozdziałów w Gotowym Filmie
              </h4>

              <div className="flex items-center gap-2 overflow-x-auto custom-scrollbar pb-2 pt-1">
                {includeIntroTitle && (
                  <div className="shrink-0 bg-[#1F1C14] border border-[#D4AF37]/40 rounded-xl px-3 py-2 text-center text-xs">
                    <span className="text-[9px] font-mono text-[#D4AF37]">INTRO</span>
                    <p className="font-bold text-white text-[11px] truncate max-w-[120px]">{coupleNames}</p>
                    <span className="text-[9px] text-[#888]">4.5s</span>
                  </div>
                )}

                {WEDDING_CHAPTER_DEFINITIONS.filter(d => activeStageKeys[d.key]).map((def, idx) => {
                  const stageClips = (clipsByStage[def.key] || []).filter(c => selectedClipIds.includes(c.id));
                  return (
                    <div 
                      key={def.key} 
                      className="shrink-0 bg-[#161616] border border-[#2A2824] rounded-xl px-3 py-2 text-center text-xs min-w-[110px]"
                    >
                      <span className="text-[9px] font-mono text-[#AAA69D]" style={{ color: def.color }}>
                        ROZDZIAŁ {idx + 1}
                      </span>
                      <p className="font-bold text-white text-[11px] truncate max-w-[130px]">{def.label}</p>
                      <span className="text-[9px] text-[#777] font-mono">{stageClips.length} ujęć</span>
                    </div>
                  );
                })}

                {includeOutroTitle && (
                  <div className="shrink-0 bg-[#1F1C14] border border-[#D4AF37]/40 rounded-xl px-3 py-2 text-center text-xs">
                    <span className="text-[9px] font-mono text-[#D4AF37]">FINAŁ</span>
                    <p className="font-bold text-white text-[11px]">Podziękowania</p>
                    <span className="text-[9px] text-[#888]">4.0s</span>
                  </div>
                )}
              </div>
            </div>

            {/* Direct Action Execution Buttons */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2">
              
              {/* Button 1: Glue & Play in Preview */}
              <button
                onClick={() => handleGlueAndAssemble('preview')}
                className="bg-[#D4AF37] hover:bg-[#FDE047] text-black font-bold p-4 rounded-2xl shadow-xl flex flex-col items-center justify-center text-center gap-1.5 transition-transform hover:scale-[1.02] cursor-pointer"
              >
                <div className="p-2.5 bg-black/10 rounded-full">
                  <Play className="w-6 h-6 text-black fill-black" />
                </div>
                <span className="text-sm uppercase tracking-wider font-bold">🎬 Sklej i Odtwórz Film</span>
                <span className="text-[11px] text-black/80 font-normal">
                  Natychmiast uruchamia odtwarzacz wideo
                </span>
              </button>

              {/* Button 2: Glue & Export to MP4 */}
              <button
                onClick={() => handleGlueAndAssemble('export')}
                className="bg-[#1C1A17] hover:bg-[#25221E] border border-[#D4AF37] text-[#D4AF37] font-bold p-4 rounded-2xl shadow-xl flex flex-col items-center justify-center text-center gap-1.5 transition-transform hover:scale-[1.02] cursor-pointer"
              >
                <div className="p-2.5 bg-[#D4AF37]/15 rounded-full">
                  <Download className="w-6 h-6 text-[#D4AF37]" />
                </div>
                <span className="text-sm uppercase tracking-wider font-bold">⚡ Sklej i Eksportuj do MP4</span>
                <span className="text-[11px] text-[#AAA69D] font-normal">
                  Przejdź od razu do pobrania pliku wideo
                </span>
              </button>

              {/* Button 3: Glue & Pro Timeline */}
              <button
                onClick={() => handleGlueAndAssemble('timeline')}
                className="bg-[#161616] hover:bg-[#202020] border border-[#2A2824] text-white font-bold p-4 rounded-2xl shadow-md flex flex-col items-center justify-center text-center gap-1.5 transition-transform hover:scale-[1.02] cursor-pointer"
              >
                <div className="p-2.5 bg-[#252525] rounded-full">
                  <Film className="w-6 h-6 text-stone-300" />
                </div>
                <span className="text-sm uppercase tracking-wider font-bold">🎛️ Otwórz w Osi Czasu (Pro)</span>
                <span className="text-[11px] text-[#AAA69D] font-normal">
                  Dla precyzyjnych cięć i mikro-edycji
                </span>
              </button>

            </div>

          </div>
        )}

      </div>

      {/* Persistent Bottom Action Bar */}
      <div className="border-t border-[#2A2824] bg-[#0E0E0E] px-6 py-3.5 flex flex-col sm:flex-row items-center justify-between gap-4 shrink-0">
        <div className="flex items-center gap-3 text-xs">
          <span className="font-mono text-white bg-[#1A1A1A] px-2.5 py-1 rounded border border-[#333]">
            {formatDurationDisplay(estimatedTotalDuration)}
          </span>
          <span className="text-[#AAA69D]">
            {selectedClipIds.length} ujęć • {activeStagesCount} etapów wg definicji • {trimmingMode === 'full' ? '100% oryginał' : trimmingMode}
          </span>
        </div>

        <div className="flex items-center gap-3 w-full sm:w-auto">
          <button
            onClick={() => handleGlueAndAssemble('preview')}
            disabled={selectedClipIds.length === 0}
            className="flex-1 sm:flex-initial luxury-btn-primary px-5 py-2 rounded-xl text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-2 cursor-pointer disabled:opacity-40 shadow-lg"
          >
            <Play className="w-3.5 h-3.5 fill-black" />
            <span>Sklej i Odtwórz</span>
          </button>

          <button
            onClick={() => handleGlueAndAssemble('export')}
            disabled={selectedClipIds.length === 0}
            className="flex-1 sm:flex-initial px-4 py-2 rounded-xl border border-[#D4AF37]/50 bg-[#1B1914] text-[#D4AF37] hover:bg-[#D4AF37]/20 text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-2 cursor-pointer disabled:opacity-40"
          >
            <Download className="w-3.5 h-3.5 text-[#D4AF37]" />
            <span>Eksport MP4</span>
          </button>
        </div>
      </div>

    </div>
  );
}
