import React, { useState, useEffect, useRef } from 'react';
import { 
  Terminal, 
  Cpu, 
  X, 
  AlertTriangle, 
  Activity, 
  Layers, 
  Film, 
  Clock, 
  Gauge, 
  Database,
  Pause,
  Play,
  Maximize2,
  Minimize2,
  RefreshCw
} from 'lucide-react';
import { renderManager } from '../../core/render/renderManager';
import { RenderProgress, RenderOptions } from '../../core/render/renderTypes';

interface RenderDiagnosticsPanelProps {
  onClose?: () => void;
}

export function RenderDiagnosticsPanel({ onClose }: RenderDiagnosticsPanelProps) {
  const [renderState, setRenderState] = useState<{
    progress: RenderProgress | null;
    options: RenderOptions | null;
    providerId: string | null;
    isRendering: boolean;
  }>({
    progress: null,
    options: null,
    providerId: null,
    isRendering: false
  });

  const [isCollapsed, setIsCollapsed] = useState(false);
  const [position, setPosition] = useState({ x: 20, y: 80 }); // Top-right offset
  const [isDragging, setIsDragging] = useState(false);
  const dragRef = useRef<HTMLDivElement>(null);
  const dragStart = useRef({ x: 0, y: 0 });

  // Stall tracking state
  const [lastFrameProgressTime, setLastFrameProgressTime] = useState<number>(Date.now());
  const [lastSeenFrame, setLastSeenFrame] = useState<number>(0);
  const [lastSeenStage, setLastSeenStage] = useState<string>('idle');
  const [secondsFrozen, setSecondsFrozen] = useState<number>(0);
  const [fpsHistory, setFpsHistory] = useState<number[]>([]);

  // Subscribe to render updates
  useEffect(() => {
    const unsubscribe = renderManager.subscribe((state) => {
      setRenderState(state);
    });
    return () => {
      unsubscribe();
    };
  }, []);

  // Monitor stalls and record FPS history
  useEffect(() => {
    const progress = renderState.progress;
    const isRendering = renderState.isRendering;

    if (!isRendering || !progress) {
      setSecondsFrozen(0);
      setFpsHistory([]);
      return;
    }

    const currentFrame = progress.currentFrame;
    const currentStage = progress.stage;

    // If frame advanced or stage changed, reset freeze timer
    if (currentFrame !== lastSeenFrame || currentStage !== lastSeenStage) {
      setLastFrameProgressTime(Date.now());
      setLastSeenFrame(currentFrame);
      setLastSeenStage(currentStage);
      setSecondsFrozen(0);

      // Record FPS history
      if (progress.fps > 0) {
        setFpsHistory(prev => {
          const next = [...prev, progress.fps];
          if (next.length > 20) next.shift(); // Keep last 20 readings
          return next;
        });
      }
    } else {
      // Frame and stage are identical. Calculate elapsed freeze time.
      const timer = setInterval(() => {
        const elapsed = (Date.now() - lastFrameProgressTime) / 1000;
        setSecondsFrozen(Math.round(elapsed * 10) / 10);
      }, 500);
      return () => clearInterval(timer);
    }
  }, [renderState.progress, renderState.isRendering, lastSeenFrame, lastSeenStage, lastFrameProgressTime]);

  // Make the HUD draggable
  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.target instanceof HTMLButtonElement || e.target instanceof SVGSVGElement) return;
    setIsDragging(true);
    dragStart.current = {
      x: e.clientX - position.x,
      y: e.clientY - position.y
    };
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging) return;
      const newX = e.clientX - dragStart.current.x;
      const newY = e.clientY - dragStart.current.y;
      
      // Keep it within window bounds approximately
      const boundedX = Math.max(10, Math.min(window.innerWidth - 380, newX));
      const boundedY = Math.max(10, Math.min(window.innerHeight - 80, newY));
      
      setPosition({ x: boundedX, y: boundedY });
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    if (isDragging) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    }
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging]);

  const { progress, options, providerId, isRendering } = renderState;

  // Format Helpers
  const formatDuration = (ms?: number) => {
    if (!ms) return '0.0s';
    return `${(ms / 1000).toFixed(1)}s`;
  };

  // Stage Styling helper
  const getStageBadgeColor = (stage: string) => {
    switch (stage) {
      case 'completed': return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20';
      case 'error': return 'bg-red-500/10 text-red-400 border-red-500/20';
      case 'cancelled': return 'bg-amber-500/10 text-amber-400 border-amber-500/20';
      case 'rendering':
      case 'encoding_video':
      case 'encoding_audio':
        return 'bg-blue-500/10 text-blue-400 border-blue-500/20 animate-pulse';
      case 'preparing':
      case 'loading':
        return 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20';
      default: return 'bg-neutral-500/10 text-neutral-400 border-neutral-500/20';
    }
  };

  return (
    <div 
      id="render-diagnostics-hud"
      ref={dragRef}
      className="fixed z-[150] w-96 bg-[#0E0E0C] border border-[#2A2824] rounded-xl shadow-[0_12px_40px_rgba(0,0,0,0.8)] overflow-hidden font-mono text-[11px] text-[#C2C0B9] transition-all select-none"
      style={{
        right: `${position.x}px`,
        top: `${position.y}px`,
        opacity: isDragging ? 0.85 : 1
      }}
    >
      {/* Drag Handle / Header */}
      <div 
        onMouseDown={handleMouseDown}
        className="flex items-center justify-between px-4 py-2.5 bg-[#171613] border-b border-[#22211E] cursor-move active:cursor-grabbing"
      >
        <div className="flex items-center gap-2">
          <Terminal className={`w-3.5 h-3.5 ${isRendering ? 'text-[#D4AF37] animate-spin' : 'text-neutral-500'}`} />
          <span className="font-bold text-white tracking-wide uppercase text-[10px]">RenderJob HUD</span>
          {isRendering && (
            <span className="px-1.5 py-0.5 rounded-full bg-red-500/20 text-red-400 text-[8px] uppercase tracking-wider font-semibold animate-pulse">
              LIVE
            </span>
          )}
        </div>

        <div className="flex items-center gap-1.5">
          <button 
            onClick={() => setIsCollapsed(!isCollapsed)}
            className="p-1 rounded text-neutral-400 hover:text-white hover:bg-neutral-800 transition-colors cursor-pointer"
            title={isCollapsed ? 'Rozwiń HUD' : 'Zwiń HUD'}
          >
            {isCollapsed ? <Maximize2 className="w-3 h-3" /> : <Minimize2 className="w-3 h-3" />}
          </button>
          {onClose && (
            <button 
              onClick={onClose}
              className="p-1 rounded text-neutral-400 hover:text-white hover:bg-neutral-800 transition-colors cursor-pointer"
              title="Zamknij HUD"
            >
              <X className="w-3 h-3" />
            </button>
          )}
        </div>
      </div>

      {!isCollapsed && (
        <div className="p-4 space-y-4 max-h-[500px] overflow-y-auto custom-scrollbar">
          
          {/* Active Job / Idle State */}
          {!progress ? (
            <div className="py-6 text-center text-neutral-500 space-y-2">
              <Activity className="w-6 h-6 mx-auto text-neutral-600" />
              <div>Brak aktywnych zadań renderowania</div>
              <p className="text-[10px] text-neutral-600 max-w-[250px] mx-auto">
                Rozpocznij eksport filmu w zakładce "Eksport", aby śledzić metryki sprzętowe i klatki w czasie rzeczywistym.
              </p>
            </div>
          ) : (
            <>
              {/* STALL WARNING BAR */}
              {isRendering && secondsFrozen >= 2.5 && (
                <div className="p-2 bg-red-950/50 border border-red-800/80 rounded-lg flex items-center gap-2 text-red-300 animate-pulse">
                  <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
                  <div className="flex-1">
                    <div className="font-bold text-[10px]">WYKRYTO ZATRZYMANIE (STALL)</div>
                    <div className="text-[9px] opacity-90">Brak zmiany klatki od {secondsFrozen} sek!</div>
                  </div>
                </div>
              )}

              {/* Real-time Status Stage */}
              <div className="bg-[#171613] p-3 rounded-lg border border-[#22211E] space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-neutral-500">STAGE:</span>
                  <span className={`px-2 py-0.5 rounded text-[10px] uppercase font-bold border ${getStageBadgeColor(progress.stage)}`}>
                    {progress.stage.replace('_', ' ')}
                  </span>
                </div>

                <div className="space-y-1">
                  <div className="flex justify-between text-[10px] text-neutral-400">
                    <span>POSTĘP:</span>
                    <span className="font-bold text-white">{progress.percent}%</span>
                  </div>
                  <div className="h-2 w-full bg-black rounded-full overflow-hidden border border-neutral-800">
                    <div 
                      className={`h-full bg-gradient-to-r ${progress.stage === 'error' ? 'from-red-500 to-red-600' : 'from-[#D4AF37] to-amber-400'} transition-all duration-300`}
                      style={{ width: `${progress.percent}%` }}
                    />
                  </div>
                </div>

                <div className="text-[10px] text-neutral-400 flex items-start gap-1 bg-black/40 p-2 rounded border border-neutral-900 leading-normal whitespace-pre-wrap">
                  <span className="text-[#D4AF37]">{'>'}</span>
                  <span>{progress.statusMessage}</span>
                </div>
              </div>

              {/* Core Job Metrics */}
              <div className="grid grid-cols-2 gap-2">
                <div className="p-2.5 bg-[#121210] rounded border border-[#22211E]">
                  <div className="text-[9px] text-neutral-500 uppercase flex items-center gap-1">
                    <Cpu className="w-3 h-3 text-neutral-400" /> Silnik / Provider
                  </div>
                  <div className="font-bold text-white mt-1 text-xs truncate" title={providerId || 'Nieznany'}>
                    {providerId === 'webcodecs_mp4_muxer' ? 'WebCodecs MP4' : 'MediaRecorder'}
                  </div>
                </div>

                <div className="p-2.5 bg-[#121210] rounded border border-[#22211E]">
                  <div className="text-[9px] text-neutral-500 uppercase flex items-center gap-1">
                    <Gauge className="w-3 h-3 text-neutral-400" /> Prędkość Renderu
                  </div>
                  <div className="font-bold text-white mt-1 text-xs">
                    {isRendering ? `${progress.fps} FPS` : 'Bezczynny'}
                  </div>
                </div>

                <div className="p-2.5 bg-[#121210] rounded border border-[#22211E]">
                  <div className="text-[9px] text-neutral-500 uppercase flex items-center gap-1">
                    <Film className="w-3 h-3 text-neutral-400" /> Klatki (Frames)
                  </div>
                  <div className="font-bold text-[#D4AF37] mt-1 text-xs">
                    {progress.currentFrame} / {progress.totalFrames}
                  </div>
                </div>

                <div className="p-2.5 bg-[#121210] rounded border border-[#22211E]">
                  <div className="text-[9px] text-neutral-500 uppercase flex items-center gap-1">
                    <Clock className="w-3 h-3 text-neutral-400" /> Czas / Estymacja
                  </div>
                  <div className="font-bold text-white mt-1 text-xs">
                    {progress.statistics?.startTime 
                      ? formatDuration(Date.now() - progress.statistics.startTime)
                      : '0.0s'}
                  </div>
                </div>
              </div>

              {/* Encoder Details */}
              <div className="space-y-1.5 bg-[#121210] p-3 rounded-lg border border-[#22211E]">
                <div className="text-[10px] font-bold text-neutral-400 flex items-center gap-1 border-b border-neutral-900 pb-1.5">
                  <Database className="w-3.5 h-3.5 text-[#D4AF37]" /> PARAMETRY ENKODERA & SYS
                </div>
                <div className="space-y-1 text-[10px] pt-1">
                  <div className="flex justify-between">
                    <span className="text-neutral-500">Rozdzielczość:</span>
                    <span className="text-white font-bold">
                      {options ? `${options.resolution} (${options.aspectRatio || '16:9'})` : 'N/A'}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-neutral-500">Docelowy FPS:</span>
                    <span className="text-white font-mono">{options?.fps || progress.targetFps || 30} FPS</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-neutral-500">Format wyjściowy:</span>
                    <span className="text-white uppercase">{options?.format || 'mp4'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-neutral-500">Przysp. sprzętowe:</span>
                    <span className="text-emerald-400 font-bold uppercase">
                      {progress.statistics?.hardwareAcceleration || 'hardware'}
                    </span>
                  </div>
                  {progress.diagnostics?.memoryUsageMb !== undefined && (
                    <div className="flex justify-between">
                      <span className="text-neutral-500">Zużycie RAM:</span>
                      <span className="text-white">{progress.diagnostics.memoryUsageMb} MB</span>
                    </div>
                  )}
                  {progress.diagnostics?.stageDetails && (
                    <div className="flex justify-between items-start gap-2 pt-1 border-t border-neutral-900 mt-1.5">
                      <span className="text-neutral-500 shrink-0">Bieżący stan buforów:</span>
                      <span className="text-neutral-400 text-right font-mono truncate max-w-[200px]" title={progress.diagnostics.stageDetails}>
                        {progress.diagnostics.stageDetails}
                      </span>
                    </div>
                  )}
                  {progress.diagnostics?.lastClipName && (
                    <div className="flex justify-between items-start gap-2 pt-1 border-t border-neutral-900 mt-1.5">
                      <span className="text-neutral-500 shrink-0">Aktywny klip:</span>
                      <span className="text-yellow-400 text-right font-mono truncate max-w-[200px]" title={progress.diagnostics.lastClipName}>
                        {progress.diagnostics.lastClipName}
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {/* Sparkline FPS graph */}
              {isRendering && fpsHistory.length > 2 && (
                <div className="p-2 bg-[#0E0E0C] border border-neutral-900 rounded-lg">
                  <div className="text-[8px] text-neutral-500 uppercase font-bold mb-1">
                    Wykres FPS (Ostatnie {fpsHistory.length} sekund)
                  </div>
                  <div className="h-8 flex items-end gap-0.5 pt-1">
                    {fpsHistory.map((val, idx) => {
                      const maxFps = Math.max(...fpsHistory, 60);
                      const heightPercent = Math.max(10, Math.min(100, (val / maxFps) * 100));
                      return (
                        <div 
                          key={idx} 
                          className="flex-1 bg-emerald-500/40 hover:bg-emerald-400 rounded-t-sm transition-all"
                          style={{ height: `${heightPercent}%` }}
                          title={`Klatka na sek: ${val}`}
                        />
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Diagnostic Error Log */}
              {progress.stage === 'error' && progress.diagnostics?.lastError && (
                <div className="p-3 bg-red-950/40 border border-red-900/40 rounded-lg text-red-300 space-y-1 text-[10px]">
                  <div className="font-bold flex items-center gap-1">
                    <AlertTriangle className="w-3.5 h-3.5 text-red-400" />
                    BŁĄD SYSTEMOWY:
                  </div>
                  <div className="font-mono bg-black/60 p-2 rounded border border-red-900/30 overflow-x-auto whitespace-pre-wrap max-h-24 custom-scrollbar select-text selection:bg-red-900/50">
                    {progress.diagnostics.lastError}
                  </div>
                </div>
              )}

              {/* Action Area */}
              {isRendering && (
                <div className="flex gap-2">
                  <button 
                    onClick={() => renderManager.cancelActiveRender()}
                    className="w-full py-2 bg-red-950/60 hover:bg-red-900 border border-red-700/60 text-red-200 text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-1 cursor-pointer"
                  >
                    Przerwij Renderowanie (Abort)
                  </button>
                </div>
              )}
            </>
          )}

          {/* Quick instructions / Help footer */}
          <div className="text-[9px] text-neutral-600 border-t border-[#22211E] pt-3.5 flex justify-between">
            <span>Toggle panel: <b className="text-neutral-400">Ctrl + Shift + D</b></span>
            <span>Przeciągnij za nagłówek</span>
          </div>

        </div>
      )}

      {isCollapsed && progress && (
        <div className="px-4 py-2 bg-[#121210] border-t border-[#22211E] flex items-center justify-between text-[10px]">
          <div className="flex items-center gap-2">
            <span className={`w-1.5 h-1.5 rounded-full ${progress.stage === 'error' ? 'bg-red-500' : 'bg-emerald-500 animate-ping'}`} />
            <span className="text-white font-bold">{progress.percent}%</span>
            <span className="text-neutral-500 truncate max-w-[120px]">{progress.statusMessage}</span>
          </div>
          <span className="font-mono text-[#D4AF37]">{progress.fps} FPS</span>
        </div>
      )}
    </div>
  );
}
