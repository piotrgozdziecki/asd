import React, { useRef, useEffect, useState, useMemo, useCallback } from 'react';
import { 
  Play, 
  Pause, 
  SkipBack, 
  SkipForward, 
  Maximize2, 
  Minimize2,
  Volume2, 
  VolumeX, 
  ShieldAlert, 
  Tv, 
  Eye,
  Film,
  RotateCcw,
  Sparkles,
  Scaling,
  Monitor,
  Smartphone,
  Square,
  ZoomIn,
  ZoomOut,
  Palette,
  Sliders,
  Check
} from 'lucide-react';
import type { TimelineItem, MediaClip, TextLayer, AudioTrackItem, ColorGradingPreset } from '../../types/project';

export type ScaleMode = 'fit' | 'fill' | '16:9' | '9:16' | '4:3' | 'original';

export interface ColorGradePresetItem {
  id: ColorGradingPreset;
  name: string;
  subtitle: string;
  icon: string;
  filter: string;
}

export const COLOR_GRADE_PRESETS: ColorGradePresetItem[] = [
  {
    id: 'none',
    name: 'Oryginał',
    subtitle: 'Naturalny obraz bez filtrów',
    icon: '🎬',
    filter: 'none'
  },
  {
    id: 'golden_hour',
    name: 'Złoto Wenecji',
    subtitle: 'Haute Couture Gold • Ciepły blask ślubny',
    icon: '✨',
    filter: 'contrast(1.08) brightness(1.04) saturate(1.22) sepia(0.2) hue-rotate(-5deg)'
  },
  {
    id: 'cinematic_noir',
    name: 'Aksamitny Noir',
    subtitle: 'Srebrna taśma filmowa • Głęboki kontrast',
    icon: '🎞️',
    filter: 'grayscale(1) contrast(1.3) brightness(0.95)'
  },
  {
    id: 'pastel_boho',
    name: 'Toskania & Boho',
    subtitle: 'Miękkie pastele • Romantyczny fine-art',
    icon: '🌿',
    filter: 'contrast(0.96) brightness(1.06) saturate(0.9) sepia(0.08)'
  },
  {
    id: 'vintage_35mm',
    name: 'Vintage Kodak 35mm',
    subtitle: 'Stylistyka analogowej taśmy Super 8',
    icon: '📽️',
    filter: 'sepia(0.3) contrast(1.15) saturate(1.12) brightness(0.98) hue-rotate(5deg)'
  },
  {
    id: 'vivid_master',
    name: 'Czysty Master Vivid',
    subtitle: 'Krystaliczna ostrość i głębokie barwy',
    icon: '💎',
    filter: 'contrast(1.1) saturate(1.2) brightness(1.02)'
  }
];

interface PreviewPlayerProps {
  currentTime: number;
  duration: number;
  playing: boolean;
  timelineItems: TimelineItem[];
  mediaLibrary: MediaClip[];
  textLayers: TextLayer[];
  audioTracks: AudioTrackItem[];
  onPlayPause: () => void;
  onSeek: (time: number) => void;
  isCinemaMode?: boolean;
  onToggleCinemaMode?: () => void;
  colorGrade?: ColorGradingPreset;
  onColorGradeChange?: (preset: ColorGradingPreset) => void;
  letterboxMode?: 'none' | 'cinemascope' | 'standard';
  onLetterboxChange?: (mode: 'none' | 'cinemascope' | 'standard') => void;
}

export function PreviewPlayer({
  currentTime,
  duration,
  playing,
  timelineItems,
  mediaLibrary,
  textLayers,
  audioTracks,
  onPlayPause,
  onSeek,
  isCinemaMode = false,
  onToggleCinemaMode,
  colorGrade = 'none',
  onColorGradeChange,
  letterboxMode = 'none',
  onLetterboxChange
}: PreviewPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const audioRefs = useRef<{ [key: string]: HTMLAudioElement | null }>({});
  
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [muted, setMuted] = useState(false);
  const [masterVolume, setMasterVolume] = useState(1);
  const [showSafeZones, setShowSafeZones] = useState(false);
  const [videoError, setVideoError] = useState<string | null>(null);
  const [isVideoReady, setIsVideoReady] = useState(false);
  
  // Autoscaling and Aspect Ratio mode
  const [scaleMode, setScaleMode] = useState<ScaleMode>('fit');
  const [zoomLevel, setZoomLevel] = useState<number>(100); // 100%, 125%, 150%

  // Visual Grading & Cinema Engine
  const [activeColorGrade, setActiveColorGrade] = useState<ColorGradingPreset>(colorGrade);
  const [isLutDropdownOpen, setIsLutDropdownOpen] = useState(false);
  const [isCinemascope, setIsCinemascope] = useState(letterboxMode === 'cinemascope');

  useEffect(() => {
    setActiveColorGrade(colorGrade);
  }, [colorGrade]);

  useEffect(() => {
    setIsCinemascope(letterboxMode === 'cinemascope');
  }, [letterboxMode]);

  const handleSelectColorGrade = (preset: ColorGradingPreset) => {
    setActiveColorGrade(preset);
    setIsLutDropdownOpen(false);
    if (onColorGradeChange) onColorGradeChange(preset);
  };

  const handleToggleCinemascope = () => {
    const nextState = !isCinemascope;
    setIsCinemascope(nextState);
    if (onLetterboxChange) onLetterboxChange(nextState ? 'cinemascope' : 'none');
  };

  // Map for fast media lookup
  const mediaMap = useMemo(() => {
    const map = new Map<string, MediaClip>();
    mediaLibrary.forEach(m => map.set(m.id, m));
    return map;
  }, [mediaLibrary]);

  // Find active video / image clip based on current playhead time
  const activeTimelineItem = useMemo(() => {
    return timelineItems.find(
      item => currentTime >= item.timelineStart && currentTime < item.timelineStart + item.duration
    ) || null;
  }, [currentTime, timelineItems]);

  const activeTitleCard = useMemo(() => {
    if (!activeTimelineItem?.titleCard?.enabled) return null;
    const itemOffset = currentTime - activeTimelineItem.timelineStart;
    const cardDuration = activeTimelineItem.titleCard.duration || 3;
    if (itemOffset < cardDuration) {
      return activeTimelineItem.titleCard;
    }
    return null;
  }, [currentTime, activeTimelineItem]);

  const activeMedia = useMemo(() => {
    if (!activeTimelineItem) return null;
    return mediaMap.get(activeTimelineItem.clipId) || null;
  }, [activeTimelineItem, mediaMap]);

  // Resolve valid playable URL for media
  const activeMediaUrl = useMemo(() => {
    if (!activeMedia) return null;
    if (activeMedia.file) {
      try {
        if (!activeMedia.objectUrl || activeMedia.objectUrl.startsWith('blob:null')) {
          const url = URL.createObjectURL(activeMedia.file);
          activeMedia.objectUrl = url;
        }
        return activeMedia.objectUrl;
      } catch (e) {
        console.warn("Could not create object URL for file:", e);
      }
    }
    if (activeMedia.objectUrl) return activeMedia.objectUrl;
    return activeMedia.thumbnailUrl || null;
  }, [activeMedia]);

  // First clip time for quick jump
  const firstClipStart = useMemo(() => {
    if (timelineItems.length === 0) return 0;
    return Math.min(...timelineItems.map(i => i.timelineStart));
  }, [timelineItems]);

  // Calculate local source time for active item
  const localSourceTime = useMemo(() => {
    if (!activeTimelineItem) return 0;
    const offset = currentTime - activeTimelineItem.timelineStart;
    const speed = activeTimelineItem.speed || 1;
    return activeTimelineItem.sourceStart + (offset * speed);
  }, [currentTime, activeTimelineItem]);

  // Play / Pause state synchronization (runs ONLY when playing state or clip changes)
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !activeTimelineItem || activeMedia?.type === 'image') return;

    if (playing) {
      if (video.paused && !(video as any)._isPlayPending) {
        (video as any)._isPlayPending = true;
        const playPromise = video.play();
        if (playPromise !== undefined) {
          playPromise
            .then(() => {
              (video as any)._isPlayPending = false;
            })
            .catch(err => {
              (video as any)._isPlayPending = false;
              console.warn("Playback error or autoplay prevented:", err);
              if (!muted) {
                video.muted = true;
                video.play().catch(() => {});
              }
            });
        }
      }
    } else {
      if (!video.paused) {
        video.pause();
      }
    }
  }, [playing, activeTimelineItem?.clipId, activeMedia?.id, muted]);

  // Volume, playback rate and seek sync (runs during scrubbing / time updates)
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !activeTimelineItem || activeMedia?.type === 'image') return;

    video.volume = (muted || activeTimelineItem.muted) ? 0 : Math.min(1, (activeTimelineItem.volume ?? 1) * masterVolume);
    video.playbackRate = activeTimelineItem.speed || 1;

    // Synchronize playhead time if drift > 0.3s or when paused
    const drift = Math.abs(video.currentTime - localSourceTime);
    if (!playing || drift > 0.3) {
      if (Number.isFinite(localSourceTime) && video.readyState >= 1) {
        try {
          video.currentTime = Math.max(0, localSourceTime);
        } catch (err) {}
      }
    }
  }, [localSourceTime, playing, activeTimelineItem, activeMedia, muted, masterVolume]);

  // Sync Secondary Audio Tracks
  useEffect(() => {
    audioTracks.forEach(track => {
      const audio = audioRefs.current[track.id];
      if (!audio) return;
      
      const isActive = currentTime >= track.timelineStart && currentTime < track.timelineStart + track.duration;
      
      if (isActive) {
        const localTime = track.sourceStart + (currentTime - track.timelineStart);
        if (Math.abs(audio.currentTime - localTime) > 0.25) {
          audio.currentTime = Math.max(0, localTime);
        }
        audio.volume = (muted || track.muted) ? 0 : Math.min(1, (track.volume ?? 1) * masterVolume);
        
        if (playing && audio.paused) {
          audio.play().catch(e => console.warn("Audio play prevented", e));
        } else if (!playing && !audio.paused) {
          audio.pause();
        }
      } else {
        if (!audio.paused) {
          audio.pause();
        }
      }
    });
  }, [currentTime, playing, audioTracks, muted, masterVolume]);

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      containerRef.current?.requestFullscreen?.();
      setIsFullscreen(true);
    } else {
      document.exitFullscreen?.();
      setIsFullscreen(false);
    }
  };

  const formatTimecode = (seconds: number) => {
    const totalMs = Math.max(0, Number.isFinite(seconds) ? seconds : 0);
    const m = Math.floor(totalMs / 60);
    const s = Math.floor(totalMs % 60);
    const frames = Math.floor((totalMs % 1) * 30); // 30 fps
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}:${frames.toString().padStart(2, '0')}`;
  };

  const stepFrames = (frames: number) => {
    const frameDuration = 1 / 30; // 30 fps
    const newTime = Math.max(0, Math.min(duration, currentTime + (frames * frameDuration)));
    onSeek(newTime);
  };

  const activeTexts = useMemo(() => {
    return textLayers.filter(
      t => currentTime >= t.timelineStart && currentTime < t.timelineStart + t.duration
    );
  }, [textLayers, currentTime]);

  const getTextStyleClass = (style: string) => {
    switch (style) {
      case 'elegant': return 'font-serif-luxury tracking-wider';
      case 'minimalist': return 'font-mono uppercase tracking-widest font-light';
      case 'cinematic': return 'font-serif-luxury font-bold drop-shadow-2xl';
      default: return 'font-sans font-medium drop-shadow-md';
    }
  };

  // Determine aspect ratio class / style based on scaleMode
  const getStageAspectRatioStyle = () => {
    switch (scaleMode) {
      case '16:9': return { aspectRatio: '16/9' };
      case '9:16': return { aspectRatio: '9/16', maxHeight: '100%' };
      case '4:3': return { aspectRatio: '4/3' };
      case 'original':
        if (activeMedia?.width && activeMedia?.height) {
          return { aspectRatio: `${activeMedia.width}/${activeMedia.height}` };
        }
        return { aspectRatio: '16/9' };
      case 'fill':
      case 'fit':
      default:
        return { width: '100%', height: '100%' };
    }
  };

  const getObjectFitClass = () => {
    if (scaleMode === 'fill') return 'object-cover';
    return 'object-contain';
  };

  const getFilterStyle = (item?: TimelineItem | null) => {
    const scaleFactor = (zoomLevel / 100) * (item?.scale || 1);
    const chosenPreset = COLOR_GRADE_PRESETS.find(p => p.id === activeColorGrade);
    const filterVal = chosenPreset?.filter || 'none';
    return {
      transform: `scale(${scaleFactor}) rotate(${item?.rotation || 0}deg)`,
      filter: filterVal !== 'none' ? filterVal : undefined
    };
  };

  const currentGradeItem = COLOR_GRADE_PRESETS.find(p => p.id === activeColorGrade) || COLOR_GRADE_PRESETS[0];

  return (
    <div 
      ref={containerRef} 
      className={`flex flex-col bg-[#070707] h-full rounded-2xl overflow-hidden border border-[#262420] shadow-[0_20px_50px_rgba(0,0,0,0.8)] relative group ${
        isCinemaMode ? 'fixed inset-0 z-50 rounded-none border-none' : ''
      }`}
    >
      {/* Hidden audio pool */}
      <div className="hidden">
        {audioTracks.map(track => (
          <audio
            key={track.id}
            ref={el => {
              audioRefs.current[track.id] = el;
            }}
            src={track.objectUrl}
            preload="auto"
          />
        ))}
      </div>

      {/* Top Floating Control Bar (Color Grade LUT, CinemaScope, Scale Mode & Zoom) */}
      <div className="absolute top-2 right-2 sm:top-3 sm:right-3 z-40 flex items-center gap-1.5 opacity-90 group-hover:opacity-100 transition-opacity bg-black/85 backdrop-blur-md px-2 py-1.5 rounded-xl border border-white/15 shadow-2xl max-w-[calc(100%-1rem)] flex-wrap">
        
        {/* Cinematic Look / LUT Selector */}
        <div className="relative">
          <button
            onClick={() => setIsLutDropdownOpen(!isLutDropdownOpen)}
            className={`px-2 py-1 rounded-lg text-[10px] font-mono flex items-center gap-1.5 transition-all cursor-pointer ${
              activeColorGrade !== 'none'
                ? 'bg-gradient-to-r from-[#D4AF37] to-[#E5C158] text-black font-bold shadow-md'
                : 'text-[#C5BBA6] hover:text-white bg-[#1A1813] border border-[#2B271E]'
            }`}
            title="Wybierz profil kolorystyczny (LUT Cinema Look)"
          >
            <Palette className="w-3 h-3" />
            <span className="hidden xs:inline">{currentGradeItem.name}</span>
          </button>

          {/* LUT Dropdown Menu */}
          {isLutDropdownOpen && (
            <div className="absolute right-0 top-full mt-2 w-56 sm:w-64 bg-[#0E0D0A] border border-[#D4AF37]/40 rounded-xl shadow-2xl p-2 z-50 space-y-1 animate-in fade-in zoom-in-95 duration-150">
              <div className="px-2 py-1 text-[9px] font-mono uppercase tracking-wider text-[#8C8370] border-b border-[#221F17] flex justify-between items-center">
                <span>Profile Kinowe (LUTs)</span>
                <span className="text-[#D4AF37]">Haute Couture</span>
              </div>
              {COLOR_GRADE_PRESETS.map(preset => {
                const isSelected = activeColorGrade === preset.id;
                return (
                  <button
                    key={preset.id}
                    onClick={() => handleSelectColorGrade(preset.id)}
                    className={`w-full text-left p-2 rounded-lg text-xs transition-colors flex items-center justify-between cursor-pointer ${
                      isSelected
                        ? 'bg-[#2E2716] text-[#EADFC9] border border-[#D4AF37]/50'
                        : 'text-[#AAA69D] hover:bg-[#1A1813] hover:text-white'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-sm">{preset.icon}</span>
                      <div>
                        <div className="font-serif font-bold text-white text-[11px] sm:text-xs">
                          {preset.name}
                        </div>
                        <div className="text-[9px] text-[#7A7260]">
                          {preset.subtitle}
                        </div>
                      </div>
                    </div>
                    {isSelected && <Check className="w-3.5 h-3.5 text-[#D4AF37] shrink-0" />}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* CinemaScope 2.39:1 Letterbox Toggle */}
        <button
          onClick={handleToggleCinemascope}
          className={`px-1.5 sm:px-2 py-1 rounded-lg text-[10px] font-mono flex items-center gap-1 transition-all cursor-pointer ${
            isCinemascope
              ? 'bg-[#2E2716] text-[#D4AF37] border border-[#D4AF37]/60 font-bold shadow-sm'
              : 'text-[#AAA69D] hover:text-white bg-[#1A1813] border border-[#2B271E]'
          }`}
          title="Przełącz format kinowy 2.39:1 (CinemaScope Paszport)"
        >
          <Film className="w-3 h-3 text-[#D4AF37]" />
          <span className="hidden sm:inline">2.39:1</span>
        </button>

        <div className="h-3 w-px bg-white/20 mx-0.5" />

        {/* Aspect Ratio / Autoscaling modes */}
        <button
          onClick={() => setScaleMode('fit')}
          className={`px-1.5 sm:px-2 py-0.5 rounded-lg text-[10px] font-mono flex items-center gap-1 transition-colors cursor-pointer ${
            scaleMode === 'fit' ? 'bg-[#D4AF37] text-black font-bold' : 'text-[#AAA69D] hover:text-white'
          }`}
          title="Autoskalowanie (Dopasuj do ekranu)"
        >
          <Scaling className="w-3 h-3" />
          <span className="hidden xs:inline">Auto</span>
        </button>

        <button
          onClick={() => setScaleMode('fill')}
          className={`px-1.5 sm:px-2 py-0.5 rounded-lg text-[10px] font-mono flex items-center gap-1 transition-colors cursor-pointer ${
            scaleMode === 'fill' ? 'bg-[#D4AF37] text-black font-bold' : 'text-[#AAA69D] hover:text-white'
          }`}
          title="Wypełnij kadr (Cover)"
        >
          <span className="hidden xs:inline">Wypełnij</span>
        </button>

        <button
          onClick={() => setScaleMode(scaleMode === '16:9' ? '9:16' : '16:9')}
          className={`px-1.5 sm:px-2 py-0.5 rounded-lg text-[10px] font-mono flex items-center gap-1 transition-colors cursor-pointer ${
            scaleMode === '16:9' || scaleMode === '9:16' ? 'bg-[#1F1D17] text-[#D4AF37] border border-[#D4AF37]/40' : 'text-[#AAA69D] hover:text-white'
          }`}
          title="Przełącz format 16:9 / 9:16"
        >
          {scaleMode === '9:16' ? <Smartphone className="w-3 h-3 text-[#D4AF37]" /> : <Monitor className="w-3 h-3 text-[#D4AF37]" />}
          <span className="text-[9px] sm:text-[10px]">{scaleMode === '9:16' ? '9:16' : '16:9'}</span>
        </button>

        <div className="h-3 w-px bg-white/20 mx-0.5" />

        {/* Zoom */}
        <button
          onClick={() => setZoomLevel(prev => prev >= 150 ? 100 : prev + 25)}
          className="px-1 py-0.5 text-[10px] font-mono text-[#AAA69D] hover:text-white cursor-pointer"
          title="Powiększenie podglądu"
        >
          {zoomLevel}%
        </button>
      </div>

      {/* Main Video Stage with Vignette & Autoscaling Frame */}
      <div className="flex-1 relative bg-black flex items-center justify-center overflow-hidden select-none p-1 sm:p-3">
        
        {/* Centered Scalable Screen Box */}
        <div 
          className="relative max-w-full max-h-full flex items-center justify-center overflow-hidden transition-all duration-300 rounded-lg shadow-2xl bg-[#050505]"
          style={getStageAspectRatioStyle()}
        >
          {/* CinemaScope 2.39:1 Anamorphic Letterbox Overlays */}
          {isCinemascope && (
            <>
              <div className="absolute top-0 left-0 right-0 h-[10.5%] bg-black/95 border-b border-[#D4AF37]/30 z-30 pointer-events-none flex items-center px-4 justify-between select-none">
                <span className="text-[8px] font-mono tracking-widest text-[#D4AF37]/70 uppercase">CINEMASCOPE 2.39:1 • HAUTE COUTURE</span>
                <span className="text-[8px] font-mono text-[#AAA69D]/50">35MM ANAMORPHIC</span>
              </div>
              <div className="absolute bottom-0 left-0 right-0 h-[10.5%] bg-black/95 border-t border-[#D4AF37]/30 z-30 pointer-events-none select-none" />
            </>
          )}

          {activeMedia && activeMediaUrl ? (
            activeMedia.type === 'video' ? (
              <video
                ref={videoRef}
                key={activeMedia.id}
                src={activeMediaUrl}
                className={`max-w-full max-h-full w-full h-full ${getObjectFitClass()} pointer-events-none transition-transform duration-150`}
                playsInline
                muted={muted || activeTimelineItem?.muted}
                onLoadedMetadata={() => {
                  setIsVideoReady(true);
                  setVideoError(null);
                  if (videoRef.current && Number.isFinite(localSourceTime)) {
                    videoRef.current.currentTime = Math.max(0, localSourceTime);
                  }
                }}
                onError={() => {
                  console.warn("Video render error for clip:", activeMedia.name);
                  setVideoError("Nie można załadować źródła wideo");
                }}
                style={getFilterStyle(activeTimelineItem)}
              />
            ) : (
              <img
                key={activeMedia.id}
                src={activeMediaUrl}
                alt={activeMedia.name}
                className={`max-w-full max-h-full w-full h-full ${getObjectFitClass()} pointer-events-none transition-transform duration-150`}
                style={getFilterStyle(activeTimelineItem)}
              />
            )
          ) : (
            <div className="text-[#666] text-xs font-mono flex flex-col items-center gap-3 p-6 text-center">
              <span className="w-14 h-14 rounded-full border border-[#D4AF37]/30 bg-[#12110D] flex items-center justify-center text-[#D4AF37] shadow-[0_0_20px_rgba(212,175,55,0.15)]">
                <Film className="w-6 h-6" />
              </span>
              <div className="space-y-1">
                <p className="text-sm text-[#F2EFE8] font-medium font-serif-luxury">
                  {timelineItems.length === 0 ? "Brak materiałów na osi czasu" : "Głowica poza zakresem ujęć"}
                </p>
                <p className="text-[11px] text-[#888] max-w-xs">
                  {timelineItems.length === 0 
                    ? "Przejdź do zakładki 'Materiały' lub użyj 'Szybkiego Montażu', aby dodać ujęcia." 
                    : "Ustaw suwak na początku klipu lub kliknij poniżej, aby skoczyć do pierwszego ujęcia."}
                </p>
              </div>
              {timelineItems.length > 0 && (
                <button
                  onClick={() => onSeek(firstClipStart)}
                  className="mt-2 px-4 py-1.5 rounded-lg bg-[#1E1C17] border border-[#D4AF37]/40 text-[#D4AF37] hover:bg-[#D4AF37]/20 text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer shadow-md"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Skocz do pierwszego ujęcia ({formatTimecode(firstClipStart)})</span>
                </button>
              )}
            </div>
          )}

          {/* Title Card Overlay Preview */}
          {activeTitleCard && (
            <div 
              className="absolute inset-0 z-20 flex flex-col items-center justify-center p-8 transition-opacity duration-300 pointer-events-none"
              style={{
                background: activeTitleCard.backgroundColor === 'gradient'
                  ? 'linear-gradient(135deg, #111827 0%, #030712 100%)'
                  : activeTitleCard.backgroundColor || '#0A0A0A'
              }}
            >
              {/* Subtle cinematic borders */}
              {(activeTitleCard.style === 'cinematic' || activeTitleCard.style === 'elegant') && (
                <div className="absolute inset-6 border border-amber-400/20 pointer-events-none" />
              )}
              
              <div className="text-center space-y-4 max-w-xl">
                {activeTitleCard.style === 'classic' && (
                  <>
                    <h2 className="text-2xl sm:text-3xl font-bold font-serif text-[#EADFC9] tracking-normal">
                      {activeTitleCard.text}
                    </h2>
                    {activeTitleCard.subtitle && (
                      <p className="text-sm sm:text-base italic font-serif text-[#A89E8D] mt-2">
                        {activeTitleCard.subtitle}
                      </p>
                    )}
                  </>
                )}
                {activeTitleCard.style === 'elegant' && (
                  <>
                    <h2 className="text-2xl sm:text-4xl font-light font-serif text-[#D4AF37] uppercase tracking-widest leading-relaxed">
                      {activeTitleCard.text}
                    </h2>
                    {activeTitleCard.subtitle && (
                      <p className="text-xs sm:text-sm font-serif text-[#EADFC9] uppercase tracking-wider mt-3">
                        {activeTitleCard.subtitle}
                      </p>
                    )}
                  </>
                )}
                {activeTitleCard.style === 'minimalist' && (
                  <>
                    <h2 className="text-xl sm:text-2xl font-light text-white tracking-widest">
                      {activeTitleCard.text}
                    </h2>
                    {activeTitleCard.subtitle && (
                      <p className="text-[10px] sm:text-xs text-[#666] tracking-wider uppercase mt-2">
                        {activeTitleCard.subtitle}
                      </p>
                    )}
                  </>
                )}
                {activeTitleCard.style === 'cinematic' && (
                  <>
                    <h2 className="text-3xl sm:text-5xl font-extrabold uppercase tracking-tight text-white drop-shadow-[0_4px_12px_rgba(0,0,0,0.8)] font-sans">
                      {activeTitleCard.text}
                    </h2>
                    {activeTitleCard.subtitle && (
                      <p className="text-xs sm:text-sm italic text-[#D4AF37] mt-3 font-serif">
                        {activeTitleCard.subtitle}
                      </p>
                    )}
                  </>
                )}
              </div>
            </div>
          )}

          {/* Text Layers Overlay */}
          {activeTexts.map(layer => (
            <div 
              key={layer.id}
              className={`absolute transform -translate-x-1/2 -translate-y-1/2 text-center pointer-events-none transition-opacity duration-300 px-4 py-1 rounded ${getTextStyleClass(layer.style)}`}
              style={{ 
                left: `${layer.position.x * 100}%`, 
                top: `${layer.position.y * 100}%`,
                color: layer.color,
                backgroundColor: layer.backgroundColor || 'transparent',
                fontSize: `${Math.max(1.1, layer.fontSize * 1.1)}rem`,
                textShadow: '0 2px 14px rgba(0,0,0,0.95)'
              }}
            >
              {layer.text}
            </div>
          ))}

          {/* Safe Zones Broadcast Overlay */}
          {showSafeZones && (
            <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
              <div className="w-[90%] h-[90%] border border-dashed border-amber-400/50 relative">
                <span className="absolute top-1 left-2 text-[9px] font-mono text-amber-400/80 uppercase">
                  Action Safe (90%)
                </span>
                <div className="w-[88.8%] h-[88.8%] mx-auto mt-[3.1%] border border-cyan-400/50 relative">
                  <span className="absolute top-1 left-2 text-[9px] font-mono text-cyan-400/80 uppercase">
                    Title Safe (80%)
                  </span>
                  <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-4 h-4 border-t border-l border-white/40" />
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Active Clip Name Badge */}
        {activeMedia && (
          <div className="absolute top-3 left-3 flex items-center gap-2 pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity">
            <span className="px-3 py-1.5 rounded-xl bg-black/80 backdrop-blur-md border border-white/10 text-[11px] font-medium text-white flex items-center gap-2 shadow-lg">
              <Film className="w-3.5 h-3.5 text-[#D4AF37]" />
              <span className="truncate max-w-[220px]">{activeMedia.name}</span>
              {activeMedia.width && activeMedia.height && (
                <span className="text-[10px] font-mono text-[#AAA69D]">({activeMedia.width}x{activeMedia.height})</span>
              )}
            </span>
          </div>
        )}

        {/* Cinema Mode Exit button */}
        {isCinemaMode && onToggleCinemaMode && (
          <button 
            onClick={onToggleCinemaMode}
            className="absolute top-4 right-4 z-50 px-3.5 py-2 rounded-xl bg-black/80 hover:bg-black border border-white/20 text-white text-xs font-semibold flex items-center gap-1.5 cursor-pointer shadow-2xl"
          >
            <Minimize2 className="w-4 h-4 text-[#D4AF37]" />
            <span>Wyjdź z Kina</span>
          </button>
        )}

      </div>

      {/* Transport Controls Bar */}
      <div className="h-13 sm:h-14 bg-[#0F0F0F] border-t border-[#22201C] flex items-center justify-between px-2 sm:px-4 shrink-0 select-none w-full max-w-full">
        
        {/* Left: Timecode & Step frames */}
        <div className="flex items-center gap-1.5 sm:gap-3 shrink-0">
          <div className="font-mono text-[11px] sm:text-xs text-[#D4AF37] font-bold bg-[#171612] px-2 sm:px-3 py-1 sm:py-1.5 rounded-lg border border-[#302B1D] shadow-inner">
            {formatTimecode(currentTime)} <span className="text-[#555] hidden xs:inline">/ {formatTimecode(duration)}</span>
          </div>

          <div className="hidden sm:flex items-center gap-1">
            <button 
              onClick={() => stepFrames(-1)}
              className="px-2 py-1 text-[10px] font-mono text-[#AAA69D] hover:text-white hover:bg-[#1E1E1E] rounded-md border border-transparent hover:border-[#333] transition-colors cursor-pointer"
              title="-1 Klatka (1/30s)"
            >
              -1f
            </button>
            <button 
              onClick={() => stepFrames(1)}
              className="px-2 py-1 text-[10px] font-mono text-[#AAA69D] hover:text-white hover:bg-[#1E1E1E] rounded-md border border-transparent hover:border-[#333] transition-colors cursor-pointer"
              title="+1 Klatka (1/30s)"
            >
              +1f
            </button>
          </div>
        </div>

        {/* Center: Main Transport Play/Pause & Peak VU Meter */}
        <div className="flex items-center justify-center gap-1.5 sm:gap-4 shrink-0">
          <button 
            onClick={() => onSeek(Math.max(0, currentTime - 5))}
            className="p-1.5 sm:p-2 text-[#AAA69D] hover:text-[#D4AF37] transition-colors cursor-pointer"
            title="Cofnij o 5 sekund"
            aria-label="Cofnij o 5 sekund"
          >
            <SkipBack className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
          </button>
          
          <button 
            onClick={onPlayPause}
            className="w-9 h-9 sm:w-11 sm:h-11 flex items-center justify-center bg-gradient-to-tr from-[#C29B27] via-[#D4AF37] to-[#FDE047] text-black rounded-full hover:brightness-110 transition-all transform hover:scale-105 shadow-[0_0_20px_rgba(212,175,55,0.4)] cursor-pointer"
            title={playing ? "Wstrzymaj (Spacja)" : "Odtwórz (Spacja)"}
            aria-label={playing ? "Wstrzymaj" : "Odtwórz"}
          >
            {playing ? <Pause className="w-4 h-4 sm:w-5 sm:h-5 fill-current" /> : <Play className="w-4 h-4 sm:w-5 sm:h-5 fill-current ml-0.5" />}
          </button>
          
          <button 
            onClick={() => onSeek(Math.min(duration, currentTime + 5))}
            className="p-1.5 sm:p-2 text-[#AAA69D] hover:text-[#D4AF37] transition-colors cursor-pointer"
            title="Przewiń o 5 sekund"
            aria-label="Przewiń o 5 sekund"
          >
            <SkipForward className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
          </button>

          {/* Stereo VU Meter */}
          <div className="hidden lg:flex items-center gap-1.5 px-2.5 py-1 bg-[#141310] rounded-lg border border-[#2B271E] shadow-inner select-none" title="Wskaźnik poziomu dźwięku (Peak VU Meter)">
            <span className="text-[9px] font-mono text-[#D4AF37] font-bold">VU</span>
            <div className="flex flex-col gap-0.5">
              {/* Left Channel */}
              <div className="flex items-center gap-0.5">
                {[1, 2, 3, 4, 5, 6].map(i => {
                  const active = playing && !muted && (i <= (Math.sin(currentTime * 8 + i) * 2 + 4));
                  return (
                    <div 
                      key={`l_${i}`} 
                      className={`w-1.5 h-1.5 rounded-xs transition-colors duration-75 ${
                        active 
                          ? (i === 6 ? 'bg-rose-500 shadow-[0_0_4px_#f43f5e]' : i >= 5 ? 'bg-amber-400' : 'bg-[#D4AF37]') 
                          : 'bg-[#25221B]'
                      }`} 
                    />
                  );
                })}
              </div>
              {/* Right Channel */}
              <div className="flex items-center gap-0.5">
                {[1, 2, 3, 4, 5, 6].map(i => {
                  const active = playing && !muted && (i <= (Math.cos(currentTime * 7 + i) * 2 + 4));
                  return (
                    <div 
                      key={`r_${i}`} 
                      className={`w-1.5 h-1.5 rounded-xs transition-colors duration-75 ${
                        active 
                          ? (i === 6 ? 'bg-rose-500 shadow-[0_0_4px_#f43f5e]' : i >= 5 ? 'bg-amber-400' : 'bg-[#D4AF37]') 
                          : 'bg-[#25221B]'
                      }`} 
                    />
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        {/* Right: Audio, Safe Zones, Cinema & Fullscreen */}
        <div className="flex items-center justify-end gap-1 sm:gap-2 shrink-0">
          
          {/* Safe zones toggle */}
          <button 
            onClick={() => setShowSafeZones(!showSafeZones)}
            className={`p-1.5 sm:p-2 rounded-lg transition-colors cursor-pointer hidden xs:flex ${
              showSafeZones ? 'text-amber-400 bg-amber-400/15 border border-amber-400/30' : 'text-[#AAA69D] hover:text-white'
            }`}
            title="Marginesy bezpieczeństwa (Safe Zones 90% / 80%)"
            aria-label="Przełącz marginesy bezpieczeństwa"
          >
            <ShieldAlert className="w-4 h-4" />
          </button>

          {/* Volume toggle */}
          <button 
            onClick={() => setMuted(!muted)}
            className="p-1.5 sm:p-2 text-[#AAA69D] hover:text-white transition-colors cursor-pointer"
            title={muted ? "Włącz dźwięk" : "Wycisz"}
            aria-label={muted ? "Włącz dźwięk" : "Wycisz"}
          >
            {muted ? <VolumeX className="w-4 h-4 text-rose-400" /> : <Volume2 className="w-4 h-4" />}
          </button>

          {/* Cinema mode */}
          {onToggleCinemaMode && (
            <button 
              onClick={onToggleCinemaMode}
              className={`p-1.5 sm:p-2 rounded-lg transition-colors cursor-pointer hidden sm:flex ${
                isCinemaMode ? 'text-[#D4AF37] bg-[#D4AF37]/20 border border-[#D4AF37]/40' : 'text-[#AAA69D] hover:text-white'
              }`}
              title="Tryb Kinowy (Kino)"
              aria-label="Tryb kinowy"
            >
              <Eye className="w-4 h-4" />
            </button>
          )}

          {/* Fullscreen */}
          <button 
            onClick={toggleFullscreen}
            className="p-1.5 sm:p-2 text-[#AAA69D] hover:text-white transition-colors cursor-pointer"
            title="Pełny ekran"
            aria-label="Pełny ekran"
          >
            <Maximize2 className="w-4 h-4" />
          </button>
        </div>

      </div>
    </div>
  );
}
