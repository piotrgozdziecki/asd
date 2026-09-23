import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { 
  Play, 
  Pause, 
  SkipBack, 
  SkipForward, 
  RotateCcw, 
  Maximize2, 
  Minimize2, 
  Volume2, 
  VolumeX, 
  Camera, 
  Tv, 
  Grid, 
  ShieldAlert, 
  Layers, 
  Film, 
  Sparkles, 
  Sliders, 
  ZoomIn, 
  ZoomOut, 
  Eye, 
  Square, 
  Smartphone, 
  Monitor, 
  ChevronLeft, 
  ChevronRight,
  Gauge,
  Repeat,
  Info,
  AlertCircle
} from 'lucide-react';
import type { 
  ProjectState, 
  TimelineItem, 
  MediaClip, 
  TextLayer, 
  AudioTrackItem, 
  FitMode,
  TransitionType
} from '../../types/project';
import { urlRegistry } from '../../core/media/urlRegistry';

interface PreviewViewProps {
  project: ProjectState;
}

type AspectRatioMode = '16:9' | '9:16' | '4:3' | '1:1' | 'project';

export function PreviewView({ project }: PreviewViewProps) {
  // Playback state (React state for UI rendering)
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const [isLooping, setIsLooping] = useState(false);
  const [isCinemaMode, setIsCinemaMode] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  
  // Audio state
  const [masterVolume, setMasterVolume] = useState(0.85);
  const [isMuted, setIsMuted] = useState(false);

  // Overlay & Display options
  const [selectedAspectRatio, setSelectedAspectRatio] = useState<AspectRatioMode>('project');
  const [showSafeZones, setShowSafeZones] = useState(false);
  const [showGrid, setShowGrid] = useState(false);
  const [showClipInfo, setShowClipInfo] = useState(true);
  const [canvasZoom, setCanvasZoom] = useState(100);
  const [engineKey, setEngineKey] = useState(0);

  // High-precision clock refs to bypass React render latency during 60fps rAF loop
  const isPlayingRef = useRef(false);
  const currentTimeRef = useRef(0);
  const playbackSpeedRef = useRef(1);
  const isLoopingRef = useRef(false);
  const masterVolumeRef = useRef(0.85);
  const isMutedRef = useRef(false);

  // Sync refs with state
  useEffect(() => { isPlayingRef.current = isPlaying; }, [isPlaying]);
  useEffect(() => { currentTimeRef.current = currentTime; }, [currentTime]);
  useEffect(() => { playbackSpeedRef.current = playbackSpeed; }, [playbackSpeed]);
  useEffect(() => { isLoopingRef.current = isLooping; }, [isLooping]);
  useEffect(() => { masterVolumeRef.current = masterVolume; }, [masterVolume]);
  useEffect(() => { isMutedRef.current = isMuted; }, [isMuted]);

  // DOM Refs
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Video & Image Element Pool (Multi-clip seamless montage player)
  const videoPoolRef = useRef<Map<string, HTMLVideoElement>>(new Map());
  const imagePoolRef = useRef<Map<string, HTMLImageElement>>(new Map());
  const audioPoolRef = useRef<Map<string, HTMLAudioElement>>(new Map());
  const createdUrlsRef = useRef<Set<string>>(new Set());

  // Frame timing
  const targetFps = project.settings?.targetFps || 30;
  const frameDuration = 1 / targetFps;

  // Media Library lookup Map
  const mediaMap = useMemo(() => {
    const map = new Map<string, MediaClip>();
    (project.mediaLibrary || []).forEach(clip => map.set(clip.id, clip));
    return map;
  }, [project.mediaLibrary]);

  // Sorted timeline items
  const sortedTimelineItems = useMemo(() => {
    return [...(project.timelineItems || [])].sort((a, b) => a.timelineStart - b.timelineStart);
  }, [project.timelineItems]);

  // Total duration of the project
  const totalDuration = useMemo(() => {
    const videoEnd = sortedTimelineItems.reduce((max, i) => Math.max(max, i.timelineStart + i.duration), 0);
    const textEnd = (project.textLayers || []).reduce((max, t) => Math.max(max, t.timelineStart + t.duration), 0);
    const audioEnd = (project.audioTracks || []).reduce((max, a) => Math.max(max, a.timelineStart + a.duration), 0);
    return Math.max(videoEnd, textEnd, audioEnd, 0.1);
  }, [sortedTimelineItems, project.textLayers, project.audioTracks]);

  // Cut points for fast navigation
  const cutPoints = useMemo(() => {
    const points = new Set<number>([0, totalDuration]);
    sortedTimelineItems.forEach(item => {
      points.add(item.timelineStart);
      points.add(item.timelineStart + item.duration);
    });
    return Array.from(points).sort((a, b) => a - b);
  }, [sortedTimelineItems, totalDuration]);

  // Calculate resolution based on aspect ratio mode
  const effectiveAspectRatio = useMemo(() => {
    if (selectedAspectRatio === '16:9') return { width: 1920, height: 1080, label: '16:9 Panorama' };
    if (selectedAspectRatio === '9:16') return { width: 1080, height: 1920, label: '9:16 Rolka / Shorts' };
    if (selectedAspectRatio === '4:3') return { width: 1440, height: 1080, label: '4:3 Klasyk' };
    if (selectedAspectRatio === '1:1') return { width: 1080, height: 1080, label: '1:1 Kwadrat' };
    
    // Project default
    const projAspect = project.settings?.aspectRatio || '16:9';
    if (projAspect === '9:16') return { width: 1080, height: 1920, label: '9:16 Projekt' };
    if (projAspect === '4:3') return { width: 1440, height: 1080, label: '4:3 Projekt' };
    return { width: 1920, height: 1080, label: '16:9 Projekt' };
  }, [selectedAspectRatio, project.settings?.aspectRatio]);

  // Resolve media URL reliably (File -> Object URL -> Thumbnail)
  const getMediaUrl = useCallback((clip: MediaClip): string | null => {
    if (!clip) return null;
    if (clip.objectUrl && (clip.objectUrl.startsWith('blob:') || clip.objectUrl.startsWith('http:') || clip.objectUrl.startsWith('https:') || clip.objectUrl.startsWith('data:'))) {
      if (!clip.objectUrl.startsWith('blob:') || urlRegistry.isAlive(clip.objectUrl)) {
        return clip.objectUrl;
      }
    }
    if (clip.file) {
      try {
        const url = urlRegistry.create(clip.file);
        clip.objectUrl = url;
        return url;
      } catch (err) {
        console.warn(`[PreviewView] Failed to create object URL for clip ${clip.name}:`, err);
      }
    }
    return clip.thumbnailUrl || null;
  }, []);

  const handleReloadEngine = () => {
    // Clear pools
    videoPoolRef.current.forEach(v => { try { v.pause(); v.src = ''; } catch(e) {} });
    videoPoolRef.current.clear();
    audioPoolRef.current.forEach(a => { try { a.pause(); a.src = ''; } catch(e) {} });
    audioPoolRef.current.clear();
    imagePoolRef.current.clear();
    
    // Increment key to trigger useEffects
    setEngineKey(prev => prev + 1);
    
    // Reset seek
    handleSeek(currentTimeRef.current);
  };

  // Preload & manage HTMLVideoElement / HTMLImageElement pool
  useEffect(() => {
    const videoPool = videoPoolRef.current;
    const imagePool = imagePoolRef.current;

    (project.mediaLibrary || []).forEach(clip => {
      const url = getMediaUrl(clip);
      if (!url) return;

      if (clip.type === 'video') {
        let video = videoPool.get(clip.id);
        if (!video) {
          video = document.createElement('video');
          video.preload = 'auto';
          video.playsInline = true;
          if (url.startsWith('http://') || url.startsWith('https://')) {
            video.crossOrigin = 'anonymous';
          }
          video.muted = isMuted;
          video.src = url;
          videoPool.set(clip.id, video);
        } else if (video.src !== url && !video.src.endsWith(url)) {
          video.src = url;
        }
      } else if (clip.type === 'image') {
        let img = imagePool.get(clip.id);
        if (!img) {
          img = new Image();
          if (url.startsWith('http://') || url.startsWith('https://')) {
            img.crossOrigin = 'anonymous';
          }
          img.src = url;
          imagePool.set(clip.id, img);
        } else if (img.src !== url && !img.src.endsWith(url)) {
          img.src = url;
        }
      }
    });
  }, [project.mediaLibrary, getMediaUrl, isMuted, engineKey]);

  // Teardown media pool on unmount
  useEffect(() => {
    const videoPool = videoPoolRef.current;
    const audioPool = audioPoolRef.current;
    const createdUrls = createdUrlsRef.current;

    return () => {
      videoPool.forEach(video => {
        try {
          video.pause();
          video.src = '';
          video.load();
        } catch (e) {}
      });
      videoPool.clear();

      audioPool.forEach(audio => {
        try {
          audio.pause();
          audio.src = '';
          audio.load();
        } catch (e) {}
      });
      audioPool.clear();
      createdUrls.clear();
    };
  }, []);

  // Helper: Find active timeline item and adjacent items at time `t`
  const getActiveItemsAt = useCallback((t: number) => {
    const active = sortedTimelineItems.find(
      item => t >= item.timelineStart && t < item.timelineStart + item.duration
    ) || null;

    return active;
  }, [sortedTimelineItems]);

  // Current active timeline item
  const activeTimelineItem = useMemo(() => {
    return getActiveItemsAt(currentTime);
  }, [currentTime, getActiveItemsAt]);

  const activeMedia = useMemo(() => {
    if (!activeTimelineItem) return null;
    return mediaMap.get(activeTimelineItem.clipId) || null;
  }, [activeTimelineItem, mediaMap]);

  // Draw a single clip frame onto canvas (Original unaltered colors and framing)
  const drawClipToContext = (
    ctx: CanvasRenderingContext2D,
    item: TimelineItem,
    clip: MediaClip,
    time: number,
    targetW: number,
    targetH: number,
    isSecondary: boolean = false,
    alphaOverride: number = 1.0
  ) => {
    const videoPool = videoPoolRef.current;
    const imagePool = imagePoolRef.current;

    const mediaElement = clip.type === 'video' 
      ? videoPool.get(clip.id) 
      : imagePool.get(clip.id);

    if (!mediaElement) return;

    const isVideo = clip.type === 'video';
    const sourceW = isVideo 
      ? (mediaElement as HTMLVideoElement).videoWidth 
      : (mediaElement as HTMLImageElement).naturalWidth;
    const sourceH = isVideo 
      ? (mediaElement as HTMLVideoElement).videoHeight 
      : (mediaElement as HTMLImageElement).naturalHeight;

    // Transition computation
    const transIn = item.transitionIn || 'cut';
    const transOut = item.transitionOut || 'cut';
    const transDur = item.transitionDuration || 0.5;

    const timeFromStart = time - item.timelineStart;
    const timeToEnd = (item.timelineStart + item.duration) - time;

    let clipAlpha = alphaOverride;
    let dipBlackAlpha = 0;
    let dipWhiteAlpha = 0;

    if (!isSecondary) {
      if ((transIn === 'fade' || transIn === 'dissolve') && timeFromStart < transDur) {
        clipAlpha *= Math.max(0, timeFromStart / transDur);
      } else if (transIn === 'dip_black' && timeFromStart < transDur) {
        dipBlackAlpha = Math.max(0, 1 - (timeFromStart / transDur));
      } else if (transIn === 'dip_white' && timeFromStart < transDur) {
        dipWhiteAlpha = Math.max(0, 1 - (timeFromStart / transDur));
      }

      if ((transOut === 'fade' || transOut === 'dissolve') && timeToEnd < transDur) {
        clipAlpha *= Math.max(0, timeToEnd / transDur);
      } else if (transOut === 'dip_black' && timeToEnd < transDur) {
        dipBlackAlpha = Math.max(dipBlackAlpha, 1 - (timeToEnd / transDur));
      } else if (transOut === 'dip_white' && timeToEnd < transDur) {
        dipWhiteAlpha = Math.max(dipWhiteAlpha, 1 - (timeToEnd / transDur));
      }
    }

    // If source media dimensions are valid, render frame
    if (sourceW > 0 && sourceH > 0) {
      const targetAspect = targetW / targetH;
      const sourceAspect = sourceW / sourceH;
      const fitMode: FitMode = item.fitMode || 'fit';

      ctx.save();
      ctx.globalAlpha = clipAlpha;

      let renderW = targetW;
      let renderH = targetH;
      let renderX = 0;
      let renderY = 0;

      if (fitMode === 'fit') {
        if (sourceAspect > targetAspect) {
          renderW = targetW;
          renderH = targetW / sourceAspect;
          renderY = (targetH - renderH) / 2;
        } else {
          renderH = targetH;
          renderW = targetH * sourceAspect;
          renderX = (targetW - renderW) / 2;
        }
      } else if (fitMode === 'fill') {
        if (sourceAspect > targetAspect) {
          renderH = targetH;
          renderW = targetH * sourceAspect;
          renderX = (targetW - renderW) / 2;
        } else {
          renderW = targetW;
          renderH = targetW / sourceAspect;
          renderY = (targetH - renderH) / 2;
        }
      }

      // Apply scale & position offset
      const scale = item.scale || 1;
      renderW *= scale;
      renderH *= scale;
      renderX = (targetW - renderW) / 2 + ((item.position?.x || 0) * targetW);
      renderY = (targetH - renderH) / 2 + ((item.position?.y || 0) * targetH);

      if (item.rotation) {
        ctx.translate(targetW / 2, targetH / 2);
        ctx.rotate((item.rotation * Math.PI) / 180);
        try {
          ctx.drawImage(mediaElement, -renderW / 2, -renderH / 2, renderW, renderH);
        } catch (e) {}
      } else {
        try {
          ctx.drawImage(mediaElement, renderX, renderY, renderW, renderH);
        } catch (e) {}
      }
      ctx.restore();
    } else if (clip.thumbnailUrl) {
      // Fallback: draw thumbnail if media is still buffering
      const thumbImg = imagePool.get(clip.id) || new Image();
      if (!thumbImg.src) thumbImg.src = clip.thumbnailUrl;
      if (thumbImg.complete && thumbImg.naturalWidth > 0) {
        ctx.save();
        ctx.globalAlpha = clipAlpha;
        ctx.drawImage(thumbImg, 0, 0, targetW, targetH);
        ctx.restore();
      }
    }

    // Dip to Black / Dip to White overlay effects
    if (dipBlackAlpha > 0) {
      ctx.fillStyle = `rgba(0, 0, 0, ${dipBlackAlpha})`;
      ctx.fillRect(0, 0, targetW, targetH);
    } else if (dipWhiteAlpha > 0) {
      ctx.fillStyle = `rgba(255, 255, 255, ${dipWhiteAlpha})`;
      ctx.fillRect(0, 0, targetW, targetH);
    }
  };

  // MAIN REAL-TIME CANVAS DRAW FUNCTION (Invoked on every requestAnimationFrame)
  const drawCanvas = useCallback((time: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) return;

    const targetW = effectiveAspectRatio.width;
    const targetH = effectiveAspectRatio.height;

    if (canvas.width !== targetW || canvas.height !== targetH) {
      canvas.width = targetW;
      canvas.height = targetH;
    }

    // 1. Clear background
    ctx.fillStyle = '#050505';
    ctx.fillRect(0, 0, targetW, targetH);

    // 2. Identify active timeline item
    const activeItem = getActiveItemsAt(time);

    if (activeItem) {
      const clip = mediaMap.get(activeItem.clipId);
      if (clip) {
        drawClipToContext(ctx, activeItem, clip, time, targetW, targetH);
      }
    } else {
      // Empty Timeline Slate / Title placeholder
      ctx.fillStyle = '#0E0D0B';
      ctx.fillRect(0, 0, targetW, targetH);

      ctx.save();
      ctx.strokeStyle = '#2A2824';
      ctx.lineWidth = 2;
      ctx.strokeRect(30, 30, targetW - 60, targetH - 60);

      ctx.fillStyle = '#D4AF37';
      ctx.font = 'bold 36px "Cinzel", "Playfair Display", serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(project.name || 'Studio Montażu Ślubnego', targetW / 2, targetH / 2 - 20);

      ctx.fillStyle = '#A39E93';
      ctx.font = '20px monospace';
      ctx.fillText('Brak aktywnego ujęcia na tej pozycji osi czasu', targetW / 2, targetH / 2 + 35);
      ctx.restore();
    }

    // 3. Render Text Layers & Subtitles
    const activeTextLayers = (project.textLayers || []).filter(
      t => time >= t.timelineStart && time < t.timelineStart + t.duration
    );

    activeTextLayers.forEach(layer => {
      ctx.save();
      const baseFontSize = layer.fontSize || 36;
      const fontSize = Math.max(16, baseFontSize * (targetH / 1080));
      
      let fontFamily = 'Cinzel, serif';
      if (layer.style === 'minimalist') fontFamily = 'sans-serif';
      if (layer.style === 'classic') fontFamily = '"Playfair Display", serif';
      if (layer.style === 'elegant') fontFamily = '"Great Vibes", cursive, serif';

      ctx.font = `${fontSize}px ${fontFamily}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      const posX = (layer.position?.x ?? 0.5) * targetW;
      const posY = (layer.position?.y ?? 0.85) * targetH;

      // Background pill if configured
      if (layer.backgroundColor) {
        const metrics = ctx.measureText(layer.text);
        const padX = fontSize * 0.6;
        const padY = fontSize * 0.3;
        ctx.fillStyle = layer.backgroundColor;
        ctx.fillRect(
          posX - metrics.width / 2 - padX, 
          posY - fontSize / 2 - padY, 
          metrics.width + padX * 2, 
          fontSize + padY * 2
        );
      }

      ctx.shadowColor = 'rgba(0,0,0,0.9)';
      ctx.shadowBlur = 12;
      ctx.shadowOffsetX = 2;
      ctx.shadowOffsetY = 3;

      ctx.fillStyle = layer.color || '#F7F4EE';
      ctx.fillText(layer.text, posX, posY);
      ctx.restore();
    });

    // 4. Safe Zones (Action Safe 90% + Title Safe 80%)
    if (showSafeZones) {
      ctx.save();
      ctx.strokeStyle = 'rgba(74, 222, 128, 0.45)';
      ctx.lineWidth = 2;
      ctx.setLineDash([8, 6]);
      ctx.strokeRect(targetW * 0.05, targetH * 0.05, targetW * 0.9, targetH * 0.9);

      ctx.strokeStyle = 'rgba(212, 175, 55, 0.65)';
      ctx.strokeRect(targetW * 0.1, targetH * 0.1, targetW * 0.8, targetH * 0.8);

      ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
      ctx.setLineDash([]);
      ctx.beginPath();
      ctx.moveTo(targetW / 2 - 15, targetH / 2);
      ctx.lineTo(targetW / 2 + 15, targetH / 2);
      ctx.moveTo(targetW / 2, targetH / 2 - 15);
      ctx.lineTo(targetW / 2, targetH / 2 + 15);
      ctx.stroke();

      ctx.fillStyle = 'rgba(0,0,0,0.75)';
      ctx.fillRect(targetW * 0.1 + 10, targetH * 0.1 + 10, 160, 26);
      ctx.fillStyle = '#D4AF37';
      ctx.font = '12px monospace';
      ctx.fillText('TITLE SAFE 80%', targetW * 0.1 + 20, targetH * 0.1 + 27);
      ctx.restore();
    }

    // 5. Rule of Thirds Grid
    if (showGrid) {
      ctx.save();
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.25)';
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);

      ctx.beginPath();
      ctx.moveTo(targetW / 3, 0);
      ctx.lineTo(targetW / 3, targetH);
      ctx.moveTo((targetW / 3) * 2, 0);
      ctx.lineTo((targetW / 3) * 2, targetH);
      ctx.moveTo(0, targetH / 3);
      ctx.lineTo(targetW, targetH / 3);
      ctx.moveTo(0, (targetH / 3) * 2);
      ctx.lineTo(targetW, (targetH / 3) * 2);
      ctx.stroke();
      ctx.restore();
    }
  }, [
    effectiveAspectRatio, 
    getActiveItemsAt, 
    mediaMap, 
    project.name, 
    project.textLayers, 
    showSafeZones, 
    showGrid
  ]);

  // Synchronize Audio Elements & Active Video Element
  const syncMediaElements = useCallback((time: number, isCurrentlyPlaying: boolean) => {
    const videoPool = videoPoolRef.current;
    const audioPool = audioPoolRef.current;
    const currentMuted = isMutedRef.current;
    const currentMasterVol = masterVolumeRef.current;
    const currentSpeed = playbackSpeedRef.current;

    // 1. Sync Active Video Clip
    const activeItem = getActiveItemsAt(time);
    const activeClip = activeItem ? mediaMap.get(activeItem.clipId) : null;
    const activeVideo = activeClip?.type === 'video' ? videoPool.get(activeClip.id) : null;

    // Pause all video elements that are NOT active
    videoPool.forEach((video, clipId) => {
      if (!activeClip || clipId !== activeClip.id || !activeVideo) {
        if (!video.paused) {
          try { video.pause(); } catch (e) {}
        }
      }
    });

    if (activeItem && activeClip && activeVideo) {
      const elapsed = time - activeItem.timelineStart;
      const speed = activeItem.speed || 1;
      const targetSourceTime = Math.max(0, activeItem.sourceStart + (elapsed * speed));

      const clipVol = (activeItem.muted || currentMuted) 
        ? 0 
        : Math.min(1, (activeItem.volume ?? 1) * currentMasterVol * (project.settings?.audioBalance?.clipVolume ?? 0.7));
      
      activeVideo.volume = clipVol;
      activeVideo.playbackRate = speed * currentSpeed;

      // Only seek if difference exceeds threshold to prevent audio stutter during smooth playback
      const drift = Math.abs(activeVideo.currentTime - targetSourceTime);
      if (!isCurrentlyPlaying || drift > 0.25) {
        if (Number.isFinite(targetSourceTime)) {
          try {
            activeVideo.currentTime = targetSourceTime;
          } catch (e) {}
        }
      }

      if (isCurrentlyPlaying) {
        if (activeVideo.paused && !(activeVideo as any)._isPlayPending) {
          (activeVideo as any)._isPlayPending = true;
          activeVideo.play()
            .then(() => {
              (activeVideo as any)._isPlayPending = false;
            })
            .catch(() => {
              (activeVideo as any)._isPlayPending = false;
              // Autoplay safety: mute and retry
              activeVideo.muted = true;
              activeVideo.play().catch(() => {});
            });
        }
      } else {
        if (!activeVideo.paused) {
          activeVideo.pause();
        }
      }
    }

    // 2. Sync Project Audio Tracks (Background Music / Voiceovers)
    (project.audioTracks || []).forEach(track => {
      let audio = audioPool.get(track.id);
      if (!audio) {
        audio = document.createElement('audio');
        audio.preload = 'auto';
        if (track.file) {
          try {
            const url = urlRegistry.create(track.file);
            createdUrlsRef.current.add(url);
            audio.src = url;
          } catch (e) {
            if (track.objectUrl) audio.src = track.objectUrl;
          }
        } else if (track.objectUrl) {
          audio.src = track.objectUrl;
        }
        audioPool.set(track.id, audio);
      }

      const isActive = time >= track.timelineStart && time < track.timelineStart + track.duration;
      if (isActive && isCurrentlyPlaying && !currentMuted && !track.muted) {
        const trackOffset = time - track.timelineStart;
        const trackLocalTime = track.sourceStart + trackOffset;

        if (Math.abs(audio.currentTime - trackLocalTime) > 0.2) {
          if (audio.readyState >= 1) {
            audio.currentTime = trackLocalTime;
          }
        }

        // Apply volume, music balance, and fade-in/fade-out
        let vol = (track.volume ?? 1) * currentMasterVol * (project.settings?.audioBalance?.musicVolume ?? 0.8);
        if (track.fadeIn && trackOffset < track.fadeIn) {
          vol *= (trackOffset / track.fadeIn);
        }
        const timeFromEnd = (track.timelineStart + track.duration) - time;
        if (track.fadeOut && timeFromEnd < track.fadeOut) {
          vol *= (timeFromEnd / track.fadeOut);
        }
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
  }, [getActiveItemsAt, mediaMap, project.settings?.audioBalance, project.audioTracks]);

  // HIGH-PRECISION METADATA-DRIVEN REQUEST_ANIMATION_FRAME PLAYBACK LOOP
  useEffect(() => {
    let animationFrameId: number;
    let lastPerfTime = performance.now();
    let lastUiUpdateTime = 0;

    const renderLoop = (perfNow: number) => {
      const dt = ((perfNow - lastPerfTime) / 1000) * playbackSpeedRef.current;
      lastPerfTime = perfNow;

      if (isPlayingRef.current) {
        let nextTime = currentTimeRef.current + dt;

        if (nextTime >= totalDuration) {
          if (isLoopingRef.current) {
            nextTime = 0;
            currentTimeRef.current = 0;
          } else {
            nextTime = totalDuration;
            currentTimeRef.current = totalDuration;
            isPlayingRef.current = false;
            setIsPlaying(false);
          }
        } else {
          currentTimeRef.current = nextTime;
        }

        // Throttle React state update to ~30 FPS to prevent starving video decoding
        if (perfNow - lastUiUpdateTime > 33) {
          lastUiUpdateTime = perfNow;
          setCurrentTime(currentTimeRef.current);
        }
      }

      // 1. Sync Audio & Video Hardware Clock
      syncMediaElements(currentTimeRef.current, isPlayingRef.current);

      // 2. Render Canvas Frame Synchronously
      drawCanvas(currentTimeRef.current);

      animationFrameId = requestAnimationFrame(renderLoop);
    };

    animationFrameId = requestAnimationFrame(renderLoop);
    return () => cancelAnimationFrame(animationFrameId);
  }, [totalDuration, syncMediaElements, drawCanvas]);

  // Handle Seek / Scrubbing
  const handleSeek = (newTime: number) => {
    const clamped = Math.max(0, Math.min(totalDuration, newTime));
    currentTimeRef.current = clamped;
    setCurrentTime(clamped);
    syncMediaElements(clamped, false);
    drawCanvas(clamped);
  };

  // Step exact 1 frame forward or backward
  const stepFrame = (deltaFrames: number) => {
    setIsPlaying(false);
    isPlayingRef.current = false;
    const next = currentTimeRef.current + (deltaFrames * frameDuration);
    handleSeek(Number(next.toFixed(4)));
  };

  // Jump to previous / next cut point
  const jumpCut = (direction: 'prev' | 'next') => {
    setIsPlaying(false);
    isPlayingRef.current = false;
    const cur = currentTimeRef.current;
    if (direction === 'prev') {
      const prevCuts = cutPoints.filter(p => p < cur - 0.05);
      const target = prevCuts.length > 0 ? prevCuts[prevCuts.length - 1] : 0;
      handleSeek(target);
    } else {
      const nextCut = cutPoints.find(p => p > cur + 0.05);
      const target = nextCut !== undefined ? nextCut : totalDuration;
      handleSeek(target);
    }
  };

  // Capture High-Res Snapshot Frame
  const handleCaptureSnapshot = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    try {
      const dataUrl = canvas.toDataURL('image/png', 1.0);
      const a = document.createElement('a');
      a.href = dataUrl;
      const tc = formatTimecode(currentTimeRef.current, targetFps).replace(/:/g, '-');
      a.download = `Klatka_${(project.name || 'Film').replace(/\s+/g, '_')}_TC_${tc}.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } catch (err) {
      console.warn('Could not capture frame snapshot:', err);
    }
  };

  // Toggle fullscreen
  const toggleFullscreen = () => {
    if (!containerRef.current) return;
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen().then(() => setIsFullscreen(true)).catch(() => {});
    } else {
      document.exitFullscreen().then(() => setIsFullscreen(false)).catch(() => {});
    }
  };

  // Keyboard shortcut handler
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement)?.tagName)) return;

      if (e.code === 'Space') {
        e.preventDefault();
        setIsPlaying(prev => !prev);
      } else if (e.code === 'ArrowLeft') {
        e.preventDefault();
        stepFrame(e.shiftKey ? -10 : -1);
      } else if (e.code === 'ArrowRight') {
        e.preventDefault();
        stepFrame(e.shiftKey ? 10 : 1);
      } else if (e.code === 'KeyJ') {
        e.preventDefault();
        jumpCut('prev');
      } else if (e.code === 'KeyK') {
        e.preventDefault();
        setIsPlaying(false);
      } else if (e.code === 'KeyL') {
        e.preventDefault();
        jumpCut('next');
      } else if (e.code === 'KeyM') {
        e.preventDefault();
        setIsMuted(m => !m);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [cutPoints, frameDuration]);

  // Format SMPTE Timecode (HH:MM:SS:FF)
  const formatTimecode = (seconds: number, fps: number = 30) => {
    const sec = Math.max(0, seconds);
    const hrs = Math.floor(sec / 3600);
    const mins = Math.floor((sec % 3600) / 60);
    const secs = Math.floor(sec % 60);
    const frames = Math.floor((sec % 1) * fps);

    const pad = (n: number) => n.toString().padStart(2, '0');
    return `${pad(hrs)}:${pad(mins)}:${pad(secs)}:${pad(frames)}`;
  };

  const currentFrameNumber = Math.floor(currentTime * targetFps);
  const totalFramesNumber = Math.floor(totalDuration * targetFps);

  return (
    <div 
      ref={containerRef}
      className={`flex flex-col h-full w-full bg-[#080808] text-[#F7F4EE] select-none ${
        isCinemaMode ? 'fixed inset-0 z-50 p-4 bg-black' : 'p-3 md:p-5'
      }`}
    >
      {/* TOP BAR: STUDIO MONITOR HEADER */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-3 shrink-0 bg-[#121110] border border-[#2A2824] rounded-xl px-4 py-2.5 shadow-md">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <span className={`w-2.5 h-2.5 rounded-full ${isPlaying ? 'bg-emerald-400 animate-pulse' : 'bg-[#D4AF37]'}`} />
            <h3 className="font-serif font-bold text-sm md:text-base text-[#F7F4EE] tracking-wide">
              Podgląd Kinowy (Canvas Engine)
            </h3>
          </div>
          <span className="hidden sm:inline-block text-xs px-2 py-0.5 rounded bg-[#1C1A17] border border-[#2A2824] text-[#D4AF37] font-mono">
            {targetFps} FPS
          </span>
          <span className="hidden md:inline-block text-xs px-2 py-0.5 rounded bg-[#1C1A17] border border-[#2A2824] text-[#A39E93] font-mono">
            {effectiveAspectRatio.width}x{effectiveAspectRatio.height}
          </span>
        </div>

        {/* View Options & Safe Guides */}
        <div className="flex items-center gap-1.5 sm:gap-2">
          {/* Aspect Ratio Selector */}
          <div className="flex items-center bg-[#1C1A17] border border-[#2A2824] rounded-lg p-0.5">
            <button
              onClick={() => setSelectedAspectRatio('16:9')}
              title="16:9 Panorama"
              className={`p-1.5 rounded text-xs transition-colors ${
                selectedAspectRatio === '16:9' ? 'bg-[#D4AF37] text-black font-bold' : 'text-[#A39E93] hover:text-[#F7F4EE]'
              }`}
            >
              <Monitor className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setSelectedAspectRatio('9:16')}
              title="9:16 Rolka / Shorts"
              className={`p-1.5 rounded text-xs transition-colors ${
                selectedAspectRatio === '9:16' ? 'bg-[#D4AF37] text-black font-bold' : 'text-[#A39E93] hover:text-[#F7F4EE]'
              }`}
            >
              <Smartphone className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setSelectedAspectRatio('4:3')}
              title="4:3 Klasyk"
              className={`p-1.5 rounded text-xs transition-colors ${
                selectedAspectRatio === '4:3' ? 'bg-[#D4AF37] text-black font-bold' : 'text-[#A39E93] hover:text-[#F7F4EE]'
              }`}
            >
              <Tv className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setSelectedAspectRatio('1:1')}
              title="1:1 Kwadrat"
              className={`p-1.5 rounded text-xs transition-colors ${
                selectedAspectRatio === '1:1' ? 'bg-[#D4AF37] text-black font-bold' : 'text-[#A39E93] hover:text-[#F7F4EE]'
              }`}
            >
              <Square className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Safe Zones */}
          <button
            onClick={() => setShowSafeZones(!showSafeZones)}
            title="Pokaż/Ukryj linie marginesów bezpieczeństwa (Safe Zones)"
            className={`p-1.5 rounded-lg border text-xs transition-colors flex items-center gap-1 ${
              showSafeZones 
                ? 'bg-[#D4AF37]/20 border-[#D4AF37] text-[#D4AF37]' 
                : 'bg-[#1C1A17] border-[#2A2824] text-[#A39E93] hover:text-[#F7F4EE]'
            }`}
          >
            <ShieldAlert className="w-4 h-4" />
          </button>

          {/* Grid */}
          <button
            onClick={() => setShowGrid(!showGrid)}
            title="Siatka trójpodziału (Rule of Thirds)"
            className={`p-1.5 rounded-lg border text-xs transition-colors flex items-center gap-1 ${
              showGrid 
                ? 'bg-[#D4AF37]/20 border-[#D4AF37] text-[#D4AF37]' 
                : 'bg-[#1C1A17] border-[#2A2824] text-[#A39E93] hover:text-[#F7F4EE]'
            }`}
          >
            <Grid className="w-4 h-4" />
          </button>

          {/* Snapshot Button */}
          <button
            onClick={handleCaptureSnapshot}
            title="Zapisz aktualną klatkę jako PNG o wysokiej rozdzielczości"
            className="p-1.5 px-2.5 rounded-lg border border-[#2A2824] bg-[#1C1A17] text-[#D4AF37] hover:bg-[#2A2824] transition-colors flex items-center gap-1.5 text-xs font-mono font-medium"
          >
            <Camera className="w-4 h-4" />
            <span className="hidden md:inline">Zrzut Klatki</span>
          </button>

          {/* Refresh Engine Button */}
          <button
            onClick={handleReloadEngine}
            title="Odśwież silnik podglądu (Resetuje połączenia wideo)"
            className="p-1.5 rounded-lg border border-[#2A2824] bg-[#1C1A17] text-[#D4AF37] hover:bg-[#2A2824] transition-colors"
          >
            <RotateCcw className="w-4 h-4" />
          </button>

          {/* Cinema Mode Toggle */}
          <button
            onClick={() => setIsCinemaMode(!isCinemaMode)}
            title="Tryb Kinowy"
            className={`p-1.5 rounded-lg border text-xs transition-colors ${
              isCinemaMode ? 'bg-[#D4AF37] text-black font-bold' : 'bg-[#1C1A17] border-[#2A2824] text-[#A39E93] hover:text-[#F7F4EE]'
            }`}
          >
            <Film className="w-4 h-4" />
          </button>

          {/* Fullscreen */}
          <button
            onClick={toggleFullscreen}
            title="Pełny ekran"
            className="p-1.5 rounded-lg border border-[#2A2824] bg-[#1C1A17] text-[#A39E93] hover:text-[#F7F4EE] transition-colors"
          >
            {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* CENTER CANVAS MONITOR STAGE */}
      <div className="flex-1 min-h-0 w-full relative flex items-center justify-center bg-[#050505] rounded-2xl overflow-hidden border border-[#1F1D1A] shadow-2xl">
        <div 
          className="relative max-w-full max-h-full flex items-center justify-center transition-transform duration-200"
          style={{ transform: `scale(${canvasZoom / 100})` }}
        >
          <canvas
            ref={canvasRef}
            className="rounded-lg shadow-2xl object-contain max-h-[62vh] md:max-h-[68vh] max-w-full"
            style={{
              aspectRatio: `${effectiveAspectRatio.width} / ${effectiveAspectRatio.height}`
            }}
          />

          {/* Active Clip HUD Overlay (Bottom-left in canvas) */}
          {showClipInfo && activeTimelineItem && activeMedia && (
            <div className="absolute bottom-3 left-3 bg-[#0C0B0A]/85 backdrop-blur-md border border-[#2A2824] rounded-lg px-3 py-1.5 text-xs flex items-center gap-3 text-[#E0DDD5] pointer-events-none shadow-lg">
              <div className="flex items-center gap-1.5">
                <Film className="w-3.5 h-3.5 text-[#D4AF37]" />
                <span className="font-semibold truncate max-w-[140px]">{activeMedia.name}</span>
              </div>
              <div className="hidden sm:flex items-center gap-2 text-[#A39E93] font-mono border-l border-[#2A2824] pl-2">
                <span>Źródło: {activeTimelineItem.sourceStart.toFixed(1)}s - {activeTimelineItem.sourceEnd.toFixed(1)}s</span>
                <span>•</span>
                <span>{activeTimelineItem.speed || 1}x</span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* BOTTOM CONTROL DECK: TIMECODE, SCRUBBER & TRANSPORT */}
      <div className="mt-3 shrink-0 bg-[#121110] border border-[#2A2824] rounded-2xl p-3 md:p-4 shadow-xl flex flex-col gap-2.5">
        {/* TIMELINE SCRUBBER BAR */}
        <div className="relative flex items-center w-full group">
          <input
            type="range"
            min="0"
            max={totalDuration}
            step={frameDuration}
            value={currentTime}
            onChange={(e) => {
              setIsPlaying(false);
              isPlayingRef.current = false;
              handleSeek(parseFloat(e.target.value));
            }}
            className="w-full h-2 bg-[#1C1A17] rounded-lg appearance-none cursor-pointer accent-[#D4AF37] focus:outline-none focus:ring-1 focus:ring-[#D4AF37]"
          />

          {/* Cut point markers on timeline */}
          <div className="absolute top-0 bottom-0 left-0 right-0 pointer-events-none flex items-center">
            {cutPoints.map((point, idx) => {
              const leftPercent = (point / totalDuration) * 100;
              return (
                <div 
                  key={idx}
                  className="absolute w-0.5 h-3 bg-[#D4AF37]/50 -top-0.5 rounded-full"
                  style={{ left: `${leftPercent}%` }}
                />
              );
            })}
          </div>
        </div>

        {/* TRANSPORT CONTROLS & TIMECODE */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          {/* Left: SMPTE Timecode & Frame Counter */}
          <div className="flex items-center gap-3">
            <div className="bg-[#0A0A0A] border border-[#2A2824] rounded-xl px-3 py-1.5 flex items-center gap-2 font-mono">
              <span className="text-[#D4AF37] font-bold text-sm sm:text-base tracking-wider">
                {formatTimecode(currentTime, targetFps)}
              </span>
              <span className="text-[#6E6A60] text-xs">/</span>
              <span className="text-[#A39E93] text-xs sm:text-sm">
                {formatTimecode(totalDuration, targetFps)}
              </span>
            </div>

            <div className="hidden lg:flex flex-col text-[11px] font-mono text-[#A39E93]">
              <span>Klatka: <strong className="text-[#F7F4EE]">{currentFrameNumber}</strong> / {totalFramesNumber}</span>
              <span>Kroki: <strong className="text-[#D4AF37]">{(1/targetFps).toFixed(4)}s</strong></span>
            </div>
          </div>

          {/* Center: Frame-by-Frame Transport Buttons */}
          <div className="flex items-center gap-1.5 sm:gap-2">
            {/* Jump to Previous Cut */}
            <button
              onClick={() => jumpCut('prev')}
              title="Poprzednie cięcie ujęcia (Klawisz J)"
              className="p-2 rounded-xl bg-[#1C1A17] border border-[#2A2824] text-[#A39E93] hover:text-[#F7F4EE] hover:bg-[#2A2824] transition-colors"
            >
              <SkipBack className="w-4 h-4" />
            </button>

            {/* Step -1 Frame */}
            <button
              onClick={() => stepFrame(-1)}
              title="Cofnij o 1 klatkę (Strzałka w lewo)"
              className="p-2 rounded-xl bg-[#1C1A17] border border-[#2A2824] text-[#A39E93] hover:text-[#F7F4EE] hover:bg-[#2A2824] transition-colors flex items-center gap-0.5 text-xs font-mono font-bold"
            >
              <ChevronLeft className="w-4 h-4" />
              <span className="hidden sm:inline">-1F</span>
            </button>

            {/* Play / Pause Primary Button */}
            <button
              onClick={() => {
                const nextPlaying = !isPlaying;
                setIsPlaying(nextPlaying);
                isPlayingRef.current = nextPlaying;
              }}
              title={isPlaying ? "Wstrzymaj (Spacja)" : "Odtwarzaj (Spacja)"}
              className="p-3 sm:px-5 rounded-xl bg-[#D4AF37] hover:bg-[#DFBE58] text-black font-bold transition-transform active:scale-95 flex items-center justify-center gap-2 shadow-lg shadow-[#D4AF37]/20"
            >
              {isPlaying ? <Pause className="w-5 h-5 fill-current" /> : <Play className="w-5 h-5 fill-current ml-0.5" />}
              <span className="hidden sm:inline text-xs uppercase tracking-wider font-sans">
                {isPlaying ? "Pauza" : "Graj"}
              </span>
            </button>

            {/* Step +1 Frame */}
            <button
              onClick={() => stepFrame(1)}
              title="Następna klatka +1 (Strzałka w prawo)"
              className="p-2 rounded-xl bg-[#1C1A17] border border-[#2A2824] text-[#A39E93] hover:text-[#F7F4EE] hover:bg-[#2A2824] transition-colors flex items-center gap-0.5 text-xs font-mono font-bold"
            >
              <span className="hidden sm:inline">+1F</span>
              <ChevronRight className="w-4 h-4" />
            </button>

            {/* Jump to Next Cut */}
            <button
              onClick={() => jumpCut('next')}
              title="Następne cięcie ujęcia (Klawisz L)"
              className="p-2 rounded-xl bg-[#1C1A17] border border-[#2A2824] text-[#A39E93] hover:text-[#F7F4EE] hover:bg-[#2A2824] transition-colors"
            >
              <SkipForward className="w-4 h-4" />
            </button>

            {/* Loop Toggle */}
            <button
              onClick={() => setIsLooping(!isLooping)}
              title={isLooping ? "Pętla włączona" : "Włącz pętlę"}
              className={`p-2 rounded-xl border transition-colors ${
                isLooping 
                  ? 'bg-[#D4AF37]/20 border-[#D4AF37] text-[#D4AF37]' 
                  : 'bg-[#1C1A17] border-[#2A2824] text-[#A39E93] hover:text-[#F7F4EE]'
              }`}
            >
              <Repeat className="w-4 h-4" />
            </button>
          </div>

          {/* Right: Audio Volume & Speed controls */}
          <div className="flex items-center gap-3">
            {/* Speed selector */}
            <div className="flex items-center bg-[#1C1A17] border border-[#2A2824] rounded-lg p-0.5 text-xs font-mono">
              {[0.5, 1, 1.5, 2].map((spd) => (
                <button
                  key={spd}
                  onClick={() => setPlaybackSpeed(spd)}
                  className={`px-2 py-1 rounded transition-colors ${
                    playbackSpeed === spd 
                      ? 'bg-[#D4AF37] text-black font-bold' 
                      : 'text-[#A39E93] hover:text-[#F7F4EE]'
                  }`}
                >
                  {spd}x
                </button>
              ))}
            </div>

            {/* Master Volume */}
            <div className="flex items-center gap-1.5 bg-[#1C1A17] border border-[#2A2824] rounded-xl px-2.5 py-1.5">
              <button
                onClick={() => setIsMuted(!isMuted)}
                className="text-[#A39E93] hover:text-[#D4AF37] transition-colors"
                title={isMuted ? "Włącz dźwięk (Klawisz M)" : "Wycisz (Klawisz M)"}
              >
                {isMuted || masterVolume === 0 ? <VolumeX className="w-4 h-4 text-red-400" /> : <Volume2 className="w-4 h-4" />}
              </button>
              <input
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={isMuted ? 0 : masterVolume}
                onChange={(e) => {
                  setMasterVolume(parseFloat(e.target.value));
                  if (isMuted) setIsMuted(false);
                }}
                className="w-16 h-1 bg-[#2A2824] rounded-lg appearance-none cursor-pointer accent-[#D4AF37]"
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
