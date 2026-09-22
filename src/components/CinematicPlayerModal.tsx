import React, { useState, useEffect, useRef } from 'react';
import { 
  X, 
  Play, 
  Pause, 
  SkipForward, 
  SkipBack, 
  Volume2, 
  VolumeX, 
  Music, 
  Sparkles,
  Heart,
  Video,
  Layers,
  Maximize2,
  Minimize2,
  Upload,
  Plus,
  Clapperboard,
  Sliders,
  ChevronRight,
  Eye,
  EyeOff,
  Film,
  FileText,
  SunMedium
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Storyboard, MediaItem } from '../types/legacy';

interface CinematicPlayerModalProps {
  storyboard: Storyboard;
  coverUrl: string | null;
  mediaItems: MediaItem[];
  token?: string | null;
  onClose: () => void;
  onOpenAutoMontage?: () => void;
  onAddMedia?: (newItems: MediaItem[]) => void;
}

function parseTimeToSeconds(timeStr: string): number {
  if (!timeStr) return 0;
  const rangePart = timeStr.split('-')[0].trim();
  const parts = rangePart.split(':').map(p => parseFloat(p));
  if (parts.length === 3 && !parts.some(isNaN)) {
    return parts[0] * 3600 + parts[1] * 60 + parts[2];
  }
  if (parts.length === 2 && !parts.some(isNaN)) {
    return parts[0] * 60 + parts[1];
  }
  const numeric = parseFloat(rangePart);
  return isNaN(numeric) ? 0 : numeric;
}

function formatSecondsToTime(seconds: number): string {
  if (isNaN(seconds) || seconds < 0) return '00:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

export function CinematicPlayerModal({ 
  storyboard, 
  coverUrl, 
  mediaItems,
  token,
  onClose,
  onOpenAutoMontage,
  onAddMedia
}: CinematicPlayerModalProps) {
  // Identify all video items from mediaItems
  const videoItems = mediaItems.filter(item => 
    item.mimeType.startsWith('video') || 
    item.name.toLowerCase().endsWith('.mp4') || 
    item.name.toLowerCase().endsWith('.mov') || 
    item.name.toLowerCase().endsWith('.webm')
  );

  const [selectedVideoIndex, setSelectedVideoIndex] = useState(0);
  const activeMedia = videoItems[selectedVideoIndex] || mediaItems[0] || null;

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);

  // Playback state
  const [isPlaying, setIsPlaying] = useState(true);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Cinematic additions overlays state
  const [showOverlays, setShowOverlays] = useState(true);
  const [currentChapterIndex, setCurrentChapterIndex] = useState(0);
  const [controlsVisible, setControlsVisible] = useState(true);

  const hideControlsTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Haptic feedback
  const triggerHaptic = (ms = 20) => {
    if (typeof window !== 'undefined' && 'vibrate' in navigator) {
      try { navigator.vibrate(ms); } catch (_) {}
    }
  };

  // Convert timeline items to timestamps
  const parsedTimeline = storyboard.timeline.map((item, index) => {
    const startSec = parseTimeToSeconds(item.time);
    return {
      ...item,
      index,
      startSec
    };
  }).sort((a, b) => a.startSec - b.startSec);

  // Determine media URL
  const getMediaSrc = (item: MediaItem | null): string => {
    if (!item) return '';
    if (item.cloudUrl) return item.cloudUrl;
    if (item.blobUrl) return item.blobUrl;
    if (item.base64) return `data:${item.mimeType};base64,${item.base64}`;
    if (item.type === 'drive' && item.id) {
      return `/api/drive/stream/${item.id}?accessToken=${token || ''}`;
    }
    return '';
  };

  const currentMediaSrc = getMediaSrc(activeMedia);
  const isVideoFile = activeMedia && (
    activeMedia.mimeType.startsWith('video') || 
    activeMedia.name.toLowerCase().endsWith('.mp4') || 
    activeMedia.name.toLowerCase().endsWith('.mov') || 
    activeMedia.name.toLowerCase().endsWith('.webm')
  );

  // Track active chapter based on video current time
  useEffect(() => {
    if (!parsedTimeline.length) return;
    let foundIndex = 0;
    for (let i = 0; i < parsedTimeline.length; i++) {
      if (currentTime >= parsedTimeline[i].startSec) {
        foundIndex = i;
      } else {
        break;
      }
    }
    if (foundIndex !== currentChapterIndex) {
      setCurrentChapterIndex(foundIndex);
    }
  }, [currentTime, parsedTimeline]);

  // Video event handlers
  const handleTimeUpdate = () => {
    if (videoRef.current) {
      setCurrentTime(videoRef.current.currentTime);
      if (videoRef.current.duration && !isNaN(videoRef.current.duration)) {
        setDuration(videoRef.current.duration);
      }
    }
  };

  const handleLoadedMetadata = () => {
    if (videoRef.current) {
      setDuration(videoRef.current.duration || 0);
      if (isPlaying) {
        videoRef.current.play().catch(e => {
          console.warn('Autoplay prevented by browser policy', e);
          setIsPlaying(false);
        });
      }
    }
  };

  const togglePlay = () => {
    triggerHaptic(15);
    if (!videoRef.current) return;
    if (isPlaying) {
      videoRef.current.pause();
      setIsPlaying(false);
    } else {
      videoRef.current.play().then(() => setIsPlaying(true)).catch(() => setIsPlaying(false));
    }
  };

  const handleSeek = (timeInSec: number) => {
    triggerHaptic(15);
    if (videoRef.current) {
      videoRef.current.currentTime = Math.max(0, Math.min(timeInSec, duration || 9999));
      setCurrentTime(videoRef.current.currentTime);
    }
  };

  const handleSkip = (secondsDelta: number) => {
    triggerHaptic(15);
    if (videoRef.current) {
      handleSeek(videoRef.current.currentTime + secondsDelta);
    }
  };

  // Fullscreen toggle
  const toggleFullscreen = () => {
    triggerHaptic(20);
    if (!containerRef.current) return;
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen().catch(() => {});
      setIsFullscreen(true);
    } else {
      document.exitFullscreen().catch(() => {});
      setIsFullscreen(false);
    }
  };

  // Clean up on unmount
  useEffect(() => {
    return () => {
      if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
      if (audioContextRef.current) {
        audioContextRef.current.close().catch(() => {});
      }
    };
  }, []);

  // Show/Hide controls timer on tap/move
  const resetControlsTimer = () => {
    setControlsVisible(true);
    if (hideControlsTimeoutRef.current) {
      clearTimeout(hideControlsTimeoutRef.current);
    }
    if (isPlaying) {
      hideControlsTimeoutRef.current = setTimeout(() => {
        setControlsVisible(false);
      }, 4500);
    }
  };

  // Add more video files directly from device
  const handleAddVideoFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files?.length) return;
    triggerHaptic(25);
    const files = Array.from(e.target.files) as File[];
    const newItems: MediaItem[] = [];

    for (const file of files) {
      const isVideo = file.type.startsWith('video/') || file.name.endsWith('.mp4') || file.name.endsWith('.mov') || file.name.endsWith('.webm');
      newItems.push({
        name: file.name,
        mimeType: file.type || (isVideo ? 'video/mp4' : 'image/jpeg'),
        type: 'local',
        blobUrl: URL.createObjectURL(file)
      });
    }

    if (onAddMedia) {
      onAddMedia(newItems);
    }
    setSelectedVideoIndex(0);
    if (e.target) e.target.value = '';
  };

  const activeChapter = parsedTimeline[currentChapterIndex] || parsedTimeline[0];

  return (
    <div 
      ref={containerRef}
      id="cinematic-player-modal"
      className="fixed inset-0 z-50 bg-black text-white flex flex-col justify-between select-none overflow-hidden"
      onClick={resetControlsTimer}
      onMouseMove={resetControlsTimer}
      onTouchStart={resetControlsTimer}
    >
      <input 
        type="file"
        ref={fileInputRef}
        onChange={handleAddVideoFile}
        accept="video/*,image/*"
        className="hidden"
      />

      {/* 1. CINEMATIC VIDEO FOUNDATION */}
      <div 
        className="absolute inset-0 z-0 flex items-center justify-center bg-black transition-all duration-300"
      >
        {isVideoFile && currentMediaSrc ? (
          <video 
            ref={videoRef}
            src={currentMediaSrc}
            playsInline
            autoPlay
            muted={isMuted}
            onTimeUpdate={handleTimeUpdate}
            onLoadedMetadata={handleLoadedMetadata}
            onEnded={() => setIsPlaying(false)}
            className="w-full h-full object-contain max-h-screen"
          />
        ) : (
          <div className="relative w-full h-full flex flex-col items-center justify-center p-6 text-center">
            {coverUrl || (activeMedia && activeMedia.blobUrl) ? (
              <img 
                src={coverUrl || activeMedia?.blobUrl} 
                alt="Wesele" 
                crossOrigin="anonymous"
                className="absolute inset-0 w-full h-full object-cover opacity-35 filter blur-xs scale-105 animate-pulse duration-1000"
              />
            ) : null}

            <div className="relative z-10 max-w-md bg-slate-950/80 backdrop-blur-md p-6 rounded-3xl border border-rose-500/30 text-center shadow-2xl">
              <div className="w-14 h-14 rounded-2xl bg-rose-500/20 border border-rose-400/40 flex items-center justify-center text-rose-400 mx-auto mb-3">
                <Video className="w-7 h-7" />
              </div>
              <h3 className="text-lg font-bold font-serif-luxury text-white mb-1.5">
                Odtwórz Swój Film Bazowy
              </h3>
              <p className="text-xs text-slate-300 font-light leading-relaxed mb-4">
                Wybierz lub wgraj nagranie wideo ze ślubu, aby odtworzyć je z kinowymi napisami w czasie rzeczywistym.
              </p>
              <button 
                id="cinematic-upload-btn"
                onClick={() => { triggerHaptic(20); fileInputRef.current?.click(); }}
                className="min-h-[2.75rem] w-full bg-gradient-to-r from-rose-600 to-amber-500 text-white font-bold text-xs px-4 py-2.5 rounded-xl shadow-lg flex items-center justify-center gap-2 active:scale-95 transition"
              >
                <Upload className="w-4 h-4" />
                <span>Wgraj plik wideo (.mp4, .mov)</span>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* 2. TOP CINEMATIC BAR */}
      <AnimatePresence>
        {controlsVisible && (
          <motion.div 
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.25 }}
            className="relative z-20 p-4 pt-safe flex items-center justify-between bg-gradient-to-b from-black/90 via-black/60 to-transparent"
          >
            {/* Left: Film title & Wedding couple */}
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-[#D4AF37] to-[#FDE047] flex items-center justify-center text-black font-bold shadow-lg shadow-[#D4AF37]/20">
                <Clapperboard className="w-5 h-5 stroke-[2.5]" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="text-xs sm:text-sm font-extrabold text-white uppercase tracking-wider font-serif-luxury text-gold-glow">
                    STUDIO KINOWE AI
                  </h1>
                </div>
                <p className="text-xs font-sans-modern opacity-80 truncate max-w-[12.5rem] sm:max-w-xs mt-0.5">
                  {storyboard.title}
                </p>
              </div>
            </div>

            {/* Right: Ambient, Voiceover & Exit */}
            <div className="flex items-center gap-2">
              {/* Overlay Visibility Toggle */}
              <button 
                id="toggle-overlays-btn"
                onClick={(e) => { e.stopPropagation(); triggerHaptic(15); setShowOverlays(!showOverlays); }}
                className={`w-9 h-9 rounded-full flex items-center justify-center transition active:scale-95 ${
                  showOverlays ? 'luxury-btn-primary font-bold shadow-lg' : 'glass-card text-white/70 hover:text-white'
                }`}
                title={showOverlays ? 'Ukryj dodatki' : 'Pokaż dodatki'}
              >
                {showOverlays ? <Eye className="w-4 h-4 text-black" /> : <EyeOff className="w-4 h-4" />}
              </button>

              {/* Close Modal */}
              <button 
                id="cinematic-close-btn"
                onClick={onClose}
                className="w-9 h-9 rounded-full glass-card hover:bg-white/20 active:scale-95 flex items-center justify-center text-white/80 hover:text-white cursor-pointer"
                aria-label="Zamknij odtwarzacz"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 3. DYNAMIC CINEMATIC OVERLAYS ("DODATKI") */}
      {showOverlays && (
        <div className="pointer-events-none relative z-10 flex-1 flex flex-col justify-end p-4 sm:p-8">
          <AnimatePresence mode="wait">
            {activeChapter && (
              <motion.div
                key={activeChapter.index}
                initial={{ opacity: 0, x: -20, scale: 0.95 }}
                animate={{ opacity: 1, x: 0, scale: 1 }}
                exit={{ opacity: 0, x: -10, scale: 0.95 }}
                transition={{ duration: 0.35 }}
                className="max-w-xl pointer-events-auto glass-panel p-5 sm:p-6 rounded-3xl shadow-2xl mb-2.5 border border-white/15"
              >
                <div className="flex items-center gap-2 mb-1.5">
                  <span className="text-[0.6875rem] font-bold font-mono-label uppercase tracking-wider text-[#FDE047] px-2.5 py-0.5 rounded-full glass-panel-gold border border-[#D4AF37]/40">
                    Rozdział {activeChapter.index + 1} z {parsedTimeline.length}
                  </span>
                  <span className="text-xs font-mono-label text-[#FDE047] font-bold">
                    ⏱ {activeChapter.time}
                  </span>
                </div>

                <h2 className="text-base sm:text-xl font-bold font-serif-luxury text-white tracking-tight leading-snug">
                  {activeChapter.elementName}
                </h2>

                <p className="text-xs sm:text-sm text-white/85 mt-1 font-sans-modern font-light leading-relaxed">
                  {activeChapter.action}
                </p>

                {activeChapter.directorNote && (
                  <div className="mt-3 pt-2.5 border-t border-white/10 flex items-center gap-2 text-xs font-sans-modern font-medium text-[#FDE047]">
                    <FileText className="w-4 h-4 text-[#D4AF37] shrink-0" />
                    <span>Wskazówka reżyserska: {activeChapter.directorNote}</span>
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>

          {/* Subtitles / Narrator Line Overlay */}
          <div className="pointer-events-auto self-center text-center mt-2 max-w-2xl px-5 py-2.5 rounded-2xl glass-card text-xs sm:text-sm text-white/90 font-light border border-white/10 shadow-lg italic">
            „{storyboard.voiceover.substring(0, 140)}...”
          </div>
        </div>
      )}

      {/* 6. BOTTOM CONTROLS & CHAPTER SCRUBBER BAR */}
      <AnimatePresence>
        {controlsVisible && (
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            transition={{ duration: 0.25 }}
            className="relative z-20 bg-gradient-to-t from-black/95 via-black/80 to-transparent p-4 sm:p-5 pb-safe space-y-3.5"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Multi-video selector pill if user uploaded several clips */}
            {videoItems.length > 1 && (
              <div className="flex items-center gap-2 overflow-x-auto pb-1 max-w-full">
                <span className="text-[0.6875rem] font-mono-label text-white/60 font-semibold uppercase tracking-wider shrink-0 mr-1">
                  Wybierz klip:
                </span>
                {videoItems.map((v, idx) => (
                  <button
                    key={idx}
                    onClick={() => { triggerHaptic(15); setSelectedVideoIndex(idx); }}
                    className={`text-xs px-3 py-1.5 rounded-xl border font-sans-modern font-medium truncate max-w-[9.5rem] shrink-0 transition ${
                      selectedVideoIndex === idx
                        ? 'luxury-btn-primary font-bold shadow-md'
                        : 'glass-card text-white/80 hover:border-white/30'
                    }`}
                  >
                    {v.name}
                  </button>
                ))}
              </div>
            )}

            {/* Interactive Timeline Scrubber with Chapter Pins */}
            <div className="relative w-full">
              {duration > 0 && parsedTimeline.map((item, idx) => {
                const percent = Math.min((item.startSec / duration) * 100, 100);
                const isActive = currentChapterIndex === idx;
                return (
                  <button
                    key={idx}
                    onClick={() => handleSeek(item.startSec)}
                    style={{ left: `${percent}%` }}
                    className={`absolute -top-3.5 -translate-x-1/2 z-10 w-3 h-3 rounded-full border transition-transform hover:scale-150 active:scale-125 ${
                      isActive 
                        ? 'bg-[#FDE047] border-black ring-2 ring-[#D4AF37] shadow-md scale-125' 
                        : 'bg-[#D4AF37]/80 border-slate-950'
                    }`}
                    title={`${item.time}: ${item.elementName}`}
                  />
                );
              })}

              <input 
                id="cinematic-timeline-scrubber"
                type="range" 
                min={0} 
                max={duration || 100} 
                step={0.1}
                value={currentTime}
                onChange={(e) => handleSeek(parseFloat(e.target.value))}
                className="w-full h-1.5 bg-white/20 rounded-lg appearance-none cursor-pointer accent-[#D4AF37] hover:accent-[#FDE047]"
              />
            </div>

            {/* Controls Row */}
            <div className="flex items-center justify-between gap-2">
              
              {/* Left: Playback Controls */}
              <div className="flex items-center gap-2.5">
                <button 
                  id="cinematic-play-btn"
                  onClick={togglePlay}
                  className="w-11 h-11 rounded-2xl luxury-btn-primary active:scale-95 text-black flex items-center justify-center shadow-lg transition"
                  aria-label={isPlaying ? 'Pauza' : 'Odtwórz'}
                >
                  {isPlaying ? <Pause className="w-5 h-5 fill-current" /> : <Play className="w-5 h-5 fill-current ml-0.5" />}
                </button>

                <button 
                  onClick={() => handleSkip(-10)}
                  className="w-9 h-9 rounded-xl glass-card hover:bg-white/20 active:scale-95 text-white/80 hover:text-white flex items-center justify-center"
                  title="Cofnij o 10s"
                >
                  <SkipBack className="w-4 h-4" />
                </button>

                <button 
                  onClick={() => handleSkip(10)}
                  className="w-9 h-9 rounded-xl glass-card hover:bg-white/20 active:scale-95 text-white/80 hover:text-white flex items-center justify-center"
                  title="Przewiń o 10s"
                >
                  <SkipForward className="w-4 h-4" />
                </button>

                <div className="text-xs font-mono-label text-white/80 ml-1.5">
                  <span className="text-white font-bold">{formatSecondsToTime(currentTime)}</span>
                  <span className="text-white/40 mx-1">/</span>
                  <span className="text-white/60">{formatSecondsToTime(duration)}</span>
                </div>
              </div>

              {/* Right: Chapter selector / Fullscreen / Montage action */}
              <div className="flex items-center gap-2">
                {/* Chapter Quick Jump Pills */}
                <div className="hidden md:flex items-center gap-1.5 max-w-xs overflow-x-auto">
                  {parsedTimeline.map((item, idx) => (
                    <button
                      key={idx}
                      onClick={() => handleSeek(item.startSec)}
                      className={`text-xs px-2.5 py-1 rounded-lg transition font-mono-label ${
                        currentChapterIndex === idx
                          ? 'luxury-btn-primary font-bold'
                          : 'glass-card text-white/70 hover:text-white'
                      }`}
                    >
                      #{idx + 1}
                    </button>
                  ))}
                </div>

                {/* Call to Montage Button */}
                {onOpenAutoMontage && (
                  <button 
                    id="cinematic-to-montage-btn"
                    onClick={() => { triggerHaptic(20); onOpenAutoMontage(); }}
                    className="min-h-[2.5rem] luxury-btn-primary text-black font-bold text-xs px-4 py-2 rounded-xl shadow-lg flex items-center gap-2 active:scale-95 transition font-mono-label uppercase"
                  >
                    <Film className="w-4 h-4 stroke-[2.5]" />
                    <span className="hidden sm:inline">Montaż & Eksport</span>
                  </button>
                )}

                {/* Fullscreen Button */}
                <button 
                  id="cinematic-fullscreen-btn"
                  onClick={toggleFullscreen}
                  className="w-9 h-9 rounded-xl glass-card hover:bg-white/20 active:scale-95 text-white/80 hover:text-white flex items-center justify-center"
                  aria-label="Pełny ekran"
                >
                  {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
                </button>
              </div>

            </div>

          </motion.div>
        )}
      </AnimatePresence>

    </div>
  );
}
