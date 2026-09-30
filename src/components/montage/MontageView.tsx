import React, { useState, useEffect, useRef, useMemo, useCallback, memo } from 'react';
import { 
  Play, 
  Pause, 
  Square, 
  SkipBack, 
  SkipForward, 
  Scissors, 
  Volume2, 
  VolumeX, 
  RotateCw, 
  Trash2, 
  ChevronLeft, 
  ChevronRight, 
  Film, 
  Layers, 
  Clock, 
  Maximize2,
  Minimize2,
  ZoomIn,
  ZoomOut,
  Sliders,
  Sparkles,
  ArrowRight,
  Monitor,
  Smartphone,
  Eye,
  ImageIcon,
  Gauge,
  Wand2,
  Type
} from 'lucide-react';
import type { ProjectState, TimelineItem, MediaClip, FitMode, TransitionType, TitleCard } from '../../types/project';
import { urlRegistry } from '../../core/media/urlRegistry';
import { thumbnailCache } from '../../core/media/thumbnailCache';
import { resolveClipMediaUrl, resolveAudioTrackUrl } from '../../core/media/mediaResolver';
import { useStudioToast } from '../common/ToastContext';

interface MontageViewProps {
  project: ProjectState;
  onUpdateTimelineItem: (id: string, updates: Partial<TimelineItem>) => void;
  onDeleteTimelineItem: (id: string) => void;
  onMoveTimelineItemOrder: (fromIndex: number, toIndex: number) => void;
  onNavigateTab: (tab: string) => void;
}

type AspectRatioMode = '16:9' | '9:16' | '4:3' | '1:1';

const formatTimeSimple = (sec: number) => {
  const mins = Math.floor(sec / 60);
  const s = (sec % 60).toFixed(1);
  return `${mins.toString().padStart(2, '0')}:${parseFloat(s) < 10 ? '0' : ''}${s}`;
};

const formatTimePrecise = (sec: number) => {
  const mins = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  const ms = Math.floor((sec % 1) * 1000);
  return `${mins.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}.${ms.toString().padStart(3, '0')}`;
};

/**
 * Highly optimized, memoized TimelineItemCard
 * Features:
 * - Asynchronous, lazy thumbnail and filmstrip loading via IntersectionObserver
 * - Cached thumbnail reuse from memory-bounded ThumbnailCache
 * - Isolated from 60fps playhead ticks: does not re-render on currentTime updates
 * - Multi-frame filmstrip tiles when zoomed in or on longer items
 */
interface TimelineItemCardProps {
  item: TimelineItem;
  clip: MediaClip | undefined;
  idx: number;
  isSelected: boolean;
  isDraggingThis: boolean;
  isTargetingThis: boolean;
  widthPct: number;
  timelineZoom: number;
  onSelect: (id: string, start: number) => void;
  onDragStart: (idx: number, e: React.DragEvent) => void;
  onDragOver: (idx: number, e: React.DragEvent) => void;
  onDragLeave: () => void;
  onDrop: (idx: number, e: React.DragEvent) => void;
  onResolveClipUrl: (clip: MediaClip) => Promise<string | null>;
}

const TimelineItemCard = memo(function TimelineItemCard({
  item,
  clip,
  idx,
  isSelected,
  isDraggingThis,
  isTargetingThis,
  widthPct,
  timelineZoom,
  onSelect,
  onDragStart,
  onDragOver,
  onDragLeave,
  onDrop,
  onResolveClipUrl
}: TimelineItemCardProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [cachedThumbnails, setCachedThumbnails] = useState<string[]>(() => {
    if (!clip) return [];
    const directKey = thumbnailCache.getCachedThumbnail(clip.id, item.sourceStart);
    if (directKey) return [directKey];
    if (clip.thumbnailUrl) return [clip.thumbnailUrl];
    return [];
  });
  const [isVisible, setIsVisible] = useState(false);

  // Lazy-load thumbnails only when card enters the viewport or buffer
  useEffect(() => {
    const el = cardRef.current;
    if (!el || typeof IntersectionObserver === 'undefined') {
      setIsVisible(true);
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setIsVisible(true);
            observer.disconnect();
          }
        });
      },
      { rootMargin: '250px' }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Fetch or generate thumbnails when visible
  useEffect(() => {
    if (!isVisible || !clip) return;

    let isCancelled = false;

    const loadThumbnails = async () => {
      // If image, use thumbnail or image source directly
      if (clip.type === 'image') {
        const url = clip.thumbnailUrl || clip.objectUrl;
        if (url && !isCancelled) {
          setCachedThumbnails([url]);
        }
        return;
      }

      const getUrl = async () => onResolveClipUrl(clip);

      // Determine strip frame count based on zoom and duration
      const effectivePixelWidth = (widthPct / 100) * 1200 * (timelineZoom / 100);
      const targetFrames = effectivePixelWidth > 220 && item.duration > 3 ? 3 : (effectivePixelWidth > 110 ? 2 : 1);

      if (targetFrames > 1) {
        try {
          const strip = await thumbnailCache.getOrRequestTimelineStrip(
            clip.id,
            item.sourceStart,
            item.duration,
            getUrl,
            targetFrames
          );
          if (!isCancelled && strip.length > 0) {
            setCachedThumbnails(strip);
            return;
          }
        } catch (e) {
          // fallback to single thumbnail
        }
      }

      // Single frame at sourceStart
      try {
        const thumb = await thumbnailCache.getOrRequestThumbnail(
          clip.id,
          item.sourceStart,
          getUrl,
          { width: 140, height: 80, quality: 0.65 }
        );
        if (!isCancelled && thumb) {
          setCachedThumbnails([thumb]);
        } else if (!isCancelled && clip.thumbnailUrl) {
          setCachedThumbnails([clip.thumbnailUrl]);
        }
      } catch (e) {
        if (!isCancelled && clip.thumbnailUrl) {
          setCachedThumbnails([clip.thumbnailUrl]);
        }
      }
    };

    loadThumbnails();

    return () => {
      isCancelled = true;
    };
  }, [isVisible, clip, item.sourceStart, item.duration, widthPct, timelineZoom, onResolveClipUrl]);

  return (
    <div
      ref={cardRef}
      draggable
      onDragStart={(e) => onDragStart(idx, e)}
      onDragOver={(e) => onDragOver(idx, e)}
      onDragLeave={onDragLeave}
      onDrop={(e) => onDrop(idx, e)}
      onClick={(e) => {
        e.stopPropagation();
        onSelect(item.id, item.timelineStart);
      }}
      style={{ width: `${widthPct}%` }}
      className={`h-full border-r border-[#121215] p-2 flex flex-col justify-between overflow-hidden transition-all relative cursor-grab active:cursor-grabbing select-none ${
        isDraggingThis ? 'opacity-40 scale-95 shadow-inner' : ''
      } ${
        isTargetingThis ? 'border-l-4 border-l-[#D4AF37]' : ''
      } ${
        isSelected 
          ? 'bg-[#2E2818] border-t-2 border-t-[#D4AF37] shadow-lg z-10' 
          : 'bg-[#18181C] hover:bg-[#222228]'
      }`}
    >
      {/* Background Filmstrip / Cached Thumbnail Preview with smooth gradient overlay */}
      {cachedThumbnails.length > 0 ? (
        <div className="absolute inset-0 flex pointer-events-none overflow-hidden opacity-30">
          {cachedThumbnails.map((tUrl, tIdx) => (
            <div 
              key={tIdx}
              className="flex-1 h-full bg-cover bg-center border-r border-black/40 last:border-r-0 transition-opacity duration-300"
              style={{ backgroundImage: `url(${tUrl})` }}
            />
          ))}
          {/* Subtle gradient vignette for text readability */}
          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-black/70" />
        </div>
      ) : (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-10">
          <Film className="w-8 h-8 text-white" />
        </div>
      )}

      {/* Header in Clip */}
      <div className="relative z-10 flex items-center justify-between text-[11px] font-mono drop-shadow-sm">
        <span className="font-bold text-white px-1 py-0.5 rounded bg-black/60 backdrop-blur-sm">
          #{idx + 1}
        </span>
        <span className="text-[10px] text-[#E5C158] font-bold px-1 py-0.5 rounded bg-black/60 backdrop-blur-sm">
          {item.duration.toFixed(1)}s
        </span>
      </div>

      {/* Clip Name */}
      <div className="relative z-10 text-[11px] text-[#EEE] truncate font-medium drop-shadow-sm px-0.5">
        {clip?.name || 'Ujęcie'}
      </div>

      {/* Timeline In/Out boundaries */}
      <div className="relative z-10 text-[9px] text-[#A5A5B0] font-mono flex justify-between drop-shadow-sm px-0.5">
        <span className="bg-black/40 px-1 rounded">{formatTimeSimple(item.timelineStart)}</span>
        <span className="bg-black/40 px-1 rounded">{formatTimeSimple(item.timelineStart + item.duration)}</span>
      </div>
    </div>
  );
});

export function MontageView({
  project,
  onUpdateTimelineItem,
  onDeleteTimelineItem,
  onMoveTimelineItemOrder,
  onNavigateTab
}: MontageViewProps) {
  const toast = useStudioToast();

  const clips = project.mediaLibrary || [];
  const clipMap = useMemo(() => new Map<string, MediaClip>(clips.map(c => [c.id, c])), [clips]);

  const sortedItems = useMemo(() => {
    return [...(project.timelineItems || [])].sort((a, b) => a.timelineStart - b.timelineStart);
  }, [project.timelineItems]);

  const totalDuration = useMemo(() => {
    return sortedItems.reduce((acc, item) => Math.max(acc, item.timelineStart + item.duration), 0);
  }, [sortedItems]);

  // Selected Clip
  const [selectedItemId, setSelectedItemId] = useState<string | null>(
    sortedItems.length > 0 ? sortedItems[0].id : null
  );

  // Playback & Timing
  const [currentTime, setCurrentTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [volume, setVolume] = useState(0.85);
  const [isMuted, setIsMuted] = useState(false);

  // Display & Framing Options
  const [aspectMode, setAspectMode] = useState<AspectRatioMode>('16:9');
  const [fitStyle, setFitStyle] = useState<'fit' | 'fill' | 'blur'>('fit');
  const [timelineZoom, setTimelineZoom] = useState<number>(100); // 50% to 300%
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Drag & drop state
  const [draggedIdx, setDraggedIdx] = useState<number | null>(null);
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);

  // Hover Scrub Tooltip
  const [hoverPosition, setHoverPosition] = useState<{ xPct: number; timeSec: number } | null>(null);

  // DOM Refs
  const playerContainerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const blurCanvasRef = useRef<HTMLCanvasElement>(null);
  const timelineTrackRef = useRef<HTMLDivElement>(null);
  const animationFrameRef = useRef<number | null>(null);
  const lastTickTimeRef = useRef<number>(0);
  const audioPoolRef = useRef<Map<string, HTMLAudioElement>>(new Map());
  const offscreenAudioHostRef = useRef<HTMLDivElement>(null);
  const lastActiveClipIdRef = useRef<string | null>(null);

  // Target FPS
  const targetFps = project.settings?.targetFps || 30;
  const currentFrameIndex = Math.floor(currentTime * targetFps);

  // Sync selected item
  useEffect(() => {
    if (sortedItems.length > 0 && (!selectedItemId || !sortedItems.some(i => i.id === selectedItemId))) {
      setSelectedItemId(sortedItems[0].id);
    }
  }, [sortedItems, selectedItemId]);

  const selectedItem = sortedItems.find(i => i.id === selectedItemId);
  const selectedClip = selectedItem ? clipMap.get(selectedItem.clipId) : null;

  // Selected Clip thumbnail state for Inspector
  const [inspectorThumbnail, setInspectorThumbnail] = useState<string | null>(null);

  // Find active item at currentTime
  const activeTimelineItem = useMemo(() => {
    return sortedItems.find(item => 
      currentTime >= item.timelineStart && currentTime < (item.timelineStart + item.duration)
    ) || (currentTime >= totalDuration && sortedItems.length > 0 ? sortedItems[sortedItems.length - 1] : sortedItems[0]);
  }, [sortedItems, currentTime, totalDuration]);

  const activeClip = activeTimelineItem ? clipMap.get(activeTimelineItem.clipId) : null;

  // Asynchronously resolve active clip URL if missing or dead
  const [resolvedClipUrls, setResolvedClipUrls] = useState<Record<string, string>>({});

  const resolveClipUrl = useCallback(async (clip: MediaClip): Promise<string | null> => {
    if (!clip) return null;
    if (clip.objectUrl && (clip.objectUrl.startsWith('http') || clip.objectUrl.startsWith('data:') || urlRegistry.isAlive(clip.objectUrl))) {
      return clip.objectUrl;
    }
    if (clip.file) {
      try {
        const u = urlRegistry.create(clip.file);
        clip.objectUrl = u;
        return u;
      } catch (e) {}
    }
    const fresh = await resolveClipMediaUrl(clip);
    if (fresh) {
      setResolvedClipUrls(prev => ({ ...prev, [clip.id]: fresh }));
      return fresh;
    }
    return null;
  }, []);

  useEffect(() => {
    if (!activeClip) return;
    if (activeClip.objectUrl && (activeClip.objectUrl.startsWith('http') || activeClip.objectUrl.startsWith('data:') || urlRegistry.isAlive(activeClip.objectUrl))) {
      return;
    }
    let isCancelled = false;
    resolveClipUrl(activeClip).then(fresh => {
      if (!isCancelled && fresh) {
        setResolvedClipUrls(prev => ({ ...prev, [activeClip.id]: fresh }));
      }
    });
    return () => { isCancelled = true; };
  }, [activeClip, resolveClipUrl]);

  // Update Inspector thumbnail when selected item or trim changes
  useEffect(() => {
    if (!selectedClip || !selectedItem) {
      setInspectorThumbnail(null);
      return;
    }
    let isCancelled = false;
    const direct = thumbnailCache.getCachedThumbnail(selectedClip.id, selectedItem.sourceStart);
    if (direct) {
      setInspectorThumbnail(direct);
      return;
    }
    if (selectedClip.thumbnailUrl) {
      setInspectorThumbnail(selectedClip.thumbnailUrl);
    }
    thumbnailCache.getOrRequestThumbnail(
      selectedClip.id,
      selectedItem.sourceStart,
      () => resolveClipUrl(selectedClip),
      { width: 240, height: 135, quality: 0.72 }
    ).then((thumb) => {
      if (!isCancelled && thumb) {
        setInspectorThumbnail(thumb);
      }
    });

    return () => { isCancelled = true; };
  }, [selectedClip, selectedItem?.sourceStart, resolveClipUrl]);

  const activeMediaSourceUrl = useMemo(() => {
    if (!activeClip) return '';
    if (activeClip.objectUrl && (activeClip.objectUrl.startsWith('http') || activeClip.objectUrl.startsWith('data:') || urlRegistry.isAlive(activeClip.objectUrl))) {
      return activeClip.objectUrl;
    }
    if (activeClip.file) {
      try {
        const u = urlRegistry.create(activeClip.file);
        activeClip.objectUrl = u;
        return u;
      } catch (e) {}
    }
    if (resolvedClipUrls[activeClip.id]) {
      return resolvedClipUrls[activeClip.id];
    }
    if (activeClip.type === 'image') {
      return activeClip.thumbnailUrl || '';
    }
    return '';
  }, [activeClip, resolvedClipUrls]);

  const activeTitleCard = useMemo(() => {
    if (!activeTimelineItem?.titleCard?.enabled) return null;
    const itemOffset = currentTime - activeTimelineItem.timelineStart;
    const cardDuration = Math.min(Math.max(0.8, activeTimelineItem.duration * 0.35), activeTimelineItem.titleCard.duration || 2.5);
    if (itemOffset < cardDuration) {
      return activeTimelineItem.titleCard;
    }
    return null;
  }, [currentTime, activeTimelineItem]);

  // Playback Loop via rAF
  useEffect(() => {
    if (!isPlaying) {
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
      if (videoRef.current && !videoRef.current.paused) videoRef.current.pause();
      audioPoolRef.current.forEach(a => { try { a.pause(); } catch(e) {} });
      return;
    }

    lastTickTimeRef.current = performance.now();

    const loop = (now: number) => {
      const delta = (now - lastTickTimeRef.current) / 1000;
      lastTickTimeRef.current = now;

      const vid = videoRef.current;
      if (vid && !vid.paused && vid.readyState >= 2 && activeTimelineItem && activeClip?.type === 'video') {
        const speed = activeTimelineItem.speed || 1;
        const vidElapsed = Math.max(0, (vid.currentTime - activeTimelineItem.sourceStart) / speed);
        const syncCurrent = activeTimelineItem.timelineStart + vidElapsed;
        if (syncCurrent >= totalDuration) {
          setIsPlaying(false);
          setCurrentTime(0);
          lastActiveClipIdRef.current = null;
          return;
        }
        setCurrentTime(syncCurrent);
      } else {
        setCurrentTime(prev => {
          const next = prev + delta;
          if (next >= totalDuration) {
            setIsPlaying(false);
            lastActiveClipIdRef.current = null;
            return 0;
          }
          return next;
        });
      }

      animationFrameRef.current = requestAnimationFrame(loop);
    };

    animationFrameRef.current = requestAnimationFrame(loop);
    return () => {
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
    };
  }, [isPlaying, totalDuration, activeTimelineItem, activeClip]);

  // Sync HTML5 video element with active item and currentTime
  useEffect(() => {
    const vid = videoRef.current;
    if (!vid || !activeTimelineItem || !activeClip || activeClip.type === 'image') {
      lastActiveClipIdRef.current = null;
      return;
    }

    if (activeMediaSourceUrl && vid.src !== activeMediaSourceUrl) {
      vid.src = activeMediaSourceUrl;
    }

    const timeInItem = Math.max(0, currentTime - activeTimelineItem.timelineStart);
    const speed = activeTimelineItem.speed || 1;
    const targetSourceTime = activeTimelineItem.sourceStart + (timeInItem * speed);

    const isNewClip = lastActiveClipIdRef.current !== activeClip.id;
    if (isNewClip) {
      lastActiveClipIdRef.current = activeClip.id;
      if (Number.isFinite(targetSourceTime)) {
        try { vid.currentTime = targetSourceTime; } catch (e) {}
      }
    } else if (!isPlaying || Math.abs(vid.currentTime - targetSourceTime) > 0.8) {
      if (Number.isFinite(targetSourceTime)) {
        try { vid.currentTime = targetSourceTime; } catch (e) {}
      }
    }

    const finalMuted = isMuted || Boolean(activeTimelineItem.muted);
    const finalVolume = finalMuted ? 0 : Math.min(1, Math.max(0, volume * (activeTimelineItem.volume ?? 1)));
    if (vid.muted !== finalMuted) {
      vid.muted = finalMuted;
    }
    vid.volume = finalVolume;
    vid.playbackRate = speed;

    if (isPlaying && vid.paused) {
      vid.play().catch(() => {});
    } else if (!isPlaying && !vid.paused) {
      vid.pause();
    }
  }, [currentTime, activeTimelineItem, activeClip, isPlaying, volume, isMuted, activeMediaSourceUrl]);

  // Sync background audio tracks in MontageView
  useEffect(() => {
    const audioPool = audioPoolRef.current;
    (project.audioTracks || []).forEach(track => {
      let audio = audioPool.get(track.id);
      if (!audio) {
        audio = document.createElement('audio');
        audio.preload = 'auto';
        if (track.file) {
          try {
            audio.src = urlRegistry.create(track.file);
          } catch (e) {
            if (track.objectUrl) audio.src = track.objectUrl;
          }
        } else if (track.objectUrl) {
          audio.src = track.objectUrl;
        } else {
          resolveAudioTrackUrl(track).then(fresh => {
            if (fresh && audio) audio.src = fresh;
          });
        }
        if (offscreenAudioHostRef.current && !audio.parentNode) {
          offscreenAudioHostRef.current.appendChild(audio);
        }
        audioPool.set(track.id, audio);
      }

      const isActive = currentTime >= track.timelineStart && currentTime < track.timelineStart + track.duration;
      if (isActive && isPlaying && !isMuted && !track.muted) {
        const trackOffset = currentTime - track.timelineStart;
        const trackLocalTime = track.sourceStart + trackOffset;

        if (Math.abs(audio.currentTime - trackLocalTime) > 0.4) {
          if (audio.readyState >= 1) {
            audio.currentTime = trackLocalTime;
          }
        }

        let vol = (track.volume ?? 1) * volume * (project.settings?.audioBalance?.musicVolume ?? 0.8);
        audio.volume = Math.max(0, Math.min(1, vol));

        if (audio.paused) {
          audio.play().catch(() => {});
        }
      } else {
        if (!audio.paused) {
          try { audio.pause(); } catch (e) {}
        }
      }
    });
  }, [currentTime, isPlaying, isMuted, volume, project.audioTracks, project.settings?.audioBalance]);

  // Render lightweight blurred background if 'blur' style is enabled
  useEffect(() => {
    const vid = videoRef.current;
    const canvas = blurCanvasRef.current;
    if (!vid || !canvas || fitStyle !== 'blur') return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Use small 64x36 scratch canvas for blur efficiency without GPU lag
    canvas.width = 64;
    canvas.height = 36;
    try {
      ctx.drawImage(vid, 0, 0, 64, 36);
    } catch {}
  }, [currentTime, fitStyle, activeClip]);

  const handlePlayToggle = () => {
    if (totalDuration === 0) return;
    const next = !isPlaying;
    if (currentTime >= totalDuration) {
      setCurrentTime(0);
      lastActiveClipIdRef.current = null;
    }
    setIsPlaying(next);
    if (next) {
      if (videoRef.current && activeClip?.type === 'video') {
        videoRef.current.muted = isMuted || Boolean(activeTimelineItem?.muted);
        videoRef.current.play().catch(() => {});
      }
      (project.audioTracks || []).forEach(track => {
        const audio = audioPoolRef.current.get(track.id);
        if (audio && !track.muted && !isMuted) {
          audio.play().catch(() => {});
        }
      });
    } else {
      if (videoRef.current && !videoRef.current.paused) videoRef.current.pause();
      audioPoolRef.current.forEach(a => { try { a.pause(); } catch (e) {} });
    }
  };

  const handleStop = () => {
    setIsPlaying(false);
    setCurrentTime(0);
    if (videoRef.current) videoRef.current.currentTime = 0;
  };

  const handleSeek = (time: number) => {
    const clamped = Math.max(0, Math.min(time, totalDuration));
    setCurrentTime(clamped);
  };

  // Skip ±5 seconds
  const handleSkip = (seconds: number) => {
    handleSeek(currentTime + seconds);
  };

  // Step exact frames
  const handleStepFrames = (frames: number) => {
    const frameInterval = 1 / targetFps;
    handleSeek(currentTime + (frames * frameInterval));
  };

  // Trim Handler for Start and End handles
  const handleTrimChange = (type: 'start' | 'end', value: number) => {
    if (!selectedItem || !selectedClip) return;
    const sourceDuration = selectedClip.duration || 10;

    if (type === 'start') {
      const clampedStart = Math.max(0, Math.min(value, selectedItem.sourceEnd - 0.2));
      const newDur = selectedItem.sourceEnd - clampedStart;
      onUpdateTimelineItem(selectedItem.id, {
        sourceStart: clampedStart,
        duration: newDur
      });
      handleSeek(selectedItem.timelineStart);
    } else {
      const clampedEnd = Math.min(sourceDuration, Math.max(value, selectedItem.sourceStart + 0.2));
      const newDur = clampedEnd - selectedItem.sourceStart;
      onUpdateTimelineItem(selectedItem.id, {
        sourceEnd: clampedEnd,
        duration: newDur
      });
      handleSeek(selectedItem.timelineStart + newDur);
    }
  };

  // Step selected item trim by ±1 frame
  const handleStepTrim = (type: 'start' | 'end', frames: number) => {
    if (!selectedItem) return;
    const frameInterval = 1 / targetFps;
    const curVal = type === 'start' ? selectedItem.sourceStart : selectedItem.sourceEnd;
    handleTrimChange(type, curVal + (frames * frameInterval));
  };

  // Move Order
  const handleMoveOrder = (direction: 'prev' | 'next') => {
    if (!selectedItem) return;
    const currentIndex = sortedItems.findIndex(i => i.id === selectedItem.id);
    if (currentIndex === -1) return;

    const targetIndex = direction === 'prev' ? currentIndex - 1 : currentIndex + 1;
    if (targetIndex >= 0 && targetIndex < sortedItems.length) {
      onMoveTimelineItemOrder(currentIndex, targetIndex);
    }
  };

  // Fullscreen toggle
  const toggleFullscreen = () => {
    if (!playerContainerRef.current) return;
    if (!document.fullscreenElement) {
      playerContainerRef.current.requestFullscreen().catch(() => {});
      setIsFullscreen(true);
    } else {
      document.exitFullscreen().catch(() => {});
      setIsFullscreen(false);
    }
  };

  // Keyboard Shortcuts (Space for Play/Pause, Left/Right)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return;

      if (e.key === ' ' || e.code === 'Space') {
        e.preventDefault();
        handlePlayToggle();
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        handleStepFrames(e.shiftKey ? -5 : -1);
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        handleStepFrames(e.shiftKey ? 5 : 1);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isPlaying, totalDuration, currentTime]);

  // Handle timeline track click
  const handleTrackClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const pct = Math.max(0, Math.min(1, clickX / rect.width));
    handleSeek(pct * totalDuration);
  }, [totalDuration]);

  // Handle hover scrub move
  const handleTrackMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const xPct = Math.max(0, Math.min(100, (x / rect.width) * 100));
    const timeSec = (xPct / 100) * totalDuration;
    setHoverPosition({ xPct, timeSec });
  }, [totalDuration]);

  const handleTrackMouseLeave = useCallback(() => {
    setHoverPosition(null);
  }, []);

  // Drag handlers
  const handleCardDragStart = useCallback((idx: number, e: React.DragEvent) => {
    e.stopPropagation();
    setDraggedIdx(idx);
    e.dataTransfer.setData('text/plain', String(idx));
    e.dataTransfer.effectAllowed = 'move';
  }, []);

  const handleCardDragOver = useCallback((idx: number, e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (dragOverIdx !== idx) setDragOverIdx(idx);
  }, [dragOverIdx]);

  const handleCardDragLeave = useCallback(() => {
    setDragOverIdx(null);
  }, []);

  const handleCardDrop = useCallback((idx: number, e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const fromIdx = Number(e.dataTransfer.getData('text/plain'));
    setDraggedIdx(null);
    setDragOverIdx(null);
    if (!isNaN(fromIdx) && fromIdx !== idx) {
      onMoveTimelineItemOrder(fromIdx, idx);
      toast.showSuccess(`Przestawiono ujęcie na pozycję #${idx + 1}`);
    }
  }, [onMoveTimelineItemOrder, toast]);

  const handleCardSelect = useCallback((id: string, start: number) => {
    setSelectedItemId(id);
    handleSeek(start);
  }, []);

  return (
    <div className="max-w-6xl mx-auto w-full px-3 sm:px-6 py-4 sm:py-6 flex flex-col gap-5 sm:gap-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#242428] pb-4">
        <div>
          <div className="flex items-center gap-2 text-[#D4AF37] text-xs font-semibold tracking-wider uppercase mb-0.5">
            <Film className="w-3.5 h-3.5" />
            <span>Timeline 2.0 • Studio Montażu</span>
          </div>
          <h1 className="text-xl sm:text-2xl font-bold text-white tracking-tight">
            Podgląd i Precyzyjne Cięcie Sekwencji
          </h1>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => onNavigateTab('export')}
            className="flex items-center gap-2 px-5 py-2.5 bg-[#D4AF37] hover:bg-[#E5C158] text-black font-extrabold text-xs sm:text-sm rounded-xl transition-all shadow-md cursor-pointer uppercase tracking-wider min-h-[44px]"
          >
            <span>SCAL I EKSPORTUJ</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {sortedItems.length === 0 ? (
        <div className="bg-[#121215] border border-[#242428] rounded-2xl p-10 text-center flex flex-col items-center justify-center gap-4 my-6">
          <Film className="w-10 h-10 text-[#666]" />
          <h2 className="text-white font-bold text-lg">Brak filmów na osi czasu</h2>
          <p className="text-xs text-[#888892] max-w-sm">Dodaj filmy, aby rozpocząć montaż, ustawić kolejność i precyzyjnie przyciąć klatki.</p>
          <button
            onClick={() => onNavigateTab('project')}
            className="px-5 py-2.5 bg-[#D4AF37] text-black font-bold text-xs rounded-xl cursor-pointer min-h-[44px]"
          >
            DODAJ FILMY
          </button>
        </div>
      ) : (
        <>
          {/* Main Cinema Video Player */}
          <div 
            ref={playerContainerRef}
            className="bg-black border border-[#26262B] rounded-2xl overflow-hidden shadow-2xl flex flex-col items-center relative"
          >
            {/* Viewport with Aspect Ratio constraint */}
            <div 
              className={`relative w-full flex items-center justify-center overflow-hidden bg-black transition-all ${
                aspectMode === '16:9' ? 'aspect-video max-h-[50vh]' :
                aspectMode === '9:16' ? 'aspect-[9/16] max-h-[55vh]' :
                aspectMode === '4:3' ? 'aspect-[4/3] max-h-[50vh]' :
                'aspect-square max-h-[50vh]'
              }`}
            >
              {/* Blurred background canvas when fitStyle === 'blur' */}
              {fitStyle === 'blur' && (
                <canvas 
                  ref={blurCanvasRef}
                  className="absolute inset-0 w-full h-full object-cover filter blur-xl opacity-40 scale-110 pointer-events-none"
                />
              )}

              {activeClip?.type === 'image' ? (
                <img
                  src={activeMediaSourceUrl || activeClip.thumbnailUrl || ''}
                  alt={activeClip.name}
                  className={`relative z-10 w-full h-full pointer-events-none ${
                    fitStyle === 'fill' ? 'object-cover' : 'object-contain'
                  }`}
                />
              ) : (
                <video
                  ref={videoRef}
                  playsInline
                  className={`relative z-10 w-full h-full pointer-events-none ${
                    fitStyle === 'fill' ? 'object-cover' : 'object-contain'
                  }`}
                />
              )}

              {/* Offscreen Audio Pool Host */}
              <div
                ref={offscreenAudioHostRef}
                style={{ position: 'fixed', bottom: 0, right: 0, width: 16, height: 16, opacity: 0.001, pointerEvents: 'none', zIndex: -9999 }}
                aria-hidden="true"
              />

              {/* Title Card Overlay Preview */}
              {activeTitleCard && (
                <div 
                  className="absolute inset-0 z-30 flex flex-col items-center justify-center p-8 transition-opacity duration-300 pointer-events-none"
                  style={{
                    background: activeTitleCard.backgroundColor === 'gradient'
                      ? 'linear-gradient(135deg, #111827 0%, #030712 100%)'
                      : activeTitleCard.backgroundColor || 'rgba(0, 0, 0, 0.85)'
                  }}
                >
                  <h3 className="text-xl sm:text-2xl font-bold font-serif-luxury text-[#F2EFE8] tracking-widest uppercase text-center mb-2">
                    {activeTitleCard.text}
                  </h3>
                  {activeTitleCard.subtitle && (
                    <p className="text-xs sm:text-sm font-sans tracking-wide text-[#D4AF37] text-center">
                      {activeTitleCard.subtitle}
                    </p>
                  )}
                </div>
              )}

              {/* Active Clip Badge */}
              {activeClip && (
                <div className="absolute top-3 left-3 z-20 bg-black/80 backdrop-blur-md px-3 py-1.5 rounded-lg border border-white/10 text-xs font-mono text-white flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-[#D4AF37]" />
                  <span className="font-semibold truncate max-w-[180px] sm:max-w-[260px]">{activeClip.name}</span>
                </div>
              )}

              {/* Frame & Precision Overlay */}
              <div className="absolute top-3 right-3 z-20 bg-black/80 backdrop-blur-md px-2.5 py-1 rounded-lg border border-white/10 text-[11px] font-mono text-[#D4AF37]">
                KLATKA #{currentFrameIndex} • {formatTimePrecise(currentTime)}
              </div>
            </div>

            {/* Transport Control Bar */}
            <div className="w-full bg-[#121215] border-t border-[#222226] p-3 sm:p-4 flex flex-wrap items-center justify-between gap-3">
              {/* Transport Buttons */}
              <div className="flex items-center gap-1.5 sm:gap-2">
                <button
                  onClick={handleStop}
                  className="p-2.5 rounded-xl bg-[#1A1A1E] hover:bg-[#24242A] text-[#AAA] hover:text-white transition-colors cursor-pointer min-h-[44px] min-w-[44px] flex items-center justify-center"
                  title="Stop (Reset do początku)"
                >
                  <Square className="w-4 h-4 fill-current" />
                </button>

                <button
                  onClick={() => handleSkip(-5)}
                  className="px-2.5 py-2 rounded-xl bg-[#1A1A1E] hover:bg-[#24242A] text-[#AAA] hover:text-white transition-colors cursor-pointer text-xs font-mono font-bold min-h-[44px] flex items-center justify-center"
                  title="Cofnij o 5 sekund"
                >
                  -5s
                </button>

                <button
                  onClick={() => handleStepFrames(-1)}
                  className="p-2.5 rounded-xl bg-[#1A1A1E] hover:bg-[#24242A] text-[#AAA] hover:text-white transition-colors cursor-pointer min-h-[44px] min-w-[44px] flex items-center justify-center font-mono text-xs"
                  title="Cofnij o 1 klatkę"
                >
                  -1 kl.
                </button>

                <button
                  onClick={handlePlayToggle}
                  className="px-6 py-2.5 rounded-xl bg-[#D4AF37] hover:bg-[#E5C158] text-black font-extrabold flex items-center gap-2 transition-all shadow-md cursor-pointer min-h-[44px]"
                  title={isPlaying ? 'Pauza (Spacja)' : 'Odtwórz (Spacja)'}
                >
                  {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 fill-black" />}
                  <span className="text-xs uppercase font-mono tracking-wider">{isPlaying ? 'PAUZA' : 'PLAY'}</span>
                </button>

                <button
                  onClick={() => handleStepFrames(1)}
                  className="p-2.5 rounded-xl bg-[#1A1A1E] hover:bg-[#24242A] text-[#AAA] hover:text-white transition-colors cursor-pointer min-h-[44px] min-w-[44px] flex items-center justify-center font-mono text-xs"
                  title="Następna klatka (+1)"
                >
                  +1 kl.
                </button>

                <button
                  onClick={() => handleSkip(5)}
                  className="px-2.5 py-2 rounded-xl bg-[#1A1A1E] hover:bg-[#24242A] text-[#AAA] hover:text-white transition-colors cursor-pointer text-xs font-mono font-bold min-h-[44px] flex items-center justify-center"
                  title="Przewiń o 5 sekund"
                >
                  +5s
                </button>
              </div>

              {/* Timecode Display */}
              <div className="font-mono text-xs sm:text-sm text-[#DDD] flex items-center gap-2 bg-[#18181C] px-3.5 py-2 rounded-xl border border-[#28282E]">
                <Clock className="w-3.5 h-3.5 text-[#D4AF37]" />
                <span className="text-white font-bold">{formatTimePrecise(currentTime)}</span>
                <span className="text-[#666]">/</span>
                <span className="text-[#888]">{formatTimeSimple(totalDuration)}</span>
              </div>

              {/* Aspect Ratio, Fit Mode & Volume Controls */}
              <div className="flex items-center gap-2">
                {/* Aspect Switcher */}
                <div className="flex items-center gap-1 bg-[#18181C] p-1 rounded-xl border border-[#28282E] text-xs font-mono">
                  {(['16:9', '9:16', '1:1'] as const).map(mode => (
                    <button
                      key={mode}
                      onClick={() => setAspectMode(mode)}
                      className={`px-2 py-1 rounded-lg transition-colors cursor-pointer ${
                        aspectMode === mode ? 'bg-[#D4AF37] text-black font-bold' : 'text-[#888] hover:text-white'
                      }`}
                    >
                      {mode}
                    </button>
                  ))}
                </div>

                {/* Framing Fit Mode */}
                <button
                  onClick={() => {
                    const next = fitStyle === 'fit' ? 'blur' : (fitStyle === 'blur' ? 'fill' : 'fit');
                    setFitStyle(next);
                  }}
                  className="px-2.5 py-1.5 bg-[#18181C] border border-[#28282E] rounded-xl text-xs font-mono text-white flex items-center gap-1.5 hover:border-[#D4AF37]/50 cursor-pointer min-h-[40px]"
                  title="Przełącz styl kadrowania (FIT, BLUR, FILL)"
                >
                  <Eye className="w-3.5 h-3.5 text-[#D4AF37]" />
                  <span className="uppercase font-bold">{fitStyle}</span>
                </button>

                {/* Volume & Mute */}
                <div className="flex items-center gap-2 bg-[#18181C] px-3 py-1.5 rounded-xl border border-[#28282E] min-h-[40px]">
                  <button
                    onClick={() => setIsMuted(!isMuted)}
                    className="text-[#AAA] hover:text-white cursor-pointer"
                    title={isMuted ? 'Wyłącz wyciszenie' : 'Wycisz dźwięk'}
                  >
                    {isMuted ? <VolumeX className="w-4 h-4 text-rose-400" /> : <Volume2 className="w-4 h-4 text-emerald-400" />}
                  </button>
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.05}
                    value={isMuted ? 0 : volume}
                    onChange={(e) => {
                      setVolume(parseFloat(e.target.value));
                      if (isMuted) setIsMuted(false);
                    }}
                    className="w-16 accent-[#D4AF37] cursor-pointer"
                  />
                </div>

                {/* Fullscreen Button */}
                <button
                  onClick={toggleFullscreen}
                  className="p-2.5 rounded-xl bg-[#18181C] hover:bg-[#24242A] text-[#AAA] hover:text-white border border-[#28282E] transition-colors cursor-pointer min-h-[40px] min-w-[40px] flex items-center justify-center"
                  title="Pełny ekran"
                >
                  {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
                </button>
              </div>
            </div>
          </div>

          {/* Timeline 2.0 Sequence Section with Thumbnail Caching */}
          <div className="bg-[#121215] border border-[#26262B] rounded-2xl p-4 sm:p-5 shadow-xl space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3 text-xs font-mono text-[#888892]">
              <span className="uppercase flex items-center gap-2 text-white font-semibold">
                <Layers className="w-4 h-4 text-[#D4AF37]" />
                Oś Czasu 2.0 • Kolejność i Buforowane Klatki ({sortedItems.length} ujęć)
              </span>

              {/* Timeline Zoom Controls */}
              <div className="flex items-center gap-1.5 bg-[#18181C] p-1 rounded-xl border border-[#28282E]">
                <button
                  onClick={() => setTimelineZoom(prev => Math.max(50, prev - 25))}
                  className="p-1 hover:text-white rounded cursor-pointer"
                  title="Pomniejsz oś czasu"
                >
                  <ZoomOut className="w-3.5 h-3.5" />
                </button>
                <span className="px-1.5 text-[11px] font-bold text-white">{timelineZoom}%</span>
                <button
                  onClick={() => setTimelineZoom(prev => Math.min(300, prev + 25))}
                  className="p-1 hover:text-white rounded cursor-pointer"
                  title="Powiększ oś czasu"
                >
                  <ZoomIn className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => setTimelineZoom(100)}
                  className="px-1.5 py-0.5 text-[10px] text-[#D4AF37] hover:underline cursor-pointer"
                >
                  Reset
                </button>
              </div>
            </div>

            {/* Scrollable Track Container */}
            <div 
              ref={timelineTrackRef}
              onWheel={(e) => {
                if (timelineTrackRef.current && (e.shiftKey || Math.abs(e.deltaX) > 0 || Math.abs(e.deltaY) > 0)) {
                  // Allow smooth horizontal scrolling with mouse wheel
                  if (!e.shiftKey && Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
                    timelineTrackRef.current.scrollLeft += e.deltaY;
                  }
                }
              }}
              className="w-full overflow-x-auto overflow-y-hidden custom-scrollbar pb-1 select-none"
            >
              <div 
                style={{ width: `${timelineZoom}%`, minWidth: '100%' }}
                onClick={handleTrackClick}
                onMouseMove={handleTrackMouseMove}
                onMouseLeave={handleTrackMouseLeave}
                className="relative h-20 bg-[#141417] rounded-xl border border-[#28282E] overflow-hidden flex cursor-pointer transition-[width] duration-150 shadow-inner"
              >
                {/* Render Memoized Timeline Item Blocks */}
                {sortedItems.map((item, idx) => {
                  const clip = clipMap.get(item.clipId);
                  const widthPct = Math.max(3, (item.duration / Math.max(0.1, totalDuration)) * 100);
                  const isSelected = item.id === selectedItemId;
                  const isDraggingThis = draggedIdx === idx;
                  const isTargetingThis = dragOverIdx === idx;

                  return (
                    <TimelineItemCard
                      key={item.id}
                      item={item}
                      clip={clip}
                      idx={idx}
                      isSelected={isSelected}
                      isDraggingThis={isDraggingThis}
                      isTargetingThis={isTargetingThis}
                      widthPct={widthPct}
                      timelineZoom={timelineZoom}
                      onSelect={handleCardSelect}
                      onDragStart={handleCardDragStart}
                      onDragOver={handleCardDragOver}
                      onDragLeave={handleCardDragLeave}
                      onDrop={handleCardDrop}
                      onResolveClipUrl={resolveClipUrl}
                    />
                  );
                })}

                {/* Hover Scrubbing Playhead & Time Preview */}
                {hoverPosition && (
                  <div
                    className="absolute top-0 bottom-0 w-px bg-white/50 pointer-events-none z-15 flex flex-col items-center"
                    style={{ left: `${hoverPosition.xPct}%` }}
                  >
                    <div className="absolute -top-1 bg-black/90 text-white font-mono text-[9px] px-1.5 py-0.5 rounded border border-white/20 whitespace-nowrap shadow-md">
                      {formatTimeSimple(hoverPosition.timeSec)}
                    </div>
                  </div>
                )}

                {/* Smooth Real-Time Playhead Marker */}
                {totalDuration > 0 && (
                  <div 
                    className="absolute top-0 bottom-0 w-0.5 bg-[#FDE047] pointer-events-none z-20 shadow-[0_0_10px_rgba(253,224,71,0.9)] transition-[left] duration-75"
                    style={{ left: `${(currentTime / totalDuration) * 100}%` }}
                  >
                    <div className="w-3 h-3 -ml-1.5 -top-1.5 bg-[#FDE047] rotate-45 rounded-sm shadow-md" />
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Selected Clip Inspector & Precision Trim (Req 7, 20 & 25) */}
          {selectedItem && selectedClip && (
            <div className="bg-[#121215] border border-[#26262B] rounded-2xl p-5 sm:p-6 shadow-xl space-y-6">
              {/* Top Row: Clip Meta & Actions */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#222226] pb-4">
                <div className="flex items-center gap-3">
                  <div className="w-16 h-12 rounded-xl bg-black overflow-hidden border border-[#303038] shrink-0 relative flex items-center justify-center">
                    {inspectorThumbnail ? (
                      <img src={inspectorThumbnail} alt={selectedClip.name} className="w-full h-full object-cover" />
                    ) : (
                      <Film className="w-5 h-5 text-[#666]" />
                    )}
                    <span className="absolute bottom-1 right-1 bg-black/70 text-[9px] font-mono text-white px-1 rounded">
                      {selectedClip.type === 'image' ? 'IMG' : 'VID'}
                    </span>
                  </div>
                  <div>
                    <h3 className="text-sm sm:text-base font-bold text-white truncate max-w-sm sm:max-w-md">
                      {selectedClip.name}
                    </h3>
                    <p className="text-xs text-[#888892] font-mono mt-0.5">
                      Oryginalna długość: {selectedClip.duration.toFixed(2)}s • Rozdzielczość: {selectedClip.width}×{selectedClip.height}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleMoveOrder('prev')}
                    className="p-2.5 bg-[#18181C] hover:bg-[#24242A] text-white rounded-xl border border-[#28282E] transition-colors cursor-pointer min-h-[44px] min-w-[44px] flex items-center justify-center"
                    title="Przesuń ujęcie wcześniej w filmie"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleMoveOrder('next')}
                    className="p-2.5 bg-[#18181C] hover:bg-[#24242A] text-white rounded-xl border border-[#28282E] transition-colors cursor-pointer min-h-[44px] min-w-[44px] flex items-center justify-center"
                    title="Przesuń ujęcie później w filmie"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => {
                      onDeleteTimelineItem(selectedItem.id);
                      toast.showInfo('Ujęcie usunięte z osi czasu.');
                    }}
                    className="p-2.5 bg-rose-950/40 hover:bg-rose-900/60 text-rose-300 rounded-xl border border-rose-800/40 transition-colors cursor-pointer min-h-[44px] min-w-[44px] flex items-center justify-center"
                    title="Usuń ujęcie z filmu"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Exact Trim 2.0 Numeric Readout (START, END, DURATION) */}
              <div className="space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h4 className="text-xs font-bold text-[#D4AF37] uppercase font-mono flex items-center gap-2">
                    <Scissors className="w-3.5 h-3.5" />
                    Precyzyjne Przycinanie Ujęcia (Trim 2.0)
                  </h4>
                  <div className="flex items-center gap-3 text-xs font-mono font-bold">
                    <span className="text-white bg-[#1A1A1E] px-3 py-1 rounded-lg border border-[#2A2A30]">
                      START {formatTimePrecise(selectedItem.sourceStart)}
                    </span>
                    <span className="text-white bg-[#1A1A1E] px-3 py-1 rounded-lg border border-[#2A2A30]">
                      END {formatTimePrecise(selectedItem.sourceEnd)}
                    </span>
                    <span className="text-[#E5C158] bg-[#2E2818] px-3 py-1 rounded-lg border border-[#D4AF37]/50">
                      DURATION {formatTimePrecise(selectedItem.duration)}
                    </span>
                  </div>
                </div>

                {/* Range Sliders for Start & End */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="bg-[#16161A] p-4 rounded-xl border border-[#24242A] space-y-2">
                    <div className="flex justify-between items-center text-xs font-mono">
                      <span className="text-[#888892]">Początek (Start):</span>
                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={() => handleStepTrim('start', -1)}
                          className="px-2 py-0.5 rounded bg-[#202026] text-white hover:bg-[#2A2A32] cursor-pointer"
                        >
                          -1 kl.
                        </button>
                        <span className="text-white font-bold">{selectedItem.sourceStart.toFixed(2)}s</span>
                        <button
                          onClick={() => handleStepTrim('start', 1)}
                          className="px-2 py-0.5 rounded bg-[#202026] text-white hover:bg-[#2A2A32] cursor-pointer"
                        >
                          +1 kl.
                        </button>
                      </div>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={selectedItem.sourceEnd - 0.2}
                      step={0.033}
                      value={selectedItem.sourceStart}
                      onChange={(e) => handleTrimChange('start', parseFloat(e.target.value))}
                      className="w-full accent-[#D4AF37] cursor-pointer"
                    />
                  </div>

                  <div className="bg-[#16161A] p-4 rounded-xl border border-[#24242A] space-y-2">
                    <div className="flex justify-between items-center text-xs font-mono">
                      <span className="text-[#888892]">Koniec (End):</span>
                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={() => handleStepTrim('end', -1)}
                          className="px-2 py-0.5 rounded bg-[#202026] text-white hover:bg-[#2A2A32] cursor-pointer"
                        >
                          -1 kl.
                        </button>
                        <span className="text-white font-bold">{selectedItem.sourceEnd.toFixed(2)}s</span>
                        <button
                          onClick={() => handleStepTrim('end', 1)}
                          className="px-2 py-0.5 rounded bg-[#202026] text-white hover:bg-[#2A2A32] cursor-pointer"
                        >
                          +1 kl.
                        </button>
                      </div>
                    </div>
                    <input
                      type="range"
                      min={selectedItem.sourceStart + 0.2}
                      max={selectedClip.duration}
                      step={0.033}
                      value={selectedItem.sourceEnd}
                      onChange={(e) => handleTrimChange('end', parseFloat(e.target.value))}
                      className="w-full accent-[#D4AF37] cursor-pointer"
                    />
                  </div>
                </div>
              </div>

              {/* Clip Adjustments: Framing, Rotation, Audio */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-3 border-t border-[#222226]">
                {/* Fit Mode */}
                <div>
                  <label className="text-[11px] font-mono text-[#888892] uppercase block mb-1.5 font-medium">Kadrowanie Ujęcia</label>
                  <div className="grid grid-cols-3 gap-1 bg-[#18181C] p-1 rounded-xl border border-[#28282E]">
                    {(['fit', 'fill', 'original'] as const).map(mode => (
                      <button
                        key={mode}
                        onClick={() => onUpdateTimelineItem(selectedItem.id, { fitMode: mode })}
                        className={`py-1.5 text-xs font-bold rounded-lg uppercase cursor-pointer transition-all ${
                          (selectedItem.fitMode || 'fit') === mode
                            ? 'bg-[#D4AF37] text-black shadow-md'
                            : 'text-[#888892] hover:text-white'
                        }`}
                      >
                        {mode === 'fit' ? 'FIT' : (mode === 'fill' ? 'FILL' : 'ORIG')}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Rotation */}
                <div>
                  <label className="text-[11px] font-mono text-[#888892] uppercase block mb-1.5 font-medium">Obrót Ujęcia</label>
                  <div className="grid grid-cols-4 gap-1 bg-[#18181C] p-1 rounded-xl border border-[#28282E]">
                    {[0, 90, 180, 270].map(deg => (
                      <button
                        key={deg}
                        onClick={() => onUpdateTimelineItem(selectedItem.id, { rotation: deg })}
                        className={`py-1.5 text-xs font-mono font-bold rounded-lg cursor-pointer transition-all ${
                          (selectedItem.rotation || 0) === deg
                            ? 'bg-[#D4AF37] text-black shadow-md'
                            : 'text-[#888892] hover:text-white'
                        }`}
                      >
                        {deg}°
                      </button>
                    ))}
                  </div>
                </div>

                {/* Volume & Mute */}
                <div>
                  <div className="flex justify-between items-center mb-1.5">
                    <label className="text-[11px] font-mono text-[#888892] uppercase font-medium">Głośność Ujęcia</label>
                    <button
                      onClick={() => onUpdateTimelineItem(selectedItem.id, { muted: !selectedItem.muted })}
                      className={`text-xs flex items-center gap-1 font-mono cursor-pointer ${
                        selectedItem.muted ? 'text-rose-400' : 'text-emerald-400'
                      }`}
                    >
                      {selectedItem.muted ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
                      <span>{selectedItem.muted ? 'Wyciszone' : `${Math.round(selectedItem.volume * 100)}%`}</span>
                    </button>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={1.5}
                    step={0.05}
                    disabled={selectedItem.muted}
                    value={selectedItem.volume}
                    onChange={(e) => onUpdateTimelineItem(selectedItem.id, { volume: parseFloat(e.target.value) })}
                    className="w-full accent-[#D4AF37] disabled:opacity-30 cursor-pointer"
                  />
                </div>
              </div>

              {/* Row 2: Speed (Slow Motion) & Transitions */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-3 border-t border-[#222226]">
                {/* Speed Controls */}
                <div>
                  <div className="flex justify-between items-center mb-1.5">
                    <label className="text-[11px] font-mono text-[#888892] uppercase font-medium flex items-center gap-1.5">
                      <Gauge className="w-3.5 h-3.5 text-[#D4AF37]" />
                      Prędkość Ujęcia (Slow-Motion)
                    </label>
                    <span className="text-xs font-mono font-bold text-[#D4AF37]">
                      {selectedItem.speed || 1.0}x
                    </span>
                  </div>
                  <div className="grid grid-cols-6 gap-1 bg-[#18181C] p-1 rounded-xl border border-[#28282E]">
                    {[
                      { val: 0.5, label: '0.5x' },
                      { val: 0.75, label: '0.75x' },
                      { val: 1.0, label: '1.0x' },
                      { val: 1.25, label: '1.25x' },
                      { val: 1.5, label: '1.5x' },
                      { val: 2.0, label: '2.0x' }
                    ].map(spd => (
                      <button
                        key={spd.val}
                        onClick={() => {
                          const newSpeed = spd.val;
                          const newDuration = (selectedItem.sourceEnd - selectedItem.sourceStart) / newSpeed;
                          onUpdateTimelineItem(selectedItem.id, { speed: newSpeed, duration: newDuration });
                        }}
                        className={`py-1.5 text-xs font-mono font-bold rounded-lg cursor-pointer transition-all ${
                          (selectedItem.speed || 1.0) === spd.val
                            ? 'bg-[#D4AF37] text-black shadow-md'
                            : 'text-[#888892] hover:text-white'
                        }`}
                      >
                        {spd.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Transitions */}
                <div>
                  <label className="text-[11px] font-mono text-[#888892] uppercase block mb-1.5 font-medium flex items-center gap-1.5">
                    <Wand2 className="w-3.5 h-3.5 text-[#D4AF37]" />
                    Przejście Wejściowe (Transition)
                  </label>
                  <div className="grid grid-cols-5 gap-1 bg-[#18181C] p-1 rounded-xl border border-[#28282E]">
                    {[
                      { id: 'cut', label: 'Cięcie' },
                      { id: 'dissolve', label: 'Przenik.' },
                      { id: 'dip_black', label: 'Czerń' },
                      { id: 'dip_white', label: 'Biel' },
                      { id: 'light_leak', label: 'Błysk' }
                    ].map(tr => (
                      <button
                        key={tr.id}
                        onClick={() => onUpdateTimelineItem(selectedItem.id, { transitionIn: tr.id as TransitionType })}
                        className={`py-1.5 text-[11px] font-bold rounded-lg uppercase cursor-pointer transition-all ${
                          (selectedItem.transitionIn || 'cut') === tr.id
                            ? 'bg-[#D4AF37] text-black shadow-md'
                            : 'text-[#888892] hover:text-white'
                        }`}
                      >
                        {tr.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Row 3: Title Card Overlay on Clip */}
              <div className="pt-3 border-t border-[#222226] bg-[#151518] p-4 rounded-xl border border-[#24242A]">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <Type className="w-4 h-4 text-[#D4AF37]" />
                    <span className="text-xs font-bold text-white uppercase font-mono">
                      Plansza Tytułowa / Podpis Sceny przed Klipem
                    </span>
                  </div>
                  <button
                    onClick={() => {
                      const enabled = !selectedItem.titleCard?.enabled;
                      onUpdateTimelineItem(selectedItem.id, {
                        titleCard: {
                          enabled,
                          text: selectedItem.titleCard?.text || selectedClip.name.replace(/\.[^/.]+$/, ""),
                          subtitle: selectedItem.titleCard?.subtitle || 'Joanna & Piotr',
                          duration: selectedItem.titleCard?.duration || 3.0,
                          style: selectedItem.titleCard?.style || 'liturgical',
                          backgroundColor: selectedItem.titleCard?.backgroundColor || '#0F0E0C'
                        }
                      });
                    }}
                    className={`px-3 py-1 text-xs rounded-lg font-mono font-bold transition-all cursor-pointer ${
                      selectedItem.titleCard?.enabled
                        ? 'bg-[#D4AF37] text-black'
                        : 'bg-[#202026] text-[#888] hover:text-white'
                    }`}
                  >
                    {selectedItem.titleCard?.enabled ? 'WŁĄCZONA' : 'WYŁĄCZONA'}
                  </button>
                </div>

                {selectedItem.titleCard?.enabled && (
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
                    <div>
                      <label className="text-[10px] font-mono text-[#888] uppercase block mb-1">Tytuł Główny</label>
                      <input
                        type="text"
                        value={selectedItem.titleCard.text}
                        onChange={(e) => onUpdateTimelineItem(selectedItem.id, {
                          titleCard: { ...selectedItem.titleCard!, text: e.target.value }
                        })}
                        placeholder="np. Ślub Joanny i Piotra"
                        className="w-full bg-[#0E0E10] border border-[#2E2E36] rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-[#D4AF37]"
                      />
                    </div>

                    <div>
                      <label className="text-[10px] font-mono text-[#888] uppercase block mb-1">Podtytuł / Data</label>
                      <input
                        type="text"
                        value={selectedItem.titleCard.subtitle || ''}
                        onChange={(e) => onUpdateTimelineItem(selectedItem.id, {
                          titleCard: { ...selectedItem.titleCard!, subtitle: e.target.value }
                        })}
                        placeholder="np. 15 Sierpnia 2026 • Kościół Św. Anny"
                        className="w-full bg-[#0E0E10] border border-[#2E2E36] rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-[#D4AF37]"
                      />
                    </div>

                    <div>
                      <label className="text-[10px] font-mono text-[#888] uppercase block mb-1">Styl Planszy</label>
                      <select
                        value={selectedItem.titleCard.style}
                        onChange={(e) => onUpdateTimelineItem(selectedItem.id, {
                          titleCard: { ...selectedItem.titleCard!, style: e.target.value as any }
                        })}
                        className="w-full bg-[#0E0E10] border border-[#2E2E36] rounded-lg px-2 py-1.5 text-xs text-white focus:outline-none focus:border-[#D4AF37]"
                      >
                        <option value="liturgical">✝ Sakralny / Kościelny (Złoty Łuk)</option>
                        <option value="elegant">❦ Elegancki Szeryfowy</option>
                        <option value="cinematic">✦ Kinowy (Cinematic)</option>
                        <option value="classic">Klasyczny</option>
                        <option value="minimalist">Minimalistyczny</option>
                      </select>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
