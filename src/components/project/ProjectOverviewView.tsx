import React, { useRef, useState } from 'react';
import { 
  Plus, 
  Play, 
  Trash2, 
  Clock, 
  Volume2, 
  VolumeX,
  ChevronDown,
  ChevronUp,
  RefreshCw,
  Video,
  Film,
  Layers,
  ArrowRight
} from 'lucide-react';
import type { ProjectState } from '../../types/project';

interface ProjectOverviewViewProps {
  project: ProjectState;
  onNavigateTab: (tab: string) => void;
  onAddFiles: (files: FileList | File[]) => Promise<void>;
  onResetProject: () => void;
  onClearCache: () => void;
  isProcessing?: boolean;
}

export const ProjectOverviewView: React.FC<ProjectOverviewViewProps> = ({
  project,
  onNavigateTab,
  onAddFiles,
  onResetProject,
  onClearCache,
  isProcessing = false
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);

  const clips = project.mediaLibrary || [];
  const timelineItems = project.timelineItems || [];
  const totalClips = clips.length;

  const totalDurationSec = timelineItems.length > 0
    ? timelineItems.reduce((acc, it) => acc + it.duration, 0)
    : clips.reduce((acc, c) => acc + c.duration, 0);

  const formatDuration = (sec: number) => {
    const mins = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${mins}:${s.toString().padStart(2, '0')}`;
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      onAddFiles(e.target.files);
      e.target.value = '';
    }
  };

  return (
    <div className="max-w-6xl mx-auto w-full px-4 sm:px-6 py-6 sm:py-8 flex flex-col gap-6">
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileInputChange}
        multiple
        accept="video/*,.mp4,.mov,.webm,.m4v"
        className="hidden"
      />

      {/* Top: Header, Project Name, Status */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-[#242428]">
        <div>
          <div className="flex items-center gap-2 text-[#D4AF37] text-xs font-semibold tracking-wider uppercase mb-1">
            <Film className="w-3.5 h-3.5" />
            <span>Merge Studio</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">
            {project.name || 'Nowy Projekt'}
          </h1>
          <p className="text-xs sm:text-sm text-[#888892] mt-0.5">
            {totalClips > 0
              ? `Status: Gotowy do montażu i scalenia (${totalClips} ${totalClips === 1 ? 'ujęcie' : (totalClips < 5 ? 'ujęcia' : 'ujęć')} • ${formatDuration(totalDurationSec)})`
              : 'Status: Oczekuje na dodanie materiałów'}
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={isProcessing}
            className="flex items-center gap-2 px-4 py-2.5 bg-[#D4AF37] hover:bg-[#E5C158] text-black font-semibold text-xs sm:text-sm rounded-xl transition-all shadow-md cursor-pointer disabled:opacity-50 min-h-[44px]"
          >
            <Plus className="w-4 h-4" />
            <span>{isProcessing ? 'Dodawanie...' : 'DODAJ FILMY'}</span>
          </button>
        </div>
      </div>

      {/* Center: Materials Area */}
      {totalClips === 0 ? (
        /* Empty State */
        <div className="bg-[#121215] border border-[#242428] rounded-2xl p-8 sm:p-16 text-center flex flex-col items-center justify-center gap-5 shadow-xl my-6">
          <div className="w-16 h-16 rounded-2xl bg-[#1A1A1E] border border-[#303038] flex items-center justify-center text-[#D4AF37]">
            <Video className="w-8 h-8" />
          </div>
          <div className="max-w-md">
            <h2 className="text-xl font-bold text-white mb-2">Twój projekt jest pusty</h2>
            <p className="text-sm text-[#888892]">
              Dodaj filmy ze swojego urządzenia, aby rozpocząć obróbkę, przycinanie i scalanie materiałów.
            </p>
          </div>
          <button
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center gap-2.5 px-6 py-3.5 bg-[#D4AF37] hover:bg-[#E5C158] text-black font-bold text-sm rounded-xl transition-all shadow-lg hover:scale-[1.02] cursor-pointer min-h-[44px]"
          >
            <Plus className="w-5 h-5" />
            <span>+ DODAJ FILMY</span>
          </button>
        </div>
      ) : (
        <>
          {/* Materials Grid */}
          <div className="space-y-3">
            <div className="flex items-center justify-between text-xs text-[#888892]">
              <span className="font-semibold uppercase tracking-wider text-white flex items-center gap-2">
                <Layers className="w-4 h-4 text-[#D4AF37]" />
                Materiały w projekcie ({totalClips})
              </span>
              <button
                onClick={() => onNavigateTab('montage')}
                className="text-[#D4AF37] hover:underline flex items-center gap-1 cursor-pointer"
              >
                <span>Otwórz na osi czasu</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {clips.map((clip, index) => {
                const isPortrait = clip.orientation === 'portrait';
                return (
                  <div
                    key={clip.id}
                    onClick={() => onNavigateTab('montage')}
                    className="group relative bg-[#151518] hover:bg-[#1A1A1E] border border-[#242428] hover:border-[#D4AF37]/50 rounded-2xl overflow-hidden shadow-lg transition-all flex flex-col cursor-pointer"
                  >
                    {/* Thumbnail Container */}
                    <div className="relative aspect-video w-full bg-black overflow-hidden flex items-center justify-center">
                      {clip.thumbnailUrl ? (
                        <img
                          src={clip.thumbnailUrl}
                          alt={clip.name}
                          className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
                        />
                      ) : (
                        <div className="text-white/40 flex flex-col items-center gap-1">
                          <Film className="w-6 h-6 text-[#666]" />
                          <span className="text-[10px] font-mono">Brak miniatury</span>
                        </div>
                      )}

                      {/* Clip Number Badge */}
                      <div className="absolute top-2.5 left-2.5 px-2 py-0.5 rounded-lg bg-black/80 backdrop-blur-md text-[11px] font-mono font-bold text-white border border-white/10 shadow-sm">
                        #{index + 1}
                      </div>

                      {/* Duration Badge */}
                      <div className="absolute bottom-2.5 right-2.5 px-2 py-0.5 rounded-lg bg-black/80 backdrop-blur-md text-[11px] font-mono font-bold text-[#E5C158] border border-white/10 shadow-sm flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        <span>{formatDuration(clip.duration)}</span>
                      </div>

                      {/* Orientation Indicator */}
                      <div className="absolute top-2.5 right-2.5 px-1.5 py-0.5 rounded-md bg-black/75 backdrop-blur-md text-[10px] font-mono text-[#AAA] border border-white/10">
                        {isPortrait ? 'Pionowo (9:16)' : 'Poziomo (16:9)'}
                      </div>

                      {/* Audio Presence Indicator */}
                      <div className="absolute bottom-2.5 left-2.5 p-1 rounded-md bg-black/75 backdrop-blur-md text-white border border-white/10">
                        {clip.hasAudio ? (
                          <span title="Zawiera dźwięk">
                            <Volume2 className="w-3.5 h-3.5 text-emerald-400" />
                          </span>
                        ) : (
                          <span title="Brak dźwięku">
                            <VolumeX className="w-3.5 h-3.5 text-[#777]" />
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Clip Info */}
                    <div className="p-3.5 flex flex-col justify-between flex-1 gap-2">
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-white truncate group-hover:text-[#D4AF37] transition-colors">
                          {clip.name}
                        </p>
                        <p className="text-[11px] text-[#777782] font-mono mt-0.5">
                          {clip.width}×{clip.height} • {clip.fps || 30} FPS
                        </p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Bottom Primary Action: SCAL FILMY */}
          <div className="sticky bottom-4 z-20 bg-[#151518]/95 backdrop-blur-md border border-[#D4AF37]/40 rounded-2xl p-4 sm:p-5 shadow-2xl flex flex-col sm:flex-row items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 text-xs font-semibold text-[#D4AF37] uppercase tracking-wider">
                <span className="w-2 h-2 rounded-full bg-[#D4AF37] animate-pulse" />
                <span>Gotowy do scalenia</span>
              </div>
              <h3 className="text-lg font-bold text-white mt-0.5">
                {totalClips} {totalClips === 1 ? 'film' : (totalClips < 5 ? 'filmy' : 'filmów')} gotowych do połączenia ({formatDuration(totalDurationSec)})
              </h3>
            </div>

            <div className="flex items-center gap-3 w-full sm:w-auto">
              <button
                onClick={() => onNavigateTab('montage')}
                className="flex-1 sm:flex-none px-5 py-3 bg-[#202024] hover:bg-[#28282E] text-white border border-[#303038] font-semibold text-xs sm:text-sm rounded-xl transition-all cursor-pointer min-h-[44px]"
              >
                PODGLĄD I MONTAŻ
              </button>

              <button
                onClick={() => onNavigateTab('export')}
                className="flex-1 sm:flex-none px-7 py-3 bg-[#D4AF37] hover:bg-[#E5C158] text-black font-extrabold text-sm rounded-xl transition-all shadow-xl hover:scale-[1.02] flex items-center justify-center gap-2 cursor-pointer uppercase tracking-wider min-h-[44px]"
              >
                <Play className="w-4 h-4 fill-black" />
                <span>SCAL FILMY</span>
              </button>
            </div>
          </div>

          {/* Collapsible Advanced Options */}
          <div className="border border-[#222226] rounded-2xl bg-[#121215] overflow-hidden">
            <button
              onClick={() => setShowAdvanced(!showAdvanced)}
              className="w-full px-5 py-3.5 flex items-center justify-between text-xs text-[#888892] hover:text-white transition-colors cursor-pointer"
            >
              <span className="font-semibold uppercase tracking-wider">Zaawansowane opcje projektu</span>
              {showAdvanced ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>

            {showAdvanced && (
              <div className="p-5 border-t border-[#222226] flex flex-wrap items-center justify-between gap-4 text-xs">
                <div className="text-[#888892]">
                  Lokalne przechowywanie pamięci urządzenia • Zgodność z PWA
                </div>

                <div className="flex items-center gap-3">
                  <button
                    onClick={onClearCache}
                    className="flex items-center gap-1.5 px-3 py-2 bg-[#1A1A1E] hover:bg-[#24242A] text-[#AAA] hover:text-white border border-[#303038] rounded-xl transition-colors cursor-pointer min-h-[40px]"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    <span>Wyczyść pamięć podręczną</span>
                  </button>

                  <button
                    onClick={onResetProject}
                    className="flex items-center gap-1.5 px-3 py-2 bg-rose-950/30 hover:bg-rose-900/50 text-rose-300 border border-rose-800/40 rounded-xl transition-colors cursor-pointer min-h-[40px]"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Wyczyść i zacznij od nowa</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
};
