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
  Sparkles
} from 'lucide-react';
import type { ProjectState } from '../../types/project';
import { videoExportService } from '../../core/export/videoExportService';
import { 
  ExportOutput, 
  ExportProgress, 
  ExportError, 
  FitMode,
  MediaSource,
  TimelineClip
} from '../../core/export/videoExportTypes';
import { urlRegistry } from '../../core/media/urlRegistry';
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
  const [normalizeAudio, setNormalizeAudio] = useState(true);

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

  // Export State
  const [isExporting, setIsExporting] = useState(false);
  const [progress, setProgress] = useState<ExportProgress | null>(null);
  const [output, setOutput] = useState<ExportOutput | null>(videoExportService.getLastOutput());
  const [error, setError] = useState<ExportError | null>(null);

  // Video preview player ref
  const videoPlayerRef = useRef<HTMLVideoElement>(null);

  // Compute Sources & Ordered Timeline
  const mediaSources: MediaSource[] = useMemo(() => {
    return (project.mediaLibrary || []).map(clip => ({
      id: clip.id,
      uri: clip.objectUrl || (clip.file ? urlRegistry.create(clip.file) : ''),
      file: clip.file,
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
    }));
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
        rotation: item.rotation || 0,
        crop: item.crop,
        fitMode: (item.fitMode as FitMode) || fitMode
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

  // Subscribe to service progress
  useEffect(() => {
    const unsubscribe = videoExportService.subscribe((p) => {
      setProgress(p);
      if (p.stage === 'SUKCES' || p.stage === 'BLAD' || p.stage === 'ANULOWANO') {
        setIsExporting(false);
      }
    });
    return unsubscribe;
  }, []);

  const handleStartExport = async () => {
    if (totalClipsCount === 0) {
      toast.showError('Dodaj przynajmniej jeden film, aby rozpocząć eksport.');
      return;
    }

    setError(null);
    setOutput(null);
    setIsExporting(true);

    try {
      const plan = videoExportService.prepareExport(
        mediaSources,
        timelineClips,
        {
          resolution,
          fps,
          fitMode
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
          code: 'EXPORT_FAILED',
          message: err?.message || 'Nieznany błąd podczas przetwarzania filmu.',
          technicalDetails: String(err?.stack || err)
        };
        setError(errorObj);
        toast.showError(`Błąd eksportu: ${errorObj.message}`);
      }
    } finally {
      setIsExporting(false);
    }
  };

  const handleCancelExport = () => {
    videoExportService.cancelExport();
    setIsExporting(false);
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

  // Stage active check helper
  const getStageStatus = (stageName: string): 'DONE' | 'ACTIVE' | 'PENDING' => {
    const cur = progress?.stage;
    const stages = ['PRZYGOTOWANIE', 'AUDIO', 'DEKODOWANIE', 'KODOWANIE', 'MUXING', 'WALIDACJA'];
    const curIdx = stages.indexOf(cur || 'PRZYGOTOWANIE');
    const targetIdx = stages.indexOf(stageName);

    if (cur === 'SUKCES' || targetIdx < curIdx) return 'DONE';
    if (targetIdx === curIdx) return 'ACTIVE';
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

        {totalClipsCount > 0 && !isExporting && !output && (
          <button
            onClick={handleStartExport}
            className="flex items-center gap-2 px-6 py-3 bg-[#D4AF37] hover:bg-[#E5C158] text-black font-extrabold text-sm rounded-xl transition-all shadow-lg hover:scale-[1.02] cursor-pointer uppercase tracking-wider min-h-[44px]"
          >
            <Play className="w-4 h-4 fill-black" />
            <span>ROZPOCZNIJ EKSPORT</span>
          </button>
        )}
      </div>

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
        </div>
      )}

      {/* In-Flight Real Progress View (Requirement 19: EKSPORT W TOKU, 72%, Klip 4 z 8, etapy) */}
      {isExporting && (
        <div className="bg-[#121215] border border-[#D4AF37]/40 rounded-2xl p-6 sm:p-10 shadow-2xl space-y-8 my-2">
          {/* Top Banner */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <span className="text-xs uppercase text-[#D4AF37] font-bold tracking-wider flex items-center gap-2 font-mono">
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                EKSPORT W TOKU
              </span>
              <h3 className="text-xl sm:text-2xl font-bold text-white mt-1">
                {progress?.statusMessage || 'Renderowanie i scalanie filmu...'}
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
              className="h-full bg-gradient-to-r from-[#B8942A] to-[#F3D179] rounded-full transition-all duration-200"
              style={{ width: `${progress?.percent || 0}%` }}
            />
          </div>

          {/* Real Engine Stage Indicators (Req 19) */}
          <div className="grid grid-cols-2 sm:grid-cols-6 gap-2 pt-2 border-t border-[#202024] text-xs font-mono">
            {[
              { id: 'PRZYGOTOWANIE', label: 'PRZYGOTOWANIE' },
              { id: 'AUDIO', label: 'AUDIO' },
              { id: 'DEKODOWANIE', label: 'DEKODOWANIE' },
              { id: 'KODOWANIE', label: 'KODOWANIE' },
              { id: 'MUXING', label: 'MUXING' },
              { id: 'WALIDACJA', label: 'WALIDACJA' }
            ].map(st => {
              const status = getStageStatus(st.id);
              return (
                <div 
                  key={st.id}
                  className={`p-2 rounded-lg border text-center flex items-center justify-center gap-1.5 ${
                    status === 'DONE'
                      ? 'bg-emerald-950/20 border-emerald-800/40 text-emerald-400'
                      : (status === 'ACTIVE'
                        ? 'bg-[#2A2414] border-[#D4AF37] text-[#E5C158] font-bold animate-pulse'
                        : 'bg-[#161619] border-[#222226] text-[#666670]')
                  }`}
                >
                  <span>{st.label}</span>
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
              <span className="text-[#777782] block text-[10px] uppercase">Prędkość:</span>
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
                ~{progress?.etaSeconds || 0}s
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Error View */}
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
            {onNavigateTab && (
              <button
                onClick={() => onNavigateTab('settings')}
                className="px-4 py-2.5 bg-[#222] hover:bg-[#333] text-[#AAA] hover:text-white text-xs rounded-xl transition-colors cursor-pointer min-h-[44px]"
              >
                Otwórz Diagnostykę Silnika
              </button>
            )}
          </div>
        </div>
      )}

      {/* Finished Result View (Requirement 20: Duży preview, specyfikacja, przyciski ODTWÓRZ, POBIERZ, UDOSTĘPNIJ, NOWY PROJEKT) */}
      {output && !isExporting && (
        <div className="bg-[#121215] border border-[#2A2A30] rounded-2xl p-6 sm:p-8 shadow-2xl space-y-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-emerald-400 font-mono text-xs font-bold uppercase tracking-wider">
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              <span>Film gotowy do odtworzenia i zapisu</span>
            </div>

            <button
              onClick={() => setOutput(null)}
              className="text-xs text-[#888892] hover:text-white transition-colors cursor-pointer font-mono"
            >
              Zamknij podgląd
            </button>
          </div>

          {/* Large video player preview */}
          <div className="relative aspect-video max-w-3xl mx-auto bg-black rounded-xl overflow-hidden border border-[#2E2E36] shadow-2xl">
            <video
              ref={videoPlayerRef}
              src={output.url}
              controls
              playsInline
              className="w-full h-full object-contain"
            />
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

          {/* 4 Action Buttons: ODTWÓRZ, POBIERZ, UDOSTĘPNIJ, NOWY PROJEKT (Req 20) */}
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
    </div>
  );
}
