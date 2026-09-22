import React, { useState, useEffect } from 'react';
import { Activity, X, HardDrive, Cpu, Film, Layers, CheckCircle, RefreshCw } from 'lucide-react';
import type { ProjectState } from '../../types/project';

interface DiagnosticsModalProps {
  isOpen: boolean;
  onClose: () => void;
  project: ProjectState;
  isDbConnected: boolean;
}

export function DiagnosticsModal({ isOpen, onClose, project, isDbConnected }: DiagnosticsModalProps) {
  const [memoryInfo, setMemoryInfo] = useState<{ usedJSHeapSize?: number; totalJSHeapSize?: number; jsHeapSizeLimit?: number } | null>(null);
  const [cacheSizeEst, setCacheSizeEst] = useState<string>('Obliczanie...');
  const [devClicks, setDevClicks] = useState(0);

  useEffect(() => {
    if (!isOpen) return;

    // Check performance memory if supported
    const perf = performance as any;
    if (perf && perf.memory) {
      setMemoryInfo({
        usedJSHeapSize: perf.memory.usedJSHeapSize,
        totalJSHeapSize: perf.memory.totalJSHeapSize,
        jsHeapSizeLimit: perf.memory.jsHeapSizeLimit
      });
    }

    // Estimate storage
    if (navigator.storage && navigator.storage.estimate) {
      navigator.storage.estimate().then(est => {
        const usedMB = ((est.usage || 0) / (1024 * 1024)).toFixed(1);
        const quotaMB = ((est.quota || 0) / (1024 * 1024)).toFixed(0);
        setCacheSizeEst(`${usedMB} MB / ${quotaMB} MB`);
      }).catch(() => {
        setCacheSizeEst('Niedostępne');
      });
    } else {
      setCacheSizeEst('Brak API Storage');
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const totalDuration = project.timelineItems.reduce((sum, item) => Math.max(sum, item.timelineStart + item.duration), 0);
  const totalClips = project.mediaLibrary.length;
  const usedClips = project.timelineItems.length;
  const audioCount = project.audioTracks.length;
  const textCount = project.textLayers.length;
  const markersCount = project.markers.length;
  const chaptersCount = project.chapters.length;

  const formatBytes = (bytes?: number) => {
    if (!bytes) return 'N/A';
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/85 backdrop-blur-md p-4 animate-in fade-in">
      <div className="w-full max-w-xl bg-[#121212] border border-[#2A2824] rounded-2xl shadow-2xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#2A2824] bg-[#0A0A0A]">
          <div 
            onClick={() => {
              const newClicks = devClicks + 1;
              setDevClicks(newClicks);
              if (newClicks >= 5) {
                setDevClicks(0);
                (window as any).toggleRenderDiagnostics?.();
              }
            }}
            className="flex items-center gap-2.5 text-[#D4AF37] cursor-pointer select-none"
            title="Kliknij 5 razy, aby włączyć HUD renderowania"
          >
            <Activity className="w-5 h-5 text-emerald-400" />
            <h2 className="font-serif-luxury font-bold text-base tracking-wide text-white">Diagnostyka Systemowa i Wydajność</h2>
          </div>
          <button 
            onClick={onClose} 
            className="p-1.5 rounded-lg text-[#AAA69D] hover:text-white hover:bg-[#202020] transition-colors cursor-pointer"
            aria-label="Zamknij panel diagnostyki"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 max-h-[70vh] overflow-y-auto space-y-5 custom-scrollbar text-xs">
          
          {/* Project Statistics */}
          <div className="space-y-2">
            <h3 className="text-[11px] font-mono uppercase tracking-wider text-[#D4AF37] flex items-center gap-2">
              <Film className="w-3.5 h-3.5" /> Statystyki Projektu
            </h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <div className="p-3 bg-[#1A1A1A] rounded-xl border border-[#262626]">
                <span className="text-[#888] block text-[10px]">Łączny Czas</span>
                <span className="font-mono font-bold text-white text-sm">{(totalDuration).toFixed(1)}s</span>
              </div>
              <div className="p-3 bg-[#1A1A1A] rounded-xl border border-[#262626]">
                <span className="text-[#888] block text-[10px]">Klipy w bibliotece</span>
                <span className="font-mono font-bold text-white text-sm">{totalClips}</span>
              </div>
              <div className="p-3 bg-[#1A1A1A] rounded-xl border border-[#262626]">
                <span className="text-[#888] block text-[10px]">Użyte na osi</span>
                <span className="font-mono font-bold text-white text-sm">{usedClips}</span>
              </div>
              <div className="p-3 bg-[#1A1A1A] rounded-xl border border-[#262626]">
                <span className="text-[#888] block text-[10px]">Ścieżki Audio</span>
                <span className="font-mono font-bold text-white text-sm">{audioCount}</span>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div className="p-2.5 bg-[#1A1A1A] rounded-xl border border-[#262626] text-center">
                <span className="text-[#888] block text-[10px]">Warstwy Tekstu</span>
                <span className="font-mono font-semibold text-[#E0DDD5]">{textCount}</span>
              </div>
              <div className="p-2.5 bg-[#1A1A1A] rounded-xl border border-[#262626] text-center">
                <span className="text-[#888] block text-[10px]">Znaczniki</span>
                <span className="font-mono font-semibold text-[#E0DDD5]">{markersCount}</span>
              </div>
              <div className="p-2.5 bg-[#1A1A1A] rounded-xl border border-[#262626] text-center">
                <span className="text-[#888] block text-[10px]">Rozdziały</span>
                <span className="font-mono font-semibold text-[#E0DDD5]">{chaptersCount}</span>
              </div>
            </div>
          </div>

          {/* Memory & Storage */}
          <div className="space-y-2 pt-2 border-t border-[#222]">
            <h3 className="text-[11px] font-mono uppercase tracking-wider text-[#D4AF37] flex items-center gap-2">
              <HardDrive className="w-3.5 h-3.5" /> Pamięć i Magazyn Danych
            </h3>
            <div className="space-y-2">
              <div className="flex items-center justify-between p-2.5 bg-[#1A1A1A] rounded-lg border border-[#262626]">
                <span className="text-[#AAA69D]">Zużycie Pamięci RAM (JS Heap):</span>
                <span className="font-mono font-bold text-emerald-400">
                  {memoryInfo ? `${formatBytes(memoryInfo.usedJSHeapSize)} / ${formatBytes(memoryInfo.totalJSHeapSize)}` : 'Niedostępne w tej przeglądarce'}
                </span>
              </div>
              <div className="flex items-center justify-between p-2.5 bg-[#1A1A1A] rounded-lg border border-[#262626]">
                <span className="text-[#AAA69D]">Pamięć podręczna IndexedDB / Storage:</span>
                <span className="font-mono text-white">{cacheSizeEst}</span>
              </div>
              <div className="flex items-center justify-between p-2.5 bg-[#1A1A1A] rounded-lg border border-[#262626]">
                <span className="text-[#AAA69D]">Status Bazy Danych (Firestore):</span>
                <span className={`font-mono font-bold ${isDbConnected ? 'text-emerald-400' : 'text-rose-500'}`}>
                  {isDbConnected ? 'POŁĄCZONO' : 'BŁĄD POŁĄCZENIA / OFFLINE'}
                </span>
              </div>
            </div>
          </div>

          {/* Video Engine Capabilities */}
          <div className="space-y-2 pt-2 border-t border-[#222]">
            <h3 className="text-[11px] font-mono uppercase tracking-wider text-[#D4AF37] flex items-center gap-2">
              <Cpu className="w-3.5 h-3.5" /> Dostępność Sprzętowa i Kodeki Wideo
            </h3>
            <div className="space-y-2 bg-[#171717] p-3 rounded-xl border border-[#262626] text-[#AAA69D]">
              <div className="flex items-center justify-between text-[11px]">
                <span className="flex items-center gap-2">
                  <CheckCircle className={`w-3.5 h-3.5 ${typeof window !== 'undefined' && typeof (window as any).VideoEncoder === 'function' ? 'text-emerald-400' : 'text-amber-400'}`} />
                  <span>WebCodecs VideoEncoder (H.264 AVC)</span>
                </span>
                <span className="font-mono text-[10px] px-2 py-0.5 rounded bg-black/40 text-white">
                  {typeof window !== 'undefined' && typeof (window as any).VideoEncoder === 'function' ? 'Dostępne (Główny silnik MP4)' : 'Brak wsparcia'}
                </span>
              </div>

              <div className="flex items-center justify-between text-[11px]">
                <span className="flex items-center gap-2">
                  <CheckCircle className={`w-3.5 h-3.5 ${typeof window !== 'undefined' && typeof (window as any).AudioEncoder === 'function' ? 'text-emerald-400' : 'text-amber-400'}`} />
                  <span>WebCodecs AudioEncoder (AAC / mp4a)</span>
                </span>
                <span className="font-mono text-[10px] px-2 py-0.5 rounded bg-black/40 text-white">
                  {typeof window !== 'undefined' && typeof (window as any).AudioEncoder === 'function' ? 'Dostępne' : 'Brak wsparcia'}
                </span>
              </div>

              <div className="flex items-center justify-between text-[11px]">
                <span className="flex items-center gap-2">
                  <CheckCircle className={`w-3.5 h-3.5 ${typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported('video/mp4') ? 'text-emerald-400' : 'text-blue-400'}`} />
                  <span>Natywny MediaRecorder MP4 / WebM</span>
                </span>
                <span className="font-mono text-[10px] px-2 py-0.5 rounded bg-black/40 text-white">
                  {typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported('video/mp4') ? 'Wspiera MP4' : 'Wspiera WebM'}
                </span>
              </div>

              <div className="flex items-center justify-between text-[11px]">
                <span className="flex items-center gap-2">
                  <CheckCircle className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Autozapis IndexedDB & Session Recovery</span>
                </span>
                <span className="font-mono text-[10px] px-2 py-0.5 rounded bg-black/40 text-emerald-400">
                  Aktywne
                </span>
              </div>
            </div>
          </div>

        </div>

        {/* Footer */}
        <div className="px-6 py-3 bg-[#0A0A0A] border-t border-[#2A2824] flex items-center justify-between">
          <button 
            onClick={() => {
              (window as any).toggleRenderDiagnostics?.();
              onClose();
            }}
            className="text-[10px] font-mono text-neutral-500 hover:text-[#D4AF37] transition-colors cursor-pointer"
            title="Uruchom pływający panel diagnostyki renderowania (Skrót: Ctrl+Alt+D)"
          >
            [Dev HUD Renderera]
          </button>
          <button 
            onClick={onClose}
            className="px-4 py-1.5 bg-[#252525] text-white hover:bg-[#333] rounded-lg text-xs font-bold transition-colors cursor-pointer"
          >
            Zamknij
          </button>
        </div>
      </div>
    </div>
  );
}
