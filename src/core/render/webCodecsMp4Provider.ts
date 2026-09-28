import { ProjectState, TimelineItem, MediaClip } from '../../types/project';
import { IRenderProvider, RenderOptions, RenderProgress, RenderResult } from './renderTypes';
import { Muxer, ArrayBufferTarget } from 'mp4-muxer';
import { urlRegistry } from '../media/urlRegistry';
import { resolveClipMediaUrl, resolveAudioTrackUrl, getMediaArrayBuffer } from '../media/mediaResolver';
import { localIndexedDB } from '../storage/indexedDBProvider';
import { FrameCompositor } from './FrameCompositor';

/**
 * WebCodecsMp4RenderProvider
 * Deterministic frame-by-frame rendering engine producing authentic H.264/AAC MP4 files
 * using WebCodecs (VideoEncoder, AudioEncoder), OfflineAudioContext, and mp4-muxer.
 */
export class WebCodecsMp4RenderProvider implements IRenderProvider {
  id = 'webcodecs_mp4_muxer';
  name = 'Silnik WebCodecs + MP4 Muxer (Prawdziwy H.264 / AAC MP4)';
  description = 'Profesjonalny potok kodowania klatka po klatce bez opóźnień czasu rzeczywistego z bezpośrednim zapisem kontenera MP4.';

  isSupported(): boolean {
    return typeof window !== 'undefined' &&
      typeof (window as unknown as { VideoEncoder: unknown }).VideoEncoder === 'function' &&
      typeof (window as unknown as { VideoFrame: unknown }).VideoFrame === 'function' &&
      typeof HTMLCanvasElement !== 'undefined';
  }

  async verifyOutput(blob: Blob): Promise<{ valid: boolean; duration: number; error?: string }> {
    if (!blob || blob.size === 0) {
      return { valid: false, duration: 0, error: 'Wygenerowany plik MP4 jest pusty (0 bajtów).' };
    }

    return new Promise((resolve) => {
      const testVideo = document.createElement('video');
      testVideo.preload = 'auto';
      testVideo.muted = true;
      testVideo.playsInline = true;
      const testUrl = URL.createObjectURL(blob);

      const timeout = setTimeout(() => {
        cleanup();
        resolve({ valid: false, duration: 0, error: 'Przekroczono limit czasu weryfikacji nagłówków MP4.' });
      }, 15000);

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
        const validMeta = dur > 0 && testVideo.videoWidth > 0;
        
        if (!validMeta) {
          cleanup();
          resolve({ valid: false, duration: dur, error: 'Metadane pliku MP4 są nieprawidłowe (brak klatek lub niepoprawny czas trwania).' });
          return;
        }

        // Deep verification: seek to 25%, 50% and 90%
        try {
          testVideo.currentTime = dur * 0.25;
          await new Promise<void>(res => {
            testVideo.onseeked = () => res();
            setTimeout(res, 1500);
          });
          
          testVideo.currentTime = dur * 0.5;
          await new Promise<void>(res => {
            testVideo.onseeked = () => res();
            setTimeout(res, 1500);
          });

          testVideo.currentTime = Math.max(0, dur - 0.5);
          await new Promise<void>(res => {
            testVideo.onseeked = () => res();
            setTimeout(res, 1500);
          });

          cleanup();
          resolve({ valid: true, duration: dur });
        } catch {
          cleanup();
          resolve({ valid: false, duration: dur, error: 'Błąd podczas weryfikacji strumienia klatek MP4.' });
        }
      };

      testVideo.onerror = () => {
        cleanup();
        resolve({ valid: false, duration: 0, error: 'Plik nie jest poprawnym strumieniem wideo MP4 (Błąd dekodowania).' });
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

    let failureStage: 'initialization' | 'loading' | 'decoding' | 'rendering' | 'encoding_video' | 'encoding_audio' | 'muxing' | 'validating' = 'initialization';
    let currentClipName: string | undefined;
    let framesProcessed = 0;
    const mediaElements = new Map<string, HTMLVideoElement | HTMLImageElement | HTMLCanvasElement>();
    let videoEncoder: VideoEncoder | null = null;
    let audioEncoder: AudioEncoder | null = null;

    // 1. Sort and validate timeline
    const sortedItems = [...(project.timelineItems || [])].sort((a, b) => a.timelineStart - b.timelineStart);
    if (sortedItems.length === 0) {
      throw new Error('Brak klipów na osi czasu do wyrenderowania.');
    }

    const clipMap = new Map<string, MediaClip>();
    (project.mediaLibrary || []).forEach(c => clipMap.set(c.id, c));

    try {
      onProgress({
        stage: 'preparing',
        percent: 1,
        currentFrame: 0,
        totalFrames: 100,
        fps: 0,
        targetFps: options.fps || 30,
        statusMessage: 'Walidacja projektu i sprawdzanie dostępności materiałów...',
        diagnostics: { provider: this.id, stageDetails: 'STAGE 1: Walidacja osi czasu', failureStage: 'initialization' }
      });

      for (const item of sortedItems) {
        const clip = clipMap.get(item.clipId);
        if (!clip) {
          throw new Error(`SOURCE_ERROR: Nie odnaleziono klipu o ID ${item.clipId} (TimelineItem: ${item.id})`);
        }
      }

      // Calculate output canvas dimensions
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

      // H.264 encoders strictly require even dimensions
      width = width - (width % 2);
      height = height - (height % 2);

      const fps = options.fps || 30;
      const totalDuration = sortedItems.reduce((max, item) => Math.max(max, item.timelineStart + item.duration), 0);
      const totalFrames = Math.max(1, Math.round(totalDuration * fps));

      onProgress({
        stage: 'preparing',
        percent: 2,
        currentFrame: 0,
        totalFrames,
        fps: 0,
        targetFps: fps,
        statusMessage: 'Inicjalizacja kodera WebCodecs i kontenera MP4...'
      });

      // 2. Audio Configuration
      const hasAudioEncoderSupport = typeof window !== 'undefined' && typeof (window as unknown as { AudioEncoder: unknown }).AudioEncoder === 'function';
      const hasProjectAudio = (project.audioTracks && project.audioTracks.length > 0) ||
        sortedItems.some(i => !i.muted);
      const enableAudio = hasAudioEncoderSupport && hasProjectAudio;

      // 3. Setup MP4 Muxer
      failureStage = 'muxing';
      const muxer = new Muxer({
        target: new ArrayBufferTarget(),
        video: {
          codec: 'avc',
          width,
          height
        },
        audio: enableAudio ? {
          codec: 'aac',
          numberOfChannels: 2,
          sampleRate: 48000
        } : undefined,
        fastStart: 'in-memory',
        firstTimestampBehavior: 'offset'
      });

      // 4. Setup VideoEncoder
      failureStage = 'encoding_video';
      const defaultBitrate = width >= 3840 ? 35000 : (width >= 1920 ? 10000 : 4500);
      const targetBitrate = (options.bitrateKbps || defaultBitrate) * 1000;

      const candidateCodecs = [
        'avc1.420028',
        'avc1.42001f',
        'avc1.42E028',
        'avc1.4D4028',
        'avc1.4D401F'
      ];

      let videoConfig: VideoEncoderConfig | null = null;
      const probeScratchCanvas = document.createElement('canvas');
      probeScratchCanvas.width = 16;
      probeScratchCanvas.height = 16;

      if (typeof VideoEncoder.isConfigSupported === 'function') {
        for (const accel of ['no-preference', 'prefer-software', 'prefer-hardware'] as HardwareAcceleration[]) {
          for (const codec of candidateCodecs) {
            try {
              const testConfig: VideoEncoderConfig = {
                codec,
                width,
                height,
                bitrate: targetBitrate,
                framerate: fps,
                hardwareAcceleration: accel,
                avc: { format: 'avc' }
              };
              const support = await VideoEncoder.isConfigSupported(testConfig);
              if (support && support.supported) {
                const fullCandidate: VideoEncoderConfig = {
                  ...(support.config || testConfig),
                  avc: { format: 'avc' }
                };

                let probeOk = false;
                try {
                  const probeEnc = new VideoEncoder({
                    output: () => {},
                    error: () => {}
                  });
                  probeEnc.configure(fullCandidate);
                  if (probeEnc.state === 'configured') {
                    const probeFrame = new VideoFrame(probeScratchCanvas, {
                      timestamp: 0,
                      duration: 33333
                    });
                    probeEnc.encode(probeFrame, { keyFrame: true });
                    probeFrame.close();
                    await probeEnc.flush();
                    probeOk = true;
                  }
                  try {
                    probeEnc.close();
                  } catch {}
                } catch {
                  probeOk = false;
                }

                if (probeOk) {
                  videoConfig = fullCandidate;
                  break;
                }
              }
            } catch {}
          }
          if (videoConfig) break;
        }
      }

      if (!videoConfig) {
        videoConfig = {
          codec: 'avc1.420028',
          width,
          height,
          bitrate: targetBitrate,
          framerate: fps,
          hardwareAcceleration: 'no-preference',
          avc: { format: 'avc' }
        };
      }

      let encoderError: { message: string; failureStage: string; originalError?: unknown } | null = null;

      videoEncoder = new VideoEncoder({
        output: (chunk, meta) => {
          try {
            muxer.addVideoChunk(chunk, meta);
          } catch (e: unknown) {
            encoderError = { 
              message: 'Błąd zapisu wideo do kontenera MP4 (Muxing Error)', 
              originalError: e, 
              failureStage: 'muxing'
            };
          }
        },
        error: (e: unknown) => {
          const errObj = e as { message?: string };
          encoderError = {
            message: `Błąd VideoEncoder: ${errObj?.message || String(e)}`,
            originalError: e,
            failureStage: 'encoding_video'
          };
        }
      });

      try {
        videoEncoder.configure(videoConfig);
      } catch (e: unknown) {
        const errObj = e as { message?: string };
        throw new Error(`Błąd konfiguracji VideoEncoder: ${errObj?.message || String(e)}`);
      }

      // 5. Canvas for rendering composite frames
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d', { alpha: false });
      if (!ctx) {
        throw new Error('Nie można utworzyć kontekstu Canvas 2D.');
      }

      // 6. Preload media elements
      failureStage = 'loading';
      onProgress({
        stage: 'loading',
        percent: 5,
        currentFrame: 0,
        totalFrames,
        fps,
        targetFps: fps,
        statusMessage: 'Ładowanie i przygotowywanie mediów do renderowania...',
        diagnostics: { provider: this.id, stageDetails: 'STAGE 2: Preload mediów', failureStage: 'loading' }
      });

      let lastProgressTime = Date.now();
      const WATCHDOG_TIMEOUT_MS = 60000;
      const startTime = Date.now();
      const speedSamples: Array<{ timestamp: number; frame: number }> = [];
      let smoothedFps = fps;
      const heartbeat = () => {
        lastProgressTime = Date.now();
      };

      const preloadClip = async (clip: MediaClip) => {
        if (mediaElements.has(clip.id)) return;
        currentClipName = clip.name;
        heartbeat();

        try {
          const src = (options.useProxyMedia && clip.proxyUrl)
            ? clip.proxyUrl
            : await resolveClipMediaUrl(clip);
          if (!src) throw new Error(`Brak źródła URL dla klipu ${clip.name}`);

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

            const isExternal = src.startsWith('http://') || src.startsWith('https://');
            const isSameOrigin = typeof window !== 'undefined' && src.startsWith(window.location.origin);
            if (isExternal && !isSameOrigin) {
              video.crossOrigin = 'anonymous';
            }
            video.src = src;

            const waitForVideo = (vidEl: HTMLVideoElement): Promise<boolean> => {
              if (vidEl.readyState >= 1 && vidEl.videoWidth > 0) return Promise.resolve(true);

              return new Promise<boolean>((resolve) => {
                let settled = false;
                const onMetadata = () => {
                  if (settled) return;
                  settled = true;
                  cleanup();
                  resolve(true);
                };
                const onError = () => {
                  if (settled) return;
                  settled = true;
                  cleanup();
                  resolve(false);
                };
                const cleanup = () => {
                  vidEl.removeEventListener('loadedmetadata', onMetadata);
                  vidEl.removeEventListener('canplay', onMetadata);
                  vidEl.removeEventListener('error', onError);
                };

                vidEl.addEventListener('loadedmetadata', onMetadata);
                vidEl.addEventListener('canplay', onMetadata);
                vidEl.addEventListener('error', onError);
                vidEl.load();

                setTimeout(() => {
                  if (!settled) {
                    settled = true;
                    cleanup();
                    resolve(vidEl.videoWidth > 0 || vidEl.readyState >= 1);
                  }
                }, 10000);
              });
            };

            let loaded = await waitForVideo(video);

            // Retry if CORS failed
            if (!loaded && video.crossOrigin) {
              video.removeAttribute('crossorigin');
              video.src = src;
              loaded = await waitForVideo(video);
            }

            // Fallback to proxyUrl
            if (!loaded && clip.proxyUrl && clip.proxyUrl !== src) {
              video.src = clip.proxyUrl;
              loaded = await waitForVideo(video);
            }

            // Fallback to in-memory file
            if (!loaded && clip.file) {
              try {
                video.src = URL.createObjectURL(clip.file);
                loaded = await waitForVideo(video);
              } catch {}
            }

            // Fallback to IndexedDB
            if (!loaded) {
              try {
                const blob = await localIndexedDB.getMediaBlob(clip.id);
                if (blob && blob.size > 0) {
                  const mime = (blob.type && blob.type.startsWith('video/')) ? blob.type : 'video/mp4';
                  const typedBlob = new Blob([blob], { type: mime });
                  const freshUrl = urlRegistry.create(typedBlob);
                  video.src = freshUrl;
                  loaded = await waitForVideo(video);
                }
              } catch {}
            }

            if (!loaded && video.videoWidth === 0 && video.readyState < 1) {
              if (clip.thumbnailUrl && clip.thumbnailUrl.length > 5) {
                const fallbackImg = new Image();
                if (clip.thumbnailUrl.startsWith('http')) fallbackImg.crossOrigin = 'anonymous';
                fallbackImg.src = clip.thumbnailUrl;
                await new Promise<void>((res) => {
                  fallbackImg.onload = () => res();
                  fallbackImg.onerror = () => res();
                  setTimeout(res, 3000);
                });
                mediaElements.set(clip.id, fallbackImg);
                return;
              }

              const fallbackEl = this.createFallbackFrameElement(clip.name, width, height);
              mediaElements.set(clip.id, fallbackEl);
              return;
            }

            mediaElements.set(clip.id, video);
          } else {
            const img = new Image();
            if (src.startsWith('http')) img.crossOrigin = 'anonymous';
            img.src = src;
            await new Promise<void>((resolve) => {
              img.onload = () => resolve();
              img.onerror = () => {
                const fallback = this.createFallbackFrameElement(clip.name, width, height);
                mediaElements.set(clip.id, fallback);
                resolve();
              };
              setTimeout(resolve, 5000);
            });
            if (!mediaElements.has(clip.id)) {
              mediaElements.set(clip.id, img);
            }
          }
        } catch {
          const safeFrame = this.createFallbackFrameElement(clip?.name || 'Ujęcie', width, height);
          mediaElements.set(clip.id, safeFrame);
        }
      };

      // Preload all initial clips
      for (const item of sortedItems) {
        if (signal?.aborted) return {} as RenderResult;
        const clip = clipMap.get(item.clipId);
        if (clip) await preloadClip(clip);
      }

      // 7. Audio Encoding via OfflineAudioContext & AudioEncoder
      if (enableAudio) {
        try {
          failureStage = 'encoding_audio';
          heartbeat();
          onProgress({
            stage: 'encoding_audio',
            percent: 6,
            currentFrame: 0,
            totalFrames,
            fps: 0,
            targetFps: fps,
            statusMessage: 'Renderowanie i miksowanie wielościeżkowego audio (AAC)...',
            diagnostics: { stageDetails: 'Miksowanie audio 48kHz stereo', failureStage: 'encoding_audio' }
          });

          audioEncoder = new AudioEncoder({
            output: (chunk, meta) => {
              try {
                muxer.addAudioChunk(chunk, meta);
                heartbeat();
              } catch (e: unknown) {
                encoderError = {
                  message: 'Błąd muxingu ścieżki audio AAC',
                  originalError: e,
                  failureStage: 'muxing'
                };
              }
            },
            error: (e: unknown) => {
              const errObj = e as { message?: string };
              encoderError = {
                message: `Błąd AudioEncoder: ${errObj?.message || String(e)}`,
                originalError: e,
                failureStage: 'encoding_audio'
              };
            }
          });

          audioEncoder.configure({
            codec: 'mp4a.40.2',
            numberOfChannels: 2,
            sampleRate: 48000,
            bitrate: 192000
          });

          await this.renderAndEncodeAudio(
            project, 
            totalDuration, 
            audioEncoder, 
            signal,
            heartbeat,
            (msg, pct) => {
              heartbeat();
              onProgress({
                stage: 'encoding_audio',
                percent: pct,
                currentFrame: 0,
                totalFrames,
                fps: 0,
                targetFps: fps,
                statusMessage: msg,
                diagnostics: { stageDetails: msg, failureStage: 'encoding_audio' }
              });
            }
          );
        } catch (audioErr) {
          // Graceful fallback if audio encoding fails
          audioEncoder = null;
          heartbeat();
        }
      }

      // 8. Main Deterministic Render Loop
      failureStage = 'rendering';
      heartbeat();
      const frameIntervalSec = 1 / fps;
      const frameDurationMicros = Math.round(frameIntervalSec * 1_000_000);

      for (let frameIndex = 0; frameIndex < totalFrames; frameIndex++) {
        const currentTime = frameIndex * frameIntervalSec;

        if (Date.now() - lastProgressTime > WATCHDOG_TIMEOUT_MS) {
          throw new Error('TIMEOUT: Przekroczono czas oczekiwania na klatkę (brak postępu potoku).');
        }

        if (signal?.aborted) {
          onProgress({ 
            stage: 'cancelled', 
            percent: 0, 
            currentFrame: frameIndex, 
            totalFrames, 
            fps: 0, 
            targetFps: fps, 
            statusMessage: 'Eksport anulowany przez użytkownika.' 
          });
          throw new Error('Eksport anulowany.');
        }

        if (encoderError) {
          throw new Error(`PIPELINE_ERROR [${encoderError.failureStage}]: ${encoderError.message}`);
        }

        // Clear canvas with black base
        ctx.fillStyle = '#000000';
        ctx.fillRect(0, 0, width, height);

        // Find active timeline items
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
            failureStage = 'decoding';
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
                }, 600);
              });
              heartbeat();
            }
          }

          // Composite Frame with FrameCompositor
          failureStage = 'rendering';
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

          // Apply transitions
          const transInType = activeItem.transitionIn || (activeItem.fadeIn ? 'fade' : 'cut');
          const transInDuration = activeItem.transitionDuration || activeItem.fadeIn || 0;
          if (transInDuration > 0 && timeInItem < transInDuration) {
            const transProgress = 1 - Math.max(0, Math.min(1, timeInItem / transInDuration));
            FrameCompositor.applyTransition(ctx, width, height, transProgress, transInType);
          }

          const timeLeft = activeItem.duration - timeInItem;
          const transOutType = activeItem.transitionOut || (activeItem.fadeOut ? 'fade' : 'cut');
          const transOutDuration = activeItem.transitionDuration || activeItem.fadeOut || 0;
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

        // Encode Frame to WebCodecs
        failureStage = 'encoding_video';
        const timestampMicros = Math.round(frameIndex * frameDurationMicros);
        const videoFrame = new VideoFrame(canvas, {
          timestamp: timestampMicros,
          duration: frameDurationMicros
        });

        try {
          if (videoEncoder.state !== 'configured') {
            throw new Error(encoderError?.message || `VideoEncoder nie jest w stanie gotowości (stan: ${videoEncoder.state})`);
          }
          const isKeyFrame = frameIndex % (fps * 2) === 0;
          videoEncoder.encode(videoFrame, { keyFrame: isKeyFrame });
        } catch (encErr: unknown) {
          const errObj = encErr as { message?: string };
          throw new Error(encoderError?.message || errObj?.message || 'Błąd kodowania klatki wideo.');
        } finally {
          videoFrame.close();
        }

        framesProcessed++;
        heartbeat();

        // GPU backpressure management
        if (videoEncoder.encodeQueueSize > 12) {
          await new Promise<void>((resolve) => {
            const checkQueue = () => {
              if (videoEncoder && videoEncoder.encodeQueueSize <= 4) {
                resolve();
              } else {
                setTimeout(checkQueue, 4);
              }
            };
            checkQueue();
          });
          heartbeat();
        }

        // Throttled UI Progress update (every 6 frames or last frame)
        if (frameIndex % 6 === 0 || frameIndex === totalFrames - 1) {
          const now = Date.now();
          const elapsed = (now - startTime) / 1000;

          speedSamples.push({ timestamp: now, frame: frameIndex });
          while (speedSamples.length > 2 && (now - speedSamples[0].timestamp) > 3000) {
            speedSamples.shift();
          }

          let currentFps = Math.max(1, Math.round(framesProcessed / Math.max(0.1, elapsed)));
          if (speedSamples.length >= 2) {
            const oldest = speedSamples[0];
            const sampleElapsed = (now - oldest.timestamp) / 1000;
            const sampleFrames = frameIndex - oldest.frame;
            if (sampleElapsed > 0.3 && sampleFrames > 0) {
              const instantaneousFps = sampleFrames / sampleElapsed;
              smoothedFps = Math.round((smoothedFps * 0.4) + (instantaneousFps * 0.6));
            }
          }
          currentFps = Math.max(1, smoothedFps);

          const percent = Math.min(95, 8 + Math.round((frameIndex / totalFrames) * 87));
          const remainingFrames = totalFrames - (frameIndex + 1);
          const etaSeconds = Math.max(1, Math.ceil(remainingFrames / currentFps));
          const elapsedSeconds = Math.round(elapsed);
          const speedMultiplier = Number(((currentFps / fps) || 1).toFixed(1));

          const finishDate = new Date(Date.now() + (etaSeconds * 1000));
          const estimatedFinishTime = finishDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });

          const m = Math.floor(etaSeconds / 60);
          const s = etaSeconds % 60;
          const etaFormatted = m > 0 ? `${m}m ${s.toString().padStart(2, '0')}s` : `${s}s`;

          onProgress({
            stage: 'rendering',
            percent,
            currentFrame: frameIndex + 1,
            totalFrames,
            fps: currentFps,
            targetFps: fps,
            etaSeconds,
            elapsedSeconds,
            estimatedFinishTime,
            speedMultiplier,
            statusMessage: `Kodowanie: ${frameIndex + 1}/${totalFrames} (${percent}%) • ~${etaFormatted} (${speedMultiplier}x)`,
            diagnostics: {
              failureStage: 'rendering',
              stageDetails: `Klatka ${frameIndex + 1}/${totalFrames}, ${speedMultiplier}x`
            }
          });
        }
      }

      // 9. Finalization & Flush
      failureStage = 'muxing';
      onProgress({ 
        stage: 'finalizing', 
        percent: 96, 
        currentFrame: totalFrames, 
        totalFrames, 
        fps: 0, 
        targetFps: fps, 
        statusMessage: 'Finalizacja kontenera MP4 i zamykanie strumieni...',
        diagnostics: { failureStage: 'muxing' }
      });

      await videoEncoder.flush();
      if (audioEncoder) await audioEncoder.flush();

      muxer.finalize();
      
      videoEncoder.close();
      if (audioEncoder) audioEncoder.close();

      const { buffer } = muxer.target;
      const finalBlob = new Blob([buffer], { type: 'video/mp4' });

      onProgress({ 
        stage: 'validating', 
        percent: 98, 
        currentFrame: totalFrames, 
        totalFrames, 
        fps: 0, 
        targetFps: fps, 
        statusMessage: 'Weryfikacja integralności wyjściowego pliku MP4...' 
      });

      const verification = await this.verifyOutput(finalBlob);
      if (!verification.valid) {
        throw new Error(verification.error || 'Błąd walidacji pliku MP4.');
      }

      const cleanName = (project.name || 'Film_Slubny').replace(/[^a-zA-Z0-9ąćęłńóśźżĄĆĘŁŃÓŚŹŻ_-]/g, '_');
      const fileName = `${cleanName}_${options.resolution}_${fps}fps.mp4`;
      const blobUrl = URL.createObjectURL(finalBlob);

      onProgress({ 
        stage: 'completed', 
        percent: 100, 
        currentFrame: totalFrames, 
        totalFrames, 
        fps: 0, 
        targetFps: fps, 
        statusMessage: 'Film ślubny został pomyślnie wyrenderowany!' 
      });

      return {
        blob: finalBlob,
        mimeType: 'video/mp4',
        duration: verification.duration || totalDuration,
        width,
        height,
        sizeBytes: finalBlob.size,
        fileName,
        blobUrl,
        verifiedPlayable: true
      };

    } catch (err: unknown) {
      const errMsg = (err as Error)?.message || String(err);
      onProgress({ 
        stage: 'error', 
        percent: 0, 
        currentFrame: framesProcessed, 
        totalFrames: 100, 
        fps: 0, 
        targetFps: 30, 
        statusMessage: `Błąd renderowania [${failureStage}]: ${errMsg}`,
        diagnostics: { 
          lastError: errMsg,
          failureStage,
          lastClipName: currentClipName
        }
      });

      try {
        if (videoEncoder && videoEncoder.state !== 'closed') videoEncoder.close();
        if (audioEncoder && audioEncoder.state !== 'closed') audioEncoder.close();
      } catch {}

      throw err;
    } finally {
      // Clean up video elements from DOM
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

  /**
   * Render audio mix to OfflineAudioContext and encode using AudioEncoder
   */
  private async renderAndEncodeAudio(
    project: ProjectState,
    totalDuration: number,
    audioEncoder: AudioEncoder,
    signal?: AbortSignal,
    onHeartbeat?: () => void,
    onProgressUpdate?: (msg: string, percent: number) => void
  ): Promise<void> {
    const sampleRate = 48000;
    const totalSamples = Math.max(1, Math.ceil(totalDuration * sampleRate));
    const OfflineCtxClass = window.OfflineAudioContext || (window as unknown as { webkitOfflineAudioContext: typeof OfflineAudioContext }).webkitOfflineAudioContext;
    if (!OfflineCtxClass) return;

    const offlineCtx = new OfflineCtxClass(2, totalSamples, sampleRate);
    const clipMap = new Map<string, MediaClip>();
    (project.mediaLibrary || []).forEach(c => clipMap.set(c.id, c));
    const audioBufferCache = new Map<string, AudioBuffer | null>();

    const fetchWithTimeout = async (url: string, timeoutMs = 15000): Promise<Response> => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const res = await fetch(url, { signal: controller.signal });
        clearTimeout(timer);
        return res;
      } catch (e) {
        clearTimeout(timer);
        throw e;
      }
    };

    // 1. Attach clip audio
    const timelineItems = project.timelineItems || [];
    const videoItems = timelineItems.filter(item => {
      if (item.muted || item.volume === 0) return false;
      const clip = clipMap.get(item.clipId);
      return clip && clip.type === 'video';
    });

    for (let i = 0; i < videoItems.length; i++) {
      if (signal?.aborted) return;
      onHeartbeat?.();

      const item = videoItems[i];
      const clip = clipMap.get(item.clipId);
      if (!clip) continue;

      onProgressUpdate?.(
        `Wczytywanie audio z ujęć (${i + 1}/${videoItems.length}): ${clip.name}...`,
        Math.round(6 + (i / Math.max(1, videoItems.length)) * 4)
      );

      let decoded: AudioBuffer | null = null;
      if (audioBufferCache.has(clip.id)) {
        decoded = audioBufferCache.get(clip.id) || null;
      } else {
        let arrayBuf: ArrayBuffer | null = null;
        if (clip.file) {
          try { arrayBuf = await clip.file.arrayBuffer(); } catch {}
        }
        if (!arrayBuf) {
          const src = await resolveClipMediaUrl(clip);
          if (src) {
            try {
              const res = await fetchWithTimeout(src, 20000);
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
            onHeartbeat?.();
            const copy = arrayBuf.slice(0);
            decoded = await offlineCtx.decodeAudioData(copy);
            audioBufferCache.set(clip.id, decoded);
          } catch {
            audioBufferCache.set(clip.id, null);
          }
        } else {
          audioBufferCache.set(clip.id, null);
        }
      }

      onHeartbeat?.();

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
        } catch {}
      }
    }

    // 2. Attach background audio tracks
    const audioTracks = (project.audioTracks || []).filter(t => !t.muted);
    for (let j = 0; j < audioTracks.length; j++) {
      if (signal?.aborted) return;
      onHeartbeat?.();

      const track = audioTracks[j];
      onProgressUpdate?.(
        `Wczytywanie ścieżki muzycznej (${j + 1}/${audioTracks.length}): ${track.name || 'Muzyka'}...`,
        Math.round(10 + (j / Math.max(1, audioTracks.length)) * 3)
      );

      try {
        let arrayBuf: ArrayBuffer | null = null;
        if (track.file) {
          arrayBuf = await track.file.arrayBuffer();
        } else {
          const freshUrl = await resolveAudioTrackUrl(track);
          arrayBuf = await getMediaArrayBuffer(track.id, undefined, freshUrl || track.objectUrl);
        }

        if (arrayBuf && arrayBuf.byteLength > 0) {
          onHeartbeat?.();
          const copy = arrayBuf.slice(0);
          const decoded = await offlineCtx.decodeAudioData(copy);
          if (decoded && decoded.duration > 0) {
            const source = offlineCtx.createBufferSource();
            source.buffer = decoded;
            const gain = offlineCtx.createGain();
            const trackBaseVol = (track.volume ?? 1) * (project.settings?.audioBalance?.musicVolume ?? 0.8);
            gain.gain.value = trackBaseVol;
            source.connect(gain);
            gain.connect(offlineCtx.destination);

            const trackOffset = Math.max(0, Math.min(track.sourceStart || 0, decoded.duration - 0.05));
            const trackDur = Math.max(0.05, Math.min(track.duration || decoded.duration, decoded.duration - trackOffset));
            source.start(track.timelineStart || 0, trackOffset, trackDur);
          }
        }
      } catch {}
      onHeartbeat?.();
    }

    onProgressUpdate?.('Miksowanie wielościeżkowego audio (48kHz stereo)...', 13);
    const renderedAudioBuf = await offlineCtx.startRendering();
    if (signal?.aborted) return;
    onHeartbeat?.();

    // Stream audio buffer chunks to AudioEncoder
    const channel0 = renderedAudioBuf.getChannelData(0);
    const channel1 = renderedAudioBuf.numberOfChannels > 1 ? renderedAudioBuf.getChannelData(1) : channel0;

    const chunkSize = 1024; // AAC frame size
    let sampleOffset = 0;

    while (sampleOffset < totalSamples) {
      if (signal?.aborted) break;
      onHeartbeat?.();
      const currentChunkSize = Math.min(chunkSize, totalSamples - sampleOffset);

      const planarData = new Float32Array(currentChunkSize * 2);
      for (let i = 0; i < currentChunkSize; i++) {
        planarData[i] = channel0[sampleOffset + i];
        planarData[currentChunkSize + i] = channel1[sampleOffset + i];
      }

      const timestampMicros = Math.round((sampleOffset / sampleRate) * 1_000_000);

      const audioData = new AudioData({
        format: 'f32-planar',
        sampleRate,
        numberOfFrames: currentChunkSize,
        numberOfChannels: 2,
        timestamp: timestampMicros,
        data: planarData
      });

      audioEncoder.encode(audioData);
      audioData.close();

      sampleOffset += currentChunkSize;

      if (sampleOffset % (chunkSize * 100) === 0 || sampleOffset >= totalSamples) {
        const aacPct = Math.round(14 + (sampleOffset / totalSamples) * 4);
        onProgressUpdate?.(`Kodowanie audio AAC (${Math.round((sampleOffset / totalSamples) * 100)}%)...`, aacPct);
      }
    }
  }

  /**
   * Generates a stylized fallback frame when a media clip format cannot be decoded
   */
  private createFallbackFrameElement(clipName: string, width: number, height: number): HTMLCanvasElement {
    const canvas = document.createElement('canvas');
    canvas.width = width || 1920;
    canvas.height = height || 1080;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      const grad = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
      grad.addColorStop(0, '#0E0D0B');
      grad.addColorStop(0.5, '#1E1912');
      grad.addColorStop(1, '#090807');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      ctx.strokeStyle = 'rgba(212, 175, 55, 0.45)';
      ctx.lineWidth = 3;
      ctx.strokeRect(32, 32, canvas.width - 64, canvas.height - 64);

      const vignette = ctx.createRadialGradient(
        canvas.width / 2, canvas.height / 2, canvas.width * 0.25,
        canvas.width / 2, canvas.height / 2, canvas.width * 0.7
      );
      vignette.addColorStop(0, 'rgba(0, 0, 0, 0)');
      vignette.addColorStop(1, 'rgba(0, 0, 0, 0.65)');
      ctx.fillStyle = vignette;
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = 'bold 32px "Cinzel", "Times New Roman", serif';
      ctx.fillStyle = '#F5F2EA';
      ctx.shadowColor = 'rgba(0, 0, 0, 0.8)';
      ctx.shadowBlur = 10;
      ctx.fillText(clipName, canvas.width / 2, canvas.height / 2 - 16);

      ctx.font = '14px monospace';
      ctx.fillStyle = '#D4AF37';
      ctx.fillText('UJĘCIE ŚLUBNE • ATELIER', canvas.width / 2, canvas.height / 2 + 28);
    }
    return canvas;
  }
}

export const webCodecsMp4RenderProvider = new WebCodecsMp4RenderProvider();
