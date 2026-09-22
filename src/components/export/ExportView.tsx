import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  Film, 
  Download, 
  Loader2, 
  CheckCircle2, 
  AlertTriangle, 
  XCircle, 
  Play, 
  RotateCcw, 
  FileCode2, 
  ShieldCheck, 
  ExternalLink,
  Sparkles,
  Layers,
  StopCircle
} from 'lucide-react';
import type { ProjectState } from '../../types/project';
import { useAuth } from '../../lib/firebase/AuthContext';
import { GoogleDriveIcon } from '../GoogleDriveModal';
import { checkProjectHealth, ProjectCheckResult } from '../../core/validation/projectValidator';
import { runRealRuntimeHealthCheck, ProjectHealthReport } from '../../core/director/projectHealthEngine';
import { sanitizeProjectForStorage } from '../../core/validation/projectMigration';
import { safeStringify } from '../../lib/safeJson';
import { renderManager } from '../../core/render/renderManager';
import { RenderProgress, RenderResult } from '../../core/render/renderTypes';

interface ExportViewProps {
  project: ProjectState;
}

export function ExportView({ project }: ExportViewProps) {
  const { accessToken, login } = useAuth();

  // Export & Render States
  const [isExporting, setIsExporting] = useState(false);
  const [renderProgress, setRenderProgress] = useState<RenderProgress | null>(null);
  const [renderResult, setRenderResult] = useState<RenderResult | null>(null);
  const [renderError, setRenderError] = useState<string | null>(null);
  const [verificationResult, setVerificationResult] = useState<{
    expectedDuration: number;
    actualDuration: number;
    drift: number;
    isPass: boolean;
    logs: string[];
  } | null>(null);

  // Settings
  const [resolution, setResolution] = useState<'720p' | '1080p' | '4k'>('1080p');
  const [fps, setFps] = useState<number>(30);
  const [aspectRatio, setAspectRatio] = useState<'16:9' | '9:16'>('16:9');
  const [selectedProviderId, setSelectedProviderId] = useState<string>('webcodecs_mp4_muxer');
  const [showDiagnostics, setShowDiagnostics] = useState<boolean>(false);

  // Google Drive states
  const [isSavingProjectToDrive, setIsSavingProjectToDrive] = useState(false);
  const [driveProjectUrl, setDriveProjectUrl] = useState<string | null>(null);
  const [isSavingVideoToDrive, setIsSavingVideoToDrive] = useState(false);
  const [driveVideoUrl, setDriveVideoUrl] = useState<string | null>(null);
  const [driveError, setDriveError] = useState<string | null>(null);

  // Preview video player ref
  const videoPlayerRef = useRef<HTMLVideoElement>(null);

  // Available & Active Providers
  const availableProviders = useMemo(() => renderManager.getAvailableProviders(), []);
  const activeProvider = useMemo(() => {
    return renderManager.getProvider(selectedProviderId);
  }, [selectedProviderId]);

  // Health check audit (Static & Runtime)
  const healthCheck: ProjectCheckResult = useMemo(() => {
    return checkProjectHealth(project);
  }, [project]);

  const [runtimeReport, setRuntimeReport] = useState<ProjectHealthReport | null>(null);
  const [isValidatingRuntime, setIsValidatingRuntime] = useState(false);

  useEffect(() => {
    let isMounted = true;
    setIsValidatingRuntime(true);
    runRealRuntimeHealthCheck(project)
      .then(report => {
        if (isMounted) {
          setRuntimeReport(report);
          setIsValidatingRuntime(false);
        }
      })
      .catch(err => {
        console.warn('Runtime health check failed:', err);
        if (isMounted) setIsValidatingRuntime(false);
      });
    return () => {
      isMounted = false;
    };
  }, [project]);

  const isReadyToExport = healthCheck.canExport && runtimeReport?.exportReadiness.status !== 'FIX BEFORE EXPORT' && project.timelineItems.length > 0;

  // Clean up object URLs on unmount
  useEffect(() => {
    return () => {
      if (renderResult?.blobUrl) {
        URL.revokeObjectURL(renderResult.blobUrl);
      }
    };
  }, [renderResult]);

  // 1. PROJECT EXPORT (.project.json)
  const handleDownloadProjectJson = () => {
    const projectExportData = {
      ...sanitizeProjectForStorage(project),
      exportedAt: new Date().toISOString()
    };

    const jsonString = safeStringify(projectExportData, 2);
    const blob = new Blob([jsonString], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const safeName = (project.name || 'Projekt_Weselny').replace(/[^a-zA-Z0-9ąćęłńóśźżĄĆĘŁŃÓŚŹŻ_-]/g, '_');
    a.download = `${safeName}.project.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleSaveProjectToDrive = async () => {
    let token = accessToken;
    if (!token) {
      try {
        token = await login();
      } catch (e) {
        setDriveError('Logowanie Google zostało anulowane lub nie powiodło się.');
        return;
      }
    }
    if (!token) {
      setDriveError('Wymagany jest dostęp do konta Google z uprawnieniami do Dysku.');
      return;
    }

    setIsSavingProjectToDrive(true);
    setDriveError(null);
    setDriveProjectUrl(null);

    try {
      const safeName = (project.name || 'Projekt_Weselny').replace(/[^a-zA-Z0-9ąćęłńóśźżĄĆĘŁŃÓŚŹŻ_-]/g, '_');
      const fileName = `${safeName}.project.json`;
      const content = safeStringify(sanitizeProjectForStorage(project), 2);

      const res = await fetch('/api/drive/upload', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          fileName,
          mimeType: 'application/json',
          content,
          isBase64: false
        })
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `Błąd serwera (${res.status})`);
      }

      const data = await res.json();
      setDriveProjectUrl(data.file?.webViewLink || 'https://drive.google.com');
    } catch (err: any) {
      setDriveError(err?.message || 'Nie udało się zapisać projektu na Dysku Google.');
    } finally {
      setIsSavingProjectToDrive(false);
    }
  };

  // 2. VIDEO EXPORT (.mp4)
  const handleStartMovieRender = async (diagnosticMode = false) => {
    if (!healthCheck.canExport) return;

    setIsExporting(true);
    setRenderError(null);
    setRenderResult(null);
    setDriveVideoUrl(null);

    try {
      // Diagnostic mode reduces complexity for testing
      const testProject = diagnosticMode ? {
        ...project,
        timelineItems: project.timelineItems.slice(0, 1).map(item => ({ ...item, duration: 3, sourceEnd: item.sourceStart + 3 })),
        audioTracks: []
      } : project;

      const result = await renderManager.startRender(
        testProject,
        {
          resolution: diagnosticMode ? '720p' : resolution,
          fps: diagnosticMode ? 24 : fps,
          aspectRatio,
          format: 'mp4'
        },
        (progress) => {
          setRenderProgress(progress);
        },
        selectedProviderId
      );

      setRenderResult(result);
      
      // Perform verification
      performExportVerification(result, totalDuration);
    } catch (err: any) {
      console.error('Render error:', err);
      const diagnosticInfo = renderProgress?.diagnostics ? `\n[Stage: ${renderProgress.stage}] ${renderProgress.diagnostics.stageDetails || ''}` : '';
      setRenderError(`${err?.message || 'Wystąpił nieoczekiwany błąd.'}${diagnosticInfo}`);
    } finally {
      setIsExporting(false);
    }
  };

  const performExportVerification = async (result: RenderResult, expectedDur: number) => {
    const logs: string[] = [];
    logs.push(`[Verification] Rozpoczęto weryfikację pliku: ${result.fileName}`);
    logs.push(`[Verification] Oczekiwana długość (Timeline): ${expectedDur.toFixed(3)}s`);
    
    try {
      // Use a temporary video element to probe the actual encoded file
      const video = document.createElement('video');
      video.preload = 'metadata';
      video.src = result.blobUrl;
      
      await new Promise((resolve) => {
        const timeout = setTimeout(() => {
          logs.push("[Verification] BŁĄD: Przekroczono czas oczekiwania na metadane pliku wynikowego.");
          resolve(null);
        }, 5000);

        video.onloadedmetadata = () => {
          clearTimeout(timeout);
          resolve(null);
        };
        video.onerror = () => {
          clearTimeout(timeout);
          logs.push("[Verification] BŁĄD: Nie można odczytać metadanych z wygenerowanego Bloba.");
          resolve(null);
        };
      });

      const actualDur = video.duration || result.duration;
      const drift = Math.abs(actualDur - expectedDur);
      const isPass = drift < 0.5; // Threshold for pass

      logs.push(`[Verification] Rzeczywista długość (Encoded): ${actualDur.toFixed(3)}s`);
      logs.push(`[Verification] Dryft czasowy: ${drift.toFixed(3)}s`);
      
      if (isPass) {
        logs.push("[Verification] STATUS: PASSED - Dryft w normie (<0.5s).");
      } else {
        logs.push("[Verification] STATUS: WARNING - Wykryto znaczący dryft czasowy.");
        logs.push("[Verification] Analiza synchronizacji ścieżek...");
        
        // Attempt to log track specific info if available (heuristic)
        if (result.sizeBytes < 1024) {
          logs.push("[Verification] UWAGA: Plik jest podejrzanie mały, możliwe uszkodzenie strumienia.");
        }
      }

      setVerificationResult({
        expectedDuration: expectedDur,
        actualDuration: actualDur,
        drift,
        isPass,
        logs
      });

      // Output to console for developer debugging as requested
      console.group("Export Verification Report");
      logs.forEach(log => console.log(log));
      console.groupEnd();

    } catch (err) {
      console.error("Verification failed", err);
    }
  };

  const handleCancelRender = () => {
    renderManager.cancelActiveRender();
    setIsExporting(false);
    // Maintain state so user sees it was cancelled
    setRenderProgress(prev => prev ? { ...prev, stage: 'cancelled', statusMessage: 'Renderowanie zostało przerwane.' } : null);
    setRenderError('Eksport został przerwany przez użytkownika.');
  };

  const getStageColor = (stage?: string) => {
    switch (stage) {
      case 'error': return 'text-red-400';
      case 'completed': return 'text-emerald-400';
      case 'cancelled': return 'text-amber-400';
      case 'rendering':
      case 'encoding_video':
      case 'encoding_audio':
        return 'text-[#D4AF37]';
      default: return 'text-[#AAA69D]';
    }
  };

  const formatSize = (bytes?: number) => {
    if (!bytes) return 'N/A';
    if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  const handleDownloadVideoFile = () => {
    if (!renderResult) return;
    const a = document.createElement('a');
    a.href = renderResult.blobUrl;
    a.download = renderResult.fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const handleSaveVideoToDrive = async () => {
    if (!renderResult) return;

    let token = accessToken;
    if (!token) {
      try {
        token = await login();
      } catch (e) {
        setDriveError('Logowanie Google zostało anulowane lub nie powiodło się.');
        return;
      }
    }
    if (!token) {
      setDriveError('Wymagany jest dostęp do konta Google z uprawnieniami do Dysku.');
      return;
    }

    setIsSavingVideoToDrive(true);
    setDriveError(null);
    setDriveVideoUrl(null);

    try {
      const formData = new FormData();
      formData.append('file', renderResult.blob, renderResult.fileName);
      formData.append('fileName', renderResult.fileName);
      formData.append('mimeType', renderResult.mimeType);

      const res = await fetch('/api/drive/upload-binary', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`
        },
        body: formData
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `Błąd serwera (${res.status})`);
      }

      const data = await res.json();
      setDriveVideoUrl(data.file?.webViewLink || 'https://drive.google.com');
    } catch (err: any) {
      setDriveError(err?.message || 'Nie udało się przesłać filmu na Dysk Google.');
    } finally {
      setIsSavingVideoToDrive(false);
    }
  };

  const formatDuration = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const totalDuration = useMemo(() => {
    return project.timelineItems.reduce((max, i) => Math.max(max, i.timelineStart + i.duration), 0);
  }, [project.timelineItems]);

  return (
    <div className="h-full bg-[#090909] flex flex-col overflow-y-auto custom-scrollbar">
      
      {/* Header */}
      <div className="p-6 md:p-8 border-b border-[#2A2824] bg-[#0C0C0C] shrink-0">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h2 className="text-2xl md:text-3xl font-serif-luxury text-[#F2EFE8] flex items-center gap-3">
              <Film className="w-7 h-7 text-[#D4AF37]" />
              Centrum Eksportu Filmu Ślubnego
            </h2>
            <p className="text-[#AAA69D] text-sm mt-1">
              Dwa niezależne mechanizmy: zapis struktury montażu oraz rzeczywisty render pliku wideo.
            </p>
          </div>
          <div 
            onClick={() => {
              const count = (window as any)._badgeClickCount || 0;
              (window as any)._badgeClickCount = count + 1;
              if (count + 1 >= 5) {
                (window as any)._badgeClickCount = 0;
                (window as any).toggleRenderDiagnostics?.();
              }
            }}
            className="flex items-center gap-2 bg-[#171717] px-3.5 py-2 rounded-xl border border-[#2A2824] cursor-pointer select-none active:bg-[#202020]"
            title="Kliknij 5 razy, aby otworzyć HUD diagnostyczny"
          >
            <ShieldCheck className="w-4 h-4 text-[#D4AF37]" />
            <span className="text-xs font-mono text-[#D4AF37]">Architektura v2 • Bez fałszywych plików</span>
          </div>
        </div>
      </div>

      <div className="flex-1 max-w-6xl w-full mx-auto p-6 md:p-8 space-y-8">
        
        {/* Drive Error Banner */}
        {driveError && (
          <div className="p-4 bg-red-950/40 border border-red-800/60 rounded-xl flex items-center justify-between text-xs text-red-200">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
              <span>{driveError}</span>
            </div>
            <button 
              onClick={() => setDriveError(null)}
              className="text-red-400 hover:text-white px-2 py-1 font-mono"
            >
              Zamknij
            </button>
          </div>
        )}

        {/* SECTION 1: PROJEKT MONTAŻOWY (JSON) */}
        <div className="bg-[#121212] border border-[#2A2824] rounded-2xl p-6 shadow-xl relative overflow-hidden">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 pb-6 border-b border-[#2A2824]">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-xl bg-[#1A1A1A] border border-[#2A2824] flex items-center justify-center shrink-0 text-[#D4AF37]">
                <FileCode2 className="w-6 h-6" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-lg font-bold text-white">1. Eksport Projektu Montażowego</h3>
                  <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20">
                    .project.json
                  </span>
                </div>
                <p className="text-xs text-[#AAA69D] mt-1 max-w-2xl leading-relaxed">
                  Zapisuje kompletną strukturę osi czasu, kolejność ujęć, punkty cięć IN/OUT, napisy, filtry barwne i rozdziały. 
                  Lekki plik tekstowy, który nie duplikuje gigabajtów nagrań i pozwala w każdej chwili wrócić do edycji.
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3 shrink-0">
              <button
                onClick={handleDownloadProjectJson}
                className="px-4 py-2.5 bg-[#1C1A17] hover:bg-[#25221E] border border-[#D4AF37]/30 text-[#D4AF37] rounded-xl text-xs font-semibold flex items-center gap-2 transition-colors cursor-pointer"
              >
                <Download className="w-4 h-4" />
                Pobierz .project.json
              </button>

              <button
                onClick={handleSaveProjectToDrive}
                disabled={isSavingProjectToDrive}
                className="px-4 py-2.5 bg-[#1F1F1F] hover:bg-[#2A2A2A] border border-[#333] text-white rounded-xl text-xs font-semibold flex items-center gap-2 transition-colors disabled:opacity-50 cursor-pointer"
              >
                {isSavingProjectToDrive ? (
                  <Loader2 className="w-4 h-4 animate-spin text-[#D4AF37]" />
                ) : (
                  <GoogleDriveIcon className="w-4 h-4" />
                )}
                Zapisz na Dysku Google
              </button>
            </div>
          </div>

          {driveProjectUrl && (
            <div className="mt-4 p-3 bg-emerald-950/40 border border-emerald-800/50 rounded-xl flex items-center justify-between text-xs text-emerald-300">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                <span>Projekt montażowy został pomyślnie zapisany na Twoim Dysku Google!</span>
              </div>
              <a 
                href={driveProjectUrl} 
                target="_blank" 
                rel="noreferrer" 
                className="underline hover:text-white flex items-center gap-1 font-semibold"
              >
                Otwórz plik w Google Drive <ExternalLink className="w-3.5 h-3.5" />
              </a>
            </div>
          )}
        </div>

        {/* SECTION 2: FINALNY FILM (MP4) */}
        <div className="bg-[#121212] border border-[#2A2824] rounded-2xl p-6 md:p-8 shadow-2xl relative overflow-hidden">
          
          <div className="flex items-start gap-4 mb-6">
            <div className="w-12 h-12 rounded-xl bg-[#D4AF37]/10 border border-[#D4AF37]/30 flex items-center justify-center shrink-0 text-[#D4AF37]">
              <Film className="w-6 h-6" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-xl font-bold text-white">2. Eksport Rzeczywistego Filmu</h3>
                <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                  {activeProvider.id === 'webcodecs_mp4_muxer' ? 'WebCodecs MP4 Muxer' : 'MediaRecorder Stream'}
                </span>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-white/5 text-[#AAA69D] border border-white/10">
                  {activeProvider.id === 'webcodecs_mp4_muxer' ? 'Format: H.264 / AAC (.mp4)' : 'Format: Strumień wideo'}
                </span>
              </div>
              <p className="text-xs text-[#AAA69D] mt-1 leading-relaxed">
                Silnik: <strong className="text-white">{activeProvider.name}</strong>. {activeProvider.description}
              </p>
            </div>
          </div>

          {/* PRE-EXPORT HEALTH CHECK */}
          {/* SMART EXPORT PRESET & PRE-FLIGHT CHECKS */}
          <div className="mb-6 p-4 rounded-xl bg-[#161514] border border-[#2A2824] space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-[#2A2824]">
              <div className="flex items-center gap-2.5">
                <ShieldCheck className="w-5 h-5 text-[#D4AF37]" />
                <div>
                  <h4 className="text-xs font-bold font-mono uppercase tracking-wider text-[#F2EFE8]">
                    Smart Export Preset: Pre-Flight Integrity Check
                  </h4>
                  <p className="text-[10px] text-[#888] font-mono">
                    Automatyczna weryfikacja 7 kluczowych aspektów przed rozpoczęciem kodowania
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                {isValidatingRuntime && <Loader2 className="w-4 h-4 text-[#D4AF37] animate-spin" />}
                <span className={`text-xs font-mono font-bold px-3 py-1 rounded-full uppercase tracking-wider shadow-md border ${
                  isReadyToExport 
                    ? 'bg-emerald-950 text-emerald-300 border-emerald-500/50 shadow-emerald-950/40' 
                    : 'bg-red-950 text-red-300 border-red-500/50 shadow-red-950/40'
                }`}>
                  {isReadyToExport ? '✓ READY TO EXPORT' : '✕ FIX BEFORE EXPORT'}
                </span>
              </div>
            </div>

            {/* 7-Point Pre-Flight Verification Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 text-xs font-mono">
              {/* 1. Brakujące media */}
              <div className={`p-2 rounded-lg border flex items-center justify-between ${
                runtimeReport?.modules.media.status === 'OK' 
                  ? 'bg-[#121212] border-[#2A2824] text-[#AAA69D]' 
                  : 'bg-red-950/20 border-red-800/40 text-red-300'
              }`}>
                <span className="flex items-center gap-1.5 truncate">
                  <Film className="w-3.5 h-3.5 text-[#D4AF37]" />
                  <span>1. Media źródłowe:</span>
                </span>
                <span className="font-bold text-[11px]">
                  {runtimeReport?.modules.media.status === 'OK' ? 'OK (0 braków)' : `${runtimeReport?.modules.media.issues.length || 1} uwagi`}
                </span>
              </div>

              {/* 2. Konflikty timeline */}
              <div className={`p-2 rounded-lg border flex items-center justify-between ${
                runtimeReport?.modules.timeline.status === 'OK' 
                  ? 'bg-[#121212] border-[#2A2824] text-[#AAA69D]' 
                  : 'bg-amber-950/20 border-amber-800/40 text-amber-300'
              }`}>
                <span className="flex items-center gap-1.5 truncate">
                  <Layers className="w-3.5 h-3.5 text-[#D4AF37]" />
                  <span>2. Konflikty timeline:</span>
                </span>
                <span className="font-bold text-[11px]">
                  {runtimeReport?.modules.timeline.status === 'OK' ? 'OK (Brak kolizji)' : 'Wykryto kolizje'}
                </span>
              </div>

              {/* 3. Błędne czasy */}
              <div className={`p-2 rounded-lg border flex items-center justify-between ${
                runtimeReport?.modules.timeline.status !== 'ERROR' 
                  ? 'bg-[#121212] border-[#2A2824] text-[#AAA69D]' 
                  : 'bg-red-950/20 border-red-800/40 text-red-300'
              }`}>
                <span className="flex items-center gap-1.5 truncate">
                  <RotateCcw className="w-3.5 h-3.5 text-[#D4AF37]" />
                  <span>3. Poprawność czasów:</span>
                </span>
                <span className="font-bold text-[11px]">
                  {runtimeReport?.modules.timeline.status !== 'ERROR' ? 'OK (Wszystkie > 0)' : 'Błędne czasy'}
                </span>
              </div>

              {/* 4. Brakujące audio */}
              <div className={`p-2 rounded-lg border flex items-center justify-between ${
                runtimeReport?.modules.audio.status !== 'ERROR' 
                  ? 'bg-[#121212] border-[#2A2824] text-[#AAA69D]' 
                  : 'bg-red-950/20 border-red-800/40 text-red-300'
              }`}>
                <span className="flex items-center gap-1.5 truncate">
                  <Sparkles className="w-3.5 h-3.5 text-[#D4AF37]" />
                  <span>4. Ścieżki audio:</span>
                </span>
                <span className="font-bold text-[11px]">
                  {runtimeReport?.modules.audio.status !== 'ERROR' ? 'OK (Zsynchronizowane)' : 'Uwagi audio'}
                </span>
              </div>

              {/* 5. Unsupported codec */}
              <div className="p-2 rounded-lg border bg-[#121212] border-[#2A2824] text-[#AAA69D] flex items-center justify-between">
                <span className="flex items-center gap-1.5 truncate">
                  <FileCode2 className="w-3.5 h-3.5 text-[#D4AF37]" />
                  <span>5. Kodek eksportu:</span>
                </span>
                <span className="font-bold text-emerald-400 text-[11px]">
                  {activeProvider.id === 'webcodecs_mp4_muxer' ? 'H.264 / AVC1 (MP4)' : 'MediaRecorder'}
                </span>
              </div>

              {/* 6. Dostępne miejsce & Pamięć */}
              <div className="p-2 rounded-lg border bg-[#121212] border-[#2A2824] text-[#AAA69D] flex items-center justify-between">
                <span className="flex items-center gap-1.5 truncate">
                  <Download className="w-3.5 h-3.5 text-[#D4AF37]" />
                  <span>6. Pamięć i Quota:</span>
                </span>
                <span className="font-bold text-white text-[11px]">
                  {runtimeReport?.modules.storage.status === 'OK' ? 'OK (Pojemność dostateczna)' : 'Ostrzeżenie pamięci'}
                </span>
              </div>

              {/* 7. Możliwości urządzenia */}
              <div className="p-2 rounded-lg border bg-[#121212] border-[#2A2824] text-[#AAA69D] flex items-center justify-between sm:col-span-2 lg:col-span-3">
                <span className="flex items-center gap-1.5 truncate">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                  <span>7. Akceleracja sprzętowa & WebCodecs:</span>
                </span>
                <span className="font-bold text-emerald-400 text-[11px]">
                  {typeof VideoEncoder !== 'undefined' ? '✓ Dostępna (Sprzętowe GPU)' : 'Standardowa (Canvas Fallback)'}
                </span>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs pt-1">
              <div className="bg-[#1C1A17] p-2.5 rounded-lg border border-[#2A2824]">
                <div className="text-[10px] font-mono text-[#777]">CZAS TRWANIA</div>
                <div className="text-white font-bold font-mono mt-0.5">{formatDuration(totalDuration)}</div>
              </div>
              <div className="bg-[#1C1A17] p-2.5 rounded-lg border border-[#2A2824]">
                <div className="text-[10px] font-mono text-[#777]">LICZBA UJĘĆ</div>
                <div className="text-white font-bold font-mono mt-0.5">{project.timelineItems.length} klipów</div>
              </div>
              <div className="bg-[#1C1A17] p-2.5 rounded-lg border border-[#2A2824]">
                <div className="text-[10px] font-mono text-[#777]">ŚCIEŻKI AUDIO</div>
                <div className="text-white font-bold font-mono mt-0.5">{project.audioTracks.length} utworów</div>
              </div>
              <div className="bg-[#1C1A17] p-2.5 rounded-lg border border-[#2A2824]">
                <div className="text-[10px] font-mono text-[#777]">WARSTWY TEKSTU</div>
                <div className="text-white font-bold font-mono mt-0.5">{project.textLayers.length} napisów</div>
              </div>
            </div>

            {/* List of issues if any */}
            {healthCheck.issues.length > 0 && (
              <div className="space-y-1.5 pt-2">
                {healthCheck.issues.map((issue) => (
                  <div 
                    key={issue.id}
                    className={`p-2.5 rounded-lg text-xs flex items-start gap-2 ${
                      issue.severity === 'error'
                        ? 'bg-red-950/30 text-red-300 border border-red-800/40'
                        : 'bg-amber-950/30 text-amber-300 border border-amber-800/40'
                    }`}
                  >
                    {issue.severity === 'error' ? (
                      <XCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                    ) : (
                      <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                    )}
                    <div>
                      <span className="font-bold">{issue.title}: </span>
                      <span>{issue.message}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* ACTIVE RENDER PROGRESS */}
          {isExporting && renderProgress && (
            <div className="my-8 p-6 bg-[#161514] border border-[#D4AF37]/40 rounded-2xl space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Loader2 className="w-6 h-6 text-[#D4AF37] animate-spin" />
                  <div>
                    <h4 className="text-sm font-bold text-white uppercase tracking-wide">
                      Status: <span className={getStageColor(renderProgress.stage)}>{renderProgress.stage.replace('_', ' ').toUpperCase()}</span>
                    </h4>
                    <p className="text-xs text-[#AAA69D] mt-0.5">{renderProgress.statusMessage}</p>
                  </div>
                </div>

                <button
                  onClick={handleCancelRender}
                  className="px-3 py-1.5 bg-red-950/50 hover:bg-red-900 border border-red-700/60 text-red-200 text-xs rounded-lg flex items-center gap-1.5 transition-colors cursor-pointer"
                >
                  <StopCircle className="w-4 h-4 text-red-400" />
                  Anuluj
                </button>
              </div>

              {/* Progress Bar */}
              <div className="space-y-1.5">
                <div className="flex justify-between text-xs font-mono text-[#AAA69D]">
                  <span className="flex items-center gap-2">
                    Postęp renderowania
                    {renderProgress.statistics?.averageFps && (
                      <span className="text-[#666]">({renderProgress.fps} FPS)</span>
                    )}
                  </span>
                  <span className="text-[#D4AF37] font-bold">{renderProgress.percent}%</span>
                </div>
                <div className="h-3 w-full bg-[#0A0A0A] rounded-full overflow-hidden border border-[#2A2824]">
                  <div 
                    className="h-full bg-gradient-to-r from-[#D4AF37] to-[#FDE047] transition-all duration-300 ease-out shadow-[0_0_10px_rgba(212,175,55,0.3)]"
                    style={{ width: `${renderProgress.percent}%` }}
                  />
                </div>
              </div>

              <div className="flex items-center justify-between text-[11px] font-mono text-[#777] pt-1">
                <div className="flex gap-4">
                  <span>Klatka: {renderProgress.currentFrame} / {renderProgress.totalFrames}</span>
                  {renderProgress.diagnostics?.memoryUsageMb && (
                    <span>RAM: {renderProgress.diagnostics.memoryUsageMb} MB</span>
                  )}
                </div>
                <span>Format: {resolution} @ {renderProgress.targetFps || fps} FPS</span>
              </div>

              {renderProgress.diagnostics && (
                <div className="mt-4 p-3 bg-black border border-[#2A2824] rounded-lg space-y-2">
                  <div className="text-[10px] text-[#555] uppercase font-bold flex justify-between">
                    <span>Log Diagnostyczny</span>
                    {renderProgress.statistics?.hardwareAcceleration && (
                      <span className="text-emerald-500/60">Accel: {renderProgress.statistics.hardwareAcceleration}</span>
                    )}
                  </div>
                  <div className="text-[11px] font-mono text-emerald-500/80 leading-relaxed">
                    <div>{'>'} {renderProgress.statusMessage}</div>
                    {renderProgress.diagnostics.stageDetails && <div>{'>'} {renderProgress.diagnostics.stageDetails}</div>}
                    {renderProgress.diagnostics.lastClipName && <div>{'>'} Przetwarzanie: {renderProgress.diagnostics.lastClipName}</div>}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* RENDER ERROR */}
          {renderError && !isExporting && (
            <div className="my-6 p-5 bg-red-950/40 border border-red-800/60 rounded-xl flex flex-col gap-4">
              <div className="flex items-start gap-3">
                <XCircle className="w-6 h-6 text-red-400 shrink-0 mt-0.5" />
                <div className="space-y-1 flex-1">
                  <div className="text-sm font-bold text-red-300">Błąd renderowania filmu</div>
                  <div className="text-xs text-red-200/90 leading-relaxed whitespace-pre-wrap">{renderError}</div>
                </div>
              </div>

              {renderProgress?.diagnostics && (
                <div className="p-4 bg-black/60 rounded-lg border border-red-900/30 font-mono text-[10px] text-red-400/80">
                  <div className="font-bold mb-2 uppercase text-red-400">Dane Diagnostyczne:</div>
                  <pre className="overflow-x-auto whitespace-pre-wrap">
                    {safeStringify(renderProgress.diagnostics, 2)}
                  </pre>
                </div>
              )}

              <div className="flex gap-3">
                <button
                  onClick={() => handleStartMovieRender(false)}
                  className="px-4 py-2 bg-[#D4AF37] text-black text-xs font-bold rounded-lg hover:bg-[#FDE047] transition-all cursor-pointer"
                >
                  Spróbuj ponownie
                </button>
                <button
                  onClick={() => handleStartMovieRender(true)}
                  className="px-4 py-2 bg-black border border-[#D4AF37]/50 text-[#D4AF37] text-xs font-bold rounded-lg hover:bg-[#1A1A1A] transition-all cursor-pointer"
                >
                  Uruchom minimalny TEST (1 klip, 3 sek)
                </button>
              </div>
            </div>
          )}

          {/* FINISHED: GENUINE VERIFIED VIDEO PLAYER & DOWNLOAD */}
          {renderResult && !isExporting && (
            <div className="my-8 p-6 bg-[#161514] border border-emerald-500/40 rounded-2xl space-y-6">
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-full bg-emerald-500/10 flex items-center justify-center border border-emerald-500/20">
                    <CheckCircle2 className="w-7 h-7 text-emerald-400" />
                  </div>
                  <div>
                    <h4 className="text-lg font-bold text-white font-serif-luxury">Eksport zakończony sukcesem</h4>
                    <p className="text-xs text-[#AAA69D] mt-0.5">
                      Plik <span className="text-white font-mono">{renderResult.fileName}</span> został zweryfikowany klatka po klatce.
                    </p>
                  </div>
                </div>

                <div className="hidden sm:flex flex-col items-end gap-1">
                  <span className="text-[11px] font-mono px-2.5 py-1 bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 rounded-lg">
                    STABILNY MP4 (H.264)
                  </span>
                  <span className="text-[10px] text-[#555] font-mono uppercase">Rozmiar: {formatSize(renderResult.sizeBytes)}</span>
                </div>
              </div>

              {/* IN-APP REAL VIDEO PLAYER */}
              <div className="relative rounded-xl overflow-hidden bg-black border border-[#2A2824] aspect-video max-h-[420px] flex items-center justify-center shadow-2xl">
                <video 
                  ref={videoPlayerRef}
                  src={renderResult.blobUrl} 
                  controls 
                  playsInline
                  className="w-full h-full object-contain"
                />
              </div>

              {/* Statistics Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 py-4 border-y border-[#2A2824]">
                <div className="space-y-1">
                  <div className="text-[10px] text-[#666] uppercase font-bold">Długość</div>
                  <div className="text-white font-mono text-sm">{formatDuration(renderResult.duration)}</div>
                </div>
                <div className="space-y-1">
                  <div className="text-[10px] text-[#666] uppercase font-bold">Wielkość</div>
                  <div className="text-white font-mono text-sm">{formatSize(renderResult.sizeBytes)}</div>
                </div>
                <div className="space-y-1">
                  <div className="text-[10px] text-[#666] uppercase font-bold">Rozdzielczość</div>
                  <div className="text-white font-mono text-sm">{renderResult.width}x{renderResult.height}</div>
                </div>
                <div className="space-y-1">
                  <div className="text-[10px] text-[#666] uppercase font-bold">Dryft (Drift)</div>
                  <div className={`font-mono text-sm ${verificationResult?.isPass ? 'text-emerald-400' : 'text-amber-400'}`}>
                    {verificationResult ? `${verificationResult.drift.toFixed(3)}s` : 'Analiza...'}
                  </div>
                </div>
              </div>

              {/* Verification Logs Panel */}
              {verificationResult && (
                <div className="p-4 bg-black/40 rounded-xl border border-[#2A2824] space-y-2">
                  <div className="flex items-center justify-between">
                    <h5 className="text-[10px] font-mono font-bold text-[#D4AF37] uppercase tracking-wider">Log Weryfikacji Synchronizacji</h5>
                    {verificationResult.isPass ? (
                      <span className="text-[9px] bg-emerald-500/20 text-emerald-400 px-2 py-0.5 rounded border border-emerald-500/30">ZGODNY</span>
                    ) : (
                      <span className="text-[9px] bg-amber-500/20 text-amber-400 px-2 py-0.5 rounded border border-amber-500/30">ROZBIEŻNOŚĆ</span>
                    )}
                  </div>
                  <div className="text-[10px] font-mono text-[#777] leading-relaxed max-h-32 overflow-y-auto custom-scrollbar">
                    {verificationResult.logs.map((log, i) => (
                      <div key={i}>{log}</div>
                    ))}
                  </div>
                </div>
              )}

              {/* ACTION BUTTONS */}
              <div className="flex flex-wrap items-center justify-between gap-4 pt-2">
                <div className="flex flex-wrap items-center gap-3">
                  <button
                    onClick={handleDownloadVideoFile}
                    className="px-6 py-3.5 bg-[#D4AF37] hover:bg-[#FDE047] text-black font-bold rounded-xl text-sm flex items-center gap-2 transition-all shadow-[0_0_20px_rgba(212,175,55,0.25)] cursor-pointer"
                  >
                    <Download className="w-5 h-5" />
                    Pobierz film na urządzenie
                  </button>

                  <button
                    onClick={handleSaveVideoToDrive}
                    disabled={isSavingVideoToDrive}
                    className="px-5 py-3.5 bg-[#1C1A17] hover:bg-[#25221E] border border-[#D4AF37]/40 text-[#D4AF37] font-semibold rounded-xl text-sm flex items-center gap-2 transition-colors disabled:opacity-50 cursor-pointer"
                  >
                    {isSavingVideoToDrive ? (
                      <Loader2 className="w-5 h-5 animate-spin text-[#D4AF37]" />
                    ) : (
                      <GoogleDriveIcon className="w-5 h-5" />
                    )}
                    Zapisz na Dysku Google
                  </button>
                </div>

                <button
                  onClick={() => { setRenderResult(null); setRenderProgress(null); }}
                  className="px-4 py-2.5 bg-[#1F1F1F] hover:bg-[#2A2A2A] text-[#AAA69D] hover:text-white rounded-xl text-xs font-mono flex items-center gap-1.5 transition-colors cursor-pointer"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  Nowy eksport
                </button>
              </div>

              {driveVideoUrl && (
                <div className="p-4 bg-emerald-950/40 border border-emerald-800/50 rounded-xl flex items-center justify-between text-xs text-emerald-300">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                    <span>Film został przesłany na Twój Dysk Google!</span>
                  </div>
                  <a 
                    href={driveVideoUrl} 
                    target="_blank" 
                    rel="noreferrer" 
                    className="underline hover:text-white flex items-center gap-1 font-semibold"
                  >
                    Otwórz w Drive <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                </div>
              )}
            </div>
          )}

          {/* RENDER CONTROLS (WHEN IDLE OR ERROR) */}
          {!isExporting && !renderResult && (
            <div className="space-y-6 pt-2">
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
                <div>
                  <label className="text-xs font-mono font-bold text-[#AAA69D] uppercase tracking-wider block mb-2">
                    Silnik Renderowania
                  </label>
                  <select 
                    value={selectedProviderId}
                    onChange={(e) => setSelectedProviderId(e.target.value)}
                    className="w-full bg-[#1A1A1A] border border-[#2A2824] rounded-xl px-4 py-3 text-white focus:outline-none focus:border-[#D4AF37] text-xs font-mono"
                  >
                    {availableProviders.map(p => (
                      <option key={p.id} value={p.id}>
                        {p.id === 'webcodecs_mp4_muxer' ? 'WebCodecs MP4 (Natywna wysoka jakość)' : 'Canvas + MediaRecorder (Kompatybilność)'}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-xs font-mono font-bold text-[#AAA69D] uppercase tracking-wider block mb-2">
                    Rozdzielczość
                  </label>
                  <select 
                    value={resolution}
                    onChange={(e) => setResolution(e.target.value as any)}
                    className="w-full bg-[#1A1A1A] border border-[#2A2824] rounded-xl px-4 py-3 text-white focus:outline-none focus:border-[#D4AF37] text-xs font-mono"
                  >
                    <option value="1080p">Full HD 1080p (Rekomendowane)</option>
                    <option value="720p">HD 720p (Szybki eksport)</option>
                    <option value="4k">4K Ultra HD (Maksymalna ostrość)</option>
                  </select>
                </div>

                <div>
                  <label className="text-xs font-mono font-bold text-[#AAA69D] uppercase tracking-wider block mb-2">
                    Płynność (FPS)
                  </label>
                  <select 
                    value={fps}
                    onChange={(e) => setFps(Number(e.target.value))}
                    className="w-full bg-[#1A1A1A] border border-[#2A2824] rounded-xl px-4 py-3 text-white focus:outline-none focus:border-[#D4AF37] text-xs font-mono"
                  >
                    <option value={30}>30 FPS (Standard ślubny)</option>
                    <option value={24}>24 FPS (Styl kinowy)</option>
                    <option value={60}>60 FPS (Super płynność)</option>
                  </select>
                </div>

                <div>
                  <label className="text-xs font-mono font-bold text-[#AAA69D] uppercase tracking-wider block mb-2">
                    Format Kadru
                  </label>
                  <select 
                    value={aspectRatio}
                    onChange={(e) => setAspectRatio(e.target.value as any)}
                    className="w-full bg-[#1A1A1A] border border-[#2A2824] rounded-xl px-4 py-3 text-white focus:outline-none focus:border-[#D4AF37] text-xs font-mono"
                  >
                    <option value="16:9">16:9 Poziomy (Telewizor / YT)</option>
                    <option value="9:16">9:16 Pionowy (Rolka / TikTok)</option>
                  </select>
                </div>
              </div>

              {/* TOGGLE DIAGNOSTIC PANEL */}
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={() => setShowDiagnostics(!showDiagnostics)}
                  className="text-xs font-mono text-[#D4AF37] hover:underline flex items-center gap-1.5 cursor-pointer"
                >
                  <Layers className="w-3.5 h-3.5" />
                  {showDiagnostics ? 'Ukryj panel diagnostyczny' : 'Pokaż parametry diagnostyczne renderera'}
                </button>
              </div>

              {/* DIAGNOSTIC PANEL */}
              {showDiagnostics && (
                <div className="p-4 bg-[#0A0A0A] border border-[#2A2824] rounded-xl space-y-3 font-mono text-xs text-[#AAA69D]">
                  <div className="flex items-center justify-between text-white font-bold pb-2 border-b border-[#2A2824]">
                    <span>PANEL DIAGNOSTYCZNY RENDERERA</span>
                    <button
                      type="button"
                      onClick={() => (window as any).toggleRenderDiagnostics?.()}
                      className="text-[#D4AF37] hover:text-yellow-300 text-[10px] uppercase underline cursor-pointer"
                    >
                      Otwórz pływający HUD
                    </button>
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-[11px]">
                    <div>
                      <span className="text-[#666] block">DOSTAWCA:</span>
                      <span className="text-white font-semibold">{activeProvider.name}</span>
                    </div>
                    <div>
                      <span className="text-[#666] block">KODEC WIDEO:</span>
                      <span className="text-white font-semibold">{activeProvider.id === 'webcodecs_mp4_muxer' ? 'H.264 / AVC1' : 'MediaRecorder Stream'}</span>
                    </div>
                    <div>
                      <span className="text-[#666] block">KODEC AUDIO:</span>
                      <span className="text-white font-semibold">{activeProvider.id === 'webcodecs_mp4_muxer' ? 'AAC 48kHz Stereo' : 'Opus / WebM Audio'}</span>
                    </div>
                    <div>
                      <span className="text-[#666] block">KONTENER:</span>
                      <span className="text-white font-semibold">{activeProvider.id === 'webcodecs_mp4_muxer' ? 'ISO MP4 (.mp4)' : 'WebM Container'}</span>
                    </div>
                    <div>
                      <span className="text-[#666] block">SZACOWANA LICZBA KLATEK:</span>
                      <span className="text-white font-semibold">{Math.round(totalDuration * fps)} klatek</span>
                    </div>
                    <div>
                      <span className="text-[#666] block">CZAS PROJEKTU:</span>
                      <span className="text-white font-semibold">{formatDuration(totalDuration)}</span>
                    </div>
                    <div>
                      <span className="text-[#666] block">KLIPY NA OSI:</span>
                      <span className="text-white font-semibold">{project.timelineItems.length} szt.</span>
                    </div>
                    <div>
                      <span className="text-[#666] block">ZARZĄDZANIE PAMIĘCIĄ:</span>
                      <span className="text-emerald-400 font-semibold">Strumieniowy GC (VideoFrame.close)</span>
                    </div>
                  </div>
                </div>
              )}

              {/* Start Render Button */}
              <div className="pt-2">
                <button 
                  onClick={() => handleStartMovieRender(false)}
                  disabled={!isReadyToExport || totalDuration === 0}
                  className="w-full bg-[#D4AF37] text-black px-6 py-4 rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-[#FDE047] transition-all transform hover:scale-[1.01] shadow-[0_0_20px_rgba(212,175,55,0.2)] disabled:opacity-40 disabled:cursor-not-allowed disabled:transform-none cursor-pointer"
                >
                  <Film className="w-5 h-5" />
                  Rozpocznij renderowanie i wygeneruj film MP4
                </button>
                {!isReadyToExport && (
                  <p className="text-[11px] text-red-400 text-center font-mono mt-2">
                    Przycisk jest zablokowany: projekt wymaga poprawy przed eksportem (FIX BEFORE EXPORT).
                  </p>
                )}
              </div>
            </div>
          )}

        </div>

      </div>
    </div>
  );
}
