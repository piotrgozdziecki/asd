import React, { useState, useEffect, useRef, useMemo } from 'react';
import { 
  Download, 
  Play, 
  RotateCcw, 
  CheckCircle2, 
  XCircle, 
  Share2, 
  Clock, 
  Monitor, 
  HardDrive, 
  Loader2, 
  StopCircle,
  FileVideo,
  Info,
  Sliders,
  Sparkles,
  Terminal,
  Activity,
  Cpu,
  RefreshCw,
  AlertTriangle,
  Layers,
  ChevronDown,
  ChevronUp,
  Film,
  Music,
  Maximize2
} from 'lucide-react';
import type { ProjectState } from '../../types/project';
import { videoExportService } from '../../core/export/videoExportService';
import { exportQueueService } from '../../core/export/exportQueueService';
import { 
  ExportOutput, 
  ExportProgress, 
  ExportError, 
  FitMode,
  MediaSource,
  TimelineClip,
  DiagnosticsCapabilities,
  DiagnosticLogEntry,
  ExportStage,
  SerialExportTask,
  ExportResolution,
  VideoCodecOption,
  ContainerFormat
} from '../../core/export/videoExportTypes';
import { urlRegistry } from '../../core/media/urlRegistry';
import { resolveClipMediaUrl } from '../../core/media/mediaResolver';
import { useStudioToast } from '../common/ToastContext';
import { AiMontageSummaryPanel } from './AiMontageSummaryPanel';

interface ExportViewProps {
  project: ProjectState;
  onUpdateProject?: (project: ProjectState) => void;
  onNavigateTab?: (tab: string) => void;
  onResetProject?: () => void;
}

type ExportPresetMode = 'FAST' | 'BALANCED' | 'QUALITY' | 'MAX_QUALITY';

export function ExportView({ project, onUpdateProject, onNavigateTab, onResetProject }: ExportViewProps) {
  const toast = useStudioToast();

  // Settings & Presets
  const [presetMode, setPresetMode] = useState<ExportPresetMode>('BALANCED');
  const [resolution, setResolution] = useState<ExportResolution>('1080p');
  const [fps, setFps] = useState<number>(30);
  const [quality, setQuality] = useState<'standard' | 'high' | 'maximum'>('high');
  const [fitMode, setFitMode] = useState<FitMode>('fit');
  const [videoCodec, setVideoCodec] = useState<VideoCodecOption>('auto');
  const [container, setContainer] = useState<ContainerFormat>('auto');
  const [isManualCodecMode, setIsManualCodecMode] = useState(false);

  // Export State
  const [isExporting, setIsExporting] = useState(false);
  const [progress, setProgress] = useState<ExportProgress | null>(null);
  const [output, setOutput] = useState<ExportOutput | null>(videoExportService.getLastOutput());
  const [error, setError] = useState<ExportError | null>(null);
  const [queueTasks, setQueueTasks] = useState<SerialExportTask[]>([]);

  // Diagnostics & Developer Panel State
  const [showDiagnostics, setShowDiagnostics] = useState(false);
  const [capabilities, setCapabilities] = useState<DiagnosticsCapabilities | null>(null);
  const [testResult, setTestResult] = useState<{ success: boolean; durationMs: number; details: string } | null>(null);
  const [isTestingEngine, setIsTestingEngine] = useState(false);
  const [logs, setLogs] = useState<DiagnosticLogEntry[]>([]);

  // Video preview player ref
  const videoPlayerRef = useRef<HTMLVideoElement>(null);
  const [isPlayingResult, setIsPlayingResult] = useState(false);

  useEffect(() => {
    if (output?.url && videoPlayerRef.current) {
      videoPlayerRef.current.load();
    }
  }, [output?.url]);

  // Load hardware capabilities on mount
  useEffect(() => {
    handleLoadCapabilities();
  }, []);

  const isGpuAccelerated = useMemo(() => {
    if (!capabilities) return true; // Optimistic while loading capabilities
    return Boolean(
      capabilities.webCodecsSupported &&
      capabilities.videoEncoderSupported &&
      (capabilities.hevcHardware || capabilities.av1Hardware || capabilities.vp9Hardware || capabilities.h264Supported)
    );
  }, [capabilities]);

  // Sync preset changes
  const applyPreset = (mode: ExportPresetMode) => {
    setPresetMode(mode);
    switch (mode) {
      case 'FAST':
        setResolution('720p');
        setFps(30);
        setQuality('standard');
        break;
      case 'BALANCED':
        setResolution('1080p');
        setFps(30);
        setQuality('high');
        break;
      case 'QUALITY':
        setResolution('1080p');
        setFps(60);
        setQuality('high');
        break;
      case 'MAX_QUALITY':
        setResolution('4k');
        setFps(60);
        setQuality('maximum');
        break;
    }
  };

  // Compute Sources & Ordered Timeline
  const mediaSources: MediaSource[] = useMemo(() => {
    return (project.mediaLibrary || []).map(clip => {
      const activeUri = (clip.objectUrl && urlRegistry.isAlive(clip.objectUrl))
        ? clip.objectUrl
        : (clip.file ? urlRegistry.create(clip.file) : (clip.objectUrl || ''));

      return {
        id: clip.id,
        uri: activeUri,
        file: clip.file,
        type: clip.type || (/\.(jpe?g|png|webp|gif|svg|bmp)$/i.test(clip.name) ? 'image' : 'video'),
        name: clip.name,
        size: clip.size || 0,
        duration: clip.duration || 1,
        width: clip.width || 1920,
        height: clip.height || 1080,
        fps: clip.fps || 30,
        videoCodec: clip.mimeType?.includes('webm') ? 'VP9' : 'H.264',
        audioCodec: clip.hasAudio ? 'AAC' : 'Brak',
        audioChannels: clip.audioChannels || (clip.hasAudio ? 2 : 0),
        sampleRate: clip.hasAudio ? 48000 : 0,
        orientation: clip.orientation || 'landscape',
        hasAudio: Boolean(clip.hasAudio),
        supported: clip.status !== 'ERROR' && clip.status !== 'error',
        thumbnailUrl: clip.thumbnailUrl
      };
    });
  }, [project.mediaLibrary]);

  const timelineClips: TimelineClip[] = useMemo(() => {
    const rawItems = project.timelineItems || [];
    if (rawItems.length > 0) {
      let currentTimeline = 0;
      return rawItems.map(item => {
        const matchingSource = mediaSources.find(s => s.id === item.clipId);
        const srcDur = matchingSource?.duration || 0;
        let realStart = Math.max(0, item.sourceStart || 0);
        let realEnd = item.sourceEnd;
        
        // If sourceEnd was uninitialized or truncated, heal with full source duration
        if (srcDur > 0) {
          if (realEnd <= realStart || (realEnd <= 2.5 && srcDur > 3.0)) {
            realEnd = srcDur;
          }
        }
        if (!realEnd || realEnd <= realStart) {
          realEnd = srcDur || Math.max(item.duration, 5);
        }

        const realDur = Math.max(0.2, (realEnd - realStart) / (item.speed || 1));
        const itemStart = currentTimeline;
        currentTimeline += realDur;

        return {
          id: item.id,
          sourceId: item.clipId,
          sourceStart: realStart,
          sourceEnd: realEnd,
          timelineStart: itemStart,
          duration: realDur,
          volume: item.volume ?? 1,
          muted: Boolean(item.muted),
          speed: item.speed || 1,
          rotation: item.rotation || 0,
          crop: item.crop,
          fitMode: (item.fitMode as FitMode) || fitMode,
          colorAdjustments: item.colorAdjustments,
          titleCard: item.titleCard,
          transitionIn: item.transitionIn,
          transitionOut: item.transitionOut,
          transitionDuration: item.transitionDuration
        };
      });
    }

    let currentTimeline = 0;
    return mediaSources.map((source, idx) => {
      const dur = Math.max(0.5, source.duration || 5);
      const start = currentTimeline;
      currentTimeline += dur;
      return {
        id: `auto_${idx}_${source.id}`,
        sourceId: source.id,
        sourceStart: 0,
        sourceEnd: dur,
        timelineStart: start,
        duration: dur,
        volume: 1,
        muted: false,
        rotation: 0,
        fitMode
      };
    });
  }, [project.timelineItems, mediaSources, fitMode]);

  const totalClipsCount = timelineClips.length;
  const totalDurationSec = timelineClips.reduce((acc, c) => acc + c.duration, 0);

  const formatDuration = (sec: number) => {
    const mins = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${mins}:${s.toString().padStart(2, '0')}`;
  };

  const formatSize = (bytes: number) => {
    if (!bytes) return '0 MB';
    const mb = bytes / (1024 * 1024);
    if (mb >= 1024) return `${(mb / 1024).toFixed(2)} GB`;
    return `${mb.toFixed(1)} MB`;
  };

  // Subscribe to service progress and export queue
  useEffect(() => {
    const unsubQueue = exportQueueService.subscribe((tasks) => {
      setQueueTasks(tasks);
      const active = tasks.find((t) => t.status === 'processing');
      if (active) {
        setIsExporting(true);
        if (active.progress) setProgress(active.progress);
        if (active.output) setOutput(active.output);
      }
    });

    const unsubscribe = videoExportService.subscribe((p) => {
      setProgress(p);
      if (p.stage === 'COMPLETED' || p.stage === 'FAILED' || p.stage === 'CANCELLED') {
        setIsExporting(false);
      }
      setLogs(videoExportService.getDiagnosticLogs());
    });

    return () => {
      unsubQueue();
      unsubscribe();
    };
  }, []);

  const performCodecTestEncode = async (codecString: string): Promise<boolean> => {
    if (typeof VideoEncoder === 'undefined') return false;
    return new Promise((resolve) => {
      let isResolved = false;
      let encoder: VideoEncoder | null = null;
      let canvas: HTMLCanvasElement | null = null;
      let frame: VideoFrame | null = null;

      const cleanup = () => {
        if (frame) {
          try { frame.close(); } catch {}
        }
        if (encoder) {
          try { encoder.close(); } catch {}
        }
        if (canvas) {
          try { canvas.remove(); } catch {}
        }
      };

      const timeout = setTimeout(() => {
        if (!isResolved) {
          isResolved = true;
          cleanup();
          resolve(false);
        }
      }, 400);

      try {
        encoder = new VideoEncoder({
          output: () => {
            if (!isResolved) {
              isResolved = true;
              clearTimeout(timeout);
              cleanup();
              resolve(true);
            }
          },
          error: (err) => {
            console.warn(`[Auto-Codec] Test encode failed for ${codecString}:`, err);
            if (!isResolved) {
              isResolved = true;
              clearTimeout(timeout);
              cleanup();
              resolve(false);
            }
          }
        });

        const config = {
          codec: codecString,
          width: 128,
          height: 128,
          bitrate: 500000,
          framerate: 30,
          hardwareAcceleration: 'prefer-hardware' as const
        };

        encoder.configure(config);

        canvas = document.createElement('canvas');
        canvas.width = 128;
        canvas.height = 128;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.fillStyle = '#C5A059';
          ctx.fillRect(0, 0, 128, 128);
        }

        frame = new VideoFrame(canvas, { timestamp: 0, duration: 33333 });
        encoder.encode(frame, { keyFrame: true });
        encoder.flush();
      } catch (err) {
        console.warn(`[Auto-Codec] Exception testing ${codecString}:`, err);
        if (!isResolved) {
          isResolved = true;
          clearTimeout(timeout);
          cleanup();
          resolve(false);
        }
      }
    });
  };

  const probeAndSelectOptimalCodec = async (): Promise<VideoCodecOption> => {
    toast.showInfo('🔍 Badanie akceleracji sprzętowej: testowanie najlepszego kodeka...');
    
    // 1. Try H.264 hardware encoding sample write
    const h264Codec = 'avc1.42E01F';
    const hasH264Hw = await performCodecTestEncode(h264Codec);
    if (hasH264Hw) {
      console.log('[Auto-Codec] H.264 hardware acceleration successfully verified.');
      return 'H.264';
    }

    // 2. Try VP9 hardware encoding sample write
    const vp9Codec = 'vp09.00.10.08';
    const hasVp9Hw = await performCodecTestEncode(vp9Codec);
    if (hasVp9Hw) {
      console.log('[Auto-Codec] VP9 hardware acceleration successfully verified.');
      return 'VP9';
    }

    // 3. Fallback to CPU/Reliable codec
    console.warn('[Auto-Codec] No hardware accelerated encoder verified. Falling back to CPU render.');
    return 'FFMPEG_X264';
  };

  const handleEnqueueExport = async () => {
    if (totalClipsCount === 0) {
      toast.showError('Dodaj przynajmniej jeden film, aby rozpocząć eksport.');
      return;
    }

    try {
      const resolvedSources: MediaSource[] = await Promise.all(
        (project.mediaLibrary || []).map(async (clip) => {
          const freshUri = await resolveClipMediaUrl(clip);
          return {
            id: clip.id,
            uri: freshUri || clip.objectUrl || '',
            file: clip.file,
            type: clip.type || (/\.(jpe?g|png|webp|gif|svg|bmp)$/i.test(clip.name) ? 'image' : 'video'),
            name: clip.name,
            size: clip.size || 0,
            duration: clip.duration || 1,
            width: clip.width || 1920,
            height: clip.height || 1080,
            fps: clip.fps || 30,
            videoCodec: clip.mimeType?.includes('webm') ? 'VP9' : 'H.264',
            audioCodec: clip.hasAudio ? 'AAC' : 'Brak',
            audioChannels: clip.audioChannels || (clip.hasAudio ? 2 : 0),
            sampleRate: clip.hasAudio ? 48000 : 0,
            orientation: clip.orientation || 'landscape',
            hasAudio: Boolean(clip.hasAudio),
            supported: clip.status !== 'ERROR' && clip.status !== 'error',
            thumbnailUrl: clip.thumbnailUrl
          };
        })
      );

      let activeVideoCodec = videoCodec;
      if (videoCodec === 'auto') {
        try {
          activeVideoCodec = await probeAndSelectOptimalCodec();
          toast.showSuccess(`✨ Wybrano optymalny sprzętowy kodek: ${activeVideoCodec === 'H.264' ? 'H.264' : (activeVideoCodec === 'VP9' ? 'VP9' : 'CPU render')}`);
        } catch {
          activeVideoCodec = 'H.264';
        }
      }

      const plan = videoExportService.prepareExport(
        resolvedSources.length > 0 ? resolvedSources : mediaSources,
        timelineClips,
        {
          resolution,
          fps,
          quality,
          fitMode,
          videoCodec: activeVideoCodec,
          container,
          colorGrade: (project.settings?.colorGrade as any) || 'none',
          letterbox: project.settings?.letterbox === 'cinemascope' ? 'cinemascope' : 'none'
        },
        {
          audioTracks: project.audioTracks || []
        }
      );

      const task = exportQueueService.enqueueTask({
        title: `Eksport ${resolution} (${fps} FPS • ${activeVideoCodec})`,
        projectName: project.name || 'Projekt Wideo',
        config: {
          presetMode,
          resolution,
          fps,
          videoCodec,
          container,
          fitMode,
          colorGrade: (project.settings?.colorGrade as any) || 'none',
          letterbox: project.settings?.letterbox === 'cinemascope' ? 'cinemascope' : 'none',
          title: project.name,
          clipCount: totalClipsCount,
          durationSec: totalDurationSec
        },
        plan
      });

      if (capabilities && !isGpuAccelerated) {
        toast.showWarning('⚠️ Brak akceleracji GPU: Eksport jest realizowany w trybie programowym CPU. Włącz "Akcelerację sprzętową" w chrome://settings/system, aby przyspieszyć renderowanie.');
      }

      toast.showSuccess(`Dodano do kolejki eksportu: ${task.title}`);
    } catch (err: any) {
      toast.showError(`Nie udało się przygotować zadania: ${err.message}`);
    }
  };

  const handleStartExport = async () => {
    if (totalClipsCount === 0) {
      toast.showError('Dodaj przynajmniej jeden film, aby rozpocząć eksport.');
      return;
    }

    if (capabilities && !isGpuAccelerated) {
      toast.showWarning('⚠️ Brak akceleracji GPU: Renderowanie odbędzie się na procesorze CPU. Dla 10-krotnie wyższej prędkości włącz "Akcelerację sprzętową" w ustawieniach przeglądarki.');
    }

    setError(null);
    setOutput(null);
    setIsExporting(true);

    try {
      // Ensure all clips have resolved, active media URLs
      const resolvedSources: MediaSource[] = await Promise.all(
        (project.mediaLibrary || []).map(async (clip) => {
          const freshUri = await resolveClipMediaUrl(clip);
          return {
            id: clip.id,
            uri: freshUri || clip.objectUrl || '',
            file: clip.file,
            type: clip.type || (/\.(jpe?g|png|webp|gif|svg|bmp)$/i.test(clip.name) ? 'image' : 'video'),
            name: clip.name,
            size: clip.size || 0,
            duration: clip.duration || 1,
            width: clip.width || 1920,
            height: clip.height || 1080,
            fps: clip.fps || 30,
            videoCodec: clip.mimeType?.includes('webm') ? 'VP9' : 'H.264',
            audioCodec: clip.hasAudio ? 'AAC' : 'Brak',
            audioChannels: clip.audioChannels || (clip.hasAudio ? 2 : 0),
            sampleRate: clip.hasAudio ? 48000 : 0,
            orientation: clip.orientation || 'landscape',
            hasAudio: Boolean(clip.hasAudio),
            supported: clip.status !== 'ERROR' && clip.status !== 'error',
            thumbnailUrl: clip.thumbnailUrl
          };
        })
      );

      let activeVideoCodec = videoCodec;
      if (videoCodec === 'auto') {
        try {
          activeVideoCodec = await probeAndSelectOptimalCodec();
          toast.showSuccess(`✨ Wybrano optymalny sprzętowy kodek: ${activeVideoCodec === 'H.264' ? 'H.264' : (activeVideoCodec === 'VP9' ? 'VP9' : 'CPU render')}`);
        } catch {
          activeVideoCodec = 'H.264';
        }
      }

      const plan = videoExportService.prepareExport(
        resolvedSources.length > 0 ? resolvedSources : mediaSources,
        timelineClips,
        {
          resolution,
          fps,
          quality,
          fitMode,
          videoCodec: activeVideoCodec,
          container,
          colorGrade: (project.settings?.colorGrade as any) || 'none',
          letterbox: project.settings?.letterbox || 'none'
        },
        {
          audioTracks: project.audioTracks || [],
          textLayers: project.textLayers || []
        }
      );

      const result = await videoExportService.startExport(plan, (p) => {
        setProgress(p);
      });

      setOutput(result);
      toast.showSuccess('Film został pomyślnie wyeksportowany!');
    } catch (err: any) {
      console.error('Export failed:', err);
      const isCancelled = err?.message === 'CANCELLED' || err?.message?.includes('anulowany');
      if (isCancelled) {
        toast.showInfo('Eksport został przerwany.');
      } else {
        let errorMsg = err?.message || 'Nieznany błąd podczas przetwarzania filmu.';
        if (!isGpuAccelerated || errorMsg.toLowerCase().includes('videoencoder') || errorMsg.toLowerCase().includes('webcodecs') || errorMsg.toLowerCase().includes('ffmpeg')) {
          errorMsg += ' — Wskazówka: Włącz opcję "Używaj akceleracji sprzętowej, gdy jest dostępna" w ustawieniach przeglądarki (np. chrome://settings/system) i zrestartuj przeglądarkę, aby aktywować pełne wsparcie GPU (WebCodecs/MediaRecorder).';
        }
        const errorObj: ExportError = {
          code: 'ENCODER_ERROR',
          message: errorMsg,
          technicalDetails: String(err?.stack || err)
        };
        setError(errorObj);
        toast.showError(`Błąd eksportu: ${errorObj.message}`);
      }
    } finally {
      setIsExporting(false);
      setLogs(videoExportService.getDiagnosticLogs());
    }
  };

  const handleCancelExport = () => {
    videoExportService.cancelExport();
    setIsExporting(false);
    toast.showInfo('Eksport anulowany.');
  };

  const handleRunEngineTest = async () => {
    setIsTestingEngine(true);
    setTestResult(null);
    try {
      const res = await videoExportService.runEngineTest();
      setTestResult(res);
      if (res.success) {
        toast.showSuccess(`Test silnika MP4 zaliczony (${res.durationMs}ms)!`);
      } else {
        toast.showError(`Test silnika: ${res.details}`);
      }
    } catch (e: any) {
      setTestResult({ success: false, durationMs: 0, details: e?.message || String(e) });
    } finally {
      setIsTestingEngine(false);
    }
  };

  const handleLoadCapabilities = async () => {
    try {
      const caps = await videoExportService.getDiagnostics();
      setCapabilities(caps);
    } catch {}
  };

  const handleSaveOutput = async () => {
    if (!output) return;
    try {
      await videoExportService.saveOutput(output);
      toast.showSuccess('Plik wideo został pobrany.');
    } catch (e: any) {
      toast.showError(`Błąd zapisu pliku: ${e.message}`);
    }
  };

  const handleShareOutput = async () => {
    if (!output) return;
    try {
      await videoExportService.shareOutput(output);
    } catch (e: any) {
      toast.showError(`Błąd udostępniania: ${e.message}`);
    }
  };

  const handlePlayResult = () => {
    if (videoPlayerRef.current) {
      if (videoPlayerRef.current.paused) {
        videoPlayerRef.current.play().catch(() => {});
      } else {
        videoPlayerRef.current.pause();
      }
    }
  };

  const STAGES_DISPLAY: { id: ExportStage; label: string; icon: string }[] = [
    { id: 'PREPARATION', label: 'Przygotowanie', icon: '⚙️' },
    { id: 'MEDIA_ANALYSIS', label: 'Analiza', icon: '🔍' },
    { id: 'AUDIO_ENCODING', label: 'Audio AAC', icon: '🎵' },
    { id: 'VIDEO_ENCODING', label: 'Wideo H.264', icon: '🎬' },
    { id: 'FINAL_FLUSH', label: 'Opróżnianie', icon: '⚡' },
    { id: 'MUXING', label: 'Muxowanie MP4', icon: '📦' },
    { id: 'VALIDATION', label: 'Walidacja', icon: '🛡️' }
  ];

  const getStageVisualStatus = (stageId: ExportStage): 'DONE' | 'ACTIVE' | 'PENDING' => {
    if (!progress) return 'PENDING';
    if (progress.stage === 'COMPLETED') return 'DONE';
    if (progress.stage === 'FAILED' || progress.stage === 'CANCELLED') return 'PENDING';

    const stageRank: Record<ExportStage, number> = {
      PREPARATION: 0,
      MEDIA_ANALYSIS: 1,
      AUDIO_ENCODING: 2,
      DECODING: 3,
      FRAME_NORMALIZATION: 3,
      VIDEO_ENCODING: 3,
      FINAL_FLUSH: 4,
      MUXING: 5,
      VALIDATION: 6,
      SAVING: 6,
      COMPLETED: 7,
      FAILED: 0,
      CANCELLED: 0
    };

    const curRank = stageRank[progress.stage] ?? 0;
    const targetRank = stageRank[stageId] ?? 0;

    if (curRank > targetRank) return 'DONE';
    if (curRank === targetRank) return 'ACTIVE';
    return 'PENDING';
  };

  return (
    <div className="max-w-5xl mx-auto w-full px-4 sm:px-6 py-6 sm:py-8 flex flex-col gap-6 sm:gap-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[var(--border-subtle)] pb-4">
        <div>
          <div className="flex items-center gap-2 text-[var(--gold-primary)] text-xs font-semibold tracking-wider uppercase mb-1">
            <Download className="w-3.5 h-3.5" />
            <span>Ekran Eksportu</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">
            Finalizacja i Eksport Filmu
          </h1>
          <p className="text-xs sm:text-sm text-[#888892] mt-0.5">
            Połączenie {totalClipsCount} {totalClipsCount === 1 ? 'filmu' : 'filmów'} w jeden plik ({formatDuration(totalDurationSec)})
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            onClick={() => {
              setShowDiagnostics(!showDiagnostics);
              if (!capabilities) handleLoadCapabilities();
            }}
            className="flex items-center gap-1.5 px-3 py-2 bg-[var(--bg-subtle)] hover:bg-white/[0.08] text-[var(--gold-primary)] border border-[var(--border-luxury)] text-xs font-semibold rounded-xl transition-all cursor-pointer shadow-sm min-h-[40px]"
            title="Pokaż panel diagnostyki silnika dla developerów"
          >
            <Activity className="w-3.5 h-3.5" />
            <span>Diagnostyka Silnika</span>
            {showDiagnostics ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          </button>

          {totalClipsCount > 0 && !isExporting && !output && (
            <div className="flex items-center gap-2">
              <button
                onClick={handleEnqueueExport}
                className="flex items-center gap-2 px-4 py-3 bg-[var(--bg-card)] hover:bg-white/[0.05] text-[var(--gold-primary)] border border-[var(--border-luxury)] font-bold text-xs rounded-xl transition-all cursor-pointer min-h-[44px]"
                title="Dodaj do kolejki bez natychmiastowego zablokowania ekranu"
              >
                <Layers className="w-4 h-4 text-[var(--gold-primary)]" />
                <span>DODAJ DO KOLEJKI</span>
              </button>

              <button
                onClick={handleStartExport}
                className="flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-[var(--gold-primary)] to-[var(--gold-bright)] hover:brightness-110 text-black font-extrabold text-sm rounded-xl transition-all shadow-lg hover:scale-[1.02] cursor-pointer uppercase tracking-wider min-h-[44px]"
              >
                <Play className="w-4 h-4 fill-black" />
                <span>ROZPOCZNIJ EKSPORT</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* GPU Hardware Acceleration Support Banner & Browser Hint */}
      {capabilities && !isGpuAccelerated && (
        <div className="p-4 sm:p-5 rounded-2xl bg-amber-950/40 border-2 border-amber-500/60 shadow-[0_0_25px_rgba(245,158,11,0.2)] flex flex-col sm:flex-row items-start gap-4 text-xs font-sans animate-fadeIn">
          <div className="w-10 h-10 rounded-xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center shrink-0 text-amber-400">
            <AlertTriangle className="w-5 h-5 animate-pulse" />
          </div>
          <div className="space-y-2 flex-1">
            <div className="flex items-center gap-2 font-cinematic font-bold text-amber-300 text-sm">
              <span>⚠️ Brak Akceleracji Sprzętowej GPU w Przeglądarce (WebCodecs / MediaRecorder)</span>
            </div>
            <p className="text-amber-100/90 leading-relaxed">
              Silnik wykrył brak aktywnego kodera sprzętowego GPU w bieżącej sesji przeglądarki. Eksport zostanie przeprowadzony w wolniejszym trybie programowym (CPU FFmpeg).
            </p>
            <div className="p-3.5 rounded-xl bg-black/50 border border-amber-500/30 text-[11px] font-mono text-amber-200/90 space-y-1.5">
              <span className="font-bold text-amber-300 block">💡 Jak odblokować 10-krotnie szybszy render GPU (NVENC / Apple M1-M4 / Intel QuickSync):</span>
              <ol className="list-decimal list-inside space-y-1 opacity-95">
                <li>Używaj nowej wersji przeglądarki <strong>Google Chrome, Microsoft Edge lub Safari</strong>.</li>
                <li>Otwórz Ustawienia przeglądarki (<code className="bg-amber-950/80 px-1.5 py-0.5 rounded text-amber-200">chrome://settings/system</code>).</li>
                <li>Zaznacz opcję <strong>"Używaj akceleracji sprzętowej, gdy jest dostępna"</strong> (Hardware Acceleration) i zrestartuj przeglądarkę.</li>
              </ol>
            </div>
          </div>
        </div>
      )}

      {/* Developer Diagnostics Panel */}
      {showDiagnostics && (
        <div className="bg-[var(--bg-atelier)] border-2 border-[var(--border-luxury)] rounded-2xl p-5 shadow-2xl space-y-4 animate-fadeIn">
          <div className="flex items-center justify-between border-b border-[var(--border-subtle)] pb-3">
            <div className="flex items-center gap-2">
              <Cpu className="w-4 h-4 text-[var(--gold-bright)]" />
              <h3 className="text-xs font-bold text-[var(--gold-bright)] uppercase tracking-wider font-mono">
                Panel Diagnostyczny Silnika Wideo
              </h3>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={handleRunEngineTest}
                disabled={isTestingEngine}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[var(--bg-subtle)] border border-[var(--gold-primary)] text-xs font-bold text-[var(--gold-bright)] hover:bg-white/[0.05] cursor-pointer disabled:opacity-50 min-h-[36px]"
              >
                <RefreshCw className={`w-3 h-3 ${isTestingEngine ? 'animate-spin' : ''}`} />
                <span>Test Eksportu MP4 (1s)</span>
              </button>
            </div>
          </div>

          {testResult && (
            <div className={`p-3 rounded-xl border text-xs font-mono flex items-start gap-2 ${
              testResult.success 
                ? 'bg-emerald-950/30 border-emerald-800/50 text-emerald-300' 
                : 'bg-rose-950/30 border-rose-800/50 text-rose-300'
            }`}>
              <Info className="w-4 h-4 shrink-0 mt-0.5" />
              <div>
                <strong>{testResult.success ? 'TEST ZALICZONY' : 'TEST NIE POWIÓDŁ SIĘ'} ({testResult.durationMs}ms):</strong>
                <p className="mt-0.5">{testResult.details}</p>
              </div>
            </div>
          )}

          {/* Capabilities Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-2 text-[11px] font-mono">
            <div className="p-2.5 rounded-xl bg-[#0E0C08] border border-[#261E10]">
              <span className="text-[#8C7E64] block">WebCodecs:</span>
              <span className={`font-bold ${capabilities?.webCodecsSupported ? 'text-emerald-400' : 'text-rose-400'}`}>
                {capabilities?.webCodecsSupported ? 'Dostępny ✓' : 'Brak ✗'}
              </span>
            </div>
            <div className="p-2.5 rounded-xl bg-[#0E0C08] border border-[#261E10]">
              <span className="text-[#8C7E64] block">AV1 Master:</span>
              <span className={`font-bold ${capabilities?.av1Supported ? 'text-emerald-400' : 'text-[#8C7E64]'}`}>
                {capabilities?.av1Supported ? 'Akceleracja GPU ✓' : 'Software / Niedostępny'}
              </span>
            </div>
            <div className="p-2.5 rounded-xl bg-[#0E0C08] border border-[#261E10]">
              <span className="text-[#8C7E64] block">HEVC / H.265:</span>
              <span className={`font-bold ${capabilities?.hevcSupported ? 'text-emerald-400' : 'text-[#8C7E64]'}`}>
                {capabilities?.hevcSupported ? 'Sprzętowy NVENC/Apple ✓' : 'Niedostępny'}
              </span>
            </div>
            <div className="p-2.5 rounded-xl bg-[#0E0C08] border border-[#261E10]">
              <span className="text-[#8C7E64] block">VP9 WebM:</span>
              <span className={`font-bold ${capabilities?.vp9Supported ? 'text-emerald-400' : 'text-[#8C7E64]'}`}>
                {capabilities?.vp9Supported ? 'Obsługiwany ✓' : 'Brak'}
              </span>
            </div>
            <div className="p-2.5 rounded-xl bg-[#0E0C08] border border-[#261E10]">
              <span className="text-[#8C7E64] block">H.264 / AVC:</span>
              <span className={`font-bold ${capabilities?.h264Supported ? 'text-emerald-400' : 'text-rose-400'}`}>
                {capabilities?.h264Supported ? 'Obsługiwany ✓' : 'Brak ✗'}
              </span>
            </div>
            <div className="p-2.5 rounded-xl bg-[#0E0C08] border border-[#261E10]">
              <span className="text-[#8C7E64] block">Audio Codecs:</span>
              <span className={`font-bold ${capabilities?.aacSupported || capabilities?.opusSupported ? 'text-emerald-400' : 'text-amber-400'}`}>
                {capabilities?.aacSupported ? 'AAC ✓' : ''} {capabilities?.opusSupported ? '· Opus ✓' : ''}
              </span>
            </div>
          </div>

          {/* Live Diagnostic Logs stream */}
          {logs.length > 0 && (
            <div className="space-y-1">
              <span className="text-[10px] text-[#8C7E64] uppercase font-bold tracking-wider font-mono">
                Ostatnie Zdarzenia Silnika:
              </span>
              <div className="max-h-32 overflow-y-auto bg-black/60 rounded-lg p-2.5 border border-[#241C0E] text-[10px] font-mono text-[#DDD2BC] space-y-1 custom-scrollbar">
                {logs.slice(-15).map((log, lIdx) => (
                  <div key={lIdx} className="flex items-center gap-2">
                    <span className="text-[var(--ink-muted)]">[{new Date(log.timestamp).toLocaleTimeString()}]</span>
                    <span className="text-[var(--gold-primary)] font-bold">[{log.category}]</span>
                    <span>{log.message}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Pre-Flight AI Montage Summary Panel (When idle and has clips) */}
      {!isExporting && !output && totalClipsCount > 0 && (
        <AiMontageSummaryPanel
          project={project}
          resolution={resolution}
          fps={fps}
          quality={quality}
          fitMode={fitMode}
          videoCodec={videoCodec}
          container={container}
          onVideoCodecChange={setVideoCodec}
          onContainerChange={setContainer}
          isExporting={isExporting}
          onConfirmRender={handleStartExport}
        />
      )}

      {/* Preset & Settings Selector (When idle) */}
      {!isExporting && !output && (
        <div className="atelier-card rounded-3xl p-6 sm:p-8 border border-[var(--border-luxury)] shadow-[0_20px_60px_-15px_rgba(0,0,0,0.85)] space-y-7 relative overflow-hidden">
          {/* Subtle Ambient Golden Glow */}
          <div className="absolute top-0 right-0 w-80 h-80 bg-gradient-to-br from-[var(--gold-primary)]/10 to-transparent blur-3xl pointer-events-none" />

          {/* Engine Capability Badge Banner */}
          <div className="flex flex-wrap items-center justify-between gap-3 p-4 bg-gradient-to-r from-[var(--bg-atelier)] via-[var(--bg-card)] to-[var(--bg-atelier)] border border-[var(--border-luxury)] rounded-2xl text-xs shadow-inner relative z-10">
            <div className="flex items-center gap-2.5">
              <span className="flex h-2.5 w-2.5 relative">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
              </span>
              <span className="text-[var(--gold-bright)] font-bold tracking-wide uppercase font-cinematic text-xs">
                Silnik Renderujący Master Studio • WebCodecs GPU Multi-Codec
              </span>
            </div>
            <div className="flex items-center gap-3 text-[11px] text-[var(--ink-secondary)] font-mono">
              <span className="flex items-center gap-1 text-emerald-400 font-bold">
                <CheckCircle2 className="w-3.5 h-3.5" /> Akceleracja GPU Zero-Copy
              </span>
              <span className="hidden sm:inline text-stone-600">·</span>
              <span className="flex items-center gap-1 text-[var(--gold-bright)]">
                <Sparkles className="w-3.5 h-3.5" /> Rec.709 VBR Quality
              </span>
              <span className="hidden sm:inline text-stone-600">·</span>
              <span className="text-cyan-400">Audio Ducking -18dB</span>
            </div>
          </div>

          {/* Preset Selector */}
          <div className="relative z-10 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-xs font-bold text-[var(--gold-primary)] uppercase tracking-wider font-cinematic flex items-center gap-2">
                <Sliders className="w-4 h-4 text-[var(--gold-primary)]" />
                <span>Wybierz Styl i Preset Jakości</span>
              </h2>
              <span className="text-[11px] font-mono text-[var(--ink-muted)]">
                Zoptymalizowany dla telewizorów 4K i projekcji kinowych
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                { id: 'FAST', name: 'SZYBKI INTERNET', desc: '720p • Błyskawiczny transfer' },
                { id: 'BALANCED', name: 'ZRÓWNOWAŻONY', desc: '1080p • Standard ślubny' },
                { id: 'QUALITY', name: 'WYSOKA JAKOŚĆ', desc: '1080p 60FPS • Płynny taniec' },
                { id: 'MAX_QUALITY', name: 'MAKSYMALNY (4K)', desc: '4K Ultra HD • Master 60FPS' }
              ].map(p => (
                <button
                  key={p.id}
                  onClick={() => applyPreset(p.id as ExportPresetMode)}
                  className={`p-4 rounded-2xl border text-left transition-all cursor-pointer min-h-[50px] relative overflow-hidden ${
                    presetMode === p.id
                      ? 'bg-gradient-to-br from-[var(--accent-emerald)] via-[var(--bg-atelier)] to-[var(--bg-atelier)] border-[var(--gold-primary)] text-white shadow-[0_0_20px_rgba(197,160,89,0.25)]'
                      : 'bg-[var(--bg-card)] border-[var(--border-subtle)] text-[var(--ink-muted)] hover:text-white hover:border-[var(--gold-primary)]/40'
                  }`}
                >
                  <span className={`block text-xs font-bold font-cinematic ${presetMode === p.id ? 'text-[var(--gold-bright)]' : 'text-white'}`}>
                    {p.name}
                  </span>
                  <span className="block text-[10px] text-[var(--ink-muted)] mt-1 font-mono">
                    {p.desc}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* Granular Parameter Adjustments */}
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 pt-4 border-t border-[#261E13] relative z-10">
            <div>
              <label className="text-xs text-[var(--ink-secondary)] block mb-1.5 font-medium">Rozdzielczość</label>
              <select
                value={resolution}
                onChange={(e) => setResolution(e.target.value as any)}
                className="w-full bg-[var(--bg-atelier)] border border-[var(--border-subtle)] rounded-xl px-3 py-2.5 text-xs text-white focus:border-[var(--gold-primary)] focus:outline-none min-h-[44px]"
              >
                <option value="1080p">1920 × 1080 (Full HD 16:9)</option>
                <option value="1440p">2560 × 1440 (2K QHD 16:9)</option>
                <option value="4k">3840 × 2160 (4K Ultra HD Master)</option>
                <option value="720p">1280 × 720 (HD 16:9)</option>
                <option value="vertical_1080p">1080 × 1920 (Pionowy 9:16 Reels)</option>
                <option value="vertical_4k">2160 × 3840 (Pionowy 4K Reels)</option>
                <option value="square_1080p">1080 × 1080 (Kwadrat 1:1 Feed)</option>
              </select>
            </div>

            <div>
              <label className="text-xs text-[var(--ink-secondary)] block mb-1.5 font-medium">Płynność (FPS)</label>
              <select
                value={fps}
                onChange={(e) => setFps(Number(e.target.value))}
                className="w-full bg-[var(--bg-atelier)] border border-[var(--border-subtle)] rounded-xl px-3 py-2.5 text-xs text-white focus:border-[var(--gold-primary)] focus:outline-none min-h-[44px]"
              >
                <option value={24}>24 FPS (Kinowy Hollywood 24p)</option>
                <option value={25}>25 FPS (Europejski PAL 25p)</option>
                <option value={30}>30 FPS (Standard 30p)</option>
                <option value={50}>50 FPS (Płynny PAL 50p)</option>
                <option value={60}>60 FPS (Ultra Płynny 60p HFR)</option>
              </select>
            </div>

            <div>
              <label className="text-xs text-[var(--ink-secondary)] block mb-1.5 font-medium">Jakość & Bitrate</label>
              <select
                value={quality}
                onChange={(e) => setQuality(e.target.value as any)}
                className="w-full bg-[var(--bg-atelier)] border border-[var(--border-subtle)] rounded-xl px-3 py-2.5 text-xs text-white focus:border-[var(--gold-primary)] focus:outline-none min-h-[44px]"
              >
                <option value="maximum">Maksymalna Master (do 85-120 Mbps)</option>
                <option value="high">Wysoka Studio (18-55 Mbps)</option>
                <option value="standard">Standardowa (8-16 Mbps)</option>
              </select>
            </div>

            <div>
              <label className="text-xs text-[var(--ink-secondary)] block mb-1.5 font-medium">Kadrowanie proporcji</label>
              <select
                value={fitMode}
                onChange={(e) => setFitMode(e.target.value as any)}
                className="w-full bg-[var(--bg-atelier)] border border-[var(--border-subtle)] rounded-xl px-3 py-2.5 text-xs text-white focus:border-[var(--gold-primary)] focus:outline-none min-h-[44px]"
              >
                <option value="fit">FIT (Kadr + rozmyte tło dla mieszanych)</option>
                <option value="fill">FILL (Wypełnij ekran bez pasów)</option>
                <option value="original">ORIGINAL (Bez zmian)</option>
              </select>
            </div>
          </div>

          {/* Color Grading & CinemaScope Letterbox Controls */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-4 border-t border-[var(--border-subtle)] relative z-10">
            <div>
              <label className="text-xs text-[var(--gold-primary)] block mb-1.5 font-medium flex items-center gap-1.5 font-cinematic">
                <span>🎨 Styl Barwny / LUT Kinowy</span>
              </label>
              <select
                value={project.settings?.colorGrade || 'none'}
                onChange={(e) => {
                  if (onUpdateProject) {
                    onUpdateProject({
                      ...project,
                      settings: {
                        ...project.settings,
                        colorGrade: e.target.value as any
                      }
                    });
                  }
                }}
                className="w-full bg-[var(--bg-atelier)] border border-[var(--border-subtle)] rounded-xl px-3 py-2.5 text-xs text-white focus:border-[var(--gold-primary)] focus:outline-none min-h-[44px]"
              >
                <option value="none">Oryginalny (Czysty zapis z kamer)</option>
                <option value="golden_hour">✨ Złota Godzina (Ciepły romantyczny blask)</option>
                <option value="vivid_master">💎 Czysty Master (Maksymalna czystość & kontrast)</option>
                <option value="pastel_boho">🌸 Pastelowy Sen (Soft Boho & Delikatne pastele)</option>
                <option value="vintage_35mm">🎞️ Vintage 35mm (Analogowe ziarno & sepia)</option>
                <option value="cinematic_noir">🎬 Kinowy Noir (Głęboki czarno-biały luksus)</option>
              </select>
            </div>

            <div>
              <label className="text-xs text-[var(--gold-primary)] block mb-1.5 font-medium flex items-center gap-1.5 font-cinematic">
                <span>🎬 Format Kinowy (Letterbox)</span>
              </label>
              <select
                value={project.settings?.letterbox || 'none'}
                onChange={(e) => {
                  if (onUpdateProject) {
                    onUpdateProject({
                      ...project,
                      settings: {
                        ...project.settings,
                        letterbox: e.target.value as any
                      }
                    });
                  }
                }}
                className="w-full bg-[var(--bg-atelier)] border border-[var(--border-subtle)] rounded-xl px-3 py-2.5 text-xs text-white focus:border-[var(--gold-primary)] focus:outline-none min-h-[44px]"
              >
                <option value="none">Standardowy (16:9 Pełny kadr)</option>
                <option value="cinemascope">CinemaScope 2.39:1 (Hollywoodzkie czarne pasy góra/dół)</option>
              </select>
            </div>
          </div>

          {/* ADVANCED MULTI-CODEC & CONTAINER ENGINE CONFIGURATION */}
          <div className="pt-4 border-t border-[#261E13] space-y-4 relative z-10">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="text-xs font-bold text-[#FDE047] uppercase tracking-wider font-cinematic flex items-center gap-2">
                  <Cpu className="w-4 h-4 text-[#D4AF37]" />
                  <span>Kodek Wideo & Akceleracja Sprzętowa GPU</span>
                </h3>
                <p className="text-[11px] text-[#8C7D5B] font-mono mt-0.5">
                  Domyślnie silnik bada sprzęt i samoczynnie dobiera optymalny kodek bez konieczności wiedzy technicznej.
                </p>
              </div>

              {/* Mode Toggle: Auto vs Manual */}
              <div className="flex items-center gap-1.5 p-1 bg-[#120F0A] border border-[#2A2114] rounded-xl text-[11px] font-mono">
                <button
                  type="button"
                  onClick={() => {
                    setIsManualCodecMode(false);
                    setVideoCodec('auto');
                    setContainer('auto');
                  }}
                  className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer font-bold ${
                    !isManualCodecMode 
                      ? 'bg-gradient-to-r from-[#D4AF37] to-[#FDE047] text-black shadow-md' 
                      : 'text-[#8C7D5B] hover:text-white'
                  }`}
                >
                  ⚡ Wybór Automatyczny (Rekomendowany)
                </button>
                <button
                  type="button"
                  onClick={() => setIsManualCodecMode(true)}
                  className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer font-medium ${
                    isManualCodecMode 
                      ? 'bg-[#2B2112] text-[#FDE047] border border-[#D4AF37]/50 shadow-md' 
                      : 'text-[#8C7D5B] hover:text-white'
                  }`}
                >
                  ⚙️ Wybór Ręczny (Zaawansowany)
                </button>
              </div>
            </div>

            {/* If Automatic Mode (Default) */}
            {!isManualCodecMode ? (
              <div className="p-5 rounded-2xl bg-gradient-to-br from-[#241A0B] via-[#161209] to-[#0E0C08] border border-[#D4AF37]/50 shadow-[0_0_30px_rgba(212,175,55,0.15)] flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div className="space-y-1.5 max-w-xl">
                  <div className="flex items-center gap-2 text-xs font-cinematic font-bold text-[#FDE047]">
                    <Sparkles className="w-4 h-4 text-[#D4AF37]" />
                    <span>Tryb Inteligentny AI & GPU Aktywny (Auto)</span>
                  </div>
                  <p className="text-xs text-[#EADFC9] leading-relaxed">
                    Nie musisz znać kodeków. Silnik automatycznie wykryje Twoją kartę graficzną (<span className="text-[#FDE047] font-semibold">Apple Silicon M1-M4 / NVENC / AV1 / H.264</span>) oraz ujęcia ślubne i zastosuje najnowocześniejsze kodowanie sprzętowe z bezstratnym audio i kalibracją barwną Rec.709.
                  </p>
                </div>

                <div className="flex flex-col gap-1.5 shrink-0 text-right sm:border-l sm:border-[var(--border-subtle)] sm:pl-5 text-xs font-mono">
                  {isGpuAccelerated ? (
                    <span className="text-emerald-400 font-bold flex items-center justify-end gap-1.5">
                      <CheckCircle2 className="w-3.5 h-3.5" /> Akceleracja GPU Zero-Copy
                    </span>
                  ) : (
                    <span className="text-amber-400 font-bold flex items-center justify-end gap-1.5">
                      <AlertTriangle className="w-3.5 h-3.5" /> Tryb Programowy CPU (Brak GPU)
                    </span>
                  )}
                  <span className="text-[var(--gold-primary)]">
                    Kontener: Auto (MP4 / WebM)
                  </span>
                  <span className="text-[var(--gold-dark)] text-[10px]">
                    Bitrate: VBR Adaptive Cinema
                  </span>
                </div>
              </div>
            ) : (
              /* If Manual Mode */
              <div className="space-y-4 animate-fadeIn">
                {/* Interactive Codec Cards Selection Grid */}
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-3">
                  {[
                    { 
                      id: 'auto' as VideoCodecOption, 
                      title: 'Auto GPU', 
                      badge: 'Optymalny',
                      desc: 'Negocjuje najszybszy sprzętowy kodek',
                      isHw: true
                    },
                    { 
                      id: 'FFMPEG_X264' as VideoCodecOption, 
                      title: 'Reliable CPU', 
                      badge: 'NAJWYŻSZA ZGODNOŚĆ',
                      desc: 'Naprawia błędy obrazu i zacięcia (x264)',
                      isHw: false
                    },
                    { 
                      id: 'AV1' as VideoCodecOption, 
                      title: 'AV1 Master', 
                      badge: '-40% Rozmiar',
                      desc: 'Brak bloków w cieniach i dymie',
                      isHw: capabilities?.av1Supported
                    },
                    { 
                      id: 'H.265' as VideoCodecOption, 
                      title: 'Apple HEVC', 
                      badge: 'M1-M4 / NVENC',
                      desc: 'Dedykowane bloki sprzętowe GPU',
                      isHw: capabilities?.hevcSupported
                    },
                    { 
                      id: 'VP9' as VideoCodecOption, 
                      title: 'VP9 YouTube', 
                      badge: 'WebM + Opus',
                      desc: 'Stabilne strumieniowanie 4K',
                      isHw: capabilities?.vp9Supported
                    },
                    { 
                      id: 'H.264' as VideoCodecOption, 
                      title: 'H.264 / AVC', 
                      badge: '100% Zgodny',
                      desc: 'Smart TV, telefony i auta',
                      isHw: capabilities?.h264Supported
                    },
                    { 
                      id: 'ProRes_Master' as VideoCodecOption, 
                      title: 'ProRes Master', 
                      badge: '120 Mbps',
                      desc: 'Bezstratna archiwizacja ślubna',
                      isHw: true
                    }
                  ].map(c => {
                    const isSelected = videoCodec === c.id;
                    return (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => setVideoCodec(c.id)}
                        className={`p-3.5 rounded-2xl border text-left transition-all cursor-pointer flex flex-col justify-between gap-2 min-h-[96px] ${
                          isSelected
                            ? 'bg-gradient-to-br from-[#1B4332] via-[#0D1A10] to-[#050705] border-[#C5A059] text-white shadow-[0_0_20px_rgba(197,160,89,0.3)] ring-1 ring-[#C5A059]/50'
                            : 'bg-[#0A0C0A]/80 border-[#202520] text-[#949B96] hover:border-[#C5A059]/40 hover:text-white'
                        }`}
                      >
                        <div>
                          <div className="flex items-center justify-between gap-1 mb-1">
                            <span className={`text-xs font-bold font-cinematic ${isSelected ? 'text-[#E5C992]' : 'text-[#F8F7F4]'}`}>
                              {c.title}
                            </span>
                            {isSelected && (
                              <span className="w-1.5 h-1.5 rounded-full bg-[#E5C992] shadow-[0_0_6px_#E5C992]" />
                            )}
                          </div>
                          <span className={`text-[9.5px] font-mono font-semibold block ${c.id === 'FFMPEG_X264' ? 'text-cyan-400' : 'text-[#C5A059]'}`}>
                            {c.badge}
                          </span>
                        </div>

                        <div>
                          <p className={`text-[9.5px] font-mono leading-tight ${isSelected ? 'text-white/80' : 'text-[#7A6E57]'}`}>
                            {c.desc}
                          </p>
                        </div>
                      </button>
                    );
                  })}
                </div>

                {/* Container Format Selector (MP4 vs WebM) */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
                  <div className="p-4 rounded-2xl bg-[#14110A]/90 border border-[#2B2317]">
                    <label className="text-xs text-[#EADFC9] block mb-2 font-medium flex items-center justify-between font-cinematic">
                      <span className="flex items-center gap-2">
                        <Layers className="w-3.5 h-3.5 text-[#D4AF37]" />
                        <span>Kontener Pliku Wyjściowego</span>
                      </span>
                      <span className="text-[10px] text-[#D4AF37] font-mono">
                        {container === 'auto' ? 'Auto-Dopasowany' : container.toUpperCase()}
                      </span>
                    </label>

                    <div className="grid grid-cols-3 gap-2">
                      {[
                        { id: 'auto' as ContainerFormat, name: 'Auto', audio: 'Domyślny' },
                        { id: 'mp4' as ContainerFormat, name: 'MP4', audio: 'AAC 192k' },
                        { id: 'webm' as ContainerFormat, name: 'WebM', audio: 'Opus 48k' }
                      ].map(cnt => (
                        <button
                          key={cnt.id}
                          type="button"
                          onClick={() => setContainer(cnt.id)}
                          className={`p-2.5 rounded-xl border text-center transition-all cursor-pointer ${
                            container === cnt.id
                              ? 'bg-[var(--gold-soft)] border-[var(--gold-primary)] text-[var(--gold-bright)] font-bold shadow-md'
                              : 'bg-[var(--bg-atelier)] border-[var(--border-subtle)] text-[var(--gold-dark)] hover:text-[#CCC]'
                          }`}
                        >
                          <span className="block text-xs font-mono">{cnt.name}</span>
                          <span className="block text-[9.5px] font-mono text-[#8C7D5B] mt-0.5">{cnt.audio}</span>
                        </button>
                      ))}
                    </div>

                    <p className="text-[10px] text-[var(--gold-dark)] font-mono mt-2.5 leading-relaxed">
                      {container === 'mp4' && 'Kontener MP4 gwarantuje bezproblemowe odtworzenie na telewizorach Smart TV, odtwarzaczach stacjonarnych i smartfonach z audio AAC.'}
                      {container === 'webm' && 'WebM oferuje zoptymalizowane strumieniowanie z bezstratnym kodekiem Opus 48 kHz (standard YouTube 4K).'}
                      {container === 'auto' && 'Automatycznie dobiera kontener MP4 dla H.264/HEVC/AV1 oraz WebM dla VP9.'}
                    </p>
                  </div>

                  {/* Codec Advantage Technical Specs Card */}
                  <div className="p-4 rounded-2xl bg-[var(--bg-card)] border border-[var(--border-subtle)] flex flex-col justify-between">
                    <div>
                      <span className="text-xs font-bold text-[var(--gold-primary)] uppercase tracking-wider font-cinematic block mb-1.5">
                        Charakterystyka: {videoCodec === 'auto' ? 'Auto GPU' : videoCodec}
                      </span>
                      <p className="text-[11px] text-[#A89C82] leading-relaxed">
                        {videoCodec === 'AV1' && 'AOMedia Video 1 redukuje bitrate o 40% bez jakichkolwiek bloków kompresyjnych na ciemnym tle ceremonii kościelnej lub zabawy weselnej.'}
                        {videoCodec === 'H.265' && 'HEVC wykorzystuje sprzętowe jednostki NVENC i Apple Silicon Media Engine, skracając czas renderowania nawet 3-krotnie.'}
                        {videoCodec === 'VP9' && 'VP9 to format rekomendowany do bezpośredniej publikacji na YouTube z natywnym dźwiękiem Opus 48 kHz bez ponownej kompresji.'}
                        {videoCodec === 'H.264' && 'Klasyczny High Profile AVC gwarantuje zgodność z każdym, nawet 10-letnim telewizorem i odtwarzaczem samochodowym.'}
                        {videoCodec === 'ProRes_Master' && 'Profil Master Studio z bitrate dochodzącym do 120 Mbps — idealny do archiwizacji na dyskach twardych.'}
                        {videoCodec === 'auto' && 'Inteligentna analiza bada możliwości Twojej karty graficznej i wybiera optymalną kombinację jakości do czasu renderowania.'}
                      </p>
                    </div>

                    <div className="flex items-center justify-between text-[10px] font-mono text-[var(--ink-muted)] pt-2 border-t border-[var(--border-subtle)] mt-2">
                      <span>Przestrzeń barw: Rec.709 Broadcast</span>
                      <span>Tryb: VBR Adaptive</span>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* In-Flight Real Progress View */}
      {isExporting && (
        <div className="bg-[var(--bg-atelier)] border border-[var(--gold-primary)]/50 rounded-2xl p-6 sm:p-10 shadow-2xl space-y-8 my-2">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <span className="text-xs uppercase text-[var(--gold-primary)] font-bold tracking-wider flex items-center gap-2 font-mono">
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                EKSPORT W TOKU
              </span>
              <h3 className="text-xl sm:text-2xl font-bold text-white mt-1">
                {progress?.statusMessage || 'Przetwarzanie ujęć i kodowanie strumieni...'}
              </h3>
            </div>

            <button
              onClick={handleCancelExport}
              className="px-4 py-2.5 bg-rose-950/40 hover:bg-rose-900/60 text-rose-300 border border-rose-800/60 font-semibold text-xs rounded-xl transition-colors flex items-center gap-2 self-start sm:self-auto cursor-pointer min-h-[44px]"
            >
              <StopCircle className="w-4 h-4" />
              <span>ANULUJ EKSPORT</span>
            </button>
          </div>

          {/* Central Prominent Percentage */}
          <div className="text-center py-4 space-y-2">
            <span className="text-6xl sm:text-7xl font-extrabold text-white tracking-tight font-mono block">
              {progress?.percent || 0}%
            </span>
            <span className="text-sm font-mono text-[#AAA] block">
              {progress?.currentClipIndex
                ? `Klip ${progress.currentClipIndex} z ${progress.totalClips || totalClipsCount} • ${progress.currentClipName || ''}`
                : `Przetwarzanie sekwencji (${totalClipsCount} ujęć)`}
            </span>
          </div>

          {/* Real progress bar */}
          <div className="h-3 w-full bg-[var(--bg-subtle)] rounded-full overflow-hidden p-0.5 border border-[var(--border-subtle)]">
            <div 
              className="h-full bg-gradient-to-r from-[var(--gold-dark)] via-[var(--gold-primary)] to-[var(--gold-bright)] rounded-full transition-all duration-200"
              style={{ width: `${progress?.percent || 0}%` }}
            />
          </div>

          {/* Real Engine Stage Indicators */}
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2 pt-2 border-t border-[#202024] text-xs font-mono">
            {STAGES_DISPLAY.map(st => {
              const status = getStageVisualStatus(st.id);
              return (
                <div 
                  key={st.id}
                  className={`p-2 rounded-lg border text-center flex items-center justify-center gap-1.5 ${
                    status === 'DONE'
                      ? 'bg-emerald-950/30 border-emerald-800/50 text-emerald-400'
                      : (status === 'ACTIVE'
                        ? 'bg-[#2A2414] border-[#D4AF37] text-[#E5C158] font-bold animate-pulse shadow-[0_0_10px_rgba(212,175,55,0.2)]'
                        : 'bg-[#161619] border-[#222226] text-[#666670]')
                  }`}
                >
                  <span>{st.icon}</span>
                  <span className="truncate">{st.label}</span>
                  <span>{status === 'DONE' ? '✓' : (status === 'ACTIVE' ? '●' : '○')}</span>
                </div>
              );
            })}
          </div>

          {/* Live Metrics */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs font-mono bg-[#16161A] p-4 rounded-xl border border-[#24242A]">
            <div>
              <span className="text-[#777782] block text-[10px] uppercase">Klatki:</span>
              <span className="text-white font-bold mt-0.5 block">
                {progress?.currentFrame || 0} / {progress?.totalFrames || 0}
              </span>
            </div>
            <div>
              <span className="text-[#777782] block text-[10px] uppercase">Prędkość / FPS:</span>
              <span className="text-white font-bold mt-0.5 block">
                {progress?.fps || 0} FPS
              </span>
            </div>
            <div>
              <span className="text-[#777782] block text-[10px] uppercase">Czas pracy:</span>
              <span className="text-white font-bold mt-0.5 block">
                {progress?.elapsedSeconds || 0}s
              </span>
            </div>
            <div>
              <span className="text-[#777782] block text-[10px] uppercase">Pozostały czas (ETA):</span>
              <span className="text-[#D4AF37] font-bold mt-0.5 block">
                {progress?.etaSeconds ? `~${progress.etaSeconds}s` : 'Obliczanie...'}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Error View with Recovery */}
      {error && !isExporting && (
        <div className="bg-rose-950/30 border border-rose-800/60 rounded-2xl p-6 shadow-2xl space-y-4">
          <div className="flex items-start gap-3">
            <XCircle className="w-6 h-6 text-rose-400 shrink-0 mt-0.5" />
            <div>
              <h3 className="text-base font-bold text-rose-300">
                Eksport nie powiódł się
              </h3>
              <p className="text-sm text-rose-200/90 mt-1">
                {error.message}
              </p>
              {error.technicalDetails && (
                <div className="mt-3 p-3 bg-black/60 rounded-lg text-xs font-mono text-rose-300/80 overflow-x-auto">
                  {error.technicalDetails}
                </div>
              )}
            </div>
          </div>

          <div className="flex items-center gap-3 pt-2">
            <button
              onClick={handleStartExport}
              className="px-4 py-2.5 bg-rose-900/60 hover:bg-rose-900 text-white font-semibold text-xs rounded-xl transition-colors cursor-pointer min-h-[44px]"
            >
              Spróbuj ponownie
            </button>
            <button
              onClick={() => {
                setShowDiagnostics(true);
                handleLoadCapabilities();
              }}
              className="px-4 py-2.5 bg-[#222] hover:bg-[#333] text-[#AAA] hover:text-white text-xs rounded-xl transition-colors cursor-pointer min-h-[44px]"
            >
              Pokaż Diagnostykę Silnika
            </button>
          </div>
        </div>
      )}

      {/* Finished Result View */}
      {output && !isExporting && (
        <div className="bg-[#121215] border border-[#2A2A30] rounded-2xl p-6 sm:p-8 shadow-2xl space-y-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-emerald-400 font-mono text-xs font-bold uppercase tracking-wider">
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              <span>Film pomyślnie wygenerowany i zweryfikowany</span>
            </div>

            <button
              onClick={() => setOutput(null)}
              className="text-xs text-[#888892] hover:text-white transition-colors cursor-pointer font-mono"
            >
              Zamknij podgląd
            </button>
          </div>

          {/* Large video player preview */}
          <div className="relative aspect-video max-w-3xl mx-auto bg-black rounded-xl overflow-hidden border border-[#2E2E36] shadow-2xl group">
            <video
              ref={videoPlayerRef}
              src={output.url}
              controls
              playsInline
              preload="auto"
              onPlay={() => setIsPlayingResult(true)}
              onPause={() => setIsPlayingResult(false)}
              onEnded={() => setIsPlayingResult(false)}
              className="w-full h-full object-contain cursor-pointer"
            />
            {!isPlayingResult && (
              <div 
                className="absolute inset-0 flex items-center justify-center pointer-events-none pb-12"
              >
                <button
                  type="button"
                  onClick={handlePlayResult}
                  className="w-16 h-16 rounded-full bg-gradient-to-tr from-[#C29B27] via-[#D4AF37] to-[#FDE047] text-black flex items-center justify-center shadow-[0_0_30px_rgba(212,175,55,0.7)] hover:scale-110 active:scale-95 transition-transform pointer-events-auto cursor-pointer"
                  title="Kliknij, aby odtworzyć film"
                >
                  <Play className="w-7 h-7 fill-black ml-1" />
                </button>
              </div>
            )}
          </div>

          {/* Technical Specs Summary */}
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3 text-xs font-mono bg-[#16161A] p-4 rounded-xl border border-[#24242A]">
            <div className="col-span-2">
              <span className="text-[#777782] block text-[10px] uppercase">Nazwa pliku:</span>
              <span className="text-white font-bold mt-0.5 block truncate" title={output.fileName}>
                {output.fileName}
              </span>
            </div>

            <div>
              <span className="text-[#777782] block text-[10px] uppercase">Rozmiar:</span>
              <span className="text-white font-bold mt-0.5 block">
                {formatSize(output.sizeBytes)}
              </span>
            </div>

            <div>
              <span className="text-[#777782] block text-[10px] uppercase">Czas trwania:</span>
              <span className="text-white font-bold mt-0.5 block">
                {formatDuration(output.duration)}
              </span>
            </div>

            <div>
              <span className="text-[#777782] block text-[10px] uppercase">Rozdzielczość:</span>
              <span className="text-white font-bold mt-0.5 block">
                {output.width} × {output.height}
              </span>
            </div>

            <div>
              <span className="text-[#777782] block text-[10px] uppercase">Płynność (FPS):</span>
              <span className="text-white font-bold mt-0.5 block">
                {output.fps} FPS
              </span>
            </div>

            <div>
              <span className="text-[#777782] block text-[10px] uppercase">Format & Audio:</span>
              <span className="text-[#D4AF37] font-bold mt-0.5 block">
                {output.videoCodec} / {output.audioCodec}
              </span>
            </div>
          </div>

          {/* 4 Action Buttons: ODTWÓRZ, POBIERZ, UDOSTĘPNIJ, NOWY PROJEKT */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2">
            <button
              onClick={handlePlayResult}
              className="px-4 py-3 bg-[#1C1C20] hover:bg-[#26262C] text-white border border-[#303038] font-bold text-xs rounded-xl transition-all flex items-center justify-center gap-2 cursor-pointer min-h-[44px]"
            >
              <Play className="w-4 h-4 text-[#D4AF37]" />
              <span>ODTWÓRZ</span>
            </button>

            <button
              onClick={handleSaveOutput}
              className="px-4 py-3 bg-[#D4AF37] hover:bg-[#E5C158] text-black font-extrabold text-xs rounded-xl transition-all shadow-lg flex items-center justify-center gap-2 cursor-pointer min-h-[44px]"
            >
              <Download className="w-4 h-4 fill-black" />
              <span>POBIERZ PLIK</span>
            </button>

            <button
              onClick={handleShareOutput}
              className="px-4 py-3 bg-[#1C1C20] hover:bg-[#26262C] text-white border border-[#303038] font-bold text-xs rounded-xl transition-all flex items-center justify-center gap-2 cursor-pointer min-h-[44px]"
            >
              <Share2 className="w-4 h-4 text-emerald-400" />
              <span>UDOSTĘPNIJ</span>
            </button>

            <button
              onClick={() => {
                if (onResetProject) {
                  onResetProject();
                } else if (onNavigateTab) {
                  onNavigateTab('project');
                }
              }}
              className="px-4 py-3 bg-[#1C1C20] hover:bg-rose-950/40 text-[#AAA] hover:text-rose-400 border border-[#303038] hover:border-rose-900/40 font-bold text-xs rounded-xl transition-all flex items-center justify-center gap-2 cursor-pointer min-h-[44px]"
            >
              <RotateCcw className="w-4 h-4" />
              <span>NOWY PROJEKT</span>
            </button>
          </div>
        </div>
      )}

      {/* Serial Export Queue Panel */}
      {queueTasks.length > 0 && (
        <div className="bg-[#121115] border border-[#2B261D] rounded-2xl p-5 shadow-xl space-y-4">
          <div className="flex items-center justify-between border-b border-[#242018] pb-3">
            <div className="flex items-center gap-2">
              <Layers className="w-4 h-4 text-[#D4AF37]" />
              <h3 className="text-xs font-bold text-[#D4AF37] uppercase tracking-wider font-mono">
                Seryjna Kolejka Eksportu ({queueTasks.length})
              </h3>
            </div>
            {queueTasks.some(t => t.status === 'completed' || t.status === 'cancelled' || t.status === 'failed') && (
              <button
                onClick={() => exportQueueService.clearCompleted()}
                className="text-xs text-[#888892] hover:text-white transition-colors cursor-pointer font-mono"
              >
                Wyczyść Zakończone
              </button>
            )}
          </div>

          <div className="space-y-3">
            {queueTasks.map((task) => (
              <div 
                key={task.id} 
                className={`p-4 rounded-xl border transition-all ${
                  task.status === 'processing'
                    ? 'bg-[#1C1810] border-[#D4AF37] shadow-lg'
                    : task.status === 'completed'
                    ? 'bg-[#121814] border-emerald-900/50'
                    : task.status === 'failed'
                    ? 'bg-[#1D1214] border-rose-900/50'
                    : 'bg-[#16161A] border-[#24242A]'
                }`}
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-white">{task.title}</span>
                      <span className="text-[10px] text-[#888892] font-mono">({task.projectName})</span>
                      <span className={`px-2 py-0.5 text-[10px] font-mono font-bold rounded-full ${
                        task.status === 'processing'
                          ? 'bg-[#D4AF37]/20 text-[#FDE047] border border-[#D4AF37]/40 animate-pulse'
                          : task.status === 'completed'
                          ? 'bg-emerald-950/60 text-emerald-400 border border-emerald-800/60'
                          : task.status === 'failed'
                          ? 'bg-rose-950/60 text-rose-300 border border-rose-800/60'
                          : 'bg-[#222228] text-[#888892] border border-[#33333E]'
                      }`}>
                        {task.status === 'processing' ? 'Renderowanie...' :
                         task.status === 'completed' ? 'Ukończono ✓' :
                         task.status === 'failed' ? 'Błąd ✗' :
                         task.status === 'cancelled' ? 'Anulowano' : 'Oczekuje w kolejce'}
                      </span>
                    </div>

                    <div className="text-[11px] text-[#888892] font-mono mt-1 flex items-center gap-3">
                      <span>{task.config.resolution} • {task.config.fps} FPS • {task.config.videoCodec || 'Auto GPU'}</span>
                      {task.config.clipCount !== undefined && <span>• {task.config.clipCount} ujęć</span>}
                      {task.config.durationSec !== undefined && <span>• {formatDuration(task.config.durationSec)}</span>}
                    </div>
                  </div>

                  {/* Task Action Buttons */}
                  <div className="flex items-center gap-2 self-start sm:self-auto">
                    {task.status === 'processing' && (
                      <button
                        onClick={() => exportQueueService.cancelTask(task.id)}
                        className="px-3 py-1.5 bg-rose-950/40 hover:bg-rose-900/60 text-rose-300 border border-rose-800/60 font-semibold text-xs rounded-lg transition-colors cursor-pointer min-h-[36px]"
                      >
                        Anuluj
                      </button>
                    )}

                    {task.status === 'queued' && (
                      <button
                        onClick={() => exportQueueService.removeTask(task.id)}
                        className="px-3 py-1.5 bg-[#222228] hover:bg-rose-950/40 text-[#AAA] hover:text-rose-300 border border-[#33333E] text-xs rounded-lg transition-colors cursor-pointer min-h-[36px]"
                      >
                        Usuń
                      </button>
                    )}

                    {task.status === 'failed' && (
                      <button
                        onClick={() => exportQueueService.retryTask(task.id)}
                        className="px-3 py-1.5 bg-rose-900/60 hover:bg-rose-900 text-white font-semibold text-xs rounded-lg transition-colors cursor-pointer min-h-[36px]"
                      >
                        Ponów
                      </button>
                    )}

                    {task.status === 'completed' && task.output && (
                      <button
                        onClick={() => videoExportService.saveOutput(task.output!)}
                        className="px-3 py-1.5 bg-[#D4AF37] hover:bg-[#E5C158] text-black font-extrabold text-xs rounded-lg transition-colors shadow-md flex items-center gap-1 cursor-pointer min-h-[36px]"
                      >
                        <Download className="w-3.5 h-3.5 fill-black" />
                        <span>Pobierz MP4</span>
                      </button>
                    )}
                  </div>
                </div>

                {/* Progress bar for active task */}
                {task.status === 'processing' && task.progress && (
                  <div className="mt-3 space-y-1.5 pt-2 border-t border-[#2B2416]">
                    <div className="flex items-center justify-between text-xs font-mono">
                      <span className="text-[#D4AF37]">{task.progress.statusMessage}</span>
                      <span className="text-white font-bold">{task.progress.percent}%</span>
                    </div>
                    <div className="h-2 w-full bg-[#1A1A1E] rounded-full overflow-hidden border border-[#2E2E36]">
                      <div 
                        className="h-full bg-gradient-to-r from-[#B8942A] to-[#FDE047] transition-all duration-150"
                        style={{ width: `${task.progress.percent}%` }}
                      />
                    </div>
                  </div>
                )}

                {/* Error message for failed task */}
                {task.status === 'failed' && task.error && (
                  <div className="mt-2 p-2.5 bg-rose-950/40 border border-rose-800/40 rounded-lg text-xs font-mono text-rose-300">
                    <strong>Błąd:</strong> {task.error.message}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
