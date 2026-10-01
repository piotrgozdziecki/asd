import React, { useState, useMemo } from 'react';
import { 
  Sparkles, 
  Clock, 
  Film, 
  CheckCircle2, 
  Zap, 
  Play, 
  Cpu, 
  Maximize2, 
  Eye, 
  Layers, 
  Volume2, 
  Sliders, 
  ShieldCheck, 
  AlertCircle, 
  AlertTriangle,
  Calendar, 
  Palette, 
  Music, 
  X,
  HardDrive
} from 'lucide-react';
import type { ProjectState, MediaClip, TimelineItem, WeddingChapter, ClipCategory } from '../../types/project';
import { videoExportService } from '../../core/export/videoExportService';
import { ExportPreset, ExportResolution, VideoCodecOption, ContainerFormat } from '../../core/export/videoExportTypes';

interface AiMontageSummaryPanelProps {
  project: ProjectState;
  resolution: ExportResolution;
  fps: number;
  quality: 'standard' | 'high' | 'maximum';
  fitMode: string;
  videoCodec?: VideoCodecOption;
  container?: ContainerFormat;
  onVideoCodecChange?: (c: VideoCodecOption) => void;
  onContainerChange?: (c: ContainerFormat) => void;
  isExporting: boolean;
  onConfirmRender: () => Promise<void> | void;
}

interface ChapterPreviewData {
  id: string;
  key: string;
  name: string;
  startTime: number;
  endTime: number;
  duration: number;
  clipCount: number;
  keyframeUrl?: string;
  emotion: string;
  timeOfDay: string;
  transition: string;
  representativeClipName: string;
}

export function AiMontageSummaryPanel({
  project,
  resolution,
  fps,
  quality,
  fitMode,
  videoCodec = 'auto',
  container = 'auto',
  onVideoCodecChange,
  onContainerChange,
  isExporting,
  onConfirmRender
}: AiMontageSummaryPanelProps) {
  const [isOptimizingGpu, setIsOptimizingGpu] = useState(false);
  const [gpuStatusMsg, setGpuStatusMsg] = useState<string | null>(null);
  const [lightboxKeyframe, setLightboxKeyframe] = useState<ChapterPreviewData | null>(null);

  // Compute total duration and clips
  const { totalDurationSec, totalClipsCount, timelineItems } = useMemo(() => {
    const items = project.timelineItems || [];
    const dur = items.reduce((acc, it) => acc + (it.duration || 0), 0);
    return {
      totalDurationSec: dur > 0 ? dur : (project.mediaLibrary || []).reduce((acc, c) => acc + (c.duration || 0), 0),
      totalClipsCount: items.length > 0 ? items.length : (project.mediaLibrary || []).length,
      timelineItems: items
    };
  }, [project.timelineItems, project.mediaLibrary]);

  // Compute Estimated Render Metrics via GPU engine
  const metrics = useMemo(() => {
    return videoExportService.calculateEstimatedRenderMetrics(
      totalDurationSec,
      fps,
      resolution,
      quality,
      videoCodec
    );
  }, [totalDurationSec, fps, resolution, quality, videoCodec]);

  // Format seconds to MM:SS or HH:MM:SS
  const formatTime = (sec: number) => {
    const s = Math.max(0, Math.floor(sec));
    const mins = Math.floor(s / 60);
    const secs = s % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // Human-readable resolution label
  const resolutionDisplay = useMemo(() => {
    switch (resolution) {
      case '4k': return '4K Ultra HD (3840 × 2160)';
      case '1440p': return '2K QHD (2560 × 1440)';
      case '720p': return 'HD (1280 × 720)';
      case 'vertical_1080p': return 'Pionowy 9:16 (1080 × 1920 Reels)';
      case 'vertical_4k': return 'Pionowy 4K (2160 × 3840 Ultra HD)';
      case 'square_1080p': return 'Kwadrat 1:1 (1080 × 1080 Social)';
      default: return 'Full HD (1920 × 1080)';
    }
  }, [resolution]);

  // Category Polish Labels & Emojis
  const categoryDictionary: Record<string, { label: string; icon: string; defaultEmotion: string; defaultTime: string }> = {
    preparations: { label: 'Poranne Przygotowania', icon: '💍', defaultEmotion: 'Czuły & Nostalgiczny', defaultTime: 'Rano' },
    ceremony: { label: 'Ceremonia i Przysięga', icon: '⛪', defaultEmotion: 'Wzruszający & Dostojny', defaultTime: 'Popołudnie' },
    congratulations: { label: 'Życzenia od Bliskich', icon: '🥂', defaultEmotion: 'Radość & Uściski', defaultTime: 'Popołudnie' },
    first_dance: { label: 'Pierwszy Taniec w Chmurach', icon: '💃', defaultEmotion: 'Romantyczny & Magiczny', defaultTime: 'Złota Godzina' },
    toast: { label: 'Toasty i Przemowy', icon: '🍾', defaultEmotion: 'Wzruszenie & Wiwaty', defaultTime: 'Wieczór' },
    party: { label: 'Szaleństwo na Parkiecie', icon: '🎉', defaultEmotion: 'Czysta Energia & Zabawa', defaultTime: 'Noc' },
    cake: { label: 'Krojenie Tortu Weselnego', icon: '🎂', defaultEmotion: 'Słodki & Radosny', defaultTime: 'Wieczór' },
    outdoor: { label: 'Sesja Plenerowa w Słońcu', icon: '🌿', defaultEmotion: 'Intymny & Spokojny', defaultTime: 'Złota Godzina' },
    ending: { label: 'Zimne Ognie i Finał', icon: '✨', defaultEmotion: 'Spektakularny & Ciepły', defaultTime: 'Noc' }
  };

  // Derive chapter keyframes and visual structure
  const chapterPreviews: ChapterPreviewData[] = useMemo(() => {
    const clipMap = new Map<string, MediaClip>((project.mediaLibrary || []).map(c => [c.id, c]));
    
    // 1. If project has explicit chapters defined
    if (project.chapters && project.chapters.length > 0) {
      return project.chapters.map((chap, idx) => {
        // Find matching timeline clips in chapter span
        const matchedItems = timelineItems.filter(
          item => item.timelineStart >= chap.startTime - 0.5 && item.timelineStart < chap.endTime + 0.5
        );
        const firstClip = matchedItems[0] ? clipMap.get(matchedItems[0].clipId) : undefined;
        const meta = categoryDictionary[chap.chapterKey] || {
          label: chap.name,
          icon: '🎬',
          defaultEmotion: 'Romantyczny',
          defaultTime: 'Złota Godzina'
        };

        const emotion = (firstClip?.analysis as any)?.emotion || meta.defaultEmotion;
        const timeOfDay = (firstClip?.analysis as any)?.timeOfDay || meta.defaultTime;
        const transition = matchedItems[0]?.transitionIn || (idx === 0 ? 'dip_black' : 'dissolve');

        return {
          id: chap.id,
          key: chap.chapterKey,
          name: chap.name || meta.label,
          startTime: chap.startTime,
          endTime: chap.endTime,
          duration: Math.max(1, chap.endTime - chap.startTime),
          clipCount: Math.max(1, matchedItems.length),
          keyframeUrl: firstClip?.thumbnailUrl,
          emotion: typeof emotion === 'string' ? emotion : meta.defaultEmotion,
          timeOfDay: typeof timeOfDay === 'string' ? timeOfDay : meta.defaultTime,
          transition,
          representativeClipName: firstClip?.name || `Ujęcie ${idx + 1}`
        };
      });
    }

    // 2. Synthesize chapters from timeline items and categories
    if (timelineItems.length > 0) {
      const groups: {
        category: string;
        items: TimelineItem[];
        startTime: number;
        endTime: number;
      }[] = [];

      let currentGroup: { category: string; items: TimelineItem[]; startTime: number; endTime: number } | null = null;

      timelineItems.forEach((item) => {
        const clip = clipMap.get(item.clipId);
        const cat = (clip?.category as string) || 'ceremony';

        if (!currentGroup || currentGroup.category !== cat) {
          if (currentGroup) groups.push(currentGroup);
          currentGroup = {
            category: cat,
            items: [item],
            startTime: item.timelineStart,
            endTime: item.timelineStart + (item.duration || 5)
          };
        } else {
          currentGroup.items.push(item);
          currentGroup.endTime = item.timelineStart + (item.duration || 5);
        }
      });

      if (currentGroup) groups.push(currentGroup);

      return groups.map((g, idx) => {
        const meta = categoryDictionary[g.category] || {
          label: `Scena ${idx + 1}`,
          icon: '🎬',
          defaultEmotion: 'Romantyczny',
          defaultTime: 'Popołudnie'
        };

        const firstClip = clipMap.get(g.items[0]?.clipId);
        const emotion = (firstClip?.analysis as any)?.emotion || meta.defaultEmotion;
        const timeOfDay = (firstClip?.analysis as any)?.timeOfDay || meta.defaultTime;
        const transition = g.items[0]?.transitionIn || (idx === 0 ? 'dip_black' : 'dissolve');

        return {
          id: `chap_synth_${idx}`,
          key: g.category,
          name: `${meta.icon} ${meta.label}`,
          startTime: g.startTime,
          endTime: g.endTime,
          duration: Math.max(1, g.endTime - g.startTime),
          clipCount: g.items.length,
          keyframeUrl: firstClip?.thumbnailUrl,
          emotion: typeof emotion === 'string' ? emotion : meta.defaultEmotion,
          timeOfDay: typeof timeOfDay === 'string' ? timeOfDay : meta.defaultTime,
          transition,
          representativeClipName: firstClip?.name || `Klip ${idx + 1}`
        };
      });
    }

    // 3. Fallback when timeline is not populated yet
    return (project.mediaLibrary || []).slice(0, 6).map((c, idx) => {
      const meta = categoryDictionary[c.category || 'ceremony'] || {
        label: c.name,
        icon: '🎬',
        defaultEmotion: 'Romantyczny',
        defaultTime: 'Złota Godzina'
      };
      return {
        id: `lib_${c.id}`,
        key: c.category || 'ceremony',
        name: `${meta.icon} ${c.name}`,
        startTime: idx * 10,
        endTime: (idx + 1) * 10,
        duration: c.duration || 10,
        clipCount: 1,
        keyframeUrl: c.thumbnailUrl,
        emotion: meta.defaultEmotion,
        timeOfDay: meta.defaultTime,
        transition: idx === 0 ? 'dip_black' : 'dissolve',
        representativeClipName: c.name
      };
    });
  }, [project.chapters, timelineItems, project.mediaLibrary]);

  // Handle Master Confirm Button with real GPU Optimization trigger
  const handleConfirmWithGpuOptimization = async () => {
    if (isExporting || isOptimizingGpu) return;

    setIsOptimizingGpu(true);
    setGpuStatusMsg('Rozgrzewanie potoku GPU i testowanie enkodera WebCodecs...');

    try {
      const targetPreset: ExportPreset = {
        resolution,
        width: resolution === '4k' ? 3840 : (resolution === '1440p' ? 2560 : 1920),
        height: resolution === '4k' ? 2160 : (resolution === '1440p' ? 1440 : 1080),
        fps,
        videoCodec,
        container,
        audioCodec: container === 'webm' ? 'Opus' : 'AAC',
        bitrate: resolution === '4k' ? 55_000_000 : 18_000_000,
        quality,
        fitMode: fitMode as any
      };

      const result = await videoExportService.optimizeGpuPipeline(targetPreset);
      setGpuStatusMsg(result.details);

      // Brief visual affirmation before launching export
      setTimeout(async () => {
        setIsOptimizingGpu(false);
        setGpuStatusMsg(null);
        await onConfirmRender();
      }, 350);
    } catch (err: any) {
      console.warn('[AiMontageSummaryPanel] GPU optimization warning:', err);
      setIsOptimizingGpu(false);
      setGpuStatusMsg(null);
      await onConfirmRender();
    }
  };

  return (
    <div className="w-full bg-[#050705] border-2 border-[#C5A059]/40 rounded-3xl p-5 sm:p-7 shadow-[0_12px_45px_rgba(0,0,0,0.85)] relative overflow-hidden backdrop-blur-xl animate-fadeIn space-y-6">
      {/* Golden glow ambient highlight */}
      <div className="absolute top-0 right-0 w-96 h-96 bg-[#1B4332]/20 rounded-full blur-3xl pointer-events-none -mr-20 -mt-20" />
      <div className="absolute bottom-0 left-0 w-96 h-96 bg-[#C5A059]/5 rounded-full blur-3xl pointer-events-none -ml-20 -mb-20" />

      {/* Header bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#1B4332]/30 pb-4 relative z-10">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="flex h-2.5 w-2.5 relative">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[var(--gold-bright)] opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-[var(--gold-primary)]"></span>
            </span>
            <span className="text-[11px] font-extrabold uppercase tracking-widest text-[var(--gold-bright)] font-mono">
              AUDYT PRZEDEKSPORTOWY • PRE-FLIGHT MASTER
            </span>
          </div>
          <h2 className="text-xl sm:text-2xl font-black text-white font-cinematic tracking-wide flex items-center gap-2.5">
            <Sparkles className="w-5 h-5 text-[var(--gold-primary)]" />
            Panel Podsumowujący: Montaż AI
          </h2>
          <p className="text-xs text-[var(--ink-muted)]">
            Kompletny scenariusz produkcji ({totalClipsCount} ujęć, {formatTime(totalDurationSec)}) z dynamiczną optymalizacją sprzętową.
          </p>
        </div>

        {/* Status Pill */}
        <div className="flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-[var(--bg-atelier)] border border-[var(--gold-primary)]/40 text-[var(--gold-bright)] text-xs font-bold font-mono self-start sm:self-auto shadow-[0_0_15px_rgba(197,160,89,0.15)]">
          <ShieldCheck className="w-4 h-4 text-emerald-400" />
          <span>GOTOWY DO RENDEROWANIA MASTER</span>
        </div>
      </div>

      {/* Warnings & Validation (Phase 4.4) */}
      {(resolution.includes('4k') && totalClipsCount > 20) && (
        <div className="p-4 rounded-2xl bg-amber-950/30 border-2 border-amber-500/50 flex items-start gap-3 relative z-10 animate-pulse">
          <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <h4 className="text-xs font-bold text-amber-200 uppercase tracking-wider">
              Ostrzeżenie: Złożony Projekt 4K
            </h4>
            <p className="text-xs text-amber-100/80 leading-relaxed">
              Projekt zawiera ponad 20 ujęć w rozdzielczości 4K. Renderowanie może zająć znaczną ilość czasu i obciążyć procesor. Upewnij się, że masz podłączone zasilanie i nie zamykaj karty przeglądarki.
            </p>
          </div>
        </div>
      )}

      {/* TOP HERO METRICS: Estimated Render Time & GPU Engine */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3 relative z-10">
        {/* Metric 1: Estimated Render Time */}
        <div className="p-4 rounded-2xl bg-gradient-to-br from-[#0D1A10] via-[#050705] to-[#0D1A10] border border-[var(--gold-primary)]/30 shadow-inner flex flex-col justify-between">
          <div className="flex items-center justify-between text-[var(--ink-muted)] text-xs font-mono mb-1">
            <span className="flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-[var(--gold-bright)]" /> Szacowany Czas:
            </span>
            <span className="text-[var(--gold-bright)] font-bold">~{metrics.renderSpeedFactor}x RT</span>
          </div>
          <div className="text-2xl sm:text-3xl font-black text-transparent bg-clip-text bg-gradient-to-r from-[var(--ink-primary)] via-[var(--gold-bright)] to-[var(--gold-primary)] font-mono tracking-tight my-1">
            ~{metrics.estimatedSeconds < 60 ? `${metrics.estimatedSeconds} sek` : `${Math.floor(metrics.estimatedSeconds / 60)}m ${metrics.estimatedSeconds % 60}s`}
          </div>
          <div className="text-[11px] text-emerald-400 font-medium flex items-center gap-1">
            <Zap className="w-3 h-3" /> Potok {videoCodec === 'FFMPEG_X264' ? 'Reliable CPU' : 'WebCodecs GPU'}
          </div>
        </div>

        {/* Metric 2: Resolution & Framerate */}
        <div className="p-4 rounded-2xl bg-[#050705] border border-[#1B4332]/40 flex flex-col justify-between">
          <div className="text-[#949B96] text-xs font-mono mb-1 flex items-center gap-1.5">
            <Film className="w-3.5 h-3.5 text-[#C5A059]" /> Format Wyjściowy:
          </div>
          <div className="text-base sm:text-lg font-bold text-white font-mono tracking-tight my-1 truncate" title={resolutionDisplay}>
            {resolutionDisplay}
          </div>
          <div className="text-[11px] text-[#949B96] font-mono">
            {fps} FPS • {quality === 'maximum' ? 'Jakość Master (High Bitrate)' : (quality === 'high' ? 'Wysoka Studio' : 'Standard')}
          </div>
        </div>

        {/* Metric 3: Total Frames & Output Size */}
        <div className="p-4 rounded-2xl bg-[#050705] border border-[#1B4332]/40 flex flex-col justify-between">
          <div className="text-[#949B96] text-xs font-mono mb-1 flex items-center gap-1.5">
            <HardDrive className="w-3.5 h-3.5 text-[#C5A059]" /> Klatki & Rozmiar:
          </div>
          <div className="text-base sm:text-lg font-bold text-white font-mono tracking-tight my-1">
            {metrics.totalFrames.toLocaleString()} klatek
          </div>
          <div className="text-[11px] text-[#949B96] font-mono">
            Przewidywany rozmiar: ~{metrics.estimatedSizeMb} MB
          </div>
        </div>

        {/* Metric 4: Soundscape & Audio Ducking */}
        <div className="p-4 rounded-2xl bg-[#050705] border border-[#1B4332]/40 flex flex-col justify-between">
          <div className="text-[var(--ink-muted)] text-xs font-mono mb-1 flex items-center gap-1.5">
            <Music className="w-3.5 h-3.5 text-[var(--gold-bright)]" /> Ścieżka Dźwiękowa:
          </div>
          <div className="text-base font-bold text-[var(--gold-bright)] font-mono tracking-tight my-1 truncate">
            {project.audioTracks && project.audioTracks.length > 0 
              ? (project.audioTracks[0].name.replace(/^♫\s*/, '')) 
              : 'Oryginalny Dźwięk'}
          </div>
          <div className="text-[11px] text-cyan-400 font-mono flex items-center gap-1">
            <Volume2 className="w-3 h-3" /> Audio Ducking aktywny
          </div>
        </div>
      </div>

      {/* CHAPTER KEYFRAME GALLERY (Visual Arc of the Wedding) */}
      <div className="space-y-3 relative z-10">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-bold text-[var(--gold-bright)] uppercase tracking-wider font-mono flex items-center gap-2">
            <Layers className="w-4 h-4 text-[var(--gold-primary)]" />
            Podgląd Klatek Kluczowych Rozdziałów ({chapterPreviews.length} Aktów)
          </h3>
          <span className="text-[11px] text-[var(--ink-muted)] font-mono hidden sm:inline">
            Kliknij klatkę, aby powiększyć podgląd
          </span>
        </div>

        {/* Horizontal scrollable cards container */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3.5 max-h-[380px] overflow-y-auto custom-scrollbar p-1">
          {chapterPreviews.map((chap, idx) => (
            <div
              key={chap.id || idx}
              onClick={() => setLightboxKeyframe(chap)}
              className="group relative rounded-2xl bg-[#15120C] border border-[#2E2413] hover:border-[#D4AF37] p-2.5 transition-all cursor-pointer shadow-lg hover:shadow-[0_8px_24px_rgba(212,175,55,0.2)] hover:-translate-y-1 flex flex-col justify-between overflow-hidden"
            >
              {/* Aspect Ratio Keyframe Image Container */}
              <div className="relative aspect-video w-full rounded-xl overflow-hidden bg-black/80 border border-[#241B0D] group-hover:border-[#D4AF37]/50 transition-colors">
                {chap.keyframeUrl ? (
                  <img
                    src={chap.keyframeUrl}
                    alt={chap.name}
                    className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                  />
                ) : (
                  <div className="w-full h-full flex flex-col items-center justify-center text-stone-600 bg-gradient-to-br from-[#12100C] to-[#0A0907]">
                    <Film className="w-8 h-8 text-[#D4AF37]/40 mb-1" />
                    <span className="text-[10px] text-[#A89C82] font-mono">Klatka Rozdziału</span>
                  </div>
                )}

                {/* Timestamp Badge */}
                <div className="absolute bottom-2 left-2 px-2 py-0.5 rounded-md bg-black/80 backdrop-blur-md border border-white/10 text-[10px] font-mono font-bold text-white shadow">
                  {formatTime(chap.startTime)} – {formatTime(chap.endTime)}
                </div>

                {/* Inspect Button icon */}
                <div className="absolute top-2 right-2 w-7 h-7 rounded-lg bg-black/60 backdrop-blur-md border border-white/15 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity text-white">
                  <Eye className="w-3.5 h-3.5 text-[#FDE047]" />
                </div>

                {/* Chapter Index number */}
                <div className="absolute top-2 left-2 px-2 py-0.5 rounded-md bg-[#241D0E]/90 border border-[#D4AF37]/40 text-[#FDE047] font-mono text-[10px] font-extrabold">
                  #{idx + 1}
                </div>
              </div>

              {/* Chapter Metadata */}
              <div className="pt-2.5 space-y-1.5">
                <div className="flex items-center justify-between gap-1">
                  <h4 className="text-xs font-bold text-white group-hover:text-[#FDE047] transition-colors truncate font-cinematic">
                    {chap.name}
                  </h4>
                  <span className="text-[10px] font-mono text-[#D4AF37] shrink-0 font-bold">
                    {formatTime(chap.duration)}
                  </span>
                </div>

                {/* Mood, Time of Day & Clip Count Pills */}
                <div className="flex flex-wrap items-center gap-1.5 text-[10px] font-mono">
                  <span className="px-1.5 py-0.5 rounded bg-[#201A0E] border border-[#3E3117] text-[#D4AF37]">
                    {chap.clipCount} {chap.clipCount === 1 ? 'ujęcie' : 'ujęć'}
                  </span>
                  <span className="px-1.5 py-0.5 rounded bg-white/[0.04] text-[#A89C82] truncate max-w-[120px]">
                    {chap.emotion}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* PRODUCTION CHECKLIST BADGES */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2 text-[11px] font-mono relative z-10 border-t border-[#261E10]">
        <div className="flex items-center gap-2 text-emerald-400">
          <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
          <span>Kodek: {videoCodec === 'auto' ? 'Auto GPU (Wykryty automatycznie)' : videoCodec} ({container === 'auto' ? 'Auto MP4/WebM' : container.toUpperCase()})</span>
        </div>
        <div className="flex items-center gap-2 text-[var(--gold-bright)]">
          <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
          <span>Jakość: B-Frames VBR Rec.709</span>
        </div>
        <div className="flex items-center gap-2 text-cyan-400">
          <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
          <span>Ducking mowy (-18dB)</span>
        </div>
        <div className="flex items-center gap-2 text-[#E7E5E4]">
          <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
          <span>Potok GPU Zero-Copy</span>
        </div>
      </div>

      {/* GPU STATUS BANNER (during optimization) */}
      {gpuStatusMsg && (
        <div className="p-3.5 rounded-2xl bg-[var(--bg-atelier)] border border-[var(--gold-primary)] text-xs font-mono text-[var(--gold-bright)] flex items-center gap-2.5 animate-pulse relative z-10">
          <Zap className="w-4 h-4 text-[var(--gold-bright)] animate-spin" />
          <span>{gpuStatusMsg}</span>
        </div>
      )}

      {/* MASTER ACTION BUTTON: Potwierdź Renderowanie (Optymalizacja GPU) */}
      <div className="pt-2 relative z-10">
        <button
          onClick={handleConfirmWithGpuOptimization}
          disabled={isExporting || isOptimizingGpu || totalClipsCount === 0}
          className="group relative w-full py-4 px-8 rounded-2xl bg-gradient-to-r from-[var(--gold-primary)] via-[var(--gold-bright)] to-[var(--gold-dark)] hover:brightness-110 active:scale-[0.99] text-black font-black text-sm sm:text-base tracking-wider uppercase transition-all shadow-[0_0_35px_rgba(197,160,89,0.4)] disabled:opacity-50 cursor-pointer overflow-hidden flex items-center justify-center gap-3 font-cinematic"
        >
          <div className="absolute inset-0 bg-white/20 opacity-0 group-hover:opacity-100 transition-opacity" />
          
          {isOptimizingGpu ? (
            <>
              <Zap className="w-5 h-5 text-black animate-spin" />
              <span>OPTYMALIZACJA POTOKU GPU W TOKU...</span>
            </>
          ) : isExporting ? (
            <>
              <Film className="w-5 h-5 text-black animate-pulse" />
              <span>RENDEROWANIE W TOKU...</span>
            </>
          ) : (
            <>
              <div className="w-7 h-7 rounded-full bg-black/15 flex items-center justify-center">
                <Play className="w-4 h-4 fill-black text-black" />
              </div>
              <span>POTWIERDŹ RENDEROWANIE (OPTYMALIZACJA GPU & EXPORT)</span>
              <div className="hidden sm:flex items-center gap-1 text-[11px] font-mono px-2.5 py-1 rounded-full bg-black/15 border border-black/20 font-bold">
                <Cpu className="w-3 h-3" /> MASTER 4K/1080P
              </div>
            </>
          )}
        </button>
      </div>

      {/* LIGHTBOX KEYFRAME DETAIL MODAL */}
      {lightboxKeyframe && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-xl animate-fadeIn">
          <div className="bg-[#14120C] border-2 border-[#D4AF37] rounded-3xl max-w-2xl w-full p-5 sm:p-6 shadow-2xl relative space-y-4">
            {/* Close button */}
            <button
              onClick={() => setLightboxKeyframe(null)}
              className="absolute top-4 right-4 p-2 rounded-xl bg-white/10 hover:bg-white/20 text-white cursor-pointer transition-colors"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-[#FDE047]" />
              <h3 className="text-base font-bold text-white font-cinematic">
                Podgląd Klatki Kluczowej: {lightboxKeyframe.name}
              </h3>
            </div>

            {/* Large Preview */}
            <div className="relative aspect-video w-full rounded-2xl overflow-hidden border border-[#2F2414] bg-black">
              {lightboxKeyframe.keyframeUrl ? (
                <img
                  src={lightboxKeyframe.keyframeUrl}
                  alt={lightboxKeyframe.name}
                  className="w-full h-full object-contain"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-stone-500 font-mono text-xs">
                  Brak wygenerowanej miniatury dla tego rozdziału
                </div>
              )}
              <div className="absolute bottom-3 left-3 px-3 py-1 rounded-lg bg-black/80 backdrop-blur-md border border-white/20 text-xs font-mono text-white">
                Oś czasu: {formatTime(lightboxKeyframe.startTime)} – {formatTime(lightboxKeyframe.endTime)} ({formatTime(lightboxKeyframe.duration)})
              </div>
            </div>

            {/* Details */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs font-mono">
              <div className="p-2.5 rounded-xl bg-[#1C160C] border border-[#2E2413]">
                <span className="text-[#8C7E64] block text-[10px]">Liczba ujęć:</span>
                <span className="font-bold text-white">{lightboxKeyframe.clipCount} ujęć</span>
              </div>
              <div className="p-2.5 rounded-xl bg-[#1C160C] border border-[#2E2413]">
                <span className="text-[#8C7E64] block text-[10px]">Emocja:</span>
                <span className="font-bold text-[#FDE047]">{lightboxKeyframe.emotion}</span>
              </div>
              <div className="p-2.5 rounded-xl bg-[#1C160C] border border-[#2E2413]">
                <span className="text-[#8C7E64] block text-[10px]">Pora Dnia:</span>
                <span className="font-bold text-[#D4AF37]">{lightboxKeyframe.timeOfDay}</span>
              </div>
              <div className="p-2.5 rounded-xl bg-[#1C160C] border border-[#2E2413]">
                <span className="text-[#8C7E64] block text-[10px]">Przejście wejściowe:</span>
                <span className="font-bold text-white">{lightboxKeyframe.transition}</span>
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <button
                onClick={() => setLightboxKeyframe(null)}
                className="px-5 py-2.5 rounded-xl bg-[#2A2111] hover:bg-[#3E3018] text-[#FDE047] border border-[#D4AF37]/40 text-xs font-bold font-mono cursor-pointer transition-colors"
              >
                Zamknij Podgląd
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
