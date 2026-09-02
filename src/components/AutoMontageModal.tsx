import React, { useState, useEffect, useRef } from 'react';
import { 
  X, 
  Play, 
  Pause, 
  Film, 
  Download, 
  Sparkles, 
  Music, 
  Layers, 
  Clock, 
  CheckCircle2, 
  AlertCircle, 
  RefreshCw,
  Sliders,
  Maximize2,
  Video,
  Image as ImageIcon,
  Share2,
  Plus,
  Clapperboard,
  Eye,
  Tv,
  Camera,
  Scissors
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Storyboard, MediaItem } from '../App';

interface AutoMontageModalProps {
  storyboard: Storyboard;
  mediaItems: MediaItem[];
  coverUrl: string | null;
  token?: string | null;
  onClose: () => void;
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

export function AutoMontageModal({
  storyboard,
  mediaItems,
  coverUrl,
  token,
  onClose,
  onAddMedia
}: AutoMontageModalProps) {
  const [localMedia, setLocalMedia] = useState<MediaItem[]>(mediaItems);

  // Identify user videos and photos
  const userVideoFiles = localMedia.filter(item => 
    item.mimeType.startsWith('video') || 
    item.name.toLowerCase().endsWith('.mp4') || 
    item.name.toLowerCase().endsWith('.mov') || 
    item.name.toLowerCase().endsWith('.webm')
  );

  const userPhotoFiles = localMedia.filter(item => 
    item.mimeType.startsWith('image') || 
    item.name.toLowerCase().endsWith('.jpg') || 
    item.name.toLowerCase().endsWith('.jpeg') || 
    item.name.toLowerCase().endsWith('.png') ||
    item.name.toLowerCase().endsWith('.webp')
  );

  // Montage Mode:
  // 'baseVideo' = Plays the user's continuous wedding film from start to end with cinematic burned-in chapter titles, lower thirds and narrative subtitles.
  // 'multiClip' = Assembles short video cuts directly from the user's film at each scene's specific timestamp into a dynamic highlights reel.
  const [montageMode, setMontageMode] = useState<'baseVideo' | 'multiClip'>(
    userVideoFiles.length > 0 ? 'baseVideo' : 'multiClip'
  );

  const [selectedBaseVideoIndex, setSelectedBaseVideoIndex] = useState(0);
  const activeBaseVideo = userVideoFiles[selectedBaseVideoIndex] || userVideoFiles[0] || null;

  // Montage Configuration
  const [aspectRatio, setAspectRatio] = useState<'9:16' | '16:9'>('9:16');
  const [baseVideoDurationOption, setBaseVideoDurationOption] = useState<'full' | '60s' | '30s'>('full');
  const [sceneDuration, setSceneDuration] = useState(3.5); // seconds per scene in highlights mode
  const [includeAudio, setIncludeAudio] = useState(true);
  const [showSubtitles, setShowSubtitles] = useState(true);

  // Extracted scene thumbnails from user's actual video
  const [sceneThumbnails, setSceneThumbnails] = useState<Record<number, string>>({});
  const [isExtractingFrames, setIsExtractingFrames] = useState(false);

  // Montage Processing State
  const [isRendering, setIsRendering] = useState(false);
  const [renderProgress, setRenderProgress] = useState(0);
  const [currentRenderingScene, setCurrentRenderingScene] = useState(1);
  const [renderedVideoBlob, setRenderedVideoBlob] = useState<Blob | null>(null);
  const [renderedVideoUrl, setRenderedVideoUrl] = useState<string | null>(null);
  const [renderedFormat, setRenderedFormat] = useState<'mp4' | 'webm'>('mp4');
  const [statusMessage, setStatusMessage] = useState<string>('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const videoPlayerRef = useRef<HTMLVideoElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const abortControllerRef = useRef<boolean>(false);

  const triggerHaptic = (duration = 20) => {
    if (typeof window !== 'undefined' && 'vibrate' in navigator) {
      try { navigator.vibrate(duration); } catch (e) {}
    }
  };

  // Sync external media
  useEffect(() => {
    if (mediaItems.length > localMedia.length) {
      setLocalMedia(mediaItems);
    }
  }, [mediaItems]);

  // Parsed timeline sorted by timestamp
  const parsedTimeline = storyboard.timeline.map((item, index) => {
    const startSec = parseTimeToSeconds(item.time);
    return {
      ...item,
      index,
      startSec
    };
  }).sort((a, b) => a.startSec - b.startSec);

  // Helper to get media source URL
  const getMediaUrl = (item: MediaItem | null): string => {
    if (!item) return '';
    if (item.blobUrl) return item.blobUrl;
    if (item.type === 'drive' && item.id) {
      return `/api/drive/stream/${item.id}?accessToken=${token || ''}`;
    }
    if (item.base64) {
      try {
        const byteCharacters = atob(item.base64);
        const byteNumbers = new Uint8Array(byteCharacters.length);
        for (let i = 0; i < byteCharacters.length; i++) {
          byteNumbers[i] = byteCharacters.charCodeAt(i);
        }
        const blob = new Blob([byteNumbers], { type: item.mimeType || 'video/mp4' });
        const url = URL.createObjectURL(blob);
        item.blobUrl = url;
        return url;
      } catch (e) {
        return `data:${item.mimeType};base64,${item.base64}`;
      }
    }
    return '';
  };

  // Safe and robust video element loader for HTML5 canvas montage
  const prepareVideoElement = (src: string): Promise<HTMLVideoElement> => {
    if (!src) {
      return Promise.reject(new Error('Brak adresu pliku wideo. Wybierz plik wideo ze swojego dysku lub urządzenia.'));
    }

    const video = document.createElement('video');
    video.muted = true;
    video.playsInline = true;
    video.preload = 'auto';

    // NEVER set crossOrigin on blob: or data: URLs (causes CORS network errors in Chrome / mobile WebView)
    if (src.startsWith('http://') || src.startsWith('https://')) {
      try {
        const urlObj = new URL(src, window.location.href);
        if (urlObj.origin !== window.location.origin) {
          video.crossOrigin = 'anonymous';
        }
      } catch (e) {}
    }

    return new Promise<HTMLVideoElement>((resolve, reject) => {
      let isSettled = false;

      const cleanup = () => {
        video.onloadedmetadata = null;
        video.oncanplay = null;
        video.onerror = null;
      };

      const handleSuccess = () => {
        if (!isSettled) {
          isSettled = true;
          cleanup();
          resolve(video);
        }
      };

      video.onloadedmetadata = handleSuccess;
      video.oncanplay = handleSuccess;

      video.onerror = () => {
        if (video.crossOrigin) {
          // Retry without crossOrigin
          video.crossOrigin = null as any;
          video.src = src;
          video.load();
          return;
        }
        if (!isSettled) {
          isSettled = true;
          cleanup();
          const code = video.error ? video.error.code : 0;
          let msg = 'Nie udało się wczytać pliku wideo.';
          if (code === 4) {
            msg = 'Format pliku wideo nie jest wspierany przez tę przeglądarkę (zalecany standardowy format .mp4 / H.264).';
          } else if (code === 2) {
            msg = 'Wystąpił problem z połączeniem podczas ładowania nagrania wideo.';
          }
          reject(new Error(msg));
        }
      };

      video.src = src;
      video.load();

      if (video.readyState >= 1) {
        handleSuccess();
      }

      setTimeout(() => {
        if (!isSettled) {
          if (video.videoWidth > 0 || video.duration > 0 || video.readyState >= 1) {
            handleSuccess();
          } else {
            isSettled = true;
            cleanup();
            reject(new Error('Przekroczono limit czasu ładowania wideo (10s).'));
          }
        }
      }, 10000);
    });
  };

  // Extract authentic thumbnails directly from the user's wedding video at the exact scene timestamps
  useEffect(() => {
    if (!activeBaseVideo) return;
    const videoSrc = getMediaUrl(activeBaseVideo);
    if (!videoSrc) return;

    let isCancelled = false;
    setIsExtractingFrames(true);

    const video = document.createElement('video');
    video.src = videoSrc;
    if (videoSrc.startsWith('http://') || videoSrc.startsWith('https://')) {
      try {
        const u = new URL(videoSrc, window.location.href);
        if (u.origin !== window.location.origin) {
          video.crossOrigin = 'anonymous';
        }
      } catch (e) {}
    }
    video.muted = true;
    video.playsInline = true;
    video.preload = 'metadata';

    video.onerror = () => {
      if (!isCancelled) {
        setIsExtractingFrames(false);
      }
    };

    video.onloadedmetadata = async () => {
      const vidDuration = video.duration || 30;
      const thumbs: Record<number, string> = {};

      for (let i = 0; i < parsedTimeline.length; i++) {
        if (isCancelled) break;
        const scene = parsedTimeline[i];
        
        let targetSec = scene.startSec;
        if (targetSec >= vidDuration - 0.5) {
          targetSec = (i / Math.max(1, parsedTimeline.length - 1)) * Math.max(0, vidDuration - 2);
        }

        video.currentTime = Math.max(0, Math.min(targetSec, vidDuration - 0.5));

        await new Promise<void>((resolve) => {
          const onSeek = () => {
            try {
              const canvas = document.createElement('canvas');
              canvas.width = 480;
              canvas.height = 270;
              const ctx = canvas.getContext('2d');
              if (ctx) {
                ctx.drawImage(video, 0, 0, 480, 270);
                thumbs[i] = canvas.toDataURL('image/jpeg', 0.82);
              }
            } catch (e) {
              console.warn('Frame extraction error', e);
            }
            resolve();
          };
          video.onseeked = onSeek;
          setTimeout(resolve, 800);
        });
      }

      if (!isCancelled) {
        setSceneThumbnails(thumbs);
        setIsExtractingFrames(false);
      }
    };

    video.load();

    return () => {
      isCancelled = true;
    };
  }, [activeBaseVideo?.name, activeBaseVideo?.blobUrl, activeBaseVideo?.id, parsedTimeline.length]);

  // Audio synthesis for romantic background music
  const generateRomanticAudioTrack = (audioCtx: AudioContext, totalDurationSec: number) => {
    const destination = audioCtx.createMediaStreamDestination();
    const masterGain = audioCtx.createGain();
    masterGain.gain.setValueAtTime(0.32, audioCtx.currentTime);
    masterGain.connect(destination);

    const chordProgressions = [
      [164.81, 196.00, 246.94, 329.63], // E minor
      [130.81, 164.81, 196.00, 261.63], // C major
      [196.00, 246.94, 293.66, 392.00], // G major
      [146.83, 220.00, 293.66, 369.99], // D major
    ];

    const chordLength = 3.8;
    const numChords = Math.ceil(totalDurationSec / chordLength) + 1;

    for (let c = 0; c < numChords; c++) {
      const chordTime = audioCtx.currentTime + c * chordLength;
      const notes = chordProgressions[c % chordProgressions.length];

      notes.forEach((freq, noteIdx) => {
        const osc = audioCtx.createOscillator();
        const noteGain = audioCtx.createGain();

        osc.type = noteIdx % 2 === 0 ? 'sine' : 'triangle';
        osc.frequency.setValueAtTime(freq, chordTime);

        const noteStart = chordTime + noteIdx * 0.12;
        noteGain.gain.setValueAtTime(0.0001, noteStart);
        noteGain.gain.exponentialRampToValueAtTime(0.22 / notes.length, noteStart + 0.3);
        noteGain.gain.exponentialRampToValueAtTime(0.0001, noteStart + chordLength * 0.95);

        osc.connect(noteGain);
        noteGain.connect(masterGain);

        osc.start(noteStart);
        osc.stop(noteStart + chordLength);
      });
    }

    return destination;
  };

  // Add more user media files
  const handleAddMediaFiles = async (e: React.ChangeEvent<HTMLInputElement>) => {
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

    setLocalMedia(prev => [...prev, ...newItems]);
    if (onAddMedia) {
      onAddMedia(newItems);
    }
    const hasVideo = newItems.some(it => it.mimeType.startsWith('video'));
    if (hasVideo) {
      setMontageMode('baseVideo');
      setSelectedBaseVideoIndex(0);
    }
    if (e.target) e.target.value = '';
  };

  // -------------------------------------------------------------
  // RENDERING ENGINE
  // -------------------------------------------------------------
  const startAutomaticMontage = async () => {
    triggerHaptic(35);
    setIsRendering(true);
    setRenderProgress(0);
    setRenderedVideoBlob(null);
    setRenderedVideoUrl(null);
    setErrorMessage(null);
    abortControllerRef.current = false;

    const canvas = canvasRef.current;
    if (!canvas) {
      setErrorMessage('Błąd inicjalizacji silnika graficznego.');
      setIsRendering(false);
      return;
    }

    // Resolution setup
    const width = aspectRatio === '9:16' ? 720 : 1280;
    const height = aspectRatio === '9:16' ? 1280 : 720;
    canvas.width = width;
    canvas.height = height;

    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) {
      setErrorMessage('Nie udało się utworzyć kontekstu 2D.');
      setIsRendering(false);
      return;
    }

    try {
      if (montageMode === 'baseVideo') {
        try {
          await renderBaseVideoMontage(ctx, width, height);
        } catch (baseErr: any) {
          console.warn('Przełączanie na tryb teledysku ze scenariusza:', baseErr);
          setStatusMessage('Przełączanie na montaż teledysku z rozdziałów scenariusza...');
          await renderHighlightsMontageFromBaseVideo(ctx, width, height);
        }
      } else {
        await renderHighlightsMontageFromBaseVideo(ctx, width, height);
      }
    } catch (err: any) {
      console.error('Błąd montażu:', err);
      setErrorMessage(`Błąd montażu: ${err.message || 'Nieznany błąd renderowania.'}`);
      setIsRendering(false);
    }
  };

  // -------------------------------------------------------------
  // MODE 1: BASE VIDEO WITH OVERLAYS (Film Bazowy z Dodatkami)
  // -------------------------------------------------------------
  const renderBaseVideoMontage = async (
    ctx: CanvasRenderingContext2D, 
    width: number, 
    height: number
  ) => {
    if (!activeBaseVideo) {
      throw new Error('Brak wybranego filmu bazowego. Dodaj plik wideo, aby go zmontować.');
    }

    setStatusMessage('Wczytywanie Twojego oryginalnego nagrania ślubnego...');
    const videoUrl = getMediaUrl(activeBaseVideo);
    if (!videoUrl) {
      throw new Error('Nie znaleziono źródła dla wybranego pliku wideo. Wgraj plik ponownie lub wybierz inny.');
    }

    const video = await prepareVideoElement(videoUrl);

    const origDuration = video.duration || 30;
    let targetDuration = origDuration;
    if (baseVideoDurationOption === '30s') targetDuration = Math.min(30, origDuration);
    if (baseVideoDurationOption === '60s') targetDuration = Math.min(60, origDuration);

    setStatusMessage(`Przygotowywanie miksu kinowego (${Math.round(targetDuration)}s)...`);

    // Audio setup
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    const audioCtx = new AudioCtx();
    const audioDestination = includeAudio ? generateRomanticAudioTrack(audioCtx, targetDuration) : null;

    // Stream & Recorder
    const canvasStream = (canvasRef.current as any).captureStream(30);
    const combinedTracks: MediaStreamTrack[] = [...canvasStream.getVideoTracks()];
    if (audioDestination) {
      combinedTracks.push(...audioDestination.stream.getAudioTracks());
    }
    const combinedStream = new MediaStream(combinedTracks);

    let mimeType = 'video/mp4';
    if (!MediaRecorder.isTypeSupported('video/mp4')) {
      mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
        ? 'video/webm;codecs=vp9'
        : 'video/webm';
    }
    setRenderedFormat(mimeType.includes('mp4') ? 'mp4' : 'webm');

    const recordedChunks: Blob[] = [];
    const mediaRecorder = new MediaRecorder(combinedStream, {
      mimeType,
      videoBitsPerSecond: 4_500_000
    });

    mediaRecorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) recordedChunks.push(e.data);
    };

    const recordingPromise = new Promise<Blob>((resolve) => {
      mediaRecorder.onstop = () => {
        const blob = new Blob(recordedChunks, { type: mimeType });
        resolve(blob);
      };
    });

    mediaRecorder.start(250);
    video.currentTime = 0;
    await video.play().catch(e => console.warn('Video play notice:', e));

    const fps = 30;
    const frameInterval = 1000 / fps;
    const totalFrames = Math.round(targetDuration * fps);

    for (let f = 0; f < totalFrames; f++) {
      if (abortControllerRef.current) break;

      let currentTime = video.currentTime;
      if (video.paused || isNaN(currentTime)) {
        currentTime = (f / totalFrames) * targetDuration;
        video.currentTime = currentTime;
      }

      setRenderProgress(Math.min(Math.round((f / totalFrames) * 100), 99));
      setStatusMessage(`Wypalanie dodatków na Twoim filmie: ${Math.round(currentTime)}s / ${Math.round(targetDuration)}s`);

      // 1. Draw User's Real Video Frame
      ctx.fillStyle = '#030712';
      ctx.fillRect(0, 0, width, height);

      const vW = video.videoWidth || 1280;
      const vH = video.videoHeight || 720;
      const vRatio = vW / vH;
      const canvasRatio = width / height;

      let drawW = width;
      let drawH = height;
      if (vRatio > canvasRatio) {
        drawW = height * vRatio;
      } else {
        drawH = width / vRatio;
      }
      const drawX = (width - drawW) / 2;
      const drawY = (height - drawH) / 2;

      ctx.drawImage(video, drawX, drawY, drawW, drawH);

      // 2. Cinematic Letterbox Bars
      const barH = height * 0.08;
      ctx.fillStyle = 'rgba(0, 0, 0, 0.75)';
      ctx.fillRect(0, 0, width, barH);
      ctx.fillRect(0, height - barH, width, barH);

      // 3. Top Header
      ctx.textAlign = 'center';
      ctx.fillStyle = '#fb7185';
      ctx.font = 'bold 15px sans-serif';
      ctx.fillText('✦ JOANNA & PIOTR ✦', width / 2, barH * 0.65);

      // 4. Intro Overlay (first 3 seconds)
      if (currentTime < 3.2) {
        const introAlpha = currentTime < 2.5 ? 1 : Math.max(0, (3.2 - currentTime) / 0.7);
        ctx.save();
        ctx.globalAlpha = introAlpha * 0.9;
        ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
        ctx.fillRect(width * 0.08, height * 0.35, width * 0.84, height * 0.3);
        ctx.strokeStyle = '#f43f5e';
        ctx.lineWidth = 2;
        ctx.strokeRect(width * 0.08, height * 0.35, width * 0.84, height * 0.3);

        ctx.globalAlpha = introAlpha;
        ctx.textAlign = 'center';
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 26px serif';
        ctx.fillText(storyboard.title.substring(0, 32), width / 2, height * 0.46);

        ctx.fillStyle = '#fde047';
        ctx.font = 'italic 16px sans-serif';
        ctx.fillText('Film Ślubny • Pamiątka na całe życie', width / 2, height * 0.53);
        ctx.restore();
      }

      // 5. Chapter Lower-Thirds at Timeline Timestamps
      const activeChapter = parsedTimeline.find(
        ch => currentTime >= ch.startSec && currentTime < ch.startSec + 4.5
      );

      if (activeChapter && currentTime >= 3.2 && currentTime < targetDuration - 3.0) {
        const timeIntoChapter = currentTime - activeChapter.startSec;
        let chapterAlpha = 1;
        if (timeIntoChapter < 0.5) chapterAlpha = timeIntoChapter / 0.5;
        if (timeIntoChapter > 3.8) chapterAlpha = Math.max(0, (4.5 - timeIntoChapter) / 0.7);

        ctx.save();
        ctx.globalAlpha = chapterAlpha * 0.92;

        const boxX = width * 0.06;
        const boxY = height * 0.72;
        const boxW = width * 0.88;
        const boxH = height * 0.16;

        ctx.fillStyle = 'rgba(2, 6, 23, 0.88)';
        ctx.fillRect(boxX, boxY, boxW, boxH);
        ctx.strokeStyle = 'rgba(244, 63, 94, 0.8)';
        ctx.lineWidth = 1.5;
        ctx.strokeRect(boxX, boxY, boxW, boxH);

        // Gold accent bar
        ctx.fillStyle = '#f59e0b';
        ctx.fillRect(boxX, boxY, 5, boxH);

        ctx.globalAlpha = chapterAlpha;
        ctx.textAlign = 'left';

        // Chapter tag
        ctx.fillStyle = '#fda4af';
        ctx.font = 'bold 12px sans-serif';
        ctx.fillText(`ROZDZIAŁ ${activeChapter.index + 1} • ⏱ ${activeChapter.time}`, boxX + 18, boxY + 24);

        // Title
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 18px serif';
        ctx.fillText(activeChapter.elementName.substring(0, 36), boxX + 18, boxY + 50);

        // Action
        ctx.fillStyle = '#cbd5e1';
        ctx.font = '12px sans-serif';
        ctx.fillText(activeChapter.action.substring(0, 48), boxX + 18, boxY + 74);

        ctx.restore();
      }

      // 6. Subtitles narrative
      if (showSubtitles && currentTime >= 3.5 && currentTime < targetDuration - 3.0) {
        ctx.save();
        ctx.textAlign = 'center';
        ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
        ctx.fillRect(width * 0.1, height - barH - 34, width * 0.8, 28);
        ctx.fillStyle = '#f1f5f9';
        ctx.font = 'italic 12px sans-serif';
        ctx.fillText(`„${storyboard.voiceover.substring(0, 52)}...”`, width / 2, height - barH - 16);
        ctx.restore();
      }

      // 7. Outro (last 3 seconds)
      if (currentTime >= targetDuration - 3.0) {
        ctx.save();
        ctx.fillStyle = 'rgba(2, 6, 23, 0.85)';
        ctx.fillRect(width * 0.1, height * 0.38, width * 0.8, height * 0.25);
        ctx.strokeStyle = '#f59e0b';
        ctx.lineWidth = 2;
        ctx.strokeRect(width * 0.1, height * 0.38, width * 0.8, height * 0.25);

        ctx.textAlign = 'center';
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 24px serif';
        ctx.fillText('I żyli długo i szczęśliwie...', width / 2, height * 0.48);

        ctx.fillStyle = '#fb7185';
        ctx.font = '15px sans-serif';
        ctx.fillText('Joanna & Piotr', width / 2, height * 0.55);
        ctx.restore();
      }

      await new Promise(r => setTimeout(r, frameInterval));
    }

    video.pause();
    mediaRecorder.stop();
    setStatusMessage('Zapisywanie Twojego zmontowanego filmu...');

    const finalBlob = await recordingPromise;
    setRenderedVideoBlob(finalBlob);
    setRenderedVideoUrl(URL.createObjectURL(finalBlob));
    setRenderProgress(100);
    setIsRendering(false);
    triggerHaptic(50);
  };

  // -------------------------------------------------------------
  // MODE 2: HIGHLIGHTS MONTAGE SOURCED 100% FROM USER'S FILM OR PHOTOS
  // -------------------------------------------------------------
  const renderHighlightsMontageFromBaseVideo = async (
    ctx: CanvasRenderingContext2D, 
    width: number, 
    height: number
  ) => {
    setStatusMessage('Przygotowywanie ujęć ze scenariusza...');

    const totalScenes = parsedTimeline.length;
    const totalDuration = totalScenes * sceneDuration + 4.0; // intro + outro buffer

    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    const audioCtx = new AudioCtx();
    const audioDestination = includeAudio ? generateRomanticAudioTrack(audioCtx, totalDuration) : null;

    const canvasStream = (canvasRef.current as any).captureStream(30);
    const combinedTracks: MediaStreamTrack[] = [...canvasStream.getVideoTracks()];
    if (audioDestination) {
      combinedTracks.push(...audioDestination.stream.getAudioTracks());
    }
    const combinedStream = new MediaStream(combinedTracks);

    let mimeType = 'video/mp4';
    if (!MediaRecorder.isTypeSupported('video/mp4')) {
      mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
        ? 'video/webm;codecs=vp9'
        : 'video/webm';
    }
    setRenderedFormat(mimeType.includes('mp4') ? 'mp4' : 'webm');

    const recordedChunks: Blob[] = [];
    const mediaRecorder = new MediaRecorder(combinedStream, {
      mimeType,
      videoBitsPerSecond: 4_000_000
    });

    mediaRecorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) recordedChunks.push(e.data);
    };

    const recordingPromise = new Promise<Blob>((resolve) => {
      mediaRecorder.onstop = () => {
        resolve(new Blob(recordedChunks, { type: mimeType }));
      };
    });

    mediaRecorder.start(250);

    const fps = 30;
    const frameInterval = 1000 / fps;
    let totalElapsed = 0;

    // If user has a base video, we extract clips directly from it!
    let baseVideoElement: HTMLVideoElement | null = null;
    let baseVideoDuration = 30;

    if (activeBaseVideo) {
      const bSrc = getMediaUrl(activeBaseVideo);
      if (bSrc) {
        try {
          baseVideoElement = await prepareVideoElement(bSrc);
          baseVideoDuration = baseVideoElement.duration || 30;
        } catch (e) {
          console.warn('Highlights base video load notice:', e);
          baseVideoElement = null;
        }
      }
    }

    // 1. INTRO (2 seconds)
    const introFrames = Math.round(2.0 * fps);
    for (let f = 0; f < introFrames; f++) {
      if (abortControllerRef.current) break;
      totalElapsed += 1 / fps;
      setRenderProgress(Math.min(Math.round((totalElapsed / totalDuration) * 100), 99));

      ctx.fillStyle = '#020617';
      ctx.fillRect(0, 0, width, height);

      // If we have cover, subtle background
      if (coverUrl) {
        // Dark background
        ctx.fillStyle = 'rgba(15, 23, 42, 0.95)';
        ctx.fillRect(0, 0, width, height);
      }

      ctx.textAlign = 'center';
      ctx.fillStyle = '#f43f5e';
      ctx.font = 'bold 16px sans-serif';
      ctx.fillText('✦ TELEDYSK ŚLUBNY ✦', width / 2, height * 0.42);

      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 28px serif';
      ctx.fillText('Joanna & Piotr', width / 2, height * 0.50);

      ctx.fillStyle = '#fde047';
      ctx.font = 'italic 15px sans-serif';
      ctx.fillText(storyboard.title.substring(0, 34), width / 2, height * 0.57);

      await new Promise(r => setTimeout(r, frameInterval));
    }

    // 2. RENDER EACH SCENE USING USER'S OWN VIDEO / PHOTOS
    for (let sIdx = 0; sIdx < parsedTimeline.length; sIdx++) {
      if (abortControllerRef.current) break;
      const scene = parsedTimeline[sIdx];
      setCurrentRenderingScene(sIdx + 1);
      setStatusMessage(`Ujęcie ${sIdx + 1}/${totalScenes}: ${scene.elementName} (z Twojego filmu)`);

      // If user has base video, seek to the scene's exact timestamp
      if (baseVideoElement) {
        let seekTime = scene.startSec;
        if (seekTime >= baseVideoDuration - sceneDuration) {
          seekTime = (sIdx / Math.max(1, totalScenes - 1)) * Math.max(0, baseVideoDuration - sceneDuration - 1);
        }

        baseVideoElement.currentTime = Math.max(0, seekTime);
        await new Promise<void>((res) => {
          baseVideoElement!.onseeked = () => res();
          setTimeout(res, 600);
        });
        baseVideoElement.play().catch(() => {});
      }

      // Preloaded image fallback if no video
      let photoImg: HTMLImageElement | null = null;
      if (!baseVideoElement) {
        const userPhoto = userPhotoFiles[sIdx % userPhotoFiles.length];
        const photoSrc = userPhoto ? getMediaUrl(userPhoto) : coverUrl;
        if (photoSrc) {
          photoImg = new Image();
          photoImg.crossOrigin = 'anonymous';
          await new Promise<void>(res => {
            photoImg!.onload = () => res();
            photoImg!.onerror = () => res();
            setTimeout(res, 1500);
            photoImg!.src = photoSrc;
          });
        }
      }

      const frames = Math.round(sceneDuration * fps);
      for (let f = 0; f < frames; f++) {
        if (abortControllerRef.current) break;
        totalElapsed += 1 / fps;
        setRenderProgress(Math.min(Math.round((totalElapsed / totalDuration) * 100), 99));

        ctx.fillStyle = '#030712';
        ctx.fillRect(0, 0, width, height);

        if (baseVideoElement) {
          // Draw real frame from user's video!
          const vW = baseVideoElement.videoWidth || 1280;
          const vH = baseVideoElement.videoHeight || 720;
          const vRatio = vW / vH;
          const canvasRatio = width / height;

          let drawW = width;
          let drawH = height;
          if (vRatio > canvasRatio) {
            drawW = height * vRatio;
          } else {
            drawH = width / vRatio;
          }
          const drawX = (width - drawW) / 2;
          const drawY = (height - drawH) / 2;
          ctx.drawImage(baseVideoElement, drawX, drawY, drawW, drawH);
        } else if (photoImg && photoImg.naturalWidth > 0) {
          // Ken Burns zoom on user's own photo / cover
          const scale = 1.0 + (f / frames) * 0.12;
          const sW = width * scale;
          const sH = height * scale;
          const sX = (width - sW) / 2;
          const sY = (height - sH) / 2;
          ctx.drawImage(photoImg, sX, sY, sW, sH);
        } else {
          // Elegant luxury typography card
          ctx.fillStyle = '#0f172a';
          ctx.fillRect(0, 0, width, height);
          ctx.strokeStyle = '#f43f5e';
          ctx.lineWidth = 2;
          ctx.strokeRect(width * 0.1, height * 0.2, width * 0.8, height * 0.6);
        }

        // Scene Lower-Third Overlay
        const boxX = width * 0.06;
        const boxY = height * 0.74;
        const boxW = width * 0.88;
        const boxH = height * 0.17;

        ctx.fillStyle = 'rgba(2, 6, 23, 0.88)';
        ctx.fillRect(boxX, boxY, boxW, boxH);
        ctx.strokeStyle = '#f43f5e';
        ctx.lineWidth = 1.5;
        ctx.strokeRect(boxX, boxY, boxW, boxH);

        // Accent strip
        ctx.fillStyle = '#f59e0b';
        ctx.fillRect(boxX, boxY, 5, boxH);

        ctx.textAlign = 'left';
        ctx.fillStyle = '#fde047';
        ctx.font = 'bold 12px sans-serif';
        ctx.fillText(`SCENA ${sIdx + 1} z ${totalScenes} • ⏱ ${scene.time}`, boxX + 16, boxY + 24);

        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 17px serif';
        ctx.fillText(scene.elementName.substring(0, 36), boxX + 16, boxY + 48);

        ctx.fillStyle = '#cbd5e1';
        ctx.font = '12px sans-serif';
        ctx.fillText(scene.action.substring(0, 48), boxX + 16, boxY + 70);

        await new Promise(r => setTimeout(r, frameInterval));
      }

      if (baseVideoElement) {
        baseVideoElement.pause();
      }
    }

    mediaRecorder.stop();
    setStatusMessage('Zapisywanie finalnego teledysku ze scen...');
    const finalBlob = await recordingPromise;
    setRenderedVideoBlob(finalBlob);
    setRenderedVideoUrl(URL.createObjectURL(finalBlob));
    setRenderProgress(100);
    setIsRendering(false);
    triggerHaptic(50);
  };

  // Download rendered video
  const downloadRenderedVideo = () => {
    if (!renderedVideoBlob) return;
    triggerHaptic(20);
    const a = document.createElement('a');
    a.href = URL.createObjectURL(renderedVideoBlob);
    a.download = `Joanna_i_Piotr_Teledysk_Slubny.${renderedFormat}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  return (
    <div 
      id="auto-montage-modal"
      className="fixed inset-0 z-50 bg-black/95 backdrop-blur-xl text-white flex flex-col justify-between overflow-y-auto"
    >
      <input 
        type="file"
        ref={fileInputRef}
        onChange={handleAddMediaFiles}
        multiple
        accept="video/*,image/*"
        className="hidden"
      />

      {/* Top Header */}
      <div className="sticky top-0 z-20 bg-slate-950/90 backdrop-blur-md p-4 pt-safe flex items-center justify-between border-b border-slate-800">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-rose-500 to-amber-400 flex items-center justify-center shadow-md">
            <Clapperboard className="w-4 h-4 text-slate-950 font-bold" />
          </div>
          <div>
            <h2 className="text-sm sm:text-base font-bold text-white flex items-center gap-1.5 font-serif-luxury">
              Montaż & Eksport Filmu
            </h2>
            <p className="text-[10px] text-rose-300">
              Ujęcia wyłącznie z Twojego filmu • Joanna & Piotr • POCO F6 AMOLED
            </p>
          </div>
        </div>

        <button 
          id="close-montage-btn"
          onClick={onClose}
          className="w-9 h-9 rounded-full bg-white/10 active:bg-white/20 flex items-center justify-center text-slate-300 hover:text-white transition"
          aria-label="Zamknij"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Main Content */}
      <div className="max-w-2xl w-full mx-auto p-4 sm:p-6 space-y-5">
        
        {errorMessage && (
          <div className="p-3.5 rounded-2xl bg-rose-950/80 border border-rose-700/80 text-rose-200 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
            <span>{errorMessage}</span>
          </div>
        )}

        {/* MODE SELECTOR TABS */}
        {!isRendering && !renderedVideoUrl && (
          <div className="grid grid-cols-2 gap-2 p-1 bg-slate-900/90 rounded-2xl border border-slate-800">
            <button
              onClick={() => { triggerHaptic(15); setMontageMode('baseVideo'); }}
              className={`py-3 px-3 rounded-xl flex flex-col items-center text-center gap-1 transition ${
                montageMode === 'baseVideo'
                  ? 'bg-rose-600 text-white font-bold shadow-lg shadow-rose-900/40'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <div className="flex items-center gap-1.5">
                <Video className="w-4 h-4" />
                <span className="text-xs font-semibold">Film Bazowy z Dodatkami</span>
              </div>
              <span className="text-[10px] opacity-80">
                Cały Twój film + intro, rozdziały i napisy
              </span>
            </button>

            <button
              onClick={() => { triggerHaptic(15); setMontageMode('multiClip'); }}
              className={`py-3 px-3 rounded-xl flex flex-col items-center text-center gap-1 transition ${
                montageMode === 'multiClip'
                  ? 'bg-rose-600 text-white font-bold shadow-lg shadow-rose-900/40'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <div className="flex items-center gap-1.5">
                <Scissors className="w-4 h-4" />
                <span className="text-xs font-semibold">Dynamiczny Teledysk</span>
              </div>
              <span className="text-[10px] opacity-80">
                Skrót ujęć wycięty z Twojego filmu
              </span>
            </button>
          </div>
        )}

        {/* Video Preview / Render Canvas Area */}
        <div className="relative rounded-3xl overflow-hidden bg-slate-900 border border-slate-800 shadow-2xl flex flex-col items-center justify-center min-h-[320px] sm:min-h-[400px]">
          
          <canvas 
            ref={canvasRef}
            className={`max-h-[380px] sm:max-h-[440px] w-auto max-w-full rounded-2xl shadow-xl ${
              renderedVideoUrl ? 'hidden' : 'block'
            }`}
          />

          {/* Rendered Finished Video */}
          {renderedVideoUrl && (
            <div className="w-full flex flex-col items-center p-2">
              <video 
                ref={videoPlayerRef}
                src={renderedVideoUrl}
                controls
                autoPlay
                playsInline
                className="max-h-[420px] sm:max-h-[480px] w-auto max-w-full rounded-2xl shadow-2xl border border-rose-500/30"
              />
              <div className="mt-3 flex items-center gap-2 text-xs text-emerald-400 font-medium">
                <CheckCircle2 className="w-4 h-4" />
                <span>Film zmontowany pomyślnie na bazie Twojego materiału!</span>
              </div>
            </div>
          )}

          {/* Progress Overlay */}
          {isRendering && (
            <div className="absolute inset-0 bg-slate-950/85 backdrop-blur-xs flex flex-col items-center justify-center p-6 text-center z-10">
              <div className="relative w-20 h-20 mb-4 flex items-center justify-center">
                <svg className="w-full h-full transform -rotate-90" viewBox="0 0 36 36">
                  <path
                    className="text-slate-800"
                    strokeWidth="3.5"
                    stroke="currentColor"
                    fill="none"
                    d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                  />
                  <path
                    className="text-rose-500 transition-all duration-300 stroke-current"
                    strokeWidth="3.5"
                    strokeDasharray={`${renderProgress}, 100`}
                    strokeLinecap="round"
                    fill="none"
                    d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                  />
                </svg>
                <span className="absolute font-bold text-sm text-white">{renderProgress}%</span>
              </div>

              <h4 className="text-base font-bold text-white mb-1 font-serif-luxury">
                Montowanie Twojego Filmu...
              </h4>
              <p className="text-xs text-rose-300 font-medium max-w-xs">{statusMessage}</p>
            </div>
          )}

          {/* Initial State Explanations */}
          {!isRendering && !renderedVideoUrl && (
            <div className="text-center p-6 space-y-3">
              <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-rose-500 to-amber-500 text-slate-950 flex items-center justify-center mx-auto shadow-lg">
                <Film className="w-7 h-7 stroke-[2.5]" />
              </div>
              <h3 className="text-lg font-bold text-white font-serif-luxury">
                {montageMode === 'baseVideo' ? 'Oryginalny Film z Nakładkami' : 'Teledysk wycięty z Twojego Wideo'}
              </h3>
              <p className="text-xs text-slate-300 max-w-sm mx-auto font-light leading-relaxed">
                {montageMode === 'baseVideo' 
                  ? 'Oryginalne wideo ze ślubu zostanie wyrenderowane z kinowymi belkami rozdziałów, napisami i dedykowanym intro.'
                  : `Każda z ${parsedTimeline.length} scen teledysku zostanie wycięta bezpośrednio z Twojego nagrania wideo w odpowiednich sekundach.`}
              </p>
            </div>
          )}

        </div>

        {/* SCENE KADRY (Frames extracted from user's video) */}
        {!isRendering && !renderedVideoUrl && (
          <div className="bg-slate-900/90 rounded-3xl p-4 sm:p-5 border border-slate-800 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
                  <Camera className="w-4 h-4 text-rose-400" />
                  Kadry ze Scenariusza ({parsedTimeline.length})
                </h4>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  {isExtractingFrames 
                    ? 'Wczytywanie kadrów z Twojego filmu...' 
                    : userVideoFiles.length > 0
                      ? 'Kadry pobrane bezpośrednio z Twojego wideo ślubnego'
                      : 'Dodaj plik wideo, aby automatycznie pobrać kadry'}
                </p>
              </div>

              <button
                onClick={() => { triggerHaptic(15); fileInputRef.current?.click(); }}
                className="bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-500/40 text-xs px-3 py-1.5 rounded-xl flex items-center gap-1.5 transition active:scale-95 font-semibold"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>+ Dodaj plik</span>
              </button>
            </div>

            {/* Horizontal scrollable scene frames */}
            <div className="flex gap-2.5 overflow-x-auto pb-2 pt-1">
              {parsedTimeline.map((scene, idx) => {
                const thumb = sceneThumbnails[idx] || (userPhotoFiles[idx % userPhotoFiles.length] ? getMediaUrl(userPhotoFiles[idx % userPhotoFiles.length]) : coverUrl);

                return (
                  <div 
                    key={idx}
                    className="shrink-0 w-36 bg-slate-950 rounded-2xl overflow-hidden border border-slate-800 flex flex-col"
                  >
                    <div className="relative h-20 bg-slate-900 overflow-hidden flex items-center justify-center">
                      {thumb ? (
                        <img 
                          src={thumb} 
                          alt={scene.elementName}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="text-[10px] text-slate-500 flex flex-col items-center">
                          <Film className="w-5 h-5 text-slate-600 mb-1" />
                          <span>Kadr {scene.time}</span>
                        </div>
                      )}
                      <div className="absolute top-1 left-1 px-1.5 py-0.5 rounded bg-black/75 text-[9px] font-mono text-amber-300 font-bold">
                        {scene.time}
                      </div>
                    </div>

                    <div className="p-2 flex-1 flex flex-col justify-between">
                      <div className="text-[11px] font-bold text-white truncate">
                        {scene.elementName}
                      </div>
                      <div className="text-[9px] text-slate-400 line-clamp-1 mt-0.5">
                        {scene.action}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

          </div>
        )}

        {/* Base Video Selector & Options (when in baseVideo mode) */}
        {!isRendering && !renderedVideoUrl && montageMode === 'baseVideo' && (
          <div className="bg-slate-900/90 rounded-3xl p-4 sm:p-5 border border-slate-800 space-y-4">
            
            <div className="flex items-center justify-between">
              <div>
                <h4 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
                  <Video className="w-4 h-4 text-rose-400" />
                  Wybierz wideo bazowe
                </h4>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  {userVideoFiles.length > 0 
                    ? `Dostępne ${userVideoFiles.length} wideo w projekcie` 
                    : 'Nie wgrałeś jeszcze pliku wideo'}
                </p>
              </div>
            </div>

            {userVideoFiles.length > 0 ? (
              <div className="space-y-2">
                {userVideoFiles.map((vf, idx) => (
                  <button
                    key={idx}
                    onClick={() => { triggerHaptic(15); setSelectedBaseVideoIndex(idx); }}
                    className={`w-full p-3 rounded-2xl border text-left flex items-center justify-between transition ${
                      selectedBaseVideoIndex === idx
                        ? 'bg-rose-950/60 border-rose-500 text-white ring-1 ring-rose-500/50'
                        : 'bg-slate-950/60 border-slate-800 text-slate-300 hover:bg-slate-900'
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-lg bg-rose-500/20 flex items-center justify-center text-rose-400">
                        <Video className="w-4 h-4" />
                      </div>
                      <div>
                        <div className="text-xs font-bold truncate max-w-[200px] sm:max-w-xs">{vf.name}</div>
                        <div className="text-[10px] text-slate-400">Główne nagranie ślubne</div>
                      </div>
                    </div>
                    {selectedBaseVideoIndex === idx && (
                      <CheckCircle2 className="w-4 h-4 text-rose-400" />
                    )}
                  </button>
                ))}
              </div>
            ) : (
              <div className="p-4 rounded-2xl bg-amber-950/30 border border-amber-500/30 text-center">
                <p className="text-xs text-amber-200">
                  Wgraj plik wideo ze ślubu, aby silnik zmontował go z kinowymi nakładkami.
                </p>
              </div>
            )}

            {/* Duration Selector for Base Video */}
            <div className="pt-2 border-t border-slate-800 flex items-center justify-between">
              <span className="text-xs text-slate-300 font-medium">Czas trwania montażu:</span>
              <div className="flex items-center gap-1">
                {(['full', '60s', '30s'] as const).map(opt => (
                  <button
                    key={opt}
                    onClick={() => { triggerHaptic(10); setBaseVideoDurationOption(opt); }}
                    className={`text-xs px-2.5 py-1 rounded-lg border font-medium transition ${
                      baseVideoDurationOption === opt
                        ? 'bg-rose-600 text-white border-rose-400 font-bold'
                        : 'bg-slate-800 text-slate-300 border-slate-700'
                    }`}
                  >
                    {opt === 'full' ? 'Cały film' : opt}
                  </button>
                ))}
              </div>
            </div>

          </div>
        )}

        {/* Global Settings & Export Actions */}
        {!isRendering && !renderedVideoUrl && (
          <div className="space-y-4">
            {/* Format & Audio Toggles */}
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-slate-900/90 p-3.5 rounded-2xl border border-slate-800 flex items-center justify-between">
                <span className="text-xs text-slate-300">Format wideo:</span>
                <div className="flex gap-1">
                  <button
                    onClick={() => setAspectRatio('9:16')}
                    className={`text-[11px] px-2 py-1 rounded-lg font-bold transition ${
                      aspectRatio === '9:16' ? 'bg-rose-600 text-white' : 'bg-slate-800 text-slate-400'
                    }`}
                  >
                    9:16 (Pion)
                  </button>
                  <button
                    onClick={() => setAspectRatio('16:9')}
                    className={`text-[11px] px-2 py-1 rounded-lg font-bold transition ${
                      aspectRatio === '16:9' ? 'bg-rose-600 text-white' : 'bg-slate-800 text-slate-400'
                    }`}
                  >
                    16:9 (Kino)
                  </button>
                </div>
              </div>

              <div className="bg-slate-900/90 p-3.5 rounded-2xl border border-slate-800 flex items-center justify-between">
                <span className="text-xs text-slate-300">Muzyka w tle:</span>
                <button
                  onClick={() => { triggerHaptic(10); setIncludeAudio(!includeAudio); }}
                  className={`text-xs font-bold px-3 py-1 rounded-lg transition ${
                    includeAudio ? 'bg-amber-400 text-slate-950' : 'bg-slate-800 text-slate-400'
                  }`}
                >
                  {includeAudio ? 'ON' : 'OFF'}
                </button>
              </div>
            </div>

            {/* Launch Montage Button */}
            <button
              id="start-montage-btn"
              onClick={startAutomaticMontage}
              className="min-h-[52px] w-full bg-gradient-to-r from-rose-600 via-rose-500 to-amber-500 hover:from-rose-500 hover:to-amber-400 text-white font-bold text-sm sm:text-base py-3 px-6 rounded-2xl shadow-xl shadow-rose-950/60 flex items-center justify-center gap-2.5 active:scale-98 transition transform"
            >
              <Film className="w-5 h-5 stroke-[2.5]" />
              <span>
                {montageMode === 'baseVideo' 
                  ? 'Zmontuj Film Bazowy z Dodatkami' 
                  : 'Zmontuj Teledysk ze Scen z Twojego Filmu'}
              </span>
            </button>
          </div>
        )}

        {/* Download actions when completed */}
        {renderedVideoUrl && (
          <div className="space-y-3 pt-2">
            <button
              id="download-montage-btn"
              onClick={downloadRenderedVideo}
              className="min-h-[52px] w-full bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-white font-bold text-sm sm:text-base py-3 px-6 rounded-2xl shadow-xl flex items-center justify-center gap-2.5 active:scale-98 transition"
            >
              <Download className="w-5 h-5" />
              <span>Pobierz Gotowy Film (.mp4 / .webm)</span>
            </button>

            <button
              onClick={() => {
                setRenderedVideoUrl(null);
                setRenderedVideoBlob(null);
              }}
              className="w-full text-xs text-slate-400 hover:text-white py-2 flex items-center justify-center gap-1.5 transition"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Zmontuj ponownie z innymi ustawieniami</span>
            </button>
          </div>
        )}

      </div>
    </div>
  );
}
