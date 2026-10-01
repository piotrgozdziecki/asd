import React, { useRef, useState, useMemo } from 'react';
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
  ArrowRight,
  Sparkles,
  Heart,
  Music,
  Download,
  Scissors,
  CheckCircle2,
  Sliders,
  ShieldCheck,
  Zap
} from 'lucide-react';
import type { ProjectState, MediaClip } from '../../types/project';

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
    ? timelineItems.reduce((acc, it) => acc + (it.duration || 0), 0)
    : clips.reduce((acc, c) => acc + (c.duration || 0), 0);

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

  // Canonical wedding chapters for the roadmap
  const chapterMilestones = [
    { id: 'preparations', title: 'Przygotowania', time: 'Rano', icon: '💍' },
    { id: 'ceremony', title: 'Ceremonia i Przysięga', time: 'Popołudnie', icon: '⛪' },
    { id: 'congratulations', title: 'Życzenia & Uściski', time: 'Popołudnie', icon: '🥂' },
    { id: 'first_dance', title: 'Pierwszy Taniec', time: 'Złota Godzina', icon: '💃' },
    { id: 'party', title: 'Wesele & Parkiet', time: 'Wieczór', icon: '🎉' },
    { id: 'cake', title: 'Tort & Oczepiny', time: 'Noc', icon: '🎂' },
  ];

  return (
    <div className="max-w-7xl mx-auto w-full px-4 sm:px-6 py-6 sm:py-8 flex flex-col gap-8">
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileInputChange}
        multiple
        accept="video/*,.mp4,.mov,.webm,.m4v"
        className="hidden"
      />

      {/* Haute Couture Atelier Hero Card */}
      <div className="relative rounded-3xl overflow-hidden atelier-card p-6 sm:p-10 border border-[#D4AF37]/35 shadow-[0_20px_60px_-15px_rgba(0,0,0,0.85)]">
        {/* Subtle atmospheric glow behind hero */}
        <div className="absolute top-0 right-0 w-96 h-96 bg-gradient-to-br from-[#D4AF37]/15 via-[#9A7B1C]/5 to-transparent blur-3xl pointer-events-none" />
        <div className="absolute -bottom-10 -left-10 w-72 h-72 bg-[#D4AF37]/10 blur-3xl pointer-events-none" />

        <div className="relative z-10 flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div className="space-y-3 max-w-2xl">
            {/* Editorial brand kicker */}
            <div className="flex items-center gap-2.5 text-xs text-[#D4AF37] font-semibold tracking-[0.2em] uppercase font-cinematic">
              <span className="w-1.5 h-1.5 rounded-full bg-[#D4AF37] shadow-[0_0_8px_#D4AF37]" />
              <span>Niezapomniane Chwile • Atelier Montażu Ślubnego</span>
            </div>

            {/* Romantic cinematic title */}
            <h1 className="text-2xl sm:text-4xl lg:text-5xl font-cinematic font-bold tracking-tight text-white leading-[1.15]">
              <span className="gold-gradient-text block">
                {project.name || 'Ślub oraz Wesele Joanny i Piotra'}
              </span>
            </h1>

            {/* Zero-pill metadata with typographic separators */}
            <div className="flex flex-wrap items-center gap-2 text-xs sm:text-sm text-[#A89C82] pt-1">
              <span className="text-[#F5F2EA] font-semibold font-mono tabular-nums">
                {totalClips} {totalClips === 1 ? 'ujęcie' : (totalClips < 5 ? 'ujęcia' : 'ujęć')}
              </span>
              <span aria-hidden="true" className="text-[#554B38]">·</span>
              <span className="text-[#F5F2EA] font-semibold font-mono tabular-nums">
                {formatDuration(totalDurationSec)} łącznego materiału
              </span>
              <span aria-hidden="true" className="text-[#554B38]">·</span>
              <span className="text-[#E5C158] font-medium">Master 4K HDR & Rec.709</span>
              <span aria-hidden="true" className="text-[#554B38]">·</span>
              <span className="text-[#A89C82]">Audio Ducking -18dB</span>
            </div>
          </div>

          {/* Hero Action triggers */}
          <div className="flex flex-wrap items-center gap-3 shrink-0">
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={isProcessing}
              className="luxury-btn-primary px-6 py-3.5 rounded-2xl text-xs sm:text-sm font-bold uppercase tracking-wider flex items-center gap-2.5 shadow-[0_8px_25px_rgba(212,175,55,0.35)] cursor-pointer min-h-[48px]"
            >
              <Plus className="w-4 h-4 text-black stroke-[2.5]" />
              <span>{isProcessing ? 'Importowanie ujęć...' : 'Dodaj Ujęcia Ślubne'}</span>
            </button>

            {totalClips > 0 && (
              <>
                <button
                  onClick={() => onNavigateTab('montage')}
                  className="px-5 py-3.5 rounded-2xl bg-[#18140D] hover:bg-[#251E13] text-[#F5F2EA] hover:text-[#FDE047] border border-[#3E321E] hover:border-[#D4AF37]/50 text-xs sm:text-sm font-semibold tracking-wide transition-all cursor-pointer flex items-center gap-2 min-h-[48px]"
                >
                  <Scissors className="w-4 h-4 text-[#D4AF37]" />
                  <span>Oś Czasu</span>
                </button>

                <button
                  onClick={() => onNavigateTab('export')}
                  className="px-5 py-3.5 rounded-2xl bg-[#1C160B] hover:bg-[#2A200E] text-[#FDE047] border border-[#D4AF37]/60 text-xs sm:text-sm font-semibold tracking-wide transition-all cursor-pointer flex items-center gap-2 shadow-[0_0_15px_rgba(212,175,55,0.2)] min-h-[48px]"
                >
                  <Download className="w-4 h-4 text-[#FDE047]" />
                  <span>Eksport</span>
                </button>
              </>
            )}
          </div>
        </div>

        {/* Wedding Chapters Roadmap Stepper */}
        <div className="mt-8 pt-6 border-t border-[#30271B] relative z-10">
          <div className="flex items-center justify-between text-xs text-[#A89C82] mb-3">
            <span className="font-cinematic font-semibold tracking-wider text-[#D4AF37] uppercase text-[11px]">
              Kanon Narracyjny Wesela • Oś Rozdziałów
            </span>
            <span className="font-mono text-[10px] text-[#7A6E57]">
              Inteligentna chronologia AI
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5">
            {chapterMilestones.map((ch, idx) => (
              <div 
                key={ch.id}
                className="p-3 rounded-xl bg-[#14110A]/80 border border-[#2B2317] hover:border-[#D4AF37]/40 transition-all flex flex-col justify-between gap-1.5"
              >
                <div className="flex items-center justify-between text-xs">
                  <span className="text-base">{ch.icon}</span>
                  <span className="text-[10px] font-mono text-[#8C7D5B]">0{idx + 1}</span>
                </div>
                <div>
                  <span className="text-xs font-semibold text-[#F5F2EA] block truncate">
                    {ch.title}
                  </span>
                  <span className="text-[10px] text-[#8C7D5B] font-mono">
                    {ch.time}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Materials Area */}
      {totalClips === 0 ? (
        /* Empty State with Haute Couture Welcome */
        <div className="atelier-card rounded-3xl p-10 sm:p-16 text-center flex flex-col items-center justify-center gap-6 shadow-2xl relative overflow-hidden my-4 border border-[#30281D]">
          <div className="w-20 h-20 rounded-3xl bg-gradient-to-br from-[#2D2311] via-[#1A140A] to-[#120E07] border border-[#D4AF37]/40 flex items-center justify-center text-[#D4AF37] shadow-[0_0_30px_rgba(212,175,55,0.2)]">
            <Film className="w-10 h-10" />
          </div>

          <div className="max-w-lg space-y-2">
            <h2 className="text-2xl sm:text-3xl font-cinematic font-bold text-white tracking-wide">
              Twoje Atelier Czeka Na Pierwsze Ujęcia
            </h2>
            <p className="text-sm text-[#A89C82] leading-relaxed">
              Przeciągnij i upuść filmy ze smartfonów gości lub aparatu kamerzysty. Silnik automatycznie zbada rozdzielczości, fps i kodeki, umożliwiając błyskawiczny montaż i eksport 4K.
            </p>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
            <button
              onClick={() => fileInputRef.current?.click()}
              className="luxury-btn-primary px-8 py-4 rounded-2xl text-xs sm:text-sm font-bold uppercase tracking-wider flex items-center gap-3 shadow-[0_10px_30px_rgba(212,175,55,0.4)] cursor-pointer hover:scale-[1.02] min-h-[48px]"
            >
              <Plus className="w-5 h-5 text-black stroke-[2.5]" />
              <span>Wgraj Filmy z Dysku lub Telefonu</span>
            </button>
          </div>

          <div className="flex items-center gap-6 text-[11px] font-mono text-[#8C7D5B] pt-4 border-t border-[#261E13]">
            <span>Obsługuje: MP4, MOV, WebM, 4K 60FPS</span>
            <span>·</span>
            <span>Bezpieczne przetwarzanie lokalne</span>
            <span>·</span>
            <span>Zero kompresji wstępnej</span>
          </div>
        </div>
      ) : (
        <>
          {/* Materials Grid Header */}
          <div className="space-y-4">
            <div className="flex items-center justify-between text-xs text-[#A89C82]">
              <div className="flex items-center gap-2.5">
                <Layers className="w-4 h-4 text-[#D4AF37]" />
                <h3 className="font-cinematic font-bold uppercase tracking-wider text-white text-sm">
                  Biblioteka Ujęć w Projekcie ({totalClips})
                </h3>
              </div>

              <button
                onClick={() => onNavigateTab('montage')}
                className="text-[#D4AF37] hover:text-[#FDE047] flex items-center gap-1.5 cursor-pointer font-medium tracking-wide transition-colors"
              >
                <span>Otwórz zaawansowany montaż</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>

            {/* Clips Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {clips.map((clip, index) => {
                const isPortrait = clip.orientation === 'portrait';
                return (
                  <div
                    key={clip.id}
                    onClick={() => onNavigateTab('montage')}
                    className="group relative atelier-card rounded-2xl overflow-hidden border border-[#2B2317] hover:border-[#D4AF37]/60 shadow-lg transition-all flex flex-col cursor-pointer hover:-translate-y-1"
                  >
                    {/* Thumbnail Container */}
                    <div className="relative aspect-video w-full bg-black overflow-hidden flex items-center justify-center">
                      {clip.thumbnailUrl ? (
                        <img
                          src={clip.thumbnailUrl}
                          alt={clip.name}
                          className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                        />
                      ) : (
                        <div className="text-white/40 flex flex-col items-center gap-1.5">
                          <Film className="w-6 h-6 text-[#7A6E57]" />
                          <span className="text-[10px] font-mono text-[#8C7D5B]">Generowanie miniatury</span>
                        </div>
                      )}

                      {/* Subtle Vignette Gradient */}
                      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-black/30 pointer-events-none" />

                      {/* Clip Index */}
                      <div className="absolute top-2.5 left-2.5 px-2 py-0.5 rounded-lg bg-black/85 backdrop-blur-md text-[10px] font-mono font-bold text-white border border-white/10 shadow-sm">
                        #{index + 1}
                      </div>

                      {/* Duration */}
                      <div className="absolute bottom-2.5 right-2.5 px-2 py-0.5 rounded-lg bg-black/85 backdrop-blur-md text-[11px] font-mono font-bold text-[#FDE047] border border-[#D4AF37]/30 shadow-sm flex items-center gap-1">
                        <Clock className="w-3 h-3 text-[#D4AF37]" />
                        <span className="tabular-nums">{formatDuration(clip.duration)}</span>
                      </div>

                      {/* Orientation */}
                      <div className="absolute top-2.5 right-2.5 px-2 py-0.5 rounded-lg bg-black/85 backdrop-blur-md text-[10px] font-mono text-[#CCC] border border-white/10">
                        {isPortrait ? '9:16 Pion' : '16:9 Poziom'}
                      </div>

                      {/* Audio Icon */}
                      <div className="absolute bottom-2.5 left-2.5 p-1 rounded-lg bg-black/85 backdrop-blur-md text-white border border-white/10">
                        {clip.hasAudio ? (
                          <span title="Zawiera ścieżkę audio">
                            <Volume2 className="w-3.5 h-3.5 text-emerald-400" />
                          </span>
                        ) : (
                          <span title="Brak dźwięku">
                            <VolumeX className="w-3.5 h-3.5 text-[#777]" />
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Clip Info Card Footer */}
                    <div className="p-3.5 flex flex-col justify-between flex-1 gap-2 bg-[#0F0D08]/90">
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-white truncate group-hover:text-[#FDE047] transition-colors">
                          {clip.name}
                        </p>
                        <p className="text-[10px] text-[#8C7D5B] font-mono mt-0.5 tabular-nums">
                          {clip.width}×{clip.height} · {clip.fps || 30} FPS · {clip.videoCodec || 'Wideo'}
                        </p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Sticky Bottom Atelier Action Bar */}
          <div className="sticky bottom-4 z-20 atelier-card rounded-2xl p-4 sm:p-5 border border-[#D4AF37]/50 shadow-[0_15px_45px_rgba(0,0,0,0.9)] flex flex-col sm:flex-row items-center justify-between gap-4 backdrop-blur-xl">
            <div className="flex items-center gap-3">
              <div className="w-3 h-3 rounded-full bg-[#D4AF37] animate-pulse shadow-[0_0_10px_#D4AF37]" />
              <div>
                <span className="text-[10px] uppercase font-cinematic font-bold tracking-widest text-[#D4AF37] block">
                  Gotowy do Scalenia i Eksportu Master
                </span>
                <p className="text-sm font-bold text-white mt-0.5">
                  {totalClips} {totalClips === 1 ? 'ujęcie' : (totalClips < 5 ? 'ujęcia' : 'ujęć')} gotowych na osi czasu ({formatDuration(totalDurationSec)})
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3 w-full sm:w-auto">
              <button
                onClick={() => onNavigateTab('montage')}
                className="flex-1 sm:flex-none px-5 py-3 rounded-xl bg-[#1C170E] hover:bg-[#282114] text-[#EADFC9] hover:text-white border border-[#3E321E] font-semibold text-xs sm:text-sm tracking-wide transition-all cursor-pointer min-h-[44px]"
              >
                Dopasuj Oś Czasu
              </button>

              <button
                onClick={() => onNavigateTab('export')}
                className="flex-1 sm:flex-none px-7 py-3 luxury-btn-primary text-black font-extrabold text-xs sm:text-sm rounded-xl transition-all shadow-xl hover:scale-[1.02] flex items-center justify-center gap-2 cursor-pointer uppercase tracking-wider min-h-[44px]"
              >
                <Play className="w-4 h-4 fill-black" />
                <span>Przejdź do Eksportu</span>
              </button>
            </div>
          </div>

          {/* Collapsible Atelier System Settings */}
          <div className="border border-[#261E13] rounded-2xl bg-[#0D0B07] overflow-hidden">
            <button
              onClick={() => setShowAdvanced(!showAdvanced)}
              className="w-full px-5 py-3.5 flex items-center justify-between text-xs text-[#8C7D5B] hover:text-[#EADFC9] transition-colors cursor-pointer"
            >
              <span className="font-semibold uppercase tracking-wider font-cinematic text-[11px]">
                Zaawansowane Zarządzanie Pamięcią Atelier
              </span>
              {showAdvanced ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>

            {showAdvanced && (
              <div className="p-5 border-t border-[#261E13] flex flex-wrap items-center justify-between gap-4 text-xs">
                <div className="text-[#8C7D5B] font-mono text-[11px]">
                  Baza IndexedDB w pamięci podręcznej przeglądarki · Zero-Copy WebCodecs Buffer
                </div>

                <div className="flex items-center gap-3">
                  <button
                    onClick={onClearCache}
                    className="flex items-center gap-1.5 px-3 py-2 bg-[#17130B] hover:bg-[#241D12] text-[#A89C82] hover:text-white border border-[#302515] rounded-xl transition-colors cursor-pointer min-h-[40px]"
                  >
                    <RefreshCw className="w-3.5 h-3.5 text-[#D4AF37]" />
                    <span>Wyczyść pamięć podręczną</span>
                  </button>

                  <button
                    onClick={onResetProject}
                    className="flex items-center gap-1.5 px-3 py-2 bg-rose-950/20 hover:bg-rose-900/40 text-rose-300 border border-rose-800/40 rounded-xl transition-colors cursor-pointer min-h-[40px]"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Resetuj projekt</span>
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

