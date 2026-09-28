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
  SerialExportTask
} from '../../core/export/videoExportTypes';
import { urlRegistry } from '../../core/media/urlRegistry';
import { resolveClipMediaUrl } from '../../core/media/mediaResolver';
import { useStudioToast } from '../common/ToastContext';

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
  const [resolution, setResolution] = useState<'720p' | '1080p' | '4k'>('1080p');
  const [fps, setFps] = useState<number>(30);
  const [fitMode, setFitMode] = useState<FitMode>('fit');

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

  // Sync preset changes
  const applyPreset = (mode: ExportPresetMode) => {
    setPresetMode(mode);
    switch (mode) {
      case 'FAST':
        setResolution('720p');
        setFps(30);
        break;
      case 'BALANCED':
        setResolution('1080p');
        setFps(30);
        break;
      case 'QUALITY':
        setResolution('1080p');
        setFps(60);
        break;
      case 'MAX_QUALITY':
        setResolution('4k');
        setFps(60);
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
      return rawItems.map(item => ({
        id: item.id,
        sourceId: item.clipId,
        sourceStart: item.sourceStart,
        sourceEnd: item.sourceEnd,
        timelineStart: item.timelineStart,
        duration: item.duration,
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
      }));
    }

    let currentTimeline = 0;
    return mediaSources.map((source, idx) => {
      const dur = Math.max(0.1, source.duration);
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

      const plan = videoExportService.prepareExport(
        resolvedSources.length > 0 ? resolvedSources : mediaSources,
        timelineClips,
        {
          resolution,
          fps,
          fitMode,
          colorGrade: (project.settings?.colorGrade as any) || 'none',
          letterbox: project.settings?.letterbox === 'cinemascope' ? 'cinemascope' : 'none'
        },
        {
          audioTracks: project.audioTracks || []
        }
      );

      const task = exportQueueService.enqueueTask({
        title: `Eksport ${resolution} (${fps} FPS)`,
        projectName: project.name || 'Projekt Wideo',
        config: {
          presetMode,
          resolution,
          fps,
          fitMode,
          colorGrade: (project.settings?.colorGrade as any) || 'none',
          letterbox: project.settings?.letterbox === 'cinemascope' ? 'cinemascope' : 'none',
          title: project.name,
          clipCount: totalClipsCount,
          durationSec: totalDurationSec
        },
        plan
      });

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

      const plan = videoExportService.prepareExport(
        resolvedSources.length > 0 ? resolvedSources : mediaSources,
        timelineClips,
        {
          resolution,
          fps,
          fitMode,
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
        const errorObj: ExportError = {
          code: 'UNKNOWN_EXPORT_ERROR',
          message: err?.message || 'Nieznany błąd podczas przetwarzania filmu.',
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
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#242428] pb-4">
        <div>
          <div className="flex items-center gap-2 text-[#D4AF37] text-xs font-semibold tracking-wider uppercase mb-1">
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
            className="flex items-center gap-1.5 px-3 py-2 bg-[#191712] hover:bg-[#252119] text-[#D4AF37] border border-[#3E3420] text-xs font-semibold rounded-xl transition-all cursor-pointer shadow-sm min-h-[40px]"
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
                className="flex items-center gap-2 px-4 py-3 bg-[#242018] hover:bg-[#322A1F] text-[#D4AF37] border border-[#4A3D22] font-bold text-xs rounded-xl transition-all cursor-pointer min-h-[44px]"
                title="Dodaj do kolejki bez natychmiastowego zablokowania ekranu"
              >
                <Layers className="w-4 h-4 text-[#D4AF37]" />
                <span>DODAJ DO KOLEJKI</span>
              </button>

              <button
                onClick={handleStartExport}
                className="flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-[#D4AF37] to-[#FDE047] hover:brightness-110 text-black font-extrabold text-sm rounded-xl transition-all shadow-lg hover:scale-[1.02] cursor-pointer uppercase tracking-wider min-h-[44px]"
              >
                <Play className="w-4 h-4 fill-black" />
                <span>ROZPOCZNIJ EKSPORT</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Developer Diagnostics Panel */}
      {showDiagnostics && (
        <div className="bg-[#14120D] border-2 border-[#D4AF37]/40 rounded-2xl p-5 shadow-2xl space-y-4 animate-fadeIn">
          <div className="flex items-center justify-between border-b border-[#2D2414] pb-3">
            <div className="flex items-center gap-2">
              <Cpu className="w-4 h-4 text-[#FDE047]" />
              <h3 className="text-xs font-bold text-[#FDE047] uppercase tracking-wider font-mono">
                Panel Diagnostyczny Silnika Wideo
              </h3>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={handleRunEngineTest}
                disabled={isTestingEngine}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#2A2211] border border-[#D4AF37] text-xs font-bold text-[#FDE047] hover:bg-[#3B3018] cursor-pointer disabled:opacity-50 min-h-[36px]"
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
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-[11px] font-mono">
            <div className="p-2.5 rounded-lg bg-[#0E0C08] border border-[#261E10]">
              <span className="text-[#8C7E64] block">WebCodecs:</span>
              <span className={`font-bold ${capabilities?.webCodecsSupported ? 'text-emerald-400' : 'text-rose-400'}`}>
                {capabilities?.webCodecsSupported ? 'Dostępny ✓' : 'Brak ✗'}
              </span>
            </div>
            <div className="p-2.5 rounded-lg bg-[#0E0C08] border border-[#261E10]">
              <span className="text-[#8C7E64] block">VideoEncoder H.264:</span>
              <span className={`font-bold ${capabilities?.h264Supported ? 'text-emerald-400' : 'text-rose-400'}`}>
                {capabilities?.h264Supported ? 'Obsługiwany ✓' : 'Brak ✗'}
              </span>
            </div>
            <div className="p-2.5 rounded-lg bg-[#0E0C08] border border-[#261E10]">
              <span className="text-[#8C7E64] block">AudioEncoder AAC:</span>
              <span className={`font-bold ${capabilities?.aacSupported ? 'text-emerald-400' : 'text-amber-400'}`}>
                {capabilities?.aacSupported ? 'Sprzętowy AAC ✓' : 'Miks Software ⚠️'}
              </span>
            </div>
            <div className="p-2.5 rounded-lg bg-[#0E0C08] border border-[#261E10]">
              <span className="text-[#8C7E64] block">Pamięć Heap:</span>
              <span className="text-[#DDD] font-bold">
                {capabilities?.availableMemoryMb ? `~${capabilities.availableMemoryMb} MB` : 'Dynamiczna'}
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
                    <span className="text-[#8C7E64]">[{new Date(log.timestamp).toLocaleTimeString()}]</span>
                    <span className="text-[#D4AF37] font-bold">[{log.category}]</span>
                    <span>{log.message}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Preset & Settings Selector (When idle) */}
      {!isExporting && !output && (
        <div className="bg-[#121215] border border-[#242428] rounded-2xl p-5 sm:p-6 shadow-xl space-y-6">
          <div>
            <h2 className="text-xs font-bold text-[#D4AF37] uppercase tracking-wider flex items-center gap-2">
              <Sliders className="w-3.5 h-3.5" />
              Wybierz Preset Jakości
            </h2>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-3">
              {[
                { id: 'FAST', name: 'SZYBKI', desc: '720p • Najszybszy eksport' },
                { id: 'BALANCED', name: 'ZRÓWNOWAŻONY', desc: '1080p • Standardowa jakość' },
                { id: 'QUALITY', name: 'WYSOKA JAKOŚĆ', desc: '1080p 60FPS • Płynny obraz' },
                { id: 'MAX_QUALITY', name: 'MAKSYMALNA (4K)', desc: '4K Ultra HD • Master' }
              ].map(p => (
                <button
                  key={p.id}
                  onClick={() => applyPreset(p.id as ExportPresetMode)}
                  className={`p-3.5 rounded-xl border text-left transition-all cursor-pointer min-h-[44px] ${
                    presetMode === p.id
                      ? 'bg-[#2A2414] border-[#D4AF37] text-white shadow-md'
                      : 'bg-[#18181C] border-[#2A2A30] text-[#888892] hover:text-white hover:border-[#3A3A42]'
                  }`}
                >
                  <span className={`block text-xs font-bold ${presetMode === p.id ? 'text-[#E5C158]' : 'text-white'}`}>
                    {p.name}
                  </span>
                  <span className="block text-[11px] text-[#777782] mt-1 font-mono">
                    {p.desc}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* Granular Parameter Adjustments */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-4 border-t border-[#202024]">
            <div>
              <label className="text-xs text-[#888892] block mb-1.5 font-medium">Rozdzielczość</label>
              <select
                value={resolution}
                onChange={(e) => setResolution(e.target.value as any)}
                className="w-full bg-[#18181C] border border-[#2E2E36] rounded-xl px-3 py-2.5 text-xs text-white focus:border-[#D4AF37] focus:outline-none min-h-[44px]"
              >
                <option value="720p">1280 × 720 (HD)</option>
                <option value="1080p">1920 × 1080 (Full HD)</option>
                <option value="4k">3840 × 2160 (4K UHD)</option>
              </select>
            </div>

            <div>
              <label className="text-xs text-[#888892] block mb-1.5 font-medium">Płynność (FPS)</label>
              <select
                value={fps}
                onChange={(e) => setFps(Number(e.target.value))}
                className="w-full bg-[#18181C] border border-[#2E2E36] rounded-xl px-3 py-2.5 text-xs text-white focus:border-[#D4AF37] focus:outline-none min-h-[44px]"
              >
                <option value={24}>24 FPS (Kinowy)</option>
                <option value={30}>30 FPS (Standard)</option>
                <option value={60}>60 FPS (Wysoka płynność)</option>
              </select>
            </div>

            <div>
              <label className="text-xs text-[#888892] block mb-1.5 font-medium">Kadrowanie proporcji</label>
              <select
                value={fitMode}
                onChange={(e) => setFitMode(e.target.value as any)}
                className="w-full bg-[#18181C] border border-[#2E2E36] rounded-xl px-3 py-2.5 text-xs text-white focus:border-[#D4AF37] focus:outline-none min-h-[44px]"
              >
                <option value="fit">FIT (Cały kadr + rozmyte tło dla pionowych)</option>
                <option value="fill">FILL (Wypełnij ekran)</option>
                <option value="original">ORIGINAL (Bez zmian)</option>
              </select>
            </div>
          </div>

          {/* Color Grading & CinemaScope Letterbox Controls */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-4 border-t border-[#202024]">
            <div>
              <label className="text-xs text-[#D4AF37] block mb-1.5 font-medium flex items-center gap-1.5">
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
                className="w-full bg-[#18181C] border border-[#3E3422] rounded-xl px-3 py-2.5 text-xs text-white focus:border-[#D4AF37] focus:outline-none min-h-[44px]"
              >
                <option value="none">Oryginalny (Brak filtra)</option>
                <option value="golden_hour">✨ Złota Godzina (Ciepły romantyczny blask)</option>
                <option value="vivid_master">💎 Czysty Master (Maksymalna czystość & kontrast)</option>
                <option value="pastel_boho">🌸 Pastelowy Sen (Soft Boho & Delikatne pastele)</option>
                <option value="vintage_35mm">🎞️ Vintage 35mm (Analogowe ziarno & sepia)</option>
                <option value="cinematic_noir">🎬 Kinowy Noir (Głęboki czarno-biały luksus)</option>
              </select>
            </div>

            <div>
              <label className="text-xs text-[#D4AF37] block mb-1.5 font-medium flex items-center gap-1.5">
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
                className="w-full bg-[#18181C] border border-[#3E3422] rounded-xl px-3 py-2.5 text-xs text-white focus:border-[#D4AF37] focus:outline-none min-h-[44px]"
              >
                <option value="none">Standardowy (16:9 Pełny kadr)</option>
                <option value="cinemascope">CinemaScope 2.39:1 (Hollywoodzkie czarne pasy góra/dół)</option>
              </select>
            </div>
          </div>
        </div>
      )}

      {/* In-Flight Real Progress View */}
      {isExporting && (
        <div className="bg-[#121215] border border-[#D4AF37]/50 rounded-2xl p-6 sm:p-10 shadow-2xl space-y-8 my-2">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <span className="text-xs uppercase text-[#D4AF37] font-bold tracking-wider flex items-center gap-2 font-mono">
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
          <div className="h-3 w-full bg-[#1A1A1E] rounded-full overflow-hidden p-0.5 border border-[#2E2E36]">
            <div 
              className="h-full bg-gradient-to-r from-[#B8942A] via-[#E5C158] to-[#FDE047] rounded-full transition-all duration-200"
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
                      <span>{task.config.resolution} • {task.config.fps} FPS</span>
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
