import React, { useState, useEffect } from 'react';
import { performanceMonitor, LivePerformanceMetrics, HardwareDiagnostics } from '../../core/diagnostics/performanceMonitor';

interface DebugOverlayProps {
  currentFrame?: number;
  currentTime?: number;
  activeCodec?: string;
}

export const DebugOverlay: React.FC<DebugOverlayProps> = ({
  currentFrame = 0,
  currentTime = 0,
  activeCodec = 'H.264 (AVC)'
}) => {
  const [isEnabled, setIsEnabled] = useState(performanceMonitor.isDebugEnabled());
  const [metrics, setMetrics] = useState<LivePerformanceMetrics>(performanceMonitor.getCurrentMetrics());
  const [hw, setHw] = useState<HardwareDiagnostics | null>(null);

  useEffect(() => {
    const unsubDebug = performanceMonitor.subscribeDebugOverlay(setIsEnabled);
    const unsubMetrics = performanceMonitor.subscribe(setMetrics);
    performanceMonitor.getHardwareDiagnostics().then(setHw);
    return () => {
      unsubDebug();
      unsubMetrics();
    };
  }, []);

  if (!isEnabled) return null;

  return (
    <div className="fixed top-20 right-4 z-50 pointer-events-none bg-black/85 backdrop-blur-md border border-[#D4AF37]/50 rounded-xl p-3 text-[11px] font-mono text-white/90 shadow-2xl space-y-1.5 min-w-[210px]">
      <div className="flex items-center justify-between border-b border-white/10 pb-1 text-[#D4AF37] font-bold">
        <span>MERGE DEBUG HUD</span>
        <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
      </div>

      <div className="flex justify-between">
        <span className="text-[#888]">UI FPS:</span>
        <span className={`font-bold ${metrics.uiFps >= 50 ? 'text-emerald-400' : (metrics.uiFps >= 25 ? 'text-amber-400' : 'text-rose-400')}`}>
          {metrics.uiFps} FPS ({metrics.averageFrameTimeMs}ms)
        </span>
      </div>

      <div className="flex justify-between">
        <span className="text-[#888]">KLATKA:</span>
        <span className="text-white font-bold">#{currentFrame}</span>
      </div>

      <div className="flex justify-between">
        <span className="text-[#888]">CZAS:</span>
        <span className="text-white font-bold">{currentTime.toFixed(3)}s</span>
      </div>

      <div className="flex justify-between">
        <span className="text-[#888]">KODEK:</span>
        <span className="text-[#D4AF37] font-bold">{activeCodec}</span>
      </div>

      {hw && (
        <>
          <div className="flex justify-between">
            <span className="text-[#888]">ENCODER:</span>
            <span className={`font-bold ${hw.videoEncoderType === 'HARDWARE' ? 'text-emerald-400' : 'text-amber-300'}`}>
              {hw.videoEncoderType}
            </span>
          </div>

          <div className="flex justify-between">
            <span className="text-[#888]">DECODER:</span>
            <span className={`font-bold ${hw.videoDecoderType === 'HARDWARE' ? 'text-emerald-400' : 'text-amber-300'}`}>
              {hw.videoDecoderType}
            </span>
          </div>

          <div className="flex justify-between">
            <span className="text-[#888]">GPU:</span>
            <span className={hw.gpuAvailable ? 'text-emerald-400' : 'text-rose-400'}>
              {hw.gpuAvailable ? 'AVAILABLE' : 'UNAVAILABLE'}
            </span>
          </div>

          {hw.memoryMb && (
            <div className="flex justify-between">
              <span className="text-[#888]">RAM (JS):</span>
              <span className="text-white font-bold">{hw.memoryMb.used} MB / {hw.memoryMb.limit} MB</span>
            </div>
          )}
        </>
      )}

      {metrics.droppedFramesCount > 0 && (
        <div className="flex justify-between text-rose-400">
          <span>DROPPED:</span>
          <span>{metrics.droppedFramesCount} klatek</span>
        </div>
      )}
    </div>
  );
};
