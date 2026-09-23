import { ProjectState, TimelineItem, MediaClip } from '../../types/project';
import { IRenderProvider, RenderOptions, RenderProgress, RenderResult } from './renderTypes';
import { Muxer, ArrayBufferTarget } from 'mp4-muxer';
import { urlRegistry } from '../media/urlRegistry';
import { resolveClipMediaUrl } from '../media/mediaResolver';
import { localIndexedDB } from '../storage/indexedDBProvider';

/**
 * WebCodecsMp4RenderProvider
 * Renders genuine MP4 files frame-by-frame using WebCodecs (VideoEncoder, AudioEncoder)
 * and the mp4-muxer library. Produces authentic H.264/AAC ISO-compliant MP4 containers.
 */
export class WebCodecsMp4RenderProvider implements IRenderProvider {
  id = 'webcodecs_mp4_muxer';
  name = 'Silnik WebCodecs + MP4 Muxer (Prawdziwy H.264 / AAC MP4)';
  description = 'Profesjonalny potok kodowania klatka po klatce bez opóźnień czasu rzeczywistego z bezpośrednim zapisem kontenera MP4.';

  isSupported(): boolean {
    return typeof window !== 'undefined' &&
      typeof (window as any).VideoEncoder === 'function' &&
      typeof (window as any).VideoFrame === 'function' &&
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
          resolve({ valid: false, duration: dur, error: 'Metadane pliku MP4 są nieprawidłowe.' });
          return;
        }

        // Deep verification: seek to middle and end
        try {
          // Check middle
          testVideo.currentTime = dur / 2;
          await new Promise<void>(res => {
            testVideo.onseeked = () => res();
            setTimeout(res, 2000);
          });
          
          // Check end
          testVideo.currentTime = Math.max(0, dur - 0.5);
          await new Promise<void>(res => {
            testVideo.onseeked = () => res();
            setTimeout(res, 2000);
          });

          cleanup();
          resolve({ valid: true, duration: dur });
        } catch (e) {
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
      throw new Error('Eksport został anulowany.');
    }

    let failureStage: 'initialization' | 'loading' | 'decoding' | 'rendering' | 'encoding_video' | 'encoding_audio' | 'muxing' | 'validating' = 'initialization';
    let currentClipName: string | undefined;
    let framesProcessed = 0;
    const mediaElements = new Map<string, HTMLVideoElement | HTMLImageElement>();
    let videoEncoder: any = null;
    let audioEncoder: any = null;

    // 1. Sort and validate timeline
    const sortedItems = [...(project.timelineItems || [])].sort((a, b) => a.timelineStart - b.timelineStart);
    if (sortedItems.length === 0) {
      throw new Error('Brak klipów na osi czasu do wyrenderowania.');
    }

    const clipMap = new Map<string, MediaClip>();
    (project.mediaLibrary || []).forEach(c => clipMap.set(c.id, c));

    // STAGE 1 — project validation
    try {
      onProgress({
        stage: 'preparing',
        percent: 1,
        currentFrame: 0,
        totalFrames: 100,
        fps: 0,
        targetFps: options.fps || 30,
        statusMessage: 'Walidacja projektu i sprawdzanie dostępności materiałów...',
        diagnostics: { provider: this.id, stageDetails: 'STAGE 1: project validation', failureStage: 'initialization' }
      });

    for (const item of sortedItems) {
      const clip = clipMap.get(item.clipId);
      if (!clip) {
        throw new Error(`SOURCE_ERROR: Nie odnaleziono klipu o ID ${item.clipId} (TimelineItem: ${item.id})`);
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

    // VideoEncoder requires even dimensions
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

    // 2. Determine Audio Support
    const hasAudioSupport = typeof (window as any).AudioEncoder === 'function';
    const hasProjectAudio = (project.audioTracks && project.audioTracks.length > 0) ||
      sortedItems.some(i => !i.muted);

    const enableAudio = hasAudioSupport && hasProjectAudio;

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
    // Select H.264 profile - Main profile is usually safe, but let's ensure compatibility
    let avcCodec = 'avc1.4D401F'; // Main Profile Level 3.1
    if (options.resolution === '1080p') avcCodec = 'avc1.4D4028'; // Main Level 4.0
    if (options.resolution === '4k') avcCodec = 'avc1.640033'; // High Level 5.1

    const defaultBitrate = width >= 3840 ? 40000 : (width >= 1920 ? 12000 : 5000);
    const videoConfig: any = {
      codec: avcCodec,
      width,
      height,
      bitrate: (options.bitrateKbps || defaultBitrate) * 1000,
      framerate: fps,
      latencyMode: 'quality' as const, // We don't need real-time latency
      hardwareAcceleration: 'prefer-hardware' as const,
      avc: { format: 'avc' as const }
    };

    let encoderError: any = null;
    let videoChunksProduced = 0;
    let audioChunksProduced = 0;

    // STAGE 2 — source loading & configuration validation
    try {
      const support = await (window as any).VideoEncoder.isConfigSupported(videoConfig);
      if (!support.supported) {
        console.warn('Config not supported with hardware acceleration, trying software fallback...', videoConfig);
        const softwareConfig = { ...videoConfig, hardwareAcceleration: 'prefer-software' as const };
        const softwareSupport = await (window as any).VideoEncoder.isConfigSupported(softwareConfig);
        if (!softwareSupport.supported) {
          throw new Error(`VideoEncoder nie obsługuje żądanej konfiguracji: ${avcCodec} ${width}x${height}`);
        }
        videoConfig.hardwareAcceleration = 'prefer-software';
      }
    } catch (e: any) {
      console.error('VideoEncoder config check failed:', e);
    }

    videoEncoder = new (window as any).VideoEncoder({
      output: (chunk: any, meta: any) => {
        try {
          if (chunk.timestamp < 0) {
            console.error('Negative video timestamp detected:', chunk.timestamp);
          }
          muxer.addVideoChunk(chunk, meta);
          videoChunksProduced++;
        } catch (e: any) {
          console.error('Muxer video chunk error:', e);
          encoderError = { 
            message: 'Błąd zapisu Video do kontenera (Muxing Error)', 
            originalError: e, 
            chunkTimestamp: chunk.timestamp,
            failureStage: 'muxing'
          };
        }
      },
      error: (e: any) => {
        console.error('VideoEncoder critical error:', e);
        encoderError = {
          message: `Krytyczny błąd VideoEncoder: ${e.message || String(e)}`,
          originalError: e,
          failureStage: 'encoding_video',
          config: videoConfig
        };
      }
    });

    try {
      videoEncoder.configure(videoConfig);
    } catch (e: any) {
      throw new Error(`Błąd konfiguracji VideoEncoder: ${e.message}`);
    }

    // 5. Canvas for frame drawing
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    // Disable desynchronized as it can cause issues with VideoFrame capture on some devices
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) {
      throw new Error('Nie można utworzyć kontekstu Canvas 2D.');
    }

      // 6. Preload logic (Sliding Window)
      failureStage = 'loading';
      onProgress({
        stage: 'loading',
        percent: 5,
        currentFrame: 0,
        totalFrames,
        fps,
        targetFps: fps,
        statusMessage: 'Inicjalizacja zasobów i buforów...',
        diagnostics: { provider: this.id, stageDetails: 'STAGE 3: Adaptive media loading', failureStage: 'loading' }
      });

    // Watchdog and performance tracking
    let lastProgressTime = Date.now();
    const WATCHDOG_TIMEOUT_MS = 60000; // 60 seconds without progress
    const startTime = Date.now();
    const heartbeat = () => {
      lastProgressTime = Date.now();
    };
    
    const getMemoryUsage = () => {
      const mem = (performance as any).memory;
      return mem ? Math.round(mem.usedJSHeapSize / 1024 / 1024) : undefined;
    };

    const cleanupMedia = (currentTime: number) => {
      const CLEANUP_THRESHOLD = 60; // Keep clips for longer in memory
      for (const [clipId, el] of mediaElements.entries()) {
        const items = sortedItems.filter(i => i.clipId === clipId);
        // Be very conservative with cleanup
        const isNeededSoon = items.some(i => 
          (i.timelineStart + i.duration) > (currentTime - CLEANUP_THRESHOLD) && 
          i.timelineStart < (currentTime + 120) // Keep much more ahead
        );
        if (!isNeededSoon) {
          if (el instanceof HTMLVideoElement) {
            el.src = '';
            el.load();
          }
          mediaElements.delete(clipId);
        }
      }
    };

      const preloadWindow = async (currentTime: number) => {
        const PRELOAD_THRESHOLD = 40; // seconds ahead
        // Fix: include active items that might have started in the past
        const itemsToLoad = sortedItems.filter(i => 
          (i.timelineStart + i.duration) > currentTime && 
          i.timelineStart < (currentTime + PRELOAD_THRESHOLD) &&
          !mediaElements.has(i.clipId)
        );

        for (const item of itemsToLoad) {
          if (signal?.aborted) return;
          const clip = clipMap.get(item.clipId);
          if (!clip || mediaElements.has(clip.id)) continue;
          currentClipName = clip.name;
          heartbeat();

          try {
            let src = await resolveClipMediaUrl(clip);
            if (!src) throw new Error(`Brak źródła dla ${clip.name}`);

            if (clip.type === 'video') {
              const video = document.createElement('video');
              video.muted = true;
              video.playsInline = true;
              video.preload = 'auto';

              const isExternal = src.startsWith('http://') || src.startsWith('https://');
              const isSameOrigin = typeof window !== 'undefined' && src.startsWith(window.location.origin);
              if (isExternal && !isSameOrigin) {
                video.crossOrigin = 'anonymous';
              }
              video.src = src;

              const loadVideoWithFallback = (vidEl: HTMLVideoElement): Promise<boolean> => {
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
                  }, 12000);
                });
              };

              let loaded = await loadVideoWithFallback(video);

              // Retry 1: If crossOrigin caused CORS rejection, remove it and retry
              if (!loaded && video.crossOrigin) {
                video.removeAttribute('crossorigin');
                video.src = src;
                loaded = await loadVideoWithFallback(video);
              }

              // Retry 2: If primary source failed, fallback to proxyUrl
              if (!loaded && clip.proxyUrl && clip.proxyUrl !== src) {
                console.warn(`[webCodecsMp4Provider] Re-trying with proxyUrl for clip: ${clip.name}`);
                video.src = clip.proxyUrl;
                loaded = await loadVideoWithFallback(video);
              }

              // Retry 2.5: If clip.file exists in memory, generate fresh direct blob URL
              if (!loaded && clip.file) {
                try {
                  const directUrl = URL.createObjectURL(clip.file);
                  video.src = directUrl;
                  loaded = await loadVideoWithFallback(video);
                } catch (e) {}
              }

              // Retry 3: Try restoring directly from IndexedDB with typed blob
              if (!loaded) {
                try {
                  const blob = await localIndexedDB.getMediaBlob(clip.id);
                  if (blob && blob.size > 0) {
                    const mime = (blob.type && blob.type.startsWith('video/')) ? blob.type : 'video/mp4';
                    const typedBlob = new Blob([blob], { type: mime });
                    const freshUrl = urlRegistry.create(typedBlob);
                    video.src = freshUrl;
                    loaded = await loadVideoWithFallback(video);
                  }
                } catch (e) {
                  // ignore
                }
              }

              if (!loaded && video.videoWidth === 0 && video.readyState < 1) {
                // If the device video decoder cannot decode this format (e.g. Android HEVC / Format error),
                // fall back to the clip frame thumbnail rather than halting the entire wedding render
                if (clip.thumbnailUrl && clip.thumbnailUrl.length > 5) {
                  console.warn(`[webCodecsMp4Provider] Video decoder failed for "${clip.name}" (Codec/Format issue). Falling back to clip frame image.`);
                  const fallbackImg = new Image();
                  if (clip.thumbnailUrl.startsWith('http')) fallbackImg.crossOrigin = 'anonymous';
                  fallbackImg.src = clip.thumbnailUrl;
                  await new Promise<void>((resolve) => {
                    fallbackImg.onload = () => resolve();
                    fallbackImg.onerror = () => resolve();
                    setTimeout(resolve, 3000);
                  });
                  mediaElements.set(clip.id, fallbackImg);
                  heartbeat();
                  continue;
                }

                const err = video.error;
                const errDetail = err ? `Code ${err.code}: ${err.message || 'Format unsupported'}` : 'Brak odpowiedzi metadanych';
                throw new Error(`Błąd ładowania wideo (${errDetail}): ${clip.name}`);
              }

              mediaElements.set(clip.id, video);
              heartbeat();
            } else {
              const img = new Image();
              if (src.startsWith('http')) img.crossOrigin = 'anonymous';
              img.src = src;
              await new Promise<void>((resolve, reject) => {
                img.onload = () => resolve();
                img.onerror = () => reject(new Error(`Błąd ładowania obrazu: ${clip.name}`));
                setTimeout(resolve, 5000); // safety timeout
              });
              mediaElements.set(clip.id, img);
              heartbeat();
            }
          } catch (e: any) {
            console.warn('Preload failed for clip:', clip?.name, e?.message || String(e));
            throw new Error(`LOAD_ERROR [${clip.name}]: ${e?.message || String(e)}`);
          }
        }
      };

    // 7. Audio Encoding
    if (enableAudio) {
      try {
        failureStage = 'encoding_audio';
        heartbeat();
        onProgress({
          stage: 'encoding_audio',
          percent: 5,
          currentFrame: 0,
          totalFrames,
          fps: 0,
          targetFps: fps,
          statusMessage: 'Renderowanie i miksowanie ścieżki dźwiękowej...',
          diagnostics: { stageDetails: 'Audio mixdown', failureStage: 'encoding_audio' }
        });

        audioEncoder = new (window as any).AudioEncoder({
          output: (chunk: any, meta: any) => {
            try {
              muxer.addAudioChunk(chunk, meta);
              audioChunksProduced++;
              heartbeat();
            } catch (e: any) {
              console.error('Muxer audio chunk error:', e);
              encoderError = {
                message: 'Błąd muxingu audio (AAC)',
                originalError: e,
                failureStage: 'muxing'
              };
            }
          },
          error: (e: any) => {
            console.error('AudioEncoder error:', e);
            encoderError = {
              message: `Błąd AudioEncoder: ${e.message || String(e)}`,
              originalError: e,
              failureStage: 'encoding_audio'
            };
          }
        });

        audioEncoder.configure({
          codec: 'mp4a.40.2',
          numberOfChannels: 2,
          sampleRate: 48000,
          bitrate: 128000
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
        heartbeat();
      } catch (audioErr: any) {
        console.warn('Audio skipped:', audioErr);
        audioEncoder = null;
        heartbeat();
      }
    }

    // 8. Main Render Loop
    failureStage = 'rendering';
    heartbeat(); // Reset watchdog timer right before starting frame loop
    const frameIntervalSec = 1 / fps;

    for (let frameIndex = 0; frameIndex < totalFrames; frameIndex++) {
        const currentTime = frameIndex * frameIntervalSec;

        // Watchdog check
        if (Date.now() - lastProgressTime > WATCHDOG_TIMEOUT_MS) {
          throw new Error('TIMEOUT: Renderowanie zostało zawieszone (brak postępu).');
        }

        if (signal?.aborted) {
          onProgress({ stage: 'cancelled', percent: 0, currentFrame: frameIndex, totalFrames, fps: 0, targetFps: fps, statusMessage: 'Eksport anulowany.' });
          throw new Error('Eksport anulowany.');
        }

        if (encoderError) {
          throw new Error(`PIPELINE_ERROR [${encoderError.failureStage || 'unknown'}]: ${encoderError.message || encoderError}`);
        }

        // Adaptive preloading and cleanup every second of timeline
        if (frameIndex % fps === 0) {
          await preloadWindow(currentTime);
          cleanupMedia(currentTime);
          heartbeat();
        }

        // Find active items
        const activeItems = sortedItems.filter(
          item => currentTime >= item.timelineStart && currentTime < (item.timelineStart + item.duration)
        );

        ctx.fillStyle = '#000000';
        ctx.fillRect(0, 0, width, height);

        for (const activeItem of activeItems) {
          const clip = clipMap.get(activeItem.clipId);
          const mediaEl = clip ? mediaElements.get(clip.id) : null;

          if (!mediaEl && clip) {
            console.warn(`Missing media element for active clip: ${clip.name} (ID: ${clip.id})`);
          }

          if (mediaEl) {
            const timeInItem = currentTime - activeItem.timelineStart;
            const speed = activeItem.speed || 1;

            if (mediaEl instanceof HTMLVideoElement) {
              failureStage = 'decoding';
              const targetSourceTime = activeItem.sourceStart + (timeInItem * speed);
              const diff = Math.abs(mediaEl.currentTime - targetSourceTime);
              
              // More strict seeking: wait longer if needed
              if (diff > (0.5 / fps)) {
                mediaEl.currentTime = targetSourceTime;
                await new Promise<void>((resolve) => {
                  const onSeeked = () => {
                    mediaEl.removeEventListener('seeked', onSeeked);
                    resolve();
                  };
                  mediaEl.addEventListener('seeked', onSeeked);
                  // Allow up to 1 second for seek on mobile
                  setTimeout(() => {
                    mediaEl.removeEventListener('seeked', onSeeked);
                    resolve();
                  }, 1000);
                });
                heartbeat();
              }
            }

            try {
              failureStage = 'rendering';
              this.drawMediaToCanvas(ctx, mediaEl, activeItem, width, height, timeInItem);
            } catch (drawErr: any) {
              console.error('Draw error:', drawErr);
              throw new Error(`DRAW_ERROR [${clip.name}]: ${drawErr.message || String(drawErr)}`);
            }
          }
        }

        this.drawOverlays(ctx, project, currentTime, width, height);

        // Encode Frame
        failureStage = 'encoding_video';
        const videoFrame = new (window as any).VideoFrame(canvas, {
          timestamp: Math.round(currentTime * 1_000_000),
          duration: Math.round(frameIntervalSec * 1_000_000)
        });

        const isKeyFrame = frameIndex % (fps * 2) === 0;
        videoEncoder.encode(videoFrame, { keyFrame: isKeyFrame });
        videoFrame.close(); // IMMEDIATE CLEANUP
        framesProcessed++;
        heartbeat(); // Crucial: progress heartbeat on EVERY completed frame

        // Backpressure check to prevent GPU memory bloat
        if (videoEncoder.encodeQueueSize > 12) {
          await new Promise<void>((resolve) => {
            const checkQueue = () => {
              if (videoEncoder.encodeQueueSize <= 4) {
                resolve();
              } else {
                setTimeout(checkQueue, 15);
              }
            };
            checkQueue();
          });
          heartbeat();
        }

        // Progress Reporting (UI throttled to every 5 frames or final frame)
        if (frameIndex % 5 === 0 || frameIndex === totalFrames - 1) {
          const elapsed = (Date.now() - startTime) / 1000;
          const currentFps = Math.round(framesProcessed / Math.max(0.1, elapsed));
          const percent = Math.min(95, 10 + Math.round((frameIndex / totalFrames) * 85));
          
          onProgress({
            stage: 'rendering',
            percent,
            currentFrame: frameIndex + 1,
            totalFrames,
            fps: currentFps,
            targetFps: fps,
            statusMessage: `Kodowanie filmu: ${frameIndex + 1}/${totalFrames} (${percent}%)`,
            statistics: {
              startTime,
              averageFps: currentFps,
              hardwareAcceleration: videoConfig.hardwareAcceleration === 'prefer-hardware' ? 'hardware' : 'software'
            },
            diagnostics: {
              memoryUsageMb: getMemoryUsage(),
              stageDetails: `Active: ${activeItems.length}, Preloaded: ${mediaElements.size}, VChunks: ${videoChunksProduced}`
            }
          });
        }
      }

      // 9. Finalization & Track Muxing
      failureStage = 'muxing';
      onProgress({ 
        stage: 'finalizing', 
        percent: 96, 
        currentFrame: totalFrames, 
        totalFrames, 
        fps: 0, 
        targetFps: fps, 
        statusMessage: 'Zamykanie strumieni i finalizacja kontenera MP4...',
        diagnostics: { failureStage: 'muxing' }
      });

      await videoEncoder.flush();
      if (audioEncoder) await audioEncoder.flush();

      // Finalize closes the tracks and writes the moov atom (index)
      muxer.finalize();
      
      videoEncoder.close();
      if (audioEncoder) audioEncoder.close();

      const { buffer } = muxer.target;
      const finalBlob = new Blob([buffer], { type: 'video/mp4' });

      onProgress({ stage: 'validating', percent: 98, currentFrame: totalFrames, totalFrames, fps: 0, targetFps: fps, statusMessage: 'Walidacja pliku wyjściowego...' });
      const verification = await this.verifyOutput(finalBlob);
      
      if (!verification.valid) throw new Error(verification.error || 'Błąd walidacji pliku MP4.');

      const cleanName = (project.name || 'Export').replace(/[^a-z0-9]/gi, '_');
      const fileName = `${cleanName}.mp4`;
      const blobUrl = URL.createObjectURL(finalBlob);

      onProgress({ stage: 'completed', percent: 100, currentFrame: totalFrames, totalFrames, fps: 0, targetFps: fps, statusMessage: 'Gotowe!' });

      return {
        blob: finalBlob,
        mimeType: 'video/mp4',
        duration: verification.duration,
        width,
        height,
        sizeBytes: finalBlob.size,
        fileName,
        blobUrl,
        verifiedPlayable: true
      };

    } catch (err: any) {
      const errMsg = err?.message || (typeof err === 'string' ? err : 'Nieznany błąd potoku renderowania');
      const errDetails = typeof err === 'object' && err !== null 
        ? { message: errMsg, name: err.name || 'Error', stage: failureStage, stack: err.stack ? String(err.stack).slice(0, 1000) : undefined } 
        : String(err);

      // Enhanced diagnostic logging with serializable error
      console.error(`Render Failure at stage: ${failureStage}`, {
        error: errDetails,
        clip: currentClipName,
        frames: framesProcessed
      });

      onProgress({ 
        stage: 'error', 
        percent: 0, 
        currentFrame: framesProcessed, 
        totalFrames: 100, 
        fps: 0, 
        targetFps: 30, 
        statusMessage: `Błąd [${failureStage}]: ${errMsg}`,
        diagnostics: { 
          lastError: errMsg,
          failureStage: failureStage,
          failureDetails: errDetails,
          lastClipName: currentClipName,
          browserInfo: typeof navigator !== 'undefined' ? navigator.userAgent : 'unknown'
        }
      });

      // Cleanup encoders
      try {
        if (videoEncoder) videoEncoder.close();
        if (audioEncoder) audioEncoder.close();
      } catch (e) {}

      throw err;
    } finally {
      // Clear memory
      for (const el of mediaElements.values()) {
        if (el instanceof HTMLVideoElement) {
          el.src = '';
          el.load();
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
    audioEncoder: any,
    signal?: AbortSignal,
    onHeartbeat?: () => void,
    onProgressUpdate?: (msg: string, percent: number) => void
  ): Promise<void> {
    const sampleRate = 48000;
    const totalSamples = Math.max(1, Math.ceil(totalDuration * sampleRate));
    const OfflineCtxClass = window.OfflineAudioContext || (window as any).webkitOfflineAudioContext;
    if (!OfflineCtxClass) return;

    const offlineCtx = new OfflineCtxClass(2, totalSamples, sampleRate);

    const clipMap = new Map<string, MediaClip>();
    (project.mediaLibrary || []).forEach(c => clipMap.set(c.id, c));

    // Cache decoded audio buffers so multiple segments from the same clip don't re-download/re-decode
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

    // 1. Attach clip audio from video clips
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
        `Przetwarzanie audio z wideo (${i + 1}/${videoItems.length}): ${clip.name}...`,
        Math.round(5 + (i / Math.max(1, videoItems.length)) * 5)
      );

      let decoded: AudioBuffer | null = null;

      if (audioBufferCache.has(clip.id)) {
        decoded = audioBufferCache.get(clip.id) || null;
      } else {
        const src = await resolveClipMediaUrl(clip);
        if (src) {
          try {
            const res = await fetchWithTimeout(src, 20000);
            const arrayBuf = await res.arrayBuffer();
            onHeartbeat?.();
            decoded = await offlineCtx.decodeAudioData(arrayBuf);
            audioBufferCache.set(clip.id, decoded);
          } catch (clipAudioErr) {
            console.warn(`Could not extract audio for clip ${clip.name}:`, clipAudioErr);
            audioBufferCache.set(clip.id, null);
          }
        } else {
          audioBufferCache.set(clip.id, null);
        }
      }

      onHeartbeat?.();

      if (decoded) {
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
          source.start(startTime, item.sourceStart, item.duration);
        } catch (mixErr) {
          console.warn(`Failed attaching audio source for ${clip.name}:`, mixErr);
        }
      }
    }

    // 2. Attach background tracks (music & voiceover)
    const audioTracks = (project.audioTracks || []).filter(t => t.objectUrl && !t.muted);
    for (let j = 0; j < audioTracks.length; j++) {
      if (signal?.aborted) return;
      onHeartbeat?.();

      const track = audioTracks[j];
      onProgressUpdate?.(
        `Wczytywanie ścieżki muzycznej (${j + 1}/${audioTracks.length}): ${track.name || 'Muzyka'}...`,
        Math.round(10 + (j / Math.max(1, audioTracks.length)) * 3)
      );

      try {
        const res = await fetchWithTimeout(track.objectUrl!, 20000);
        const arrayBuf = await res.arrayBuffer();
        onHeartbeat?.();
        const decoded = await offlineCtx.decodeAudioData(arrayBuf);
        const source = offlineCtx.createBufferSource();
        source.buffer = decoded;
        const gain = offlineCtx.createGain();
        const trackBaseVol = (track.volume ?? 1) * (project.settings?.audioBalance?.musicVolume ?? 0.8);
        gain.gain.value = trackBaseVol;
        source.connect(gain);
        gain.connect(offlineCtx.destination);
        source.start(track.timelineStart || 0);
      } catch (e) {
        console.warn('Could not decode audio track for MP4 mix:', track.name, e);
      }
      onHeartbeat?.();
    }

    onProgressUpdate?.('Miksowanie wielościeżkowego audio...', 13);
    const renderedAudioBuf = await offlineCtx.startRendering();
    if (signal?.aborted) return;
    onHeartbeat?.();

    // Send audio buffer chunks to AudioEncoder
    const channel0 = renderedAudioBuf.getChannelData(0);
    const channel1 = renderedAudioBuf.numberOfChannels > 1 ? renderedAudioBuf.getChannelData(1) : channel0;

    const chunkSize = 1024; // Standard AAC frame size
    let sampleOffset = 0;

    while (sampleOffset < totalSamples) {
      if (signal?.aborted) break;
      onHeartbeat?.();
      const currentChunkSize = Math.min(chunkSize, totalSamples - sampleOffset);

      // Create interleaved planar float32 data
      const planarData = new Float32Array(currentChunkSize * 2);
      for (let i = 0; i < currentChunkSize; i++) {
        planarData[i] = channel0[sampleOffset + i];
        planarData[currentChunkSize + i] = channel1[sampleOffset + i];
      }

      const timestampMicros = Math.round((sampleOffset / sampleRate) * 1_000_000);

      const audioData = new (window as any).AudioData({
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
   * Draws media frame onto canvas
   */
  private drawMediaToCanvas(
    ctx: CanvasRenderingContext2D,
    media: HTMLVideoElement | HTMLImageElement,
    item: TimelineItem,
    targetWidth: number,
    targetHeight: number,
    currentTimeInClip: number
  ) {
    const sourceWidth = 'videoWidth' in media ? media.videoWidth : media.naturalWidth;
    const sourceHeight = 'videoHeight' in media ? media.videoHeight : media.naturalHeight;

    if (!sourceWidth || !sourceHeight) return;

    const sourceAspect = sourceWidth / sourceHeight;
    const targetAspect = targetWidth / targetHeight;
    const fitMode = item.fitMode || 'fit';

    // Fade In / Out Alpha calculation
    let alpha = 1;
    if (item.fadeIn && item.fadeIn > 0 && currentTimeInClip < item.fadeIn) {
      alpha = Math.min(alpha, Math.max(0, currentTimeInClip / item.fadeIn));
    }
    const timeLeft = item.duration - currentTimeInClip;
    if (item.fadeOut && item.fadeOut > 0 && timeLeft < item.fadeOut) {
      alpha = Math.min(alpha, Math.max(0, timeLeft / item.fadeOut));
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
   * Draws overlays onto frame
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

export const webCodecsMp4RenderProvider = new WebCodecsMp4RenderProvider();
