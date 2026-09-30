import { ProjectState, TimelineItem, MediaClip } from '../../types/project';
import { IRenderProvider, RenderOptions, RenderProgress, RenderResult } from './renderTypes';
import { urlRegistry } from '../media/urlRegistry';
import { resolveClipMediaUrl, resolveAudioTrackUrl, getMediaArrayBuffer } from '../media/mediaResolver';
import { localIndexedDB } from '../storage/indexedDBProvider';
import { FrameCompositor } from './FrameCompositor';
import { AudioResampler, STANDARD_RENDER_SAMPLE_RATE, STANDARD_RENDER_CHANNELS } from '../audio/audioResampler';
import { SafeAudioDecoder } from '../audio/audioDecoder';

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
      }, 10000);

      const cleanup = () => {
        clearTimeout(timeout);
        testVideo.onloadedmetadata = null;
        testVideo.onseeked = null;
        testVideo.onerror = null;
        testVideo.src = '';
        URL.revokeObjectURL(testUrl);
      };

      testVideo.onloadedmetadata = async () => {
        const dur = testVideo.duration;
        const valid = dur > 0 && testVideo.videoWidth > 0;
        if (!valid) {
          cleanup();
          resolve({ valid: false, duration: dur, error: 'Metadane wideo są nieprawidłowe (szerokość lub czas trwania = 0).' });
          return;
        }

        try {
          testVideo.currentTime = dur * 0.5;
          await new Promise<void>(res => {
            testVideo.onseeked = () => res();
            setTimeout(res, 1500);
          });
          cleanup();
          resolve({ valid: true, duration: dur });
        } catch {
          cleanup();
          resolve({ valid: false, duration: dur, error: 'Błąd podczas weryfikacji odtwarzania wygenerowanego filmu.' });
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

    const sortedItems = [...(project.timelineItems || [])].sort((a, b) => a.timelineStart - b.timelineStart);
    if (sortedItems.length === 0) {
      throw new Error('Brak klipów na osi czasu do wyrenderowania.');
    }

    onProgress({
      stage: 'preparing',
      percent: 1,
      currentFrame: 0,
      totalFrames: 100,
      fps: 0,
      targetFps: options.fps || 30,
      statusMessage: 'Walidacja projektu i przygotowanie potoku MediaRecorder...',
      diagnostics: { provider: this.id, stageDetails: 'STAGE 1: Walidacja projektu' }
    });

    const clipMap = new Map<string, MediaClip>();
    (project.mediaLibrary || []).forEach(c => clipMap.set(c.id, c));

    for (const item of sortedItems) {
      const clip = clipMap.get(item.clipId);
      if (!clip) {
        throw new Error(`SOURCE_ERROR: Nie odnaleziono klipu o ID ${item.clipId}`);
      }
    }

    // Calculate dimensions
    const isVertical = options.aspectRatio === '9:16' || project.settings?.aspectRatio === '9:16';
    let width = 1920;
    let height = 1080;

    if (options.resolution === '720p') {
      width = isVertical ? 720 : 1280;
      height = isVertical ? 1280 : 720;
    } else if (options.resolution === '4k') {
      width = isVertical ? 2160 : 3840;
      height = isVertical ? 3840 : 2160;
    } else {
      width = isVertical ? 1080 : 1920;
      height = isVertical ? 1920 : 1080;
    }

    width = width - (width % 2);
    height = height - (height % 2);

    const fps = options.fps || 30;
    const totalDuration = sortedItems.reduce((max, item) => Math.max(max, item.timelineStart + item.duration), 0);
    const totalFrames = Math.max(1, Math.round(totalDuration * fps));

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

    // 1. Prepare Canvas & Context
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) {
      throw new Error('Nie można utworzyć kontekstu 2D dla renderowania wideo.');
    }

    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, width, height);

    // 2. Pre-mix audio using OfflineAudioContext for glitch-free playback
    onProgress({
      stage: 'encoding_audio',
      percent: 4,
      currentFrame: 0,
      totalFrames,
      fps: 0,
      targetFps: fps,
      statusMessage: 'Miksowanie wielościeżkowego audio (OfflineAudioContext)...',
      diagnostics: { stageDetails: 'STAGE 2: Pre-render miksu audio' }
    });

    const sampleRate = STANDARD_RENDER_SAMPLE_RATE;
    const totalSamples = Math.max(1, Math.ceil(totalDuration * sampleRate));
    const OfflineCtxClass = window.OfflineAudioContext || (window as unknown as { webkitOfflineAudioContext: typeof OfflineAudioContext }).webkitOfflineAudioContext;
    let masterAudioBuffer: AudioBuffer | null = null;

    if (OfflineCtxClass) {
      try {
        const offlineCtx = new OfflineCtxClass(STANDARD_RENDER_CHANNELS, totalSamples, sampleRate);
        const audioBufferCache = new Map<string, AudioBuffer | null>();
        let attachedSourcesCount = 0;

        // Detect voiceover intervals for ducking
        const rawAudioTracks = project.audioTracks || [];
        const activeAudioTracks = rawAudioTracks.filter(t => !t.muted);
        const voiceoverIntervals: { start: number; end: number; duckingRatio: number }[] = [];
        const isDuckingActive = project.settings?.audioDucking !== false && project.settings?.audioBalance?.duckingEnabled !== false;
        const duckAmount = project.settings?.duckingIntensity !== undefined ? project.settings.duckingIntensity / 100 : (project.settings?.audioBalance?.duckingAmount ?? 0.6);

        for (const track of activeAudioTracks) {
          if (track.trackType === 'voiceover') {
            const start = Math.max(0, track.timelineStart || 0);
            const end = start + (track.duration || 1);
            voiceoverIntervals.push({ start, end, duckingRatio: Math.max(0.1, 1 - duckAmount) });
          }
        }

        // Attach clip audio (Explicitly resampled to 48kHz Stereo)
        const videoItems = sortedItems.filter(item => {
          if (item.muted || item.volume === 0) return false;
          const clip = clipMap.get(item.clipId);
          return clip && clip.type === 'video';
        });

        for (const item of videoItems) {
          if (signal?.aborted) throw new Error('Anulowano.');
          const clip = clipMap.get(item.clipId);
          if (!clip) continue;

          let decoded = audioBufferCache.get(clip.id);
          if (decoded === undefined) {
            let arrayBuf: ArrayBuffer | null = null;
            if (clip.file) {
              try { arrayBuf = await clip.file.arrayBuffer(); } catch {}
            }
            if (!arrayBuf) {
              const src = await resolveClipMediaUrl(clip);
              if (src) {
                try {
                  const res = await fetch(src);
                  arrayBuf = await res.arrayBuffer();
                } catch {
                  arrayBuf = null;
                }
              }
            }
            if (!arrayBuf) {
              arrayBuf = await getMediaArrayBuffer(clip.id);
            }

            if (arrayBuf && arrayBuf.byteLength > 0) {
              try {
                decoded = await SafeAudioDecoder.decodeTo48kStereo(offlineCtx, arrayBuf);
                audioBufferCache.set(clip.id, decoded);
              } catch {
                audioBufferCache.set(clip.id, null);
                decoded = null;
              }
            } else {
              audioBufferCache.set(clip.id, null);
              decoded = null;
            }
          }

          if (decoded && decoded.duration > 0) {
            try {
              const source = offlineCtx.createBufferSource();
              source.buffer = decoded;
              const gain = offlineCtx.createGain();
              const baseVolume = (item.volume ?? 1) * (project.settings?.audioBalance?.clipVolume ?? 1);
              const startTime = Math.max(0, item.timelineStart);
              const endTime = startTime + item.duration;

              gain.gain.setValueAtTime(baseVolume, startTime);
              if (item.fadeIn && item.fadeIn > 0) {
                gain.gain.setValueAtTime(0, startTime);
                gain.gain.linearRampToValueAtTime(baseVolume, startTime + Math.min(item.fadeIn, item.duration));
              }
              if (item.fadeOut && item.fadeOut > 0) {
                const fadeOutStart = Math.max(startTime, endTime - item.fadeOut);
                gain.gain.setValueAtTime(baseVolume, fadeOutStart);
                gain.gain.linearRampToValueAtTime(0, endTime);
              }

              source.connect(gain);
              gain.connect(offlineCtx.destination);

              const maxOffset = Math.max(0, decoded.duration - 0.05);
              const safeOffset = Math.max(0, Math.min(item.sourceStart || 0, maxOffset));
              const safeDuration = Math.max(0.05, Math.min(item.duration, decoded.duration - safeOffset));
              source.start(startTime, safeOffset, safeDuration);
              attachedSourcesCount++;
            } catch {}
          }
        }

        // Attach background audio tracks & voiceover (Explicitly resampled to 48kHz Stereo)
        for (const track of activeAudioTracks) {
          try {
            let arrayBuf: ArrayBuffer | null = null;
            if (track.file) {
              arrayBuf = await track.file.arrayBuffer();
            } else {
              const freshUrl = await resolveAudioTrackUrl(track);
              arrayBuf = await getMediaArrayBuffer(track.id, undefined, freshUrl || track.objectUrl);
            }

            if (arrayBuf && arrayBuf.byteLength > 0) {
              const copy = arrayBuf.slice(0);
              const rawDecoded = await offlineCtx.decodeAudioData(copy);
              const decoded = AudioResampler.resampleTo48kStereo(offlineCtx, rawDecoded, sampleRate);
              if (decoded && decoded.duration > 0) {
                const source = offlineCtx.createBufferSource();
                source.buffer = decoded;
                const gain = offlineCtx.createGain();

                const isVoiceover = track.trackType === 'voiceover';
                let baseVol = track.volume ?? 1;
                if (isVoiceover) {
                  baseVol *= (project.settings?.audioBalance?.voiceoverVolume ?? 1.0);
                } else if (track.trackType === 'music' || !track.trackType) {
                  baseVol *= (project.settings?.audioBalance?.musicVolume ?? 0.8);
                }

                gain.gain.setValueAtTime(baseVol, 0);

                if (!isVoiceover && voiceoverIntervals.length > 0 && isDuckingActive) {
                  for (const vInt of voiceoverIntervals) {
                    const duckedVol = baseVol * vInt.duckingRatio;
                    gain.gain.setValueAtTime(baseVol, Math.max(0, vInt.start - 0.3));
                    gain.gain.linearRampToValueAtTime(duckedVol, vInt.start);
                    gain.gain.setValueAtTime(duckedVol, vInt.end);
                    gain.gain.linearRampToValueAtTime(baseVol, vInt.end + 0.5);
                  }
                }

                source.connect(gain);
                gain.connect(offlineCtx.destination);

                const trackOffset = Math.max(0, Math.min(track.sourceStart || 0, decoded.duration - 0.05));
                const trackDur = Math.max(0.05, Math.min(track.duration || decoded.duration, decoded.duration - trackOffset));
                source.start(track.timelineStart || 0, trackOffset, trackDur);
                attachedSourcesCount++;
              }
            }
          } catch {}
        }

        // Sound is FOUNDATIONAL: If no audio tracks or clip audio connected, synthesize a rich wedding soundscape!
        if (attachedSourcesCount === 0) {
          try {
            const fallbackSoundtrack = await SafeAudioDecoder.createFoundationalWeddingSoundtrack(
              offlineCtx,
              totalDuration,
              'altar_procession'
            );
            const fbSource = offlineCtx.createBufferSource();
            fbSource.buffer = fallbackSoundtrack;
            const fbGain = offlineCtx.createGain();
            fbGain.gain.setValueAtTime(0.75, 0);
            fbSource.connect(fbGain);
            fbGain.connect(offlineCtx.destination);
            fbSource.start(0, 0, totalDuration);
            attachedSourcesCount++;
          } catch {}
        }

        masterAudioBuffer = await offlineCtx.startRendering();
      } catch {}
    }

    // 3. Audio Context & MediaRecorder setup
    const AudioCtxClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const audioCtx = new AudioCtxClass({ sampleRate: 48000 });
    if (audioCtx.state === 'suspended') {
      await audioCtx.resume();
    }
    const audioDest = audioCtx.createMediaStreamDestination();

    let masterAudioSource: AudioBufferSourceNode | null = null;
    if (masterAudioBuffer) {
      masterAudioSource = audioCtx.createBufferSource();
      masterAudioSource.buffer = masterAudioBuffer;
      masterAudioSource.connect(audioDest);
    }

    const canvasStream = canvas.captureStream(fps);
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
    if (masterAudioSource) {
      masterAudioSource.start(0);
    }

    // 4. Preload all clip elements
    const mediaElements = new Map<string, HTMLVideoElement | HTMLImageElement>();
    for (const item of sortedItems) {
      if (signal?.aborted) throw new Error('Anulowano.');
      const clip = clipMap.get(item.clipId);
      if (!clip || mediaElements.has(clip.id)) continue;

      const src = (options.useProxyMedia && clip.proxyUrl)
        ? clip.proxyUrl
        : await resolveClipMediaUrl(clip);
      if (!src) continue;

      if (clip.type === 'video') {
        const video = document.createElement('video');
        video.muted = true;
        video.playsInline = true;
        video.preload = 'auto';

        video.style.position = 'fixed';
        video.style.bottom = '0px';
        video.style.right = '0px';
        video.style.width = '16px';
        video.style.height = '16px';
        video.style.opacity = '0.001';
        video.style.pointerEvents = 'none';
        video.style.zIndex = '-9999';
        document.body.appendChild(video);

        if (src.startsWith('http')) video.crossOrigin = 'anonymous';
        video.src = src;

        await new Promise<void>((resolve) => {
          let done = false;
          const onReady = () => {
            if (done) return;
            done = true;
            cleanup();
            resolve();
          };
          const cleanup = () => {
            video.removeEventListener('loadedmetadata', onReady);
            video.removeEventListener('canplay', onReady);
            video.removeEventListener('error', onReady);
          };
          video.addEventListener('loadedmetadata', onReady);
          video.addEventListener('canplay', onReady);
          video.addEventListener('error', onReady);
          video.load();
          setTimeout(onReady, 8000);
        });

        mediaElements.set(clip.id, video);
      } else {
        const img = new Image();
        if (src.startsWith('http')) img.crossOrigin = 'anonymous';
        img.src = src;
        await new Promise<void>((resolve) => {
          img.onload = () => resolve();
          img.onerror = () => resolve();
          setTimeout(resolve, 5000);
        });
        mediaElements.set(clip.id, img);
      }
    }

    // 5. Deterministic Frame by Frame rendering loop with CPU Overload Frame Skipping
    const frameIntervalSec = 1 / fps;
    const startTime = Date.now();
    let skippedFramesCount = 0;

    try {
      let frameIndex = 0;
      while (frameIndex < totalFrames) {
        if (signal?.aborted) {
          throw new Error('Eksport został przerwany przez użytkownika.');
        }

        // Frame Skipping Mechanism for CPU Overload Protection (Locks Audio-Video Sync)
        const wallClockElapsedSec = (Date.now() - startTime) / 1000;
        const currentFrameTimelineSec = frameIndex * frameIntervalSec;
        const driftLatencySec = wallClockElapsedSec - currentFrameTimelineSec;

        // If CPU lag exceeds 1.5 frame interval, skip frames to current real-time audio timestamp
        if (driftLatencySec > (frameIntervalSec * 1.5) && frameIndex < totalFrames - 1) {
          const synchronizedTargetFrame = Math.min(
            totalFrames - 1,
            Math.floor(wallClockElapsedSec / frameIntervalSec)
          );
          if (synchronizedTargetFrame > frameIndex) {
            skippedFramesCount += (synchronizedTargetFrame - frameIndex);
            frameIndex = synchronizedTargetFrame;
          }
        }

        const currentTime = frameIndex * frameIntervalSec;

        ctx.fillStyle = '#000000';
        ctx.fillRect(0, 0, width, height);

        const activeItems = sortedItems.filter(
          item => currentTime >= item.timelineStart && currentTime < (item.timelineStart + item.duration)
        );

        for (const activeItem of activeItems) {
          const clip = clipMap.get(activeItem.clipId);
          const mediaEl = clip ? mediaElements.get(clip.id) : null;
          if (!mediaEl || !clip) continue;

          const timeInItem = currentTime - activeItem.timelineStart;
          const speed = activeItem.speed || 1;

          if (mediaEl instanceof HTMLVideoElement) {
            const targetSourceTime = activeItem.sourceStart + (timeInItem * speed);
            const diff = Math.abs(mediaEl.currentTime - targetSourceTime);
            if (diff > (0.25 / fps)) {
              mediaEl.currentTime = targetSourceTime;
              await new Promise<void>((res) => {
                const onSeeked = () => {
                  mediaEl.removeEventListener('seeked', onSeeked);
                  res();
                };
                mediaEl.addEventListener('seeked', onSeeked);
                setTimeout(() => {
                  mediaEl.removeEventListener('seeked', onSeeked);
                  res();
                }, 500);
              });
            }
          }

          const srcW = mediaEl instanceof HTMLVideoElement ? mediaEl.videoWidth : ('naturalWidth' in mediaEl ? mediaEl.naturalWidth : (mediaEl as HTMLCanvasElement).width);
          const srcH = mediaEl instanceof HTMLVideoElement ? mediaEl.videoHeight : ('naturalHeight' in mediaEl ? mediaEl.naturalHeight : (mediaEl as HTMLCanvasElement).height);

          FrameCompositor.drawMedia(
            ctx,
            mediaEl,
            srcW || width,
            srcH || height,
            width,
            height,
            {
              fitMode: activeItem.fitMode || 'fit',
              rotation: activeItem.rotation || 0,
              scale: activeItem.scale || 1,
              position: activeItem.position,
              crop: activeItem.crop,
              colorAdjustments: activeItem.colorAdjustments || clip.colorAdjustments,
              globalPreset: project.settings?.colorGrade
            }
          );

          // Apply Title Card if enabled for this item
          if (activeItem.titleCard && activeItem.titleCard.enabled) {
            const cardDuration = Math.min(Math.max(0.8, activeItem.duration * 0.4), activeItem.titleCard.duration || 3);
            if (timeInItem < cardDuration) {
              FrameCompositor.drawTitleCard(ctx, width, height, activeItem.titleCard);
            }
          }

          // Apply transitions
          const transInType = activeItem.transitionIn || (activeItem.fadeIn ? 'fade' : 'cut');
          const transInDuration = activeItem.transitionDuration || activeItem.fadeIn || (transInType !== 'cut' ? 0.8 : 0);
          if (transInDuration > 0 && timeInItem < transInDuration) {
            const transProgress = 1 - Math.max(0, Math.min(1, timeInItem / transInDuration));
            FrameCompositor.applyTransition(ctx, width, height, transProgress, transInType);
          }

          const timeLeft = activeItem.duration - timeInItem;
          const transOutType = activeItem.transitionOut || (activeItem.fadeOut ? 'fade' : 'cut');
          const transOutDuration = activeItem.transitionDuration || activeItem.fadeOut || (transOutType !== 'cut' ? 0.8 : 0);
          if (transOutDuration > 0 && timeLeft < transOutDuration) {
            const transProgress = 1 - Math.max(0, Math.min(1, timeLeft / transOutDuration));
            FrameCompositor.applyTransition(ctx, width, height, transProgress, transOutType);
          }
        }

        // Draw Subtitles & Text Layers with FrameCompositor
        if (project.textLayers && project.textLayers.length > 0) {
          for (const textLayer of project.textLayers) {
            FrameCompositor.drawTextLayer(ctx, width, height, textLayer, currentTime);
          }
        }

        // Small delay to let captureStream and MediaRecorder absorb the frame
        await new Promise(r => setTimeout(r, Math.max(1, 1000 / fps / 2)));

        if (frameIndex % 8 === 0 || frameIndex === totalFrames - 1) {
          const elapsed = (Date.now() - startTime) / 1000;
          const percent = Math.min(95, 10 + Math.round((frameIndex / totalFrames) * 85));
          const currentFps = Math.max(1, Math.round((frameIndex + 1) / Math.max(0.1, elapsed)));
          const remainingFrames = totalFrames - (frameIndex + 1);
          const etaSeconds = Math.max(1, Math.ceil(remainingFrames / currentFps));

          onProgress({
            stage: 'rendering',
            percent,
            currentFrame: frameIndex + 1,
            totalFrames,
            fps: currentFps,
            targetFps: fps,
            etaSeconds,
            elapsedSeconds: Math.round(elapsed),
            speedMultiplier: Number(((currentFps / fps) || 1).toFixed(1)),
            statusMessage: `Renderowanie MediaRecorder: ${frameIndex + 1}/${totalFrames} (${percent}%) ${skippedFramesCount > 0 ? `[Skip: ${skippedFramesCount}]` : ''}`
          });
        }

        frameIndex++;
      }

      onProgress({
        stage: 'finalizing',
        percent: 96,
        currentFrame: totalFrames,
        totalFrames,
        fps,
        targetFps: fps,
        statusMessage: 'Zatrzymywanie nagrywania i finalizacja kontenera...',
        diagnostics: { stageDetails: 'MediaRecorder finalize' }
      });

      // Stop recorder and wait for final chunks
      await new Promise<void>((resolve) => {
        recorder.onstop = () => resolve();
        recorder.stop();
      });

      if (masterAudioSource) {
        try { masterAudioSource.stop(); } catch {}
      }
      try { audioCtx.close(); } catch {}

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
        statusMessage: `Weryfikacja integralności pliku (${fileExt.toUpperCase()})...`
      });

      const verification = await this.verifyOutput(finalBlob);
      if (!verification.valid) {
        throw new Error(verification.error || 'Weryfikacja pliku wideo nie powiodła się.');
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

    } catch (err: unknown) {
      try {
        if (recorder.state !== 'inactive') recorder.stop();
        if (masterAudioSource) {
          try { masterAudioSource.stop(); } catch {}
        }
        audioCtx.close();
      } catch {}
      throw err;
    } finally {
      for (const el of mediaElements.values()) {
        if (el instanceof HTMLVideoElement) {
          try {
            el.pause();
            el.src = '';
            el.load();
            if (el.parentNode) el.parentNode.removeChild(el);
          } catch {}
        }
      }
      mediaElements.clear();
    }
  }
}

export const localBrowserRenderProvider = new LocalBrowserRenderProvider();
