import React, { useState, useEffect } from 'react';
import { 
  Settings, 
  Activity, 
  Cpu, 
  HardDrive, 
  CheckCircle2, 
  XCircle, 
  Play, 
  Loader2, 
  RefreshCw, 
  ShieldCheck, 
  Trash2,
  Monitor,
  Eye,
  Zap,
  Gauge
} from 'lucide-react';
import type { ProjectState } from '../../types/project';
import { videoExportService } from '../../core/export/videoExportService';
import { performanceMonitor, HardwareDiagnostics, LivePerformanceMetrics } from '../../core/diagnostics/performanceMonitor';
import { useStudioToast } from '../common/ToastContext';

interface SettingsDiagnosticsViewProps {
  project: ProjectState;
  onUpdateProject?: (project: ProjectState) => void;
  onClearCache: () => void;
  onResetProject: () => void;
}

export const SettingsDiagnosticsView: React.FC<SettingsDiagnosticsViewProps> = ({
  project,
  onUpdateProject,
  onClearCache,
  onResetProject
}) => {
  const toast = useStudioToast();

  const [hw, setHw] = useState<HardwareDiagnostics | null>(null);
  const [metrics, setMetrics] = useState<LivePerformanceMetrics>(performanceMonitor.getCurrentMetrics());
  const [isDebugEnabled, setIsDebugEnabled] = useState(performanceMonitor.isDebugEnabled());

  const [isTestingEngine, setIsTestingEngine] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; durationMs: number; details: string } | null>(null);

  useEffect(() => {
    performanceMonitor.getHardwareDiagnostics().then(setHw);
    const unsubMetrics = performanceMonitor.subscribe(setMetrics);
    const unsubDebug = performanceMonitor.subscribeDebugOverlay(setIsDebugEnabled);
    return () => {
      unsubMetrics();
      unsubDebug();
    };
  }, []);

  const handleToggleDebug = () => {
    const next = !isDebugEnabled;
    setIsDebugEnabled(next);
    performanceMonitor.setDebugEnabled(next);
    toast.showInfo(next ? 'Tryb diagnostyczny (DEBUG HUD) został włączony.' : 'Tryb diagnostyczny wyłączony.');
  };

  const handleRunEngineTest = async () => {
    setIsTestingEngine(true);
    setTestResult(null);
    try {
      const res = await videoExportService.runEngineTest();
      setTestResult(res);
      if (res.success) {
        toast.showSuccess(`Test silnika MP4 zaliczony pomyślnie (${res.durationMs}ms)!`);
      } else {
        toast.showError(`Test nie powiódł się: ${res.details}`);
      }
    } catch (e: any) {
      setTestResult({
        success: false,
        durationMs: 0,
        details: e.message || String(e)
      });
      toast.showError(`Błąd testu: ${e.message}`);
    } finally {
      setIsTestingEngine(false);
      performanceMonitor.getHardwareDiagnostics().then(setHw);
    }
  };

  return (
    <div className="max-w-5xl mx-auto w-full px-4 sm:px-6 py-6 sm:py-8 flex flex-col gap-6 sm:gap-8">
      {/* Header */}
      <div className="border-b border-[#242428] pb-4">
        <div className="flex items-center gap-2 text-[#D4AF37] text-xs font-semibold tracking-wider uppercase mb-1">
          <Settings className="w-3.5 h-3.5" />
          <span>Wydajność i Środowisko</span>
        </div>
        <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">
          Diagnostyka Wydajności i Hardware
        </h1>
        <p className="text-xs sm:text-sm text-[#888892] mt-0.5">
          Weryfikacja akceleracji sprzętowej GPU, koderów WebCodecs, zużycia pamięci i płynności UI
        </p>
      </div>

      {/* Live Performance Panel (Requirement 28: FPS UI, render FPS, dropped frames, frame times) */}
      <div className="bg-[#121215] border border-[#26262B] rounded-2xl p-5 sm:p-6 shadow-xl space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-2 font-mono">
            <Activity className="w-4 h-4 text-[#D4AF37]" />
            Wskaźniki Wydajności w Czasie Rzeczywistym
          </h2>
          <span className="text-[11px] text-[#888892] font-mono flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            Aktualizacja: 3 Hz
          </span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 font-mono">
          <div className="bg-[#16161A] p-4 rounded-xl border border-[#24242A]">
            <span className="text-[#888892] block text-[10px] uppercase">Płynność UI (FPS):</span>
            <span className={`text-2xl font-bold mt-1 block ${
              metrics.uiFps >= 50 ? 'text-emerald-400' : (metrics.uiFps >= 30 ? 'text-amber-400' : 'text-rose-400')
            }`}>
              {metrics.uiFps} FPS
            </span>
            <span className="text-[10px] text-[#777] mt-0.5 block">Śr. klatka: {metrics.averageFrameTimeMs} ms</span>
          </div>

          <div className="bg-[#16161A] p-4 rounded-xl border border-[#24242A]">
            <span className="text-[#888892] block text-[10px] uppercase">Pominięte klatki:</span>
            <span className={`text-2xl font-bold mt-1 block ${
              metrics.droppedFramesCount === 0 ? 'text-emerald-400' : 'text-amber-400'
            }`}>
              {metrics.droppedFramesCount}
            </span>
            <span className="text-[10px] text-[#777] mt-0.5 block">z {metrics.totalFramesSampled} klatek</span>
          </div>

          <div className="bg-[#16161A] p-4 rounded-xl border border-[#24242A]">
            <span className="text-[#888892] block text-[10px] uppercase">Zużycie RAM (JS Heap):</span>
            <span className="text-2xl font-bold mt-1 block text-white">
              {hw?.memoryMb ? `${hw.memoryMb.used} MB` : 'Dostępna'}
            </span>
            <span className="text-[10px] text-[#777] mt-0.5 block">
              {hw?.memoryMb ? `Limit: ${hw.memoryMb.limit} MB` : 'Standardowa'}
            </span>
          </div>

          <div className="bg-[#16161A] p-4 rounded-xl border border-[#24242A]">
            <span className="text-[#888892] block text-[10px] uppercase">Akceleracja GPU:</span>
            <span className={`text-2xl font-bold mt-1 block ${hw?.gpuAvailable ? 'text-emerald-400' : 'text-rose-400'}`}>
              {hw?.gpuAvailable ? 'DOSTĘPNA' : 'BRAK'}
            </span>
            <span className="text-[10px] text-[#777] mt-0.5 block truncate" title={hw?.gpuRenderer}>
              {hw?.webgl2Supported ? 'WebGL 2.0' : 'WebGL'}
            </span>
          </div>
        </div>
      </div>

      {/* Hardware Capabilities (Requirement 11: GPU, VideoDecoder, VideoEncoder, OffscreenCanvas) */}
      <div className="bg-[#121215] border border-[#26262B] rounded-2xl p-5 sm:p-6 shadow-xl space-y-4">
        <h2 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-2 font-mono">
          <Cpu className="w-4 h-4 text-[#D4AF37]" />
          Akceleracja Sprzętowa i Kodeki Wideo
        </h2>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 font-mono text-xs">
          <div className="bg-[#16161A] p-4 rounded-xl border border-[#24242A] space-y-1">
            <span className="text-[#888892] block text-[10px] uppercase">Koder wideo (VideoEncoder):</span>
            <div className="flex items-center gap-2">
              <span className={`text-base font-bold ${
                hw?.videoEncoderType === 'HARDWARE' ? 'text-emerald-400' : (hw?.videoEncoderType === 'SOFTWARE' ? 'text-amber-400' : 'text-rose-400')
              }`}>
                {hw?.videoEncoderType || 'UNKNOWN'}
              </span>
            </div>
            <p className="text-[11px] text-[#777] mt-1 font-sans">
              {hw?.videoEncoderType === 'HARDWARE' 
                ? 'Sprzętowe kodowanie H.264 (NVENC / Intel QuickSync / Apple VideoToolbox).' 
                : 'Programowy koder OpenH264 / CPU.'}
            </p>
          </div>

          <div className="bg-[#16161A] p-4 rounded-xl border border-[#24242A] space-y-1">
            <span className="text-[#888892] block text-[10px] uppercase">Dekoder wideo (VideoDecoder):</span>
            <div className="flex items-center gap-2">
              <span className={`text-base font-bold ${
                hw?.videoDecoderType === 'HARDWARE' ? 'text-emerald-400' : (hw?.videoDecoderType === 'SOFTWARE' ? 'text-amber-400' : 'text-rose-400')
              }`}>
                {hw?.videoDecoderType || 'UNKNOWN'}
              </span>
            </div>
            <p className="text-[11px] text-[#777] mt-1 font-sans">
              {hw?.videoDecoderType === 'HARDWARE'
                ? 'Bezpośrednie dekodowanie klatek na GPU bez obciążania procesora.'
                : 'Dekodowanie programowe.'}
            </p>
          </div>

          <div className="bg-[#16161A] p-4 rounded-xl border border-[#24242A] space-y-1">
            <span className="text-[#888892] block text-[10px] uppercase">OffscreenCanvas / WebGL2:</span>
            <div className="flex items-center gap-2">
              <span className={`text-base font-bold ${
                hw?.offscreenCanvasSupported ? 'text-emerald-400' : 'text-amber-400'
              }`}>
                {hw?.offscreenCanvasSupported ? 'OBSŁUGIWANY' : 'BRAK'}
              </span>
            </div>
            <p className="text-[11px] text-[#777] mt-1 font-sans">
              Renderowanie klatek w tle bez blokowania wątku głównego interfejsu.
            </p>
          </div>
        </div>
      </div>

      {/* Debug Mode Overlay Toggle (Requirement 29) */}
      <div className="bg-[#121215] border border-[#26262B] rounded-2xl p-5 sm:p-6 shadow-xl flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-2 font-mono">
            <Eye className="w-4 h-4 text-[#D4AF37]" />
            Tryb Diagnostyczny (DEBUG MODE HUD)
          </h2>
          <p className="text-xs text-[#888892] mt-1 max-w-xl">
            Włącza pływającą nakładkę telemetryczną na ekranie montażu (FPS, aktualna klatka, timestamp, zużycie pamięci, stan dekodera i kodera).
          </p>
        </div>

        <button
          onClick={handleToggleDebug}
          className={`px-5 py-2.5 rounded-xl font-bold text-xs uppercase font-mono tracking-wider transition-all cursor-pointer min-h-[44px] flex items-center gap-2 ${
            isDebugEnabled
              ? 'bg-[#D4AF37] text-black shadow-lg shadow-[#D4AF37]/20'
              : 'bg-[#1C1C20] hover:bg-[#26262C] text-white border border-[#303038]'
          }`}
        >
          <Zap className="w-4 h-4" />
          <span>{isDebugEnabled ? 'DEBUG HUD: WŁĄCZONY' : 'WŁĄCZ DEBUG HUD'}</span>
        </button>
      </div>

      {/* Engine Self-Test Section */}
      <div className="bg-[#121215] border border-[#26262B] rounded-2xl p-5 sm:p-6 shadow-xl space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-2 font-mono">
              <ShieldCheck className="w-4 h-4 text-[#D4AF37]" />
              Sprzętowy Test Silnika Wideo
            </h2>
            <p className="text-xs text-[#888892] mt-1">
              Sprawdza gotowość przeglądarki do kodowania prawdziwych plików MP4 z kontenerem H.264 i muxerem.
            </p>
          </div>

          <button
            onClick={handleRunEngineTest}
            disabled={isTestingEngine}
            className="flex items-center gap-2 px-6 py-2.5 bg-[#D4AF37] hover:bg-[#E5C158] text-black font-extrabold text-xs rounded-xl transition-all shadow-md cursor-pointer disabled:opacity-50 self-start sm:self-auto uppercase tracking-wider min-h-[44px]"
          >
            {isTestingEngine ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Testowanie...</span>
              </>
            ) : (
              <>
                <Play className="w-4 h-4 fill-black" />
                <span>URUCHOM TEST</span>
              </>
            )}
          </button>
        </div>

        {testResult && (
          <div className={`p-4 rounded-xl border text-xs font-mono ${
            testResult.success 
              ? 'bg-emerald-950/20 border-emerald-800/40 text-emerald-300' 
              : 'bg-rose-950/20 border-rose-800/40 text-rose-300'
          }`}>
            <div className="flex items-center gap-2 font-bold mb-1">
              {testResult.success ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              ) : (
                <XCircle className="w-4 h-4 text-rose-400" />
              )}
              <span>{testResult.success ? 'TEST SILNIKA ZALICZONY POMYŚLNIE' : 'TEST SILNIKA NIEPOWIODŁY'}</span>
              <span className="text-[#888] font-normal">({testResult.durationMs} ms)</span>
            </div>
            <p className="text-[11px] opacity-90">{testResult.details}</p>
          </div>
        )}
      </div>

      {/* Cache & Maintenance */}
      <div className="bg-[#121215] border border-[#26262B] rounded-2xl p-5 sm:p-6 shadow-xl flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-2 font-mono">
            <HardDrive className="w-4 h-4 text-[#D4AF37]" />
            Konserwacja Pamięci Podręcznej
          </h2>
          <p className="text-xs text-[#888892] mt-1">
            Zwalnia wygenerowane miniatury, obiekty URL i tymczasowe bufory w pamięci przeglądarki.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={onClearCache}
            className="flex items-center gap-1.5 px-4 py-2.5 bg-[#18181C] hover:bg-[#24242A] text-white border border-[#2E2E36] rounded-xl text-xs font-semibold transition-colors cursor-pointer min-h-[44px]"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Wyczyść cache</span>
          </button>

          <button
            onClick={onResetProject}
            className="flex items-center gap-1.5 px-4 py-2.5 bg-rose-950/30 hover:bg-rose-900/50 text-rose-300 border border-rose-800/40 rounded-xl text-xs font-semibold transition-colors cursor-pointer min-h-[44px]"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Zresetuj projekt</span>
          </button>
        </div>
      </div>
    </div>
  );
};
