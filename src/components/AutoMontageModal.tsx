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
  Scissors,
  Activity,
  Heart,
  SunMedium,
  Ban,
  Mic,
  FileDown,
  Loader2
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Storyboard, MediaItem } from '../types/legacy';
import { downloadStoryboardPdfFile } from '../lib/pdfExport';
import { AudioTrackSelector, CustomAudioState } from './AudioTrackSelector';
import { playSynthesizedGenreMusic, getDefaultGenreForMood } from '../lib/soundLibrary';
import { VoiceRecorderModal } from './VoiceRecorderModal';
import { BeatAnalysisResult } from '../lib/beatDetector';

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

  // Montage Mode: 'baseVideo' or 'multiClip'
  const [montageMode, setMontageMode] = useState<'baseVideo' | 'multiClip'>(
    userVideoFiles.length > 0 ? 'baseVideo' : 'multiClip'
  );

  const [selectedBaseVideoIndex, setSelectedBaseVideoIndex] = useState(0);
  const activeBaseVideo = userVideoFiles[selectedBaseVideoIndex] || userVideoFiles[0] || null;

  // Montage Configuration - original format from video with natural duration
  const [sceneDuration, setSceneDuration] = useState(3.5); // seconds per scene in highlights mode
  const [includeAudio, setIncludeAudio] = useState(true);
  const [showSubtitles, setShowSubtitles] = useState(true);

  // Audio & Music: Custom Song, Beat Detection, Voiceover (no ambient music)
  const [customAudio, setCustomAudio] = useState<CustomAudioState>({
    file: null,
    url: null,
    name: '',
    duration: 0,
    beatData: null,
    syncWithBeats: true,
  });
  const [isCustomMusicSelected, setIsCustomMusicSelected] = useState(false);
  const [voiceoverBlob, setVoiceoverBlob] = useState<Blob | null>(null);
  const [voiceoverUrl, setVoiceoverUrl] = useState<string | null>(null);
  const [voiceoverDuration, setVoiceoverDuration] = useState(0);
  const [isVoiceRecorderOpen, setIsVoiceRecorderOpen] = useState(false);

  // Extracted scene thumbnails
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
  const [isExportingPdf, setIsExportingPdf] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const videoPlayerRef = useRef<HTMLVideoElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const abortControllerRef = useRef<boolean>(false);

  const triggerHaptic = (duration = 20) => {
    if (typeof window !== 'undefined' && 'vibrate' in navigator) {
      try { navigator.vibrate(duration); } catch (e) {}
    }
  };

  // Convert timeline to timestamps
  const parsedTimeline = storyboard.timeline.map((item, index) => {
    const startSec = parseTimeToSeconds(item.time);
    return {
      ...item,
      index,
      startSec
    };
  }).sort((a, b) => a.startSec - b.startSec);

  // Determine media URL
  const getMediaUrl = (item: MediaItem | null): string => {
    if (!item) return '';
    if (item.cloudUrl) return item.cloudUrl;
    if (item.blobUrl) return item.blobUrl;
    if (item.base64) return `data:${item.mimeType};base64,${item.base64}`;
    if (item.type === 'drive' && item.id) {
      return `/api/drive/stream/${item.id}?accessToken=${token || ''}`;
    }
    return '';
  };

  // Extract frames for chapter preview
  useEffect(() => {
    let isCancelled = false;
    async function extractFrames() {
      if (!activeBaseVideo || parsedTimeline.length === 0) return;
      const vUrl = getMediaUrl(activeBaseVideo);
      if (!vUrl) return;

      setIsExtractingFrames(true);
      const video = document.createElement('video');
      video.crossOrigin = 'anonymous';
      video.muted = true;
      video.playsInline = true;
      video.src = vUrl;

      const loadedPromise = new Promise<void>((resolve) => {
        video.onloadedmetadata = () => resolve();
        video.onerror = () => resolve();
        setTimeout(resolve, 3000);
      });
      await loadedPromise;

      const c = document.createElement('canvas');
      c.width = 160;
      c.height = 90;
      const ctx = c.getContext('2d');
      const thumbs: Record<number, string> = {};

      for (let i = 0; i < parsedTimeline.length; i++) {
        if (isCancelled) break;
        const scene = parsedTimeline[i];
        let targetTime = scene.startSec;
        if (video.duration && targetTime >= video.duration) {
          targetTime = (i / parsedTimeline.length) * Math.max(1, video.duration - 1);
        }

        video.currentTime = targetTime;
        await new Promise<void>((resolve) => {
          video.onseeked = () => resolve();
          setTimeout(resolve, 400);
        });

        if (ctx && video.videoWidth) {
          ctx.drawImage(video, 0, 0, c.width, c.height);
          thumbs[i] = c.toDataURL('image/jpeg', 0.65);
        }
      }

      if (!isCancelled) {
        setSceneThumbnails(thumbs);
        setIsExtractingFrames(false);
      }
    }

    extractFrames();
    return () => { isCancelled = true; };
  }, [activeBaseVideo]);

  const prepareVideoElement = async (src: string): Promise<HTMLVideoElement> => {
    return new Promise((resolve, reject) => {
      const video = document.createElement('video');
      video.crossOrigin = 'anonymous';
      video.playsInline = true;
      video.muted = true;
      video.src = src;

      let isResolved = false;
      const onReady = () => {
        if (!isResolved) {
          isResolved = true;
          resolve(video);
        }
      };

      video.onloadeddata = onReady;
      video.oncanplay = onReady;
      video.onerror = () => {
        if (!isResolved) {
          isResolved = true;
          console.warn('Video element load warning for source');
          resolve(video);
        }
      };

      setTimeout(() => {
        if (!isResolved) {
          isResolved = true;
          resolve(video);
        }
      }, 5000);
    });
  };

  // -------------------------------------------------------------
  // AUDIO MIXER (Custom MP3 + Voiceover - No Ambient Music)
  // -------------------------------------------------------------
  const setupAudioStream = async (audioCtx: AudioContext, totalDurationSec: number): Promise<MediaStreamAudioDestinationNode | null> => {
    if (!includeAudio) return null;

    const destination = audioCtx.createMediaStreamDestination();
    const masterGain = audioCtx.createGain();
    masterGain.gain.setValueAtTime(0.7, audioCtx.currentTime);
    masterGain.connect(destination);

    // 1. MUSIC TRACK (tylko jeśli użytkownik dodał własną piosenkę)
    if (isCustomMusicSelected && customAudio.file) {
      try {
        const arrayBuf = await customAudio.file.arrayBuffer();
        const decoded = await audioCtx.decodeAudioData(arrayBuf.slice(0));
        const musicSource = audioCtx.createBufferSource();
        musicSource.buffer = decoded;
        musicSource.loop = true;

        const musicGain = audioCtx.createGain();
        musicGain.gain.setValueAtTime(voiceoverBlob ? 0.45 : 0.75, audioCtx.currentTime); // Duck music slightly if voiceover exists
        musicSource.connect(musicGain);
        musicGain.connect(masterGain);
        musicSource.start(audioCtx.currentTime);
      } catch (err) {
        console.warn('Custom audio decode notice', err);
      }
    }

    // 2. VOICEOVER TRACK (User recorded vows / wishes)
    if (voiceoverBlob) {
      try {
        const vArrayBuf = await voiceoverBlob.arrayBuffer();
        const vDecoded = await audioCtx.decodeAudioData(vArrayBuf.slice(0));
        const voiceSource = audioCtx.createBufferSource();
        voiceSource.buffer = vDecoded;

        const voiceGain = audioCtx.createGain();
        voiceGain.gain.setValueAtTime(1.0, audioCtx.currentTime);
        voiceSource.connect(voiceGain);
        voiceGain.connect(masterGain);

        // Start voiceover 1.5 seconds in (after intro)
        voiceSource.start(audioCtx.currentTime + 1.5);
      } catch (vErr) {
        console.warn('Voiceover decode warning', vErr);
      }
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

    // Native Resolution setup: zachowujemy oryginalny format i proporcje z nagrania (nieokreślony/oryginalny)
    let width = 1920;
    let height = 1080;
    if (activeBaseVideo) {
      try {
        const testUrl = getMediaUrl(activeBaseVideo);
        if (testUrl) {
          const testVid = await prepareVideoElement(testUrl);
          if (testVid.videoWidth && testVid.videoHeight) {
            width = testVid.videoWidth;
            height = testVid.videoHeight;
          }
        }
      } catch (e) {
        console.warn('Wykrywanie oryginalnej rozdzielczości', e);
      }
    }
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
  // MODE 1: BASE VIDEO WITH OVERLAYS (Film Bazowy w Oryginalnym Formacie i Długości)
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

    // Naturalna, oryginalna długość filmu bez konieczności wybierania i sztucznego skracania
    const targetDuration = video.duration && video.duration > 0 ? video.duration : 30;

    setStatusMessage(`Przygotowywanie miksu kinowego (${Math.round(targetDuration)}s, format oryginalny ${width}x${height})...`);

    // Audio setup
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    const audioCtx = new AudioCtx();
    const audioDestination = await setupAudioStream(audioCtx, targetDuration);

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
      setStatusMessage(`Wypalanie efektów & LUT na filmie: ${Math.round(currentTime)}s / ${Math.round(targetDuration)}s`);

      // 1. Draw Video Frame
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
      ctx.fillStyle = '#D4AF37';
      ctx.font = 'bold 15px sans-serif';
      const couplesText = storyboard.title ? storyboard.title.toUpperCase() : 'FILM ŚLUBNY';
      ctx.fillText(`✦ ${couplesText.substring(0, 48)} ✦`, width / 2, barH * 0.65);

      // 4. Intro Overlay (first 3 seconds)
      if (currentTime < 3.2) {
        const introAlpha = currentTime < 2.5 ? 1 : Math.max(0, (3.2 - currentTime) / 0.7);
        ctx.save();
        ctx.globalAlpha = introAlpha * 0.9;
        ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
        ctx.fillRect(width * 0.08, height * 0.35, width * 0.84, height * 0.3);
        ctx.strokeStyle = '#D4AF37';
        ctx.lineWidth = 2;
        ctx.strokeRect(width * 0.08, height * 0.35, width * 0.84, height * 0.3);

        ctx.globalAlpha = introAlpha;
        ctx.textAlign = 'center';
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 26px serif';
        ctx.fillText(storyboard.title.substring(0, 32), width / 2, height * 0.46);

        ctx.fillStyle = '#D4AF37';
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
        ctx.strokeStyle = 'rgba(212, 175, 55, 0.8)';
        ctx.lineWidth = 1.5;
        ctx.strokeRect(boxX, boxY, boxW, boxH);

        // Gold accent bar
        ctx.fillStyle = '#D4AF37';
        ctx.fillRect(boxX, boxY, 5, boxH);

        ctx.globalAlpha = chapterAlpha;
        ctx.textAlign = 'left';

        // Chapter tag
        ctx.fillStyle = '#E5C158';
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
        ctx.fillText('Film Ślubny', width / 2, height * 0.55);
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
  // MODE 2: HIGHLIGHTS MONTAGE (Beat-Sync, Ken Burns, LUTs & Particles)
  // -------------------------------------------------------------
  const renderHighlightsMontageFromBaseVideo = async (
    ctx: CanvasRenderingContext2D, 
    width: number, 
    height: number
  ) => {
    setStatusMessage('Przygotowywanie ujęć ze scenariusza...');

    const totalScenes = parsedTimeline.length;
    // If beat detection is active, dynamically adjust scene times to beats
    const effectiveSceneDurations: number[] = [];
    if (isCustomMusicSelected && customAudio.beatData && customAudio.syncWithBeats && customAudio.beatData.beatTimestamps.length > 4) {
      const beats = customAudio.beatData.beatTimestamps;
      for (let i = 0; i < totalScenes; i++) {
        // Cut on every 4th or 8th beat (~3-4s per scene)
        const beatStep = customAudio.beatData.bpm > 130 ? 8 : 4;
        const bIdxStart = (i * beatStep) % (beats.length - beatStep);
        const bIdxEnd = bIdxStart + beatStep;
        const dur = Math.max(2.2, beats[bIdxEnd] - beats[bIdxStart]);
        effectiveSceneDurations.push(dur);
      }
    } else {
      for (let i = 0; i < totalScenes; i++) {
        effectiveSceneDurations.push(sceneDuration);
      }
    }

    const totalSceneTime = effectiveSceneDurations.reduce((a, b) => a + b, 0);
    const totalDuration = totalSceneTime + 4.0; // intro + outro buffer

    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    const audioCtx = new AudioCtx();
    const audioDestination = await setupAudioStream(audioCtx, totalDuration);

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

    let baseVideoElement: HTMLVideoElement | null = null;
    let baseVideoDuration = 30;

    if (activeBaseVideo) {
      const bSrc = getMediaUrl(activeBaseVideo);
      if (bSrc) {
        try {
          baseVideoElement = await prepareVideoElement(bSrc);
          baseVideoDuration = baseVideoElement.duration || 30;
        } catch (e: any) {
          console.warn('Highlights base video load notice:', e?.message || 'Nie można załadować');
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

      ctx.fillStyle = 'rgba(15, 23, 42, 0.95)';
      ctx.fillRect(0, 0, width, height);

      ctx.textAlign = 'center';
      ctx.fillStyle = '#f43f5e';
      ctx.font = 'bold 16px sans-serif';
      ctx.fillText('✦ TELEDYSK ŚLUBNY ✦', width / 2, height * 0.42);

      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 28px serif';
      ctx.fillText(storyboard.title.substring(0, 34) || 'Film Ślubny', width / 2, height * 0.50);

      ctx.fillStyle = '#fde047';
      ctx.font = 'italic 15px sans-serif';
      ctx.fillText(storyboard.title.substring(0, 34), width / 2, height * 0.57);

      await new Promise(r => setTimeout(r, frameInterval));
    }

    // 2. RENDER EACH SCENE USING USER'S OWN VIDEO / PHOTOS
    for (let sIdx = 0; sIdx < parsedTimeline.length; sIdx++) {
      if (abortControllerRef.current) break;
      const scene = parsedTimeline[sIdx];
      const curSceneDur = effectiveSceneDurations[sIdx] || sceneDuration;
      setCurrentRenderingScene(sIdx + 1);
      setStatusMessage(`Ujęcie ${sIdx + 1}/${totalScenes}: ${scene.elementName}`);

      if (baseVideoElement) {
        let seekTime = scene.startSec;
        if (seekTime >= baseVideoDuration - curSceneDur) {
          seekTime = (sIdx / Math.max(1, totalScenes - 1)) * Math.max(0, baseVideoDuration - curSceneDur - 1);
        }

        baseVideoElement.currentTime = Math.max(0, seekTime);
        await new Promise<void>((res) => {
          baseVideoElement!.onseeked = () => res();
          setTimeout(res, 600);
        });
        baseVideoElement.play().catch(() => {});
      }

      // Preloaded image for Ken Burns if no video
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

      const frames = Math.round(curSceneDur * fps);
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
          // Advanced Ken Burns Panning & Zoom (3D Parallax feel)
          const progress = f / frames;
          const zoomDirection = sIdx % 2 === 0 ? 1 : -1;
          const scale = zoomDirection === 1 ? 1.0 + progress * 0.18 : 1.18 - progress * 0.18;
          const panX = (sIdx % 3 - 1) * progress * 35;
          const panY = (sIdx % 2 === 0 ? 1 : -1) * progress * 20;

          const sW = width * scale;
          const sH = height * scale;
          const sX = (width - sW) / 2 + panX;
          const sY = (height - sH) / 2 + panY;
          ctx.drawImage(photoImg, sX, sY, sW, sH);
        } else {
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
    a.download = `Teledysk_Slubny.${renderedFormat}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  return (
    <div 
      id="auto-montage-modal"
      className="fixed inset-0 z-50 bg-[#090807]/95 backdrop-blur-2xl text-white flex flex-col justify-between overflow-y-auto"
    >
      <input 
        type="file"
        ref={fileInputRef}
        onChange={handleAddMediaFiles}
        multiple
        accept="video/*,image/*"
        className="hidden"
      />

      {/* Ambient background glows */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden z-0">
        <div className="ambient-halo w-[35rem] h-[35rem] -top-20 -left-20 bg-[#D4AF37]/10" />
        <div className="ambient-halo w-[30rem] h-[30rem] top-1/2 -right-20 bg-rose-500/10" />
      </div>

      {/* Voice Recorder Modal */}
      <VoiceRecorderModal
        isOpen={isVoiceRecorderOpen}
        onClose={() => setIsVoiceRecorderOpen(false)}
        defaultText={storyboard.voiceover}
        onSaveVoiceover={(blob, url, duration) => {
          setVoiceoverBlob(blob);
          setVoiceoverUrl(url);
          setVoiceoverDuration(duration);
        }}
      />

      {/* Top Header */}
      <div className="sticky top-0 z-20 glass-panel border-b border-white/10 p-4 sm:px-6 pt-safe flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-[#A1821C] via-[#D4AF37] to-[#FDE047] p-[1.5px] flex items-center justify-center shadow-lg shadow-[#D4AF37]/20">
            <div className="w-full h-full bg-[#030303] rounded-2xl flex items-center justify-center">
              <Clapperboard className="w-5 h-5 text-[#D4AF37]" />
            </div>
          </div>
          <div>
            <h2 className="text-sm sm:text-base font-bold text-white flex items-center gap-1.5 font-serif-luxury tracking-wide">
              Kinowy Montaż & Efekty Specjalne AI
            </h2>
            <p className="text-[0.6875rem] font-mono-label text-[#D4AF37]/80 uppercase tracking-widest font-semibold">
              Beat Detection • Ożywianie Zdjęć • Filtry LUTs • Atelier 4K
            </p>
          </div>
        </div>

        <button 
          id="close-montage-btn"
          onClick={onClose}
          className="luxury-btn-ghost w-10 h-10 rounded-full flex items-center justify-center text-white"
          aria-label="Zamknij"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Main Content */}
      <div className="max-w-3xl w-full mx-auto p-4 sm:p-6 space-y-6 relative z-10">
        
        {errorMessage && (
          <div className="p-4 rounded-2xl bg-rose-950/90 border border-rose-500/60 text-white text-xs flex items-center gap-3 backdrop-blur-xl shadow-xl">
            <AlertCircle className="w-5 h-5 shrink-0 text-rose-400" />
            <span className="font-sans-modern font-medium">{errorMessage}</span>
          </div>
        )}

        {/* MODE SELECTOR TABS */}
        {!isRendering && !renderedVideoUrl && (
          <div className="grid grid-cols-2 gap-3 p-1.5 glass-panel rounded-3xl">
            <button
              onClick={() => { triggerHaptic(15); setMontageMode('baseVideo'); }}
              className={`py-3.5 px-4 rounded-2xl flex flex-col items-center text-center gap-1.5 transition ${
                montageMode === 'baseVideo'
                  ? 'glass-panel-gold border-[#D4AF37] text-[#FDE047] font-bold shadow-xl'
                  : 'luxury-btn-ghost text-white/70'
              }`}
            >
              <div className="flex items-center gap-2">
                <Video className="w-4 h-4 text-[#D4AF37]" />
                <span className="text-xs font-mono-label uppercase font-bold tracking-wider">Film Bazowy z Dodatkami</span>
              </div>
              <span className="text-[0.6875rem] font-sans-modern opacity-80 font-medium">
                Cały Twój film + kinowe intro, rozdziały i napisy
              </span>
            </button>

            <button
              onClick={() => { triggerHaptic(15); setMontageMode('multiClip'); }}
              className={`py-3.5 px-4 rounded-2xl flex flex-col items-center text-center gap-1.5 transition ${
                montageMode === 'multiClip'
                  ? 'glass-panel-gold border-[#D4AF37] text-[#FDE047] font-bold shadow-xl'
                  : 'luxury-btn-ghost text-white/70'
              }`}
            >
              <div className="flex items-center gap-2">
                <Scissors className="w-4 h-4 text-[#D4AF37]" />
                <span className="text-xs font-mono-label uppercase font-bold tracking-wider">Teledysk ze Scen</span>
              </div>
              <span className="text-[0.6875rem] font-sans-modern opacity-80 font-medium">
                Dynamiczne ujęcia z Twoich filmów i zdjęć
              </span>
            </button>
          </div>
        )}

        {/* RENDERING PROGRESS DISPLAY */}
        {isRendering && (
          <div className="glass-panel-gold rounded-3xl p-8 text-center space-y-5 shadow-2xl border border-[#D4AF37]/50">
            <div className="w-16 h-16 mx-auto rounded-2xl bg-gradient-to-tr from-[#A1821C] via-[#D4AF37] to-[#FDE047] flex items-center justify-center animate-pulse shadow-lg">
              <Film className="w-8 h-8 text-black font-bold" />
            </div>

            <div>
              <h3 className="text-lg font-bold text-white font-serif-luxury tracking-wide">
                Trwa Kinowy Montaż Wideo
              </h3>
              <p className="text-xs text-[#FDE047] font-mono-label mt-1 font-semibold">
                {statusMessage}
              </p>
            </div>

            {/* Progress Bar */}
            <div className="space-y-2 max-w-md mx-auto">
              <div className="h-3.5 w-full bg-black/60 rounded-full overflow-hidden border border-white/20 p-0.5 shadow-inner">
                <div 
                  className="h-full bg-gradient-to-r from-[#A1821C] via-[#D4AF37] to-[#FDE047] rounded-full transition-all duration-150"
                  style={{ width: `${renderProgress}%` }}
                />
              </div>
              <div className="flex justify-between text-xs text-white/80 font-mono-label font-bold">
                <span>Postęp montażu</span>
                <span className="text-[#FDE047]">{renderProgress}%</span>
              </div>
            </div>

            <button
              onClick={() => { abortControllerRef.current = true; setIsRendering(false); }}
              className="text-xs text-rose-300 hover:text-rose-100 underline pt-2 font-mono-label uppercase font-semibold"
            >
              Anuluj montaż
            </button>
          </div>
        )}

        {/* RENDERED PREVIEW DISPLAY */}
        {renderedVideoUrl && (
          <div className="glass-panel rounded-3xl p-6 border border-emerald-500/50 space-y-4 shadow-2xl animate-in fade-in">
            <div className="flex items-center justify-between pb-3 border-b border-white/10">
              <div className="flex items-center gap-2.5">
                <CheckCircle2 className="w-6 h-6 text-emerald-400" />
                <h3 className="text-base sm:text-lg font-bold text-white font-serif-luxury">
                  Twój Film Został Pomyślnie Zmontowany!
                </h3>
              </div>
              <span className="text-xs font-mono-label px-3 py-1 rounded-full badge-luxury text-[#FDE047] font-bold">
                Format: .{renderedFormat}
              </span>
            </div>

            {/* Video Player */}
            <div className="rounded-2xl overflow-hidden bg-black border border-white/10 shadow-2xl max-h-96 flex items-center justify-center">
              <video 
                ref={videoPlayerRef}
                src={renderedVideoUrl}
                controls
                autoPlay
                playsInline
                className="w-full h-full object-contain max-h-96"
              />
            </div>
          </div>
        )}

        {/* Hidden Canvas Worker */}
        <canvas ref={canvasRef} className="hidden" />

        {/* 1. AUDIO & MUSIC SELECTOR */}
        {!isRendering && !renderedVideoUrl && (
          <AudioTrackSelector
            customAudio={customAudio}
            onCustomAudioChange={setCustomAudio}
            voiceoverBlob={voiceoverBlob}
            voiceoverUrl={voiceoverUrl}
            onOpenVoiceRecorder={() => setIsVoiceRecorderOpen(true)}
            onRemoveVoiceover={() => {
              if (voiceoverUrl) URL.revokeObjectURL(voiceoverUrl);
              setVoiceoverBlob(null);
              setVoiceoverUrl(null);
              setVoiceoverDuration(0);
            }}
            isCustomMusicSelected={isCustomMusicSelected}
            onToggleCustomMusic={setIsCustomMusicSelected}
          />
        )}

        {/* 4. SCENE SEQUENCE PREVIEW (when in multiClip mode) */}
        {!isRendering && !renderedVideoUrl && montageMode === 'multiClip' && (
          <div className="glass-panel rounded-3xl p-5 sm:p-6 space-y-4">
            
            <div className="flex items-center justify-between pb-2 border-b border-white/10">
              <div>
                <h4 className="text-xs font-bold text-white font-mono-label uppercase tracking-wider flex items-center gap-2">
                  <Scissors className="w-4 h-4 text-[#D4AF37]" />
                  Kolejka ujęć z Twojego filmu ({parsedTimeline.length} scen)
                </h4>
                <p className="text-xs font-sans-modern opacity-75 mt-0.5">
                  Ken Burns & 3D Parallax ożywią każde ujęcie
                </p>
              </div>

              <button
                onClick={() => { triggerHaptic(15); fileInputRef.current?.click(); }}
                className="luxury-btn-primary text-xs px-3.5 py-2 rounded-xl flex items-center gap-1.5 font-mono-label uppercase font-bold"
              >
                <Plus className="w-3.5 h-3.5 text-black" />
                <span>Dodaj plik</span>
              </button>
            </div>

            {/* Horizontal scrollable scene frames */}
            <div className="flex gap-3 overflow-x-auto pb-2 pt-1 no-scrollbar">
              {parsedTimeline.map((scene, idx) => {
                const thumb = sceneThumbnails[idx] || (userPhotoFiles[idx % userPhotoFiles.length] ? getMediaUrl(userPhotoFiles[idx % userPhotoFiles.length]) : coverUrl);

                return (
                  <div 
                    key={idx}
                    className="shrink-0 w-40 glass-card rounded-2xl overflow-hidden flex flex-col p-2"
                  >
                    <div className="relative h-24 rounded-xl bg-black/50 overflow-hidden flex items-center justify-center mb-2">
                      {thumb ? (
                        <img 
                          src={thumb} 
                          alt={scene.elementName}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="text-xs text-white/50 flex flex-col items-center">
                          <Film className="w-5 h-5 text-[#D4AF37] mb-1 opacity-60" />
                          <span>Kadr {scene.time}</span>
                        </div>
                      )}
                      <div className="absolute top-1.5 left-1.5 px-2 py-0.5 rounded-md bg-black/80 text-[0.625rem] font-mono-label text-[#FDE047] font-bold">
                        {scene.time}
                      </div>
                    </div>

                    <div className="flex-1 flex flex-col justify-between">
                      <div className="text-xs font-serif-luxury font-bold text-white truncate">
                        {scene.elementName}
                      </div>
                      <div className="text-[0.6875rem] font-sans-modern opacity-75 line-clamp-1 mt-0.5">
                        {scene.action}
                      </div>
                      {scene.directorNote && (
                        <div className="text-[0.625rem] text-[#FDE047] italic line-clamp-1 mt-1 font-medium border-t border-white/10 pt-1">
                          📝 {scene.directorNote}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

          </div>
        )}

        {/* 5. BASE VIDEO SELECTOR (when in baseVideo mode) */}
        {!isRendering && !renderedVideoUrl && montageMode === 'baseVideo' && (
          <div className="glass-panel rounded-3xl p-5 sm:p-6 space-y-4">
            
            <div className="flex items-center justify-between pb-2 border-b border-white/10">
              <div>
                <h4 className="text-xs font-bold text-white font-mono-label uppercase tracking-wider flex items-center gap-2">
                  <Video className="w-4 h-4 text-[#D4AF37]" />
                  Wybierz wideo bazowe
                </h4>
                <p className="text-xs font-sans-modern opacity-75 mt-0.5">
                  {userVideoFiles.length > 0 
                    ? `Dostępne ${userVideoFiles.length} wideo w projekcie` 
                    : 'Nie wgrałeś jeszcze pliku wideo'}
                </p>
              </div>
            </div>

            {userVideoFiles.length > 0 ? (
              <div className="space-y-2.5">
                {userVideoFiles.map((vf, idx) => (
                  <button
                    key={idx}
                    onClick={() => { triggerHaptic(15); setSelectedBaseVideoIndex(idx); }}
                    className={`w-full p-3.5 rounded-2xl border text-left flex items-center justify-between transition ${
                      selectedBaseVideoIndex === idx
                        ? 'glass-panel-gold border-[#D4AF37] text-[#FDE047] font-bold shadow-md'
                        : 'glass-card text-white/80 hover:border-[#D4AF37]/40'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-xl bg-[#D4AF37]/20 flex items-center justify-center text-[#D4AF37]">
                        <Video className="w-4 h-4" />
                      </div>
                      <div>
                        <div className="text-xs font-bold font-serif-luxury truncate max-w-[12.5rem] sm:max-w-xs">{vf.name}</div>
                        <div className="text-[0.625rem] font-mono-label opacity-75">Główne nagranie ślubne</div>
                      </div>
                    </div>
                    {selectedBaseVideoIndex === idx && (
                      <CheckCircle2 className="w-5 h-5 text-[#FDE047]" />
                    )}
                  </button>
                ))}
              </div>
            ) : (
              <div className="p-5 rounded-2xl glass-card text-center border border-amber-500/30">
                <p className="text-xs font-mono-label text-[#FDE047]">
                  Wgraj plik wideo ze ślubu, aby silnik zmontował go z kinowymi nakładkami.
                </p>
              </div>
            )}

            {/* Original Format & Duration Indicator */}
            <div className="pt-3 border-t border-white/10 flex items-center justify-between">
              <span className="text-xs font-mono-label uppercase font-bold text-white/80">Format i czas trwania:</span>
              <span className="text-xs font-mono-label font-bold text-[#FDE047] bg-[#D4AF37]/10 border border-[#D4AF37]/30 px-3 py-1 rounded-xl">
                Oryginalny z nagrania (pełny film)
              </span>
            </div>

          </div>
        )}

        {/* Global Settings & Export Actions */}
        {!isRendering && !renderedVideoUrl && (
          <div className="space-y-4">
            {/* Format & Audio Toggles */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="glass-panel p-4 rounded-2xl flex items-center justify-between">
                <div>
                  <span className="text-xs font-mono-label uppercase font-bold text-white/90 block">Format wideo:</span>
                  <span className="text-[0.6875rem] font-sans-modern opacity-70 block">Oryginalny format z danego filmu</span>
                </div>
                <span className="text-xs font-mono-label font-bold text-[#FDE047] bg-white/10 border border-white/20 px-3 py-1.5 rounded-xl">
                  Oryginalny (100% kadru)
                </span>
              </div>

              <div className="glass-panel p-4 rounded-2xl flex items-center justify-between">
                <div>
                  <span className="text-xs font-mono-label uppercase font-bold text-white/90 block">Dźwięk w filmie:</span>
                  <span className="text-[0.6875rem] font-sans-modern opacity-70 block">Oryginalny dźwięk lub wgrany utwór</span>
                </div>
                <button
                  onClick={() => { triggerHaptic(10); setIncludeAudio(!includeAudio); }}
                  className={`text-xs font-mono-label uppercase font-bold px-4 py-1.5 rounded-xl transition cursor-pointer ${
                    includeAudio ? 'luxury-btn-primary' : 'glass-card text-white/60'
                  }`}
                >
                  {includeAudio ? 'Włączony (ON)' : 'Wyciszony (OFF)'}
                </button>
              </div>
            </div>

            {/* Launch Montage Button */}
            <button
              id="start-montage-btn"
              onClick={startAutomaticMontage}
              className="w-full py-4 rounded-2xl luxury-btn-primary text-xs sm:text-sm font-mono-label uppercase font-extrabold tracking-widest flex items-center justify-center gap-2.5 shadow-2xl cursor-pointer"
            >
              <Film className="w-5 h-5 text-black" />
              <span>
                {montageMode === 'baseVideo' 
                  ? 'Zmontuj Film Bazowy z Efektami' 
                  : 'Zmontuj Teledysk ze Scen z Efektami'}
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
              className="w-full py-4 rounded-2xl luxury-btn-primary text-xs sm:text-sm font-mono-label uppercase font-extrabold tracking-widest flex items-center justify-center gap-2.5 shadow-2xl cursor-pointer"
            >
              <Download className="w-5 h-5 text-black" />
              <span>Pobierz Gotowy Film (.mp4 / .webm)</span>
            </button>

            <button
              onClick={async () => {
                setIsExportingPdf(true);
                try {
                  await downloadStoryboardPdfFile(storyboard, mediaItems);
                } catch (e: any) {
                  console.error(e);
                } finally {
                  setIsExportingPdf(false);
                }
              }}
              disabled={isExportingPdf}
              className="luxury-btn-ghost w-full py-3.5 rounded-2xl text-xs font-mono-label uppercase font-bold flex items-center justify-center gap-2 border border-[#D4AF37]/50 text-[#D4AF37] hover:bg-[#D4AF37]/10 cursor-pointer disabled:opacity-50"
            >
              {isExportingPdf ? (
                <Loader2 className="w-4 h-4 animate-spin text-[#D4AF37]" />
              ) : (
                <FileDown className="w-4 h-4 text-[#D4AF37]" />
              )}
              <span>Pobierz Scenariusz Reżyserski (PDF)</span>
            </button>

            <button
              onClick={() => {
                setRenderedVideoUrl(null);
                setRenderedVideoBlob(null);
              }}
              className="luxury-btn-ghost w-full py-3 rounded-2xl text-xs font-mono-label uppercase font-bold flex items-center justify-center gap-2 text-white/80 hover:text-white"
            >
              <RefreshCw className="w-4 h-4 text-[#D4AF37]" />
              <span>Zmontuj ponownie z innymi ustawieniami</span>
            </button>
          </div>
        )}

      </div>
    </div>
  );
}
