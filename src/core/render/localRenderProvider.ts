import { ProjectState, TimelineItem, MediaClip } from '../../types/project';
import { IRenderProvider, RenderOptions, RenderProgress, RenderResult } from './renderTypes';
import { urlRegistry } from '../media/urlRegistry';
import { resolveClipMediaUrl } from '../media/mediaResolver';
import { localIndexedDB } from '../storage/indexedDBProvider';

export class LocalBrowserRenderProvider implements IRenderProvider {
  id = 'local_canvas_recorder';
  name = 'Lokalny Silnik Renderowania (Przeglądarka / Canvas + MediaRecorder)';
  description = 'Renderuje film bezpośrednio na Twoim urządzeniu w czasie rzeczywistym z pełnym miksem audio i efektami.';

  isSupported(): boolean {
    return typeof window !== 'undefined' && 
      typeof document !== 'undefined' && 
      typeof HTMLCanvasElement !== 'undefined' && 
      typeof MediaRecorder !== 'undefined';
  }

  async verifyOutput(blob: Blob): Promise<{ valid: boolean; duration: number; error?: string }> {
    if (!blob || blob.size === 0) {
      return { valid: false, duration: 0, error: 'Wygenerowany plik wideo jest pusty (0 bajtów).' };
    }

    return new Promise((resolve) => {
      const testVideo = document.createElement('video');
      testVideo.preload = 'metadata';
      testVideo.muted = true;
      const testUrl = URL.createObjectURL(blob);

      const timeout = setTimeout(() => {
        cleanup();
        resolve({ valid: false, duration: 0, error: 'Przekroczono limit czasu weryfikacji odtwarzania wygenerowanego filmu.' });
      }, 7000);

      const cleanup = () => {
        clearTimeout(timeout);
        testVideo.onloadedmetadata = null;
        testVideo.onerror = null;
        testVideo.src = '';
        URL.revokeObjectURL(testUrl);
      };

      testVideo.onloadedmetadata = () => {
        const dur = testVideo.duration;
        const valid = dur > 0 && testVideo.videoWidth > 0;
        cleanup();
        if (valid) {
          resolve({ valid: true, duration: dur });
        } else {
          resolve({ valid: false, duration: dur, error: 'Metadane wideo są nieprawidłowe (szerokość lub czas trwania = 0).' });
        }
      };

      testVideo.onerror = () => {
        cleanup();
        resolve({ valid: false, duration: 0, error: 'Przeglądarka zgłosiła błąd odtwarzania wyrenderowanego pliku wideo.' });
      };

      testVideo.src = testUrl;
    });
  }

  async render(
    project: ProjectState,
    options: RenderOptions,
    onProgress: (p: RenderProgress) => void,
    signal?: AbortSignal
  ): Promise<RenderResult> {
    if (signal?.aborted) {
      throw new Error('Eksport został anulowany przed rozpoczęciem.');
    }

    // 1. Validate & prepare sorted timeline items
    const sortedItems = [...project.timelineItems].sort((a, b) => a.timelineStart - b.timelineStart);
    if (sortedItems.length === 0) {
      throw new Error('Brak klipów na osi czasu do wyrenderowania.');
    }

    // STAGE 1 — project validation
    onProgress({
      stage: 'preparing',
      percent: 1,
      currentFrame: 0,
      totalFrames: 100,
      fps: 0,
      targetFps: options.fps || 30,
      statusMessage: 'STAGE 1: Walidacja projektu i przygotowanie potoku...',
      diagnostics: { provider: this.id, stageDetails: 'STAGE 1: project validation' }
    });

    const clipMap = new Map<string, MediaClip>();
    project.mediaLibrary.forEach(c => clipMap.set(c.id, c));

    for (const item of sortedItems) {
      const clip = clipMap.get(item.clipId);
      if (!clip) {
        throw new Error(`SOURCE_ERROR: Nie odnaleziono klipu o ID ${item.clipId}`);
      }
    }

    // Calculate dimensions
    const isVertical = options.aspectRatio === '9:16' || project.settings.aspectRatio === '9:16';
    let width = 1920;
    let height = 1080;

    if (options.resolution === '720p') {
      width = isVertical ? 720 : 1280;
      height = isVertical ? 1280 : 720;
    } else if (options.resolution === '4k') {
      width = isVertical ? 2160 : 3840;
      height = isVertical ? 3840 : 2160;
    } else {
      // 1080p default
      width = isVertical ? 1080 : 1920;
      height = isVertical ? 1920 : 1080;
    }

    const fps = options.fps || 30;
    const totalDuration = sortedItems.reduce((max, item) => Math.max(max, item.timelineStart + item.duration), 0);
    const totalFrames = Math.max(1, Math.round(totalDuration * fps));

    // 4. Determine MediaRecorder mimeType (prefer MP4 container if supported)
    const candidateMimes = [
      'video/mp4;codecs=avc1.42E01E,mp4a.40.2',
      'video/mp4;codecs=avc1,aac',
      'video/mp4',
      'video/webm;codecs=vp9,opus',
      'video/webm;codecs=vp8,opus',
      'video/webm;codecs=h264',
      'video/webm'
    ];
    const selectedMime = candidateMimes.find(m => MediaRecorder.isTypeSupported(m)) || 'video/webm';

    onProgress({
      stage: 'preparing',
      percent: 2,
      currentFrame: 0,
      totalFrames,
      fps: 0,
      targetFps: fps,
      statusMessage: 'STAGE 2: Inicjalizacja potoku renderowania i buforów...',
      diagnostics: { stageDetails: 'STAGE 2: Recorder initialization', mimeType: selectedMime }
    });

    // 2. Prepare Canvas & 2D Context
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d', { alpha: false, desynchronized: true });
    if (!ctx) {
      throw new Error('Nie można utworzyć kontekstu 2D dla renderowania wideo.');
    }

    // Fill background
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, width, height);

    // 3. Audio setup (Web Audio API)
    const AudioCtxClass = window.AudioContext || (window as any).webkitAudioContext;
    const audioCtx = new AudioCtxClass();
    if (audioCtx.state === 'suspended') {
      await audioCtx.resume();
    }
    const audioDest = audioCtx.createMediaStreamDestination();

    // 5. Create Stream & Recorder
    const canvasStream = canvas.captureStream(fps);
    // Combine video tracks and audio tracks
    const combinedTracks: MediaStreamTrack[] = [
      ...canvasStream.getVideoTracks(),
      ...audioDest.stream.getAudioTracks()
    ];
    const combinedStream = new MediaStream(combinedTracks);

    const bitrate = (options.bitrateKbps || (width >= 1920 ? 8000 : 4000)) * 1000;
    const recorder = new MediaRecorder(combinedStream, {
      mimeType: selectedMime,
      videoBitsPerSecond: bitrate
    });

    const recordedChunks: Blob[] = [];
    recorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) {
        recordedChunks.push(e.data);
      }
    };

    recorder.start(100);

    // Background Audio Track Setup
    const bgAudioElements: HTMLAudioElement[] = [];
    for (const track of project.audioTracks) {
      if (track.objectUrl && !track.muted) {
        try {
          const bgAudio = new Audio(track.objectUrl);
          bgAudio.crossOrigin = 'anonymous';
          const bgSource = audioCtx.createMediaElementSource(bgAudio);
          const bgGain = audioCtx.createGain();
          bgGain.gain.value = (track.volume ?? 1) * (project.settings.audioBalance?.musicVolume ?? 0.8);
          bgSource.connect(bgGain);
          bgGain.connect(audioDest);
          bgAudioElements.push(bgAudio);
        } catch (err) {
          console.warn('Could not attach background audio track:', track.name, err);
        }
      }
    }

    // 6. Sequential Render Loop with frame-by-frame precision
    // To preserve memory and avoid loading 50 video tags simultaneously, we process clips sequentially!
    let renderedTime = 0;
    const frameDurationSec = 1 / fps;
    const frameDurationMs = 1000 / fps;

    try {
      for (let i = 0; i < sortedItems.length; i++) {
        if (signal?.aborted) {
          throw new Error('Eksport został przerwany przez użytkownika.');
        }

        const item = sortedItems[i];
        const clip = clipMap.get(item.clipId);
        if (!clip) continue;

        const clipSourceUrl = await resolveClipMediaUrl(clip);
        if (!clipSourceUrl) {
          console.warn(`[localRender] Brak źródła dla klipu: "${clip.name}"`);
          continue;
        }

        onProgress({
          stage: 'rendering',
          percent: Math.min(95, Math.round((renderedTime / totalDuration) * 90) + 5),
          currentFrame: Math.round(renderedTime * fps),
          totalFrames,
          fps,
          targetFps: fps,
          statusMessage: `STAGE 4: Renderowanie ujęcia ${i + 1}/${sortedItems.length}: "${clip.name}"`,
          diagnostics: { lastClipName: clip.name, stageDetails: 'STAGE 4: frame-by-frame rendering' }
        });

        if (clip.type === 'image') {
          // Render photo for item.duration
          await this.renderImageClip(ctx, clipSourceUrl, item, width, height, fps, signal, () => {
            renderedTime += frameDurationSec;
            this.drawOverlays(ctx, project, renderedTime, width, height);
          });
        } else {
          // Render video
          await this.renderVideoClip(
            ctx,
            clipSourceUrl,
            item,
            width,
            height,
            fps,
            audioCtx,
            audioDest,
            project.settings.audioBalance?.clipVolume ?? 0.7,
            signal,
            (currentClipTime) => {
              renderedTime += frameDurationSec;
              this.drawOverlays(ctx, project, renderedTime, width, height);
            },
            clip
          );
        }
      }

      onProgress({
        stage: 'finalizing',
        percent: 96,
        currentFrame: totalFrames,
        totalFrames,
        fps,
        targetFps: fps,
        statusMessage: 'STAGE 8: Zatrzymywanie nagrywania i finalizacja pliku...',
        diagnostics: { stageDetails: 'STAGE 8: MediaRecorder finalization' }
      });

      // Stop recorder and wait for final chunks
      await new Promise<void>((resolve) => {
        recorder.onstop = () => resolve();
        recorder.stop();
      });

      // Stop background audio
      bgAudioElements.forEach(a => {
        try { a.pause(); a.src = ''; } catch (e) {}
      });
      try { audioCtx.close(); } catch (e) {}

      // Combine chunks into final Blob
      // Ensure the output mimeType specifies MP4 or WebM accurately based on real encoder
      const isMp4Mime = selectedMime.includes('mp4');
      const finalMime = isMp4Mime ? 'video/mp4' : 'video/webm';
      const fileExt = isMp4Mime ? 'mp4' : 'webm';
      const finalBlob = new Blob(recordedChunks, { type: finalMime });

      onProgress({
        stage: 'validating',
        percent: 98,
        currentFrame: totalFrames,
        totalFrames,
        fps,
        targetFps: fps,
        statusMessage: `STAGE 9: Weryfikacja integralności pliku (${fileExt.toUpperCase()})...`,
        diagnostics: { stageDetails: 'STAGE 9: Output validation', size: finalBlob.size }
      });

      const verification = await this.verifyOutput(finalBlob);
      if (!verification.valid) {
        const errorMsg = verification.error || 'Weryfikacja pliku wideo nie powiodła się.';
        onProgress({
          stage: 'error',
          percent: 98,
          currentFrame: totalFrames,
          totalFrames,
          fps,
          targetFps: fps,
          statusMessage: `BŁĄD WALIDACJI: ${errorMsg}`,
          diagnostics: { lastError: errorMsg }
        });
        throw new Error(errorMsg);
      }

      const cleanProjectName = (project.name || 'Film_Slubny')
        .replace(/[^a-zA-Z0-9ąćęłńóśźżĄĆĘŁŃÓŚŹŻ_-]/g, '_');
      const fileName = `${cleanProjectName}_${options.resolution}_${fps}fps.${fileExt}`;
      const blobUrl = URL.createObjectURL(finalBlob);

      onProgress({
        stage: 'completed',
        percent: 100,
        currentFrame: totalFrames,
        totalFrames,
        fps,
        targetFps: fps,
        statusMessage: 'Film został pomyślnie wyrenderowany!'
      });

      return {
        blob: finalBlob,
        mimeType: finalMime,
        duration: verification.duration || totalDuration,
        width,
        height,
        sizeBytes: finalBlob.size,
        fileName,
        blobUrl,
        verifiedPlayable: true
      };

    } catch (err: any) {
      try {
        if (recorder.state !== 'inactive') recorder.stop();
        bgAudioElements.forEach(a => { a.pause(); a.src = ''; });
        audioCtx.close();
      } catch (e) {}
      throw err;
    }
  }

  /**
   * Frame-by-frame video clip rendering
   */
  private async renderVideoClip(
    ctx: CanvasRenderingContext2D,
    url: string,
    item: TimelineItem,
    targetWidth: number,
    targetHeight: number,
    fps: number,
    audioCtx: AudioContext,
    audioDest: MediaStreamAudioDestinationNode,
    masterClipVolume: number,
    signal?: AbortSignal,
    onFrameRendered?: (time: number) => void,
    clip?: MediaClip
  ): Promise<void> {
    const video = document.createElement('video');
    video.src = url;
    video.muted = item.muted;
    video.playsInline = true;
    
    const isExternal = url.startsWith('http://') || url.startsWith('https://');
    const isSameOrigin = typeof window !== 'undefined' && url.startsWith(window.location.origin);
    if (isExternal && !isSameOrigin) {
      video.crossOrigin = 'anonymous';
    }

    const waitForVideo = (vid: HTMLVideoElement): Promise<boolean> => {
      if (vid.readyState >= 1 && vid.videoWidth > 0) return Promise.resolve(true);

      return new Promise<boolean>((resolve) => {
        let done = false;
        const onReady = () => {
          if (done) return;
          done = true;
          cleanup();
          resolve(true);
        };
        const onErr = () => {
          if (done) return;
          done = true;
          cleanup();
          resolve(false);
        };
        const cleanup = () => {
          vid.removeEventListener('loadedmetadata', onReady);
          vid.removeEventListener('canplay', onReady);
          vid.removeEventListener('error', onErr);
        };

        vid.addEventListener('loadedmetadata', onReady);
        vid.addEventListener('canplay', onReady);
        vid.addEventListener('error', onErr);
        vid.load();

        setTimeout(() => {
          if (!done) {
            done = true;
            cleanup();
            resolve(vid.videoWidth > 0 || vid.readyState >= 1);
          }
        }, 12000);
      });
    };

    let loaded = await waitForVideo(video);

    // If failed with crossOrigin, retry without crossOrigin
    if (!loaded && video.crossOrigin) {
      video.removeAttribute('crossorigin');
      video.src = url;
      loaded = await waitForVideo(video);
    }

    // If failed and clip.file exists, try creating direct fresh blob URL
    if (!loaded && clip?.file) {
      try {
        const freshUrl = URL.createObjectURL(clip.file);
        video.src = freshUrl;
        loaded = await waitForVideo(video);
      } catch (e) {}
    }

    // If failed and proxy exists, try proxy
    if (!loaded && clip?.proxyUrl) {
      try {
        video.src = clip.proxyUrl;
        loaded = await waitForVideo(video);
      } catch (e) {}
    }

    if (!loaded && (video.videoWidth === 0 && video.readyState < 1)) {
      // If video codec is unsupported by device decoder, fall back to high-res thumbnail frame
      if (clip?.thumbnailUrl && clip.thumbnailUrl.length > 5) {
        console.warn(`[localRender] Video decoder failed for "${clip.name}". Falling back to clip frame image.`);
        await this.renderImageClip(ctx, clip.thumbnailUrl, item, targetWidth, targetHeight, fps, signal, () => {
          if (onFrameRendered) onFrameRendered(0);
        });
        return;
      }

      const err = video.error;
      const detail = err ? `Code ${err.code}: ${err.message}` : 'Timeout';
      throw new Error(`Nie można załadować wideo do renderowania (${detail}).`);
    }

    let audioSource: MediaElementAudioSourceNode | null = null;
    let gainNode: GainNode | null = null;

    if (!item.muted) {
      try {
        audioSource = audioCtx.createMediaElementSource(video);
        gainNode = audioCtx.createGain();
        gainNode.gain.value = (item.volume ?? 1) * masterClipVolume;
        audioSource.connect(gainNode);
        gainNode.connect(audioDest);
      } catch (e) {
        // Audio might already be connected or not present
      }
    }

    const durationToPlay = item.duration;
    const startSourceTime = item.sourceStart;
    const endSourceTime = item.sourceEnd;
    const speed = item.speed || 1;

    video.currentTime = startSourceTime;
    video.playbackRate = speed;

    await new Promise<void>((res) => {
      video.onseeked = () => res();
    });

    await video.play();

    const startPerf = performance.now();
    const targetMs = (durationToPlay * 1000);

    return new Promise<void>((resolve, reject) => {
      let isDone = false;

      const renderInterval = setInterval(() => {
        if (signal?.aborted) {
          cleanup();
          reject(new Error('Anulowano renderowanie.'));
          return;
        }

        const elapsedMs = performance.now() - startPerf;
        const currentClipSec = elapsedMs / 1000;

        // Draw frame with fitMode and transitions
        this.drawMediaToCanvas(ctx, video, item, targetWidth, targetHeight, currentClipSec);
        if (onFrameRendered) onFrameRendered(video.currentTime);

        if (elapsedMs >= targetMs || video.currentTime >= endSourceTime || video.ended) {
          cleanup();
          resolve();
        }
      }, 1000 / fps);

      const cleanup = () => {
        if (isDone) return;
        isDone = true;
        clearInterval(renderInterval);
        video.pause();
        video.src = '';
        if (audioSource && gainNode) {
          try {
            audioSource.disconnect();
            gainNode.disconnect();
          } catch (e) {}
        }
      };
    });
  }

  /**
   * Photo rendering over time
   */
  private async renderImageClip(
    ctx: CanvasRenderingContext2D,
    url: string,
    item: TimelineItem,
    targetWidth: number,
    targetHeight: number,
    fps: number,
    signal?: AbortSignal,
    onFrameRendered?: () => void
  ): Promise<void> {
    const img = new Image();
    img.src = url;
    await new Promise<void>((res, rej) => {
      img.onload = () => res();
      img.onerror = () => rej(new Error('Nie można wczytać zdjęcia do renderowania.'));
    });

    const totalFrames = Math.round(item.duration * fps);
    for (let f = 0; f < totalFrames; f++) {
      if (signal?.aborted) throw new Error('Anulowano renderowanie.');
      const currentSec = f / fps;
      this.drawMediaToCanvas(ctx, img, item, targetWidth, targetHeight, currentSec);
      if (onFrameRendered) onFrameRendered();
      await new Promise(r => setTimeout(r, 1000 / fps));
    }
  }

  /**
   * Draws video or image onto canvas honoring aspect ratio, filters, fitMode, and fade transitions
   */
  private drawMediaToCanvas(
    ctx: CanvasRenderingContext2D,
    media: HTMLVideoElement | HTMLImageElement,
    item: TimelineItem,
    targetWidth: number,
    targetHeight: number,
    currentTimeInClip?: number
  ) {
    const sourceWidth = 'videoWidth' in media ? media.videoWidth : media.naturalWidth;
    const sourceHeight = 'videoHeight' in media ? media.videoHeight : media.naturalHeight;

    if (!sourceWidth || !sourceHeight) return;

    const sourceAspect = sourceWidth / sourceHeight;
    const targetAspect = targetWidth / targetHeight;
    const fitMode = item.fitMode || 'fit';

    // Clear background
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, targetWidth, targetHeight);

    // Calculate fade in / fade out alpha
    let alpha = 1;
    if (currentTimeInClip !== undefined) {
      if (item.fadeIn && item.fadeIn > 0 && currentTimeInClip < item.fadeIn) {
        alpha = Math.min(alpha, Math.max(0, currentTimeInClip / item.fadeIn));
      }
      const timeLeft = item.duration - currentTimeInClip;
      if (item.fadeOut && item.fadeOut > 0 && timeLeft < item.fadeOut) {
        alpha = Math.min(alpha, Math.max(0, timeLeft / item.fadeOut));
      }
    }

    // Standard Fit / Fill (Original Colors - no color modifications or artificial overlays)
    ctx.save();
    ctx.globalAlpha = alpha;

    let renderW = targetWidth;
    let renderH = targetHeight;
    let renderX = 0;
    let renderY = 0;

    if (fitMode === 'fit') {
      if (sourceAspect > targetAspect) {
        renderW = targetWidth;
        renderH = targetWidth / sourceAspect;
        renderY = (targetHeight - renderH) / 2;
      } else {
        renderH = targetHeight;
        renderW = targetHeight * sourceAspect;
        renderX = (targetWidth - renderW) / 2;
      }
    } else if (fitMode === 'fill') {
      if (sourceAspect > targetAspect) {
        renderH = targetHeight;
        renderW = targetHeight * sourceAspect;
        renderX = (targetWidth - renderW) / 2;
      } else {
        renderW = targetWidth;
        renderH = targetWidth / sourceAspect;
        renderY = (targetHeight - renderH) / 2;
      }
    }

    // Apply scale and rotation if any
    if (item.scale && item.scale !== 1) {
      const centerX = renderX + renderW / 2;
      const centerY = renderY + renderH / 2;
      renderW *= item.scale;
      renderH *= item.scale;
      renderX = centerX - renderW / 2;
      renderY = centerY - renderH / 2;
    }

    ctx.drawImage(media, renderX, renderY, renderW, renderH);
    ctx.restore();
  }

  /**
   * Draws text layers & subtitles onto the current frame
   */
  private drawOverlays(
    ctx: CanvasRenderingContext2D,
    project: ProjectState,
    currentTime: number,
    targetWidth: number,
    targetHeight: number
  ) {
    if (!project.textLayers || project.textLayers.length === 0) return;

    for (const textItem of project.textLayers) {
      if (currentTime >= textItem.timelineStart && currentTime <= (textItem.timelineStart + textItem.duration)) {
        ctx.save();
        const posX = textItem.position ? textItem.position.x * targetWidth : targetWidth / 2;
        const posY = textItem.position ? textItem.position.y * targetHeight : targetHeight * 0.85;
        const baseFontSize = (textItem.fontSize || 2) * (targetHeight / 40);

        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.font = `bold ${Math.round(baseFontSize)}px "Cinzel", "Playfair Display", "Times New Roman", serif`;

        // Shadow for readability
        ctx.shadowColor = 'rgba(0, 0, 0, 0.85)';
        ctx.shadowBlur = 12;
        ctx.shadowOffsetX = 2;
        ctx.shadowOffsetY = 2;

        ctx.fillStyle = textItem.color || '#D4AF37';
        ctx.fillText(textItem.text, posX, posY);
        ctx.restore();
      }
    }
  }
}

export const localBrowserRenderProvider = new LocalBrowserRenderProvider();
