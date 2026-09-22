import React, { useState, useEffect, useRef } from 'react';
import { 
  Play, 
  Pause, 
  SkipForward, 
  SkipBack, 
  Volume2, 
  VolumeX, 
  Download, 
  Film, 
  Heart, 
  Loader2, 
  CheckCircle2, 
  AlertCircle,
  Smartphone,
  Monitor,
  Music,
  Scissors,
  Sparkles,
  Type,
  FileDown,
  Mic
} from 'lucide-react';
import { Storyboard, MediaItem } from '../types/legacy';
import { 
  mergeWeddingClipsToVideo, 
  MergeProgress, 
  VideoAspectRatio, 
  SubtitleStyle, 
  VideoTransition 
} from '../lib/videoMerger';

interface CinemaStageProps {
  storyboard: Storyboard;
  mediaItems: MediaItem[];
  coverUrl: string | null;
  customAudio?: { name: string; blobUrl: string } | null;
  voiceoverUrl?: string | null;
  onOpenVoiceRecorder?: () => void;
  onOpenAutoMontage: () => void;
  onNavigateToTab: (tab: any) => void;
  onOpenPdfExport?: () => void;
}

export const CinemaStage: React.FC<CinemaStageProps> = ({
  storyboard,
  mediaItems,
  customAudio,
  voiceoverUrl,
  onOpenVoiceRecorder,
  onOpenAutoMontage,
  onNavigateToTab,
  onOpenPdfExport
}) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentClipIdx, setCurrentClipIdx] = useState(0);
  const [clipProgress, setClipProgress] = useState(0);
  
  // Format & Aesthetics Settings - original format by default
  const [aspectRatio, setAspectRatio] = useState<VideoAspectRatio>('16:9');
  const [subtitleStyle, setSubtitleStyle] = useState<SubtitleStyle>('gold_luxury');
  const [transition, setTransition] = useState<VideoTransition>('crossfade');
  
  // Audio Controls (Custom song and custom recorded voice - no ambient synthesis)
  const [isMuted, setIsMuted] = useState(false);
  
  // Real Video Export State
  const [isExporting, setIsExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState<MergeProgress | null>(null);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);

  const customAudioPlayerRef = useRef<HTMLAudioElement | null>(null);
  const voiceoverPlayerRef = useRef<HTMLAudioElement | null>(null);
  const videoPlayerRef = useRef<HTMLVideoElement | null>(null);

  // Active clips from uploaded media items or fallback to timeline
  const activeClips: MediaItem[] = mediaItems.length > 0 
    ? mediaItems 
    : (storyboard.timeline || []).map((t) => ({
        name: t.elementName,
        mimeType: 'image/jpeg',
        type: 'local' as const,
        comment: t.action,
        durationSec: 5
      }));

  const totalClips = activeClips.length;
  const currentClip = activeClips[currentClipIdx] || activeClips[0];
  const matchingScene = (storyboard.timeline || [])[currentClipIdx] || null;
  const currentComment = currentClip?.comment || matchingScene?.action || matchingScene?.directorNote || currentClip?.name;

  // Clip duration calculation based on trimming
  const clipStart = currentClip?.startTimeSec || 0;
  const clipEnd = (currentClip?.endTimeSec && currentClip.endTimeSec > clipStart)
    ? currentClip.endTimeSec
    : clipStart + (currentClip?.durationSec || 5);
  const effectiveClipDuration = Math.max(clipEnd - clipStart, 1.5);

  // Seamless Multi-Clip Player Loop (honors trimmed clip start and duration)
  useEffect(() => {
    let timer: any;
    if (isPlaying && totalClips > 0) {
      const stepIntervalMs = 100;
      const stepPercent = (stepIntervalMs / (effectiveClipDuration * 1000)) * 100;

      timer = setInterval(() => {
        setClipProgress(prev => {
          if (prev >= 100) {
            setCurrentClipIdx(curr => {
              if (curr >= totalClips - 1) {
                setIsPlaying(false);
                return 0;
              }
              return curr + 1;
            });
            return 0;
          }
          return prev + stepPercent;
        });
      }, stepIntervalMs);
    }
    return () => clearInterval(timer);
  }, [isPlaying, totalClips, currentClipIdx, effectiveClipDuration]);

  // Restart video playback and seek to startTimeSec when clip changes
  useEffect(() => {
    if (videoPlayerRef.current) {
      const start = currentClip?.startTimeSec || 0;
      videoPlayerRef.current.currentTime = start;
      if (currentClip?.audioVolume !== undefined) {
        videoPlayerRef.current.volume = isMuted ? 0 : currentClip.audioVolume;
      }
      if (isPlaying) {
        videoPlayerRef.current.play().catch(() => {});
      }
    }
  }, [currentClipIdx, currentClip]);

  // Background Audio Soundtrack (tylko wgrany utwór użytkownika oraz nagrany własny głos)
  useEffect(() => {
    if (isPlaying && !isMuted) {
      if (customAudio && customAudio.blobUrl) {
        if (!customAudioPlayerRef.current) {
          const audio = new Audio(customAudio.blobUrl);
          audio.loop = true;
          audio.volume = voiceoverUrl ? 0.45 : 0.8;
          customAudioPlayerRef.current = audio;
        }
        customAudioPlayerRef.current.play().catch(() => {});
      }
      
      if (voiceoverUrl) {
        if (!voiceoverPlayerRef.current) {
          const vAudio = new Audio(voiceoverUrl);
          vAudio.volume = 1.0;
          voiceoverPlayerRef.current = vAudio;
        }
        voiceoverPlayerRef.current.play().catch(() => {});
      }
    } else {
      if (customAudioPlayerRef.current) {
        customAudioPlayerRef.current.pause();
      }
      if (voiceoverPlayerRef.current) {
        voiceoverPlayerRef.current.pause();
      }
    }

    return () => {
      if (customAudioPlayerRef.current) {
        customAudioPlayerRef.current.pause();
      }
      if (voiceoverPlayerRef.current) {
        voiceoverPlayerRef.current.pause();
      }
    };
  }, [isPlaying, isMuted, customAudio, voiceoverUrl]);

  const handleNextClip = () => {
    setCurrentClipIdx(curr => (curr + 1) % totalClips);
    setClipProgress(0);
  };

  const handlePrevClip = () => {
    setCurrentClipIdx(curr => (curr - 1 + totalClips) % totalClips);
    setClipProgress(0);
  };

  // Real Video Export Action with Trimming, Audio Mixing & Subtitle Styles
  const handleExportMergedVideo = async () => {
    if (activeClips.length === 0) return;
    setIsExporting(true);
    setExportError(null);
    setDownloadUrl(null);

    try {
      const clipsToMerge = activeClips.map((item, idx) => ({
        item,
        comment: item.comment || (storyboard.timeline[idx]?.action) || item.name,
        durationSec: item.durationSec || 5
      }));

      const finalBlob = await mergeWeddingClipsToVideo(
        clipsToMerge,
        null,
        { 
          aspectRatio,
          subtitleStyle,
          transition,
          customAudioBlobUrl: customAudio?.blobUrl || null
        },
        (p) => setExportProgress(p)
      );

      const url = URL.createObjectURL(finalBlob);
      setDownloadUrl(url);

      const cleanTitle = (storyboard.title || 'film_slubny')
        .toLowerCase()
        .replace(/ł/g, 'l')
        .replace(/ą/g, 'a')
        .replace(/ę/g, 'e')
        .replace(/ć/g, 'c')
        .replace(/ń/g, 'n')
        .replace(/ó/g, 'o')
        .replace(/ś/g, 's')
        .replace(/ź/g, 'z')
        .replace(/ż/g, 'z')
        .replace(/[^a-z0-9_-]/g, '_')
        .replace(/_+/g, '_');

      const a = document.createElement('a');
      a.href = url;
      a.download = `${cleanTitle}_${aspectRatio === '9:16' ? 'rolka_9x16' : 'kino_16x9'}_${Date.now()}.webm`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } catch (err: any) {
      setExportError(err.message || 'Błąd podczas łączenia filmów.');
    } finally {
      setIsExporting(false);
    }
  };

  const isCurrentVideo = currentClip && (
    currentClip.mimeType.startsWith('video') || 
    currentClip.name.toLowerCase().endsWith('.mp4') || 
    currentClip.name.toLowerCase().endsWith('.mov') ||
    currentClip.name.toLowerCase().endsWith('.webm')
  );

  return (
    <div className="space-y-5 animate-in fade-in duration-300 max-w-5xl mx-auto px-1 sm:px-0">
      
      {/* 1. Header & Format Toolbar */}
      <div className="glass-panel p-4 sm:p-6 rounded-2xl sm:rounded-3xl space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="px-2.5 py-1 rounded-full text-[0.6875rem] font-mono-label uppercase badge-luxury font-bold flex items-center gap-1.5">
              <Film className="w-3.5 h-3.5 text-[#D4AF37]" />
              Połączone Klipy ({totalClips})
            </span>
            <span className="px-2.5 py-1 rounded-full text-[0.6875rem] font-mono-label bg-white/10 text-stone-200 font-semibold">
              Klip #{currentClipIdx + 1} z {totalClips}
            </span>
            {customAudio && (
              <span className="px-2.5 py-1 rounded-full text-[0.6875rem] font-mono-label bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 flex items-center gap-1">
                <Music className="w-3 h-3" />
                {customAudio.name}
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            {onOpenPdfExport && (
              <button
                onClick={onOpenPdfExport}
                className="luxury-btn-ghost px-3.5 py-2.5 rounded-xl text-xs font-mono-label uppercase font-bold flex items-center gap-1.5 text-stone-200 hover:text-[#D4AF37] border border-white/20 hover:border-[#D4AF37]/50 cursor-pointer transition shadow-sm"
                title="Pobierz scenariusz montażowy jako plik PDF do druku i offline"
              >
                <FileDown className="w-4 h-4 text-[#D4AF37]" />
                <span className="hidden sm:inline">Scenariusz</span>
                <span>(PDF)</span>
              </button>
            )}

            <button
              onClick={handleExportMergedVideo}
              disabled={isExporting}
              className="luxury-btn-primary px-4 py-2.5 rounded-xl text-xs font-mono-label uppercase font-extrabold flex items-center gap-2 shadow-lg cursor-pointer disabled:opacity-50"
            >
              {isExporting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin text-black" />
                  <span>Tworzenie Projekcji...</span>
                </>
              ) : (
                <>
                  <Film className="w-4 h-4 text-black" />
                  <span>Uruchom Projekcję</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Subtitle & Transition Switchers (Original Video Format) */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
          {/* Format Indicator */}
          <div className="flex items-center justify-between gap-2 p-2 px-3 rounded-xl bg-white/5 border border-white/10">
            <span className="text-[0.6875rem] font-mono-label uppercase font-bold text-stone-300 shrink-0">Format:</span>
            <span className="text-xs font-mono-label font-bold text-[#FDE047] bg-white/10 px-2.5 py-1 rounded-lg">
              Oryginalny z filmu
            </span>
          </div>

          {/* Subtitle Style Switcher */}
          <div className="flex items-center gap-2 p-2 rounded-xl bg-white/5 border border-white/10">
            <span className="text-[0.6875rem] font-mono-label uppercase font-bold text-stone-300 shrink-0 flex items-center gap-1">
              <Type className="w-3.5 h-3.5 text-[#D4AF37]" />
              Napisy:
            </span>
            <select
              value={subtitleStyle}
              onChange={(e) => setSubtitleStyle(e.target.value as SubtitleStyle)}
              className="flex-1 bg-black/60 border border-white/20 text-white rounded-lg text-xs py-1.5 px-2 focus:outline-none focus:border-[#D4AF37]"
            >
              <option value="gold_luxury">Złota Klasyka</option>
              <option value="modern_minimal">Nowoczesny Minimalizm</option>
              <option value="vintage_cinema">35mm Kinowy (Żółty)</option>
            </select>
          </div>

          {/* Transition Switcher */}
          <div className="flex items-center gap-2 p-2 rounded-xl bg-white/5 border border-white/10">
            <span className="text-[0.6875rem] font-mono-label uppercase font-bold text-stone-300 shrink-0 flex items-center gap-1">
              <Sparkles className="w-3.5 h-3.5 text-[#D4AF37]" />
              Przejścia:
            </span>
            <select
              value={transition}
              onChange={(e) => setTransition(e.target.value as VideoTransition)}
              className="flex-1 bg-black/60 border border-white/20 text-white rounded-lg text-xs py-1.5 px-2 focus:outline-none focus:border-[#D4AF37]"
            >
              <option value="crossfade">Płynne Przenikanie</option>
              <option value="fade_black">Ściemnienie do Czerni</option>
              <option value="cut">Cięcie Filmowe</option>
            </select>
          </div>
        </div>

        {/* Live Export Progress Banner */}
        {isExporting && exportProgress && (
          <div className="glass-panel-gold rounded-3xl p-8 text-center space-y-5 shadow-2xl border border-[#D4AF37]/50 animate-in zoom-in duration-300 mt-4">
            <div className="w-16 h-16 mx-auto rounded-2xl bg-gradient-to-tr from-[#A1821C] via-[#D4AF37] to-[#FDE047] flex items-center justify-center animate-pulse shadow-lg">
              <Film className="w-8 h-8 text-black font-bold" />
            </div>

            <div>
              <h3 className="text-lg font-bold text-white font-serif-luxury tracking-wide">
                Trwa Renderowanie Projekcji
              </h3>
              <p className="text-xs text-[#FDE047] font-mono-label mt-1 font-semibold">
                {exportProgress.statusText}
              </p>
            </div>

            {/* Visual Progress Bar */}
            <div className="space-y-2 max-w-md mx-auto">
              <div className="h-3.5 w-full bg-black/60 rounded-full overflow-hidden border border-white/20 p-0.5 shadow-inner">
                <div 
                  className="h-full bg-gradient-to-r from-[#A1821C] via-[#D4AF37] to-[#FDE047] rounded-full transition-all duration-300"
                  style={{ width: `${exportProgress.percent}%` }}
                />
              </div>
              <div className="flex justify-between text-xs text-white/80 font-mono-label font-bold">
                <span>Postęp montażu</span>
                <span className="text-[#FDE047]">{exportProgress.percent}%</span>
              </div>
            </div>
            
            <p className="text-[0.625rem] text-white/50 pt-2 font-mono-label">Proszę nie zamykać tej karty przeglądarki</p>
          </div>
        )}

        {downloadUrl && (
          <div className="p-3.5 rounded-2xl bg-emerald-950/60 border border-emerald-500/40 text-emerald-200 text-xs font-sans-modern flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>Film gotowy! Jeśli pobieranie nie rozpoczęło się automatycznie:</span>
            </div>
            <a 
              href={downloadUrl} 
              download={`${storyboard.title ? storyboard.title.replace(/[^a-zA-Z0-9]/g, '_') : 'film_slubny'}_${aspectRatio === '9:16' ? 'rolka' : 'kino'}.webm`}
              className="px-3.5 py-1.5 rounded-lg bg-emerald-500 text-black font-bold text-xs uppercase font-mono-label shrink-0"
            >
              Pobierz Plik
            </a>
          </div>
        )}

        {exportError && (
          <div className="p-3.5 rounded-2xl bg-rose-950/60 border border-rose-500/40 text-rose-200 text-xs font-sans-modern flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
            <span>{exportError}</span>
          </div>
        )}
      </div>

      {/* 2. Responsive Dedicated Video Frame (Never cuts off contents, supports 16:9 and 9:16) */}
      <div className={`relative w-full rounded-2xl sm:rounded-3xl overflow-hidden bg-black border border-[#D4AF37]/40 shadow-2xl flex flex-col justify-between transition-all duration-300 ${
        aspectRatio === '9:16' 
          ? 'aspect-[9/16] max-w-[380px] mx-auto max-h-[70vh]' 
          : 'aspect-[16/9] max-h-[65vh]'
      }`}>
        
        {/* Cinema Stage Background */}
        <div className="absolute inset-0 z-0 bg-[#000000] pointer-events-none" />

        {/* Sharp Main Media in Center */}
        <div className="absolute inset-0 z-0 overflow-hidden flex items-center justify-center">
          {(() => {
            const mediaSrc = currentClip?.cloudUrl || currentClip?.blobUrl || (currentClip as any)?.objectUrl || (currentClip as any)?.thumbnailUrl;
            if (isCurrentVideo && mediaSrc) {
              return (
                <video 
                  ref={videoPlayerRef}
                  src={mediaSrc} 
                  className="w-full h-full object-contain" 
                  autoPlay={isPlaying}
                  loop
                  muted={isMuted}
                  playsInline
                />
              );
            }
            if (currentClip && mediaSrc) {
              return (
                <img 
                  src={mediaSrc} 
                  alt={currentClip.name} 
                  className="w-full h-full object-contain transform scale-100"
                />
              );
            }
            return (
              <div className="w-full h-full bg-gradient-to-tr from-[#030303] via-[#211d17] to-[#030303] flex items-center justify-center p-6 text-center">
                <div className="space-y-2 max-w-md">
                  <Heart className="w-10 h-10 text-[#D4AF37] mx-auto animate-pulse" />
                  <h4 className="text-base sm:text-lg font-serif-luxury font-bold text-white">
                    Klip #{currentClipIdx + 1}: {currentClip?.name}
                  </h4>
                  <p className="text-xs font-sans-modern text-[#E7E5E4] leading-relaxed">
                    {currentComment}
                  </p>
                </div>
              </div>
            );
          })()}
        </div>

        {/* Top Badges over video */}
        <div className="relative z-20 p-3 flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <span className="px-2.5 py-1 rounded-lg bg-black/80 backdrop-blur-md border border-white/20 text-[#FDE047] font-mono-label text-[0.6875rem] font-bold">
              Klip {currentClipIdx + 1} / {totalClips}
            </span>
            {currentClip?.startTimeSec !== undefined && currentClip.endTimeSec !== undefined && (
              <span className="hidden sm:inline-flex px-2 py-1 rounded-lg bg-black/70 border border-white/10 text-[0.625rem] font-mono-label text-stone-300 items-center gap-1">
                <Scissors className="w-3 h-3 text-[#D4AF37]" />
                {currentClip.startTimeSec}s - {currentClip.endTimeSec}s
              </span>
            )}
          </div>
        </div>

        {/* Bottom Subtitle Live Rendering matching Selected Style */}
        <div className="relative z-20 p-3 sm:p-4 text-center">
          {subtitleStyle === 'gold_luxury' && (
            <div className="inline-block max-w-[95%] px-4 py-2 rounded-xl bg-black/80 backdrop-blur-md border border-[#D4AF37]/40 shadow-lg text-left">
              <span className="text-[0.625rem] font-mono-label font-bold text-[#D4AF37] uppercase block">
                Klip #{currentClipIdx + 1} z {totalClips}
              </span>
              <p className="text-xs sm:text-sm font-sans-modern font-semibold text-white leading-snug">
                {currentComment}
              </p>
            </div>
          )}

          {subtitleStyle === 'modern_minimal' && (
            <div className="inline-block max-w-[95%] px-3 py-1.5 text-center drop-shadow-[0_2px_8px_rgba(0,0,0,0.9)]">
              <p className="text-sm sm:text-base font-sans-modern font-bold text-white tracking-wide">
                {currentComment}
              </p>
              <span className="text-[0.625rem] font-mono-label text-[#FDE047] opacity-90 block mt-0.5">
                — #{currentClipIdx + 1} z {totalClips} —
              </span>
            </div>
          )}

          {subtitleStyle === 'vintage_cinema' && (
            <div className="inline-block max-w-[95%] text-center">
              <p className="text-sm sm:text-base font-bold text-[#ffea31] tracking-wide drop-shadow-[0_2px_4px_rgba(0,0,0,1)] uppercase">
                {currentComment}
              </p>
            </div>
          )}
        </div>

      </div>

      {/* 3. CLEAN & SPACIOUS CONTROLS OUTSIDE THE VIDEO */}
      <div className="glass-panel p-4 sm:p-6 rounded-2xl sm:rounded-3xl space-y-4">
        
        {/* Timeline Scrubbing Bar */}
        <div className="space-y-1.5">
          <div className="h-2 w-full bg-white/15 rounded-full overflow-hidden cursor-pointer"
               onClick={(e) => {
                 const rect = e.currentTarget.getBoundingClientRect();
                 const clickX = e.clientX - rect.left;
                 const ratio = clickX / rect.width;
                 const targetIdx = Math.min(Math.floor(ratio * totalClips), totalClips - 1);
                 setCurrentClipIdx(targetIdx);
                 setClipProgress(0);
               }}>
            <div 
              className="h-full bg-gradient-to-r from-[#B48E23] to-[#FDE047] transition-all duration-100"
              style={{ width: `${((currentClipIdx + (clipProgress / 100)) / (totalClips || 1)) * 100}%` }}
            />
          </div>
          <div className="flex items-center justify-between text-[0.6875rem] font-mono-label text-stone-300">
            <span>Klip {currentClipIdx + 1} z {totalClips}: {currentClip?.name}</span>
            <span>Ścieżka: {customAudio ? customAudio.name : storyboard.musicSuggestion}</span>
          </div>
        </div>

        {/* Player Action Buttons */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
          <div className="flex items-center gap-2">
            <button
              onClick={handlePrevClip}
              className="min-h-[44px] min-w-[44px] rounded-xl bg-white/10 hover:bg-white/20 border border-white/20 text-white flex items-center justify-center cursor-pointer transition"
              title="Poprzedni klip"
            >
              <SkipBack className="w-4 h-4" />
            </button>

            <button
              onClick={() => setIsPlaying(!isPlaying)}
              className="min-h-[44px] px-6 rounded-xl bg-gradient-to-r from-[#D4AF37] to-[#FDE047] text-black font-mono-label font-bold text-xs uppercase flex items-center justify-center gap-2 shadow-lg shadow-[#D4AF37]/30 transition hover:scale-102 cursor-pointer"
            >
              {isPlaying ? <Pause className="w-4 h-4 fill-black" /> : <Play className="w-4 h-4 fill-black" />}
              <span>{isPlaying ? 'Pauza' : 'Odtwarzaj Połączone'}</span>
            </button>

            <button
              onClick={handleNextClip}
              className="min-h-[44px] min-w-[44px] rounded-xl bg-white/10 hover:bg-white/20 border border-white/20 text-white flex items-center justify-center cursor-pointer transition"
              title="Następny klip"
            >
              <SkipForward className="w-4 h-4" />
            </button>
          </div>

          <div className="flex items-center gap-2">
            {onOpenVoiceRecorder && (
              <button
                onClick={onOpenVoiceRecorder}
                className={`min-h-[44px] px-3.5 rounded-xl text-xs font-mono-label font-bold flex items-center gap-1.5 border transition cursor-pointer ${
                  voiceoverUrl 
                    ? 'bg-rose-500/20 text-rose-300 border-rose-500/40' 
                    : 'bg-white/10 text-[#D4AF37] border-white/20 hover:border-[#D4AF37]/50'
                }`}
                title={voiceoverUrl ? "Własny głos został nagrany. Kliknij, aby nagrać ponownie." : "Nagraj własny głos"}
              >
                <Mic className="w-4 h-4" />
                <span>{voiceoverUrl ? 'Własny Głos (Aktywny)' : 'Nagraj Własny Głos'}</span>
              </button>
            )}

            <button
              onClick={() => setIsMuted(!isMuted)}
              className="min-h-[44px] min-w-[44px] rounded-xl bg-white/10 hover:bg-white/20 border border-white/20 text-white flex items-center justify-center cursor-pointer transition"
              title={isMuted ? "Włącz muzykę" : "Wycisz muzykę"}
            >
              {isMuted ? <VolumeX className="w-4 h-4 text-rose-400" /> : <Volume2 className="w-4 h-4 text-emerald-400" />}
            </button>
          </div>
        </div>

      </div>

      {/* 4. Sequence List of All Joined Clips */}
      <div className="glass-panel p-4 sm:p-6 rounded-2xl sm:rounded-3xl space-y-3">
        <div className="flex items-center justify-between">
          <h4 className="text-xs font-mono-label uppercase font-bold text-stone-200">
            Wybierz Ujęcie ({totalClips} klipów):
          </h4>
          <button
            onClick={() => onNavigateToTab('studio')}
            className="text-[0.6875rem] font-mono-label text-[#D4AF37] hover:underline flex items-center gap-1"
          >
            <Scissors className="w-3 h-3" />
            Edytuj przycięcie i podpisy (Krok 1)
          </button>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2.5">
          {activeClips.map((clip, i) => (
            <button
              key={i}
              onClick={() => {
                setCurrentClipIdx(i);
                setClipProgress(0);
              }}
              className={`p-2.5 rounded-xl border text-left transition cursor-pointer ${
                currentClipIdx === i 
                  ? 'glass-panel-gold border-[#D4AF37] shadow-md text-[#FDE047]' 
                  : 'glass-card border-white/10 text-stone-300 hover:border-[#D4AF37]/40'
              }`}
            >
              <div className="flex items-center justify-between text-[0.625rem] font-mono-label font-bold mb-1">
                <span>#{i + 1}</span>
                <span className="opacity-75">{clip.mimeType.startsWith('video') ? 'Wideo' : 'Zdjęcie'}</span>
              </div>
              <p className="text-xs font-sans-modern font-semibold truncate text-white">{clip.name}</p>
              {clip.comment && (
                <p className="text-[0.625rem] font-sans-modern opacity-80 truncate text-[#D4AF37] mt-0.5">
                  "{clip.comment}"
                </p>
              )}
            </button>
          ))}
        </div>
      </div>

    </div>
  );
};
