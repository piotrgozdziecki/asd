/**
 * Client-Side Wedding Video Merger & Exporter
 * Stitches multiple clips / photos into a single continuous video file
 * using HTML5 Canvas 2D + MediaRecorder API.
 * 
 * Supports:
 * - ✂️ Trimming (startTime / endTime per clip)
 * - 📱 Aspect ratio (16:9 widescreen or 9:16 vertical reel) with smart blurred background fill
 * - 🎵 Custom background soundtrack (user MP3) + synthesized soundtrack + clip audio volume balance
 * - ✨ Multiple subtitle styles (Złota klasyka, Nowoczesny minimalizm, Kinowy)
 * - 🎬 Transitions (Płynne przenikanie, Ściemnienie do czerni, Cięcie)
 */

import { MediaItem } from '../types/legacy';

export type VideoAspectRatio = '16:9' | '9:16';
export type SubtitleStyle = 'gold_luxury' | 'modern_minimal' | 'vintage_cinema';
export type VideoTransition = 'crossfade' | 'fade_black' | 'cut';

export interface MergeProgress {
  currentClip: number;
  totalClips: number;
  clipName: string;
  percent: number;
  statusText: string;
}

export interface VideoMergerOptions {
  width?: number;
  height?: number;
  fps?: number;
  defaultPhotoDuration?: number;
  aspectRatio?: VideoAspectRatio;
  subtitleStyle?: SubtitleStyle;
  transition?: VideoTransition;
  customAudioBlobUrl?: string | null;
}

export async function mergeWeddingClipsToVideo(
  clips: { item: MediaItem; comment?: string; durationSec?: number }[],
  audioContext: AudioContext | null,
  options: VideoMergerOptions = {},
  onProgress?: (p: MergeProgress) => void
): Promise<Blob> {
  const isVertical = options.aspectRatio === '9:16';
  const width = options.width || (isVertical ? 720 : 1280);
  const height = options.height || (isVertical ? 1280 : 720);
  const fps = options.fps || 30;
  const defaultPhotoDuration = options.defaultPhotoDuration || 4;
  const subtitleStyle = options.subtitleStyle || 'gold_luxury';
  const transition = options.transition || 'crossfade';

  if (!clips || clips.length === 0) {
    throw new Error('Brak klipów do połączenia. Wgraj przynajmniej jeden plik wideo lub zdjęcie.');
  }

  // 1. Prepare canvas
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Nie udało się utworzyć kontekstu 2D dla silnika wideo.');
  }

  // 2. Prepare MediaRecorder & Audio Pipeline
  const canvasStream = canvas.captureStream(fps);

  let localAudioContext = audioContext;
  let createdLocalAudioCtx = false;
  if (!localAudioContext) {
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    if (AudioCtx) {
      localAudioContext = new AudioCtx();
      createdLocalAudioCtx = true;
    }
  }

  let audioDestNode: MediaStreamAudioDestinationNode | null = null;
  let customAudioElement: HTMLAudioElement | null = null;

  if (localAudioContext) {
    if (localAudioContext.state === 'suspended') {
      try { await localAudioContext.resume(); } catch (e) {}
    }

    try {
      audioDestNode = localAudioContext.createMediaStreamDestination();
      const combinedAudioTrack = audioDestNode.stream.getAudioTracks()[0];
      if (combinedAudioTrack) {
        canvasStream.addTrack(combinedAudioTrack);
      }

      // If user uploaded custom audio track (MP3/WAV), play it into audio destination
      if (options.customAudioBlobUrl) {
        customAudioElement = new Audio(options.customAudioBlobUrl);
        if (options.customAudioBlobUrl.startsWith('http://') || options.customAudioBlobUrl.startsWith('https://')) {
          customAudioElement.crossOrigin = 'anonymous';
        }
        customAudioElement.loop = true;
        const audioSource = localAudioContext.createMediaElementSource(customAudioElement);
        const bgMusicGain = localAudioContext.createGain();
        bgMusicGain.gain.setValueAtTime(0.75, localAudioContext.currentTime);
        audioSource.connect(bgMusicGain);
        bgMusicGain.connect(audioDestNode);
        customAudioElement.play().catch(e => console.warn('Could not auto-play custom music in background recorder', e));
      }
    } catch (audioErr) {
      console.warn('Audio mixer setup warning:', audioErr);
    }
  }

  // Determine supported mime type
  let mimeType = 'video/webm;codecs=vp9,opus';
  if (!MediaRecorder.isTypeSupported(mimeType)) {
    mimeType = 'video/webm;codecs=vp8,opus';
  }
  if (!MediaRecorder.isTypeSupported(mimeType)) {
    mimeType = 'video/webm';
  }
  if (!MediaRecorder.isTypeSupported(mimeType)) {
    mimeType = '';
  }

  const recordedChunks: Blob[] = [];
  const recorder = mimeType 
    ? new MediaRecorder(canvasStream, { mimeType, videoBitsPerSecond: isVertical ? 3_800_000 : 4_000_000 })
    : new MediaRecorder(canvasStream);

  recorder.ondataavailable = (e) => {
    if (e.data && e.data.size > 0) {
      recordedChunks.push(e.data);
    }
  };

  const recorderStopped = new Promise<Blob>((resolve) => {
    recorder.onstop = () => {
      const finalBlob = new Blob(recordedChunks, { type: mimeType || 'video/webm' });
      resolve(finalBlob);
    };
  });

  recorder.start(500);

  // Subtitle drawer matching user preference
  const drawSubtitles = (commentText: string, clipIndex: number, total: number) => {
    ctx.save();
    
    if (subtitleStyle === 'gold_luxury') {
      const barHeight = isVertical ? 96 : 80;
      const barY = height - barHeight - (isVertical ? 48 : 24);
      const barPaddingX = isVertical ? 20 : 28;
      const barWidth = width - barPaddingX * 2;

      ctx.fillStyle = 'rgba(12, 10, 8, 0.82)';
      ctx.beginPath();
      ctx.roundRect(barPaddingX, barY, barWidth, barHeight, 16);
      ctx.fill();
      ctx.strokeStyle = 'rgba(229, 193, 120, 0.5)';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      ctx.fillStyle = '#D4AF37';
      ctx.font = 'bold 12px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
      ctx.fillText(`KLIP ${clipIndex + 1} Z ${total}`, barPaddingX + 20, barY + 26);

      ctx.fillStyle = '#ffffff';
      ctx.font = '600 16px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
      ctx.fillText(commentText || 'Ujęcie Weselne', barPaddingX + 20, barY + 54);

    } else if (subtitleStyle === 'modern_minimal') {
      const barY = height - (isVertical ? 70 : 50);
      
      ctx.shadowColor = 'rgba(0, 0, 0, 0.85)';
      ctx.shadowBlur = 10;
      ctx.shadowOffsetX = 0;
      ctx.shadowOffsetY = 2;

      ctx.textAlign = 'center';
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 17px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
      ctx.fillText(commentText || `Ujęcie #${clipIndex + 1}`, width / 2, barY);

      ctx.fillStyle = '#FDE047';
      ctx.font = '600 12px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
      ctx.fillText(`— #${clipIndex + 1} z ${total} —`, width / 2, barY + 22);

    } else if (subtitleStyle === 'vintage_cinema') {
      // Classic 35mm yellow movie subtitle
      const barY = height - (isVertical ? 65 : 44);
      ctx.textAlign = 'center';
      ctx.font = 'bold 20px "Trebuchet MS", Arial, sans-serif';
      
      // Black stroke outline
      ctx.strokeStyle = '#000000';
      ctx.lineWidth = 4;
      ctx.strokeText(commentText || 'Film Ślubny', width / 2, barY);

      // Bright yellow fill
      ctx.fillStyle = '#ffea31';
      ctx.fillText(commentText || 'Film Ślubny', width / 2, barY);
    }

    ctx.restore();
  };

  // Smart Draw with Blurred Background Fill
  const drawFramedMedia = (drawable: HTMLVideoElement | HTMLImageElement, isImg: boolean, scaleMultiplier: number = 1.0) => {
    const sWidth = isImg ? (drawable as HTMLImageElement).width : (drawable as HTMLVideoElement).videoWidth;
    const sHeight = isImg ? (drawable as HTMLImageElement).height : (drawable as HTMLVideoElement).videoHeight;

    if (!sWidth || !sHeight) {
      ctx.fillStyle = '#0e0c0a';
      ctx.fillRect(0, 0, width, height);
      return;
    }

    // 1. Draw Blurred Background to fill all empty space (no ugly black bars!)
    ctx.save();
    try {
      ctx.filter = 'blur(24px) brightness(0.4)';
      ctx.drawImage(drawable, -20, -20, width + 40, height + 40);
    } catch (e) {
      ctx.fillStyle = '#0a0908';
      ctx.fillRect(0, 0, width, height);
    }
    ctx.restore();

    // 2. Draw sharp main element centered with exact aspect ratio
    const vRatio = sWidth / sHeight;
    const cRatio = width / height;
    let dW = width * scaleMultiplier;
    let dH = height * scaleMultiplier;

    if (vRatio > cRatio) {
      dH = (width / vRatio) * scaleMultiplier;
    } else {
      dW = (height * vRatio) * scaleMultiplier;
    }

    const dX = (width - dW) / 2;
    const dY = (height - dH) / 2;

    ctx.drawImage(drawable, dX, dY, dW, dH);
  };

  // Transition overlay helper
  const drawTransitionOverlay = (elapsedSec: number, totalDurationSec: number) => {
    if (transition === 'cut') return;

    const transitionDuration = 0.45; // 450ms transition
    let opacity = 0;

    if (elapsedSec < transitionDuration) {
      // Intro fade in
      opacity = (transitionDuration - elapsedSec) / transitionDuration;
    } else if (elapsedSec > totalDurationSec - transitionDuration) {
      // Outro fade out
      opacity = (elapsedSec - (totalDurationSec - transitionDuration)) / transitionDuration;
    }

    if (opacity > 0) {
      ctx.save();
      ctx.fillStyle = transition === 'fade_black' 
        ? `rgba(0, 0, 0, ${Math.min(opacity, 1)})` 
        : `rgba(229, 193, 120, ${Math.min(opacity * 0.4, 0.4)})`;
      ctx.fillRect(0, 0, width, height);
      ctx.restore();
    }
  };

  // 3. Render each clip sequentially onto canvas
  for (let i = 0; i < clips.length; i++) {
    const { item, comment, durationSec } = clips[i];
    const isVideo = item.mimeType.startsWith('video') || 
                    item.name.toLowerCase().endsWith('.mp4') || 
                    item.name.toLowerCase().endsWith('.mov') ||
                    item.name.toLowerCase().endsWith('.webm');

    const commentText = comment || item.comment || item.name;

    // Trimming values
    const startTimeSec = item.startTimeSec || 0;
    const customEndSec = item.endTimeSec;

    if (onProgress) {
      onProgress({
        currentClip: i + 1,
        totalClips: clips.length,
        clipName: item.name,
        percent: Math.round((i / clips.length) * 100),
        statusText: `Łączenie ujęcia ${i + 1} z ${clips.length}: ${item.name}`
      });
    }

    const mediaSrc = item.cloudUrl || item.blobUrl;

    if (isVideo && mediaSrc) {
      // Video Clip Processing
      await new Promise<void>((resolveClip) => {
        const video = document.createElement('video');
        video.src = mediaSrc;
        if (mediaSrc.startsWith('http://') || mediaSrc.startsWith('https://')) {
          video.crossOrigin = 'anonymous';
        }
        video.muted = true; // Video canvas renderer
        video.playsInline = true;

        video.onloadedmetadata = () => {
          const rawDur = video.duration;
          const videoDuration = (typeof rawDur === 'number' && Number.isFinite(rawDur) && !isNaN(rawDur) && rawDur > 0) 
            ? rawDur 
            : (customEndSec ? customEndSec + 1 : 10);
          const effectiveEnd = (customEndSec && customEndSec > startTimeSec) 
            ? Math.min(customEndSec, videoDuration) 
            : Math.min(videoDuration, startTimeSec + (durationSec || 8));
          
          const clipPlayDuration = Math.max(effectiveEnd - startTimeSec, 1.5);
          
          // Seek to trimmed start point
          video.currentTime = startTimeSec;

          const onSeeked = () => {
            video.removeEventListener('seeked', onSeeked);
            video.play().catch(() => {});

            const frameInterval = 1000 / fps;
            const startTime = performance.now();

            const renderInterval = setInterval(() => {
              const elapsed = (performance.now() - startTime) / 1000;

              // Draw media with smart blurred background
              drawFramedMedia(video, false);

              // Draw transition overlay
              drawTransitionOverlay(elapsed, clipPlayDuration);

              // Draw subtitles
              drawSubtitles(commentText, i, clips.length);

              if (elapsed >= clipPlayDuration || video.currentTime >= effectiveEnd || video.ended) {
                clearInterval(renderInterval);
                video.pause();
                video.src = '';
                resolveClip();
              }
            }, frameInterval);
          };

          video.addEventListener('seeked', onSeeked);
        };

        video.onerror = () => {
          // Fallback title slide
          ctx.fillStyle = '#141210';
          ctx.fillRect(0, 0, width, height);
          drawSubtitles(commentText, i, clips.length);
          setTimeout(resolveClip, 1200);
        };
      });
    } else {
      // Photo Clip Processing with Ken Burns Zoom
      await new Promise<void>((resolveClip) => {
        const img = new Image();
        if (mediaSrc && (mediaSrc.startsWith('http://') || mediaSrc.startsWith('https://'))) {
          img.crossOrigin = 'anonymous';
        }
        const imgDuration = durationSec || defaultPhotoDuration;
        const totalFrames = imgDuration * fps;
        let frameCount = 0;

        const onImageReady = () => {
          const interval = setInterval(() => {
            frameCount++;
            const progress = frameCount / totalFrames;
            const scale = 1.0 + progress * 0.05; // Ken Burns subtle zoom

            drawFramedMedia(img, true, scale);

            const elapsedSec = frameCount / fps;
            drawTransitionOverlay(elapsedSec, imgDuration);
            drawSubtitles(commentText, i, clips.length);

            if (frameCount >= totalFrames) {
              clearInterval(interval);
              resolveClip();
            }
          }, 1000 / fps);
        };

        if (mediaSrc) {
          img.onload = onImageReady;
          img.onerror = () => {
            ctx.fillStyle = '#141210';
            ctx.fillRect(0, 0, width, height);
            drawSubtitles(commentText, i, clips.length);
            setTimeout(resolveClip, 1200);
          };
          img.src = mediaSrc;
        } else {
          onImageReady();
        }
      });
    }
  }

  // 4. Finish recording
  if (onProgress) {
    onProgress({
      currentClip: clips.length,
      totalClips: clips.length,
      clipName: 'Finalizowanie wideo...',
      percent: 100,
      statusText: 'Zapisywanie gotowego pliku wideo...'
    });
  }

  if (customAudioElement) {
    try {
      customAudioElement.pause();
      customAudioElement.src = '';
    } catch (e) {}
  }

  recorder.stop();
  const finalBlob = await recorderStopped;

  if (createdLocalAudioCtx && localAudioContext) {
    try { localAudioContext.close(); } catch (e) {}
  }

  return finalBlob;
}
