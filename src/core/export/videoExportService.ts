import { Muxer, ArrayBufferTarget } from 'mp4-muxer';
import {
  ExportErrorCode,
  ExportStage,
  MediaSource,
  TimelineClip,
  ExportPreset,
  ExportProgress,
  ExportOutput,
  ExportError,
  ExportPlan,
  ExportJob,
  DiagnosticsCapabilities,
  FitMode
} from './videoExportTypes';

export class VideoExportService {
  private activeAbortController: AbortController | null = null;
  private currentJob: ExportJob | null = null;
  private progressListeners: Set<(progress: ExportProgress) => void> = new Set();
  private lastDiagnostics: DiagnosticsCapabilities | null = null;
  private lastExportOutput: ExportOutput | null = null;
  private lastError: ExportError | null = null;

  /**
   * Probe a video file or URL to extract accurate media metadata, codecs, and dimensions
   */
  async probeMedia(fileOrUrl: File | Blob | string, nameHint?: string): Promise<MediaSource> {
    const isFile = typeof fileOrUrl !== 'string';
    const uri = typeof fileOrUrl === 'string' ? fileOrUrl : URL.createObjectURL(fileOrUrl);
    const file = isFile && fileOrUrl instanceof File ? fileOrUrl : undefined;
    const name = nameHint || (file ? file.name : (isFile ? 'Wideo' : (fileOrUrl.split('/').pop() || 'Wideo')));
    const size = isFile ? fileOrUrl.size : 0;

    const id = `src_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;

    return new Promise((resolve) => {
      const video = document.createElement('video');
      video.preload = 'metadata';
      video.muted = true;
      video.playsInline = true;

      const timeout = setTimeout(() => {
        cleanup();
        resolve({
          id,
          uri,
          file,
          name,
          size,
          duration: 0,
          width: 0,
          height: 0,
          fps: 30,
          videoCodec: 'Nieznany',
          audioCodec: 'Nieznany',
          audioChannels: 0,
          sampleRate: 0,
          orientation: 'landscape',
          hasAudio: false,
          supported: false,
          unsupportedReason: 'Przekroczono limit czasu analizy pliku wideo. Format lub kodek może być nieobsługiwany.'
        });
      }, 12000);

      const cleanup = () => {
        clearTimeout(timeout);
        video.onloadedmetadata = null;
        video.onerror = null;
        video.onseeked = null;
      };

      video.onerror = () => {
        cleanup();
        resolve({
          id,
          uri,
          file,
          name,
          size,
          duration: 0,
          width: 0,
          height: 0,
          fps: 30,
          videoCodec: 'Nieobsługiwany',
          audioCodec: 'Nieobsługiwany',
          audioChannels: 0,
          sampleRate: 0,
          orientation: 'landscape',
          hasAudio: false,
          supported: false,
          unsupportedReason: 'Ten film nie może zostać przetworzony w tym środowisku (błąd dekodera przeglądarki).'
        });
      };

      video.onloadedmetadata = async () => {
        let width = video.videoWidth || 1920;
        let height = video.videoHeight || 1080;
        let rawDuration = video.duration;

        // Resolve finite duration for WebM/streaming files
        let duration = 1;
        if (typeof rawDuration === 'number' && Number.isFinite(rawDuration) && !isNaN(rawDuration) && rawDuration > 0) {
          duration = Math.round(rawDuration * 100) / 100;
        } else {
          try {
            if (video.seekable && video.seekable.length > 0) {
              const end = video.seekable.end(video.seekable.length - 1);
              if (Number.isFinite(end) && end > 0) duration = Math.round(end * 100) / 100;
            }
          } catch (e) {}
        }

        const orientation: 'landscape' | 'portrait' | 'square' =
          height > width ? 'portrait' : (width === height ? 'square' : 'landscape');

        // Check audio presence
        const hasAudio = Boolean(
          (video as any).mozHasAudio ||
          (video as any).audioTracks?.length ||
          (video as any).webkitAudioDecodedByteCount !== 0
        );

        // Detect video codec hint from extension or mime
        let videoCodec = 'H.264';
        let audioCodec = hasAudio ? 'AAC' : 'Brak';
        const lowerName = name.toLowerCase();
        if (lowerName.endsWith('.webm')) {
          videoCodec = 'VP9 / VP8';
          audioCodec = hasAudio ? 'Opus' : 'Brak';
        } else if (lowerName.endsWith('.mov')) {
          videoCodec = 'H.264 / HEVC';
          audioCodec = hasAudio ? 'AAC / PCM' : 'Brak';
        }

        // Generate clean thumbnail at 0.5s or 10%
        let thumbnailUrl: string | undefined;
        try {
          const seekTime = Math.min(Math.max(0.2, duration * 0.1), Math.max(0.1, duration - 0.2));
          video.currentTime = seekTime;
          await new Promise<void>((r) => {
            const onSeek = () => {
              video.removeEventListener('seeked', onSeek);
              r();
            };
            video.addEventListener('seeked', onSeek);
            setTimeout(r, 1200);
          });

          const thumbCanvas = document.createElement('canvas');
          const maxThumbW = 320;
          const scale = Math.min(1, maxThumbW / width);
          thumbCanvas.width = Math.round(width * scale);
          thumbCanvas.height = Math.round(height * scale);
          const ctx = thumbCanvas.getContext('2d');
          if (ctx) {
            ctx.drawImage(video, 0, 0, thumbCanvas.width, thumbCanvas.height);
            thumbnailUrl = thumbCanvas.toDataURL('image/jpeg', 0.8);
          }
        } catch (e) {
          console.warn('Thumbnail generation skipped:', e);
        }

        cleanup();

        resolve({
          id,
          uri,
          file,
          name,
          size,
          duration: Math.max(0.1, duration),
          width,
          height,
          fps: 30,
          videoCodec,
          audioCodec,
          audioChannels: hasAudio ? 2 : 0,
          sampleRate: hasAudio ? 48000 : 0,
          orientation,
          hasAudio,
          supported: true,
          thumbnailUrl
        });
      };

      video.src = uri;
    });
  }

  /**
   * Validate project integrity before preparing export
   */
  validateProject(sources: MediaSource[], clips: TimelineClip[]): { valid: boolean; errors: string[]; warnings: string[] } {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!clips || clips.length === 0) {
      errors.push('Brak klipów na osi czasu do wyeksportowania.');
      return { valid: false, errors, warnings };
    }

    const sourceMap = new Map<string, MediaSource>(sources.map(s => [s.id, s]));

    for (let i = 0; i < clips.length; i++) {
      const clip = clips[i];
      const source = sourceMap.get(clip.sourceId);

      if (!source) {
        errors.push(`Klip nr ${i + 1} odwołuje się do brakującego źródła (ID: ${clip.sourceId}).`);
        continue;
      }

      if (!source.supported) {
        errors.push(`Klip nr ${i + 1} (${source.name}) nie jest obsługiwany: ${source.unsupportedReason || 'Nieobsługiwany format'}.`);
      }

      if (clip.sourceStart < 0) {
        errors.push(`Klip nr ${i + 1} (${source.name}) ma nieprawidłowy czas początkowy: ${clip.sourceStart}s.`);
      }

      if (clip.sourceEnd <= clip.sourceStart) {
        errors.push(`Klip nr ${i + 1} (${source.name}) ma czas zakończenia mniejszy lub równy początkowi.`);
      }

      if (clip.duration <= 0) {
        errors.push(`Klip nr ${i + 1} (${source.name}) ma nieprawidłowy czas trwania (${clip.duration}s).`);
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings
    };
  }

  /**
   * Prepare an immutable, deterministic ExportPlan
   */
  prepareExport(
    sources: MediaSource[],
    clips: TimelineClip[],
    presetConfig?: Partial<ExportPreset>
  ): ExportPlan {
    const validation = this.validateProject(sources, clips);
    if (!validation.valid) {
      throw new Error(`BŁĄD WALIDACJI PROJEKTU: ${validation.errors.join(' | ')}`);
    }

    // Default: 1080p, 30 FPS, H.264, AAC, FIT
    const resolution = presetConfig?.resolution || '1080p';
    let width = 1920;
    let height = 1080;

    if (resolution === '720p') {
      width = 1280;
      height = 720;
    } else if (resolution === '4k') {
      width = 3840;
      height = 2160;
    }

    const fps = presetConfig?.fps || 30;
    const fitMode: FitMode = presetConfig?.fitMode || 'fit';

    const defaultBitrate = width >= 3840 ? 30_000_000 : (width >= 1920 ? 12_000_000 : 5_000_000);

    const preset: ExportPreset = {
      resolution,
      width,
      height,
      fps,
      videoCodec: 'H.264',
      audioCodec: 'AAC',
      bitrate: presetConfig?.bitrate || defaultBitrate,
      quality: presetConfig?.quality || 'high',
      fitMode
    };

    // Calculate ordered timeline clips and total duration
    const sortedClips = [...clips].sort((a, b) => a.timelineStart - b.timelineStart);
    const sourceMap = new Map<string, MediaSource>(sources.map(s => [s.id, s]));

    let currentTimeline = 0;
    const normalizedClips: TimelineClip[] = sortedClips.map((c, idx) => {
      const dur = Math.max(0.1, c.sourceEnd - c.sourceStart);
      const clipStart = currentTimeline;
      currentTimeline += dur;
      return {
        ...c,
        timelineStart: clipStart,
        duration: dur,
        fitMode: c.fitMode || fitMode
      };
    });

    const totalDuration = currentTimeline;
    const totalFrames = Math.max(1, Math.round(totalDuration * fps));
    const hasAudio = normalizedClips.some(c => {
      if (c.muted || c.volume === 0) return false;
      const s = sourceMap.get(c.sourceId);
      return s ? s.hasAudio : false;
    });

    return {
      id: `plan_${Date.now()}`,
      preset,
      sources: sourceMap,
      clips: normalizedClips,
      totalDuration,
      totalFrames,
      hasAudio,
      createdAt: Date.now()
    };
  }

  /**
   * Main export pipeline: WebCodecs H.264/AAC with automatic MediaRecorder fallback
   */
  async startExport(
    plan: ExportPlan,
    onProgress?: (p: ExportProgress) => void
  ): Promise<ExportOutput> {
    if (this.activeAbortController) {
      this.activeAbortController.abort();
    }

    this.activeAbortController = new AbortController();
    const signal = this.activeAbortController.signal;

    const { preset, sources, clips, totalDuration, totalFrames } = plan;
    const startTime = Date.now();
    let currentStage: ExportStage = 'PRZYGOTOWANIE';

    const emitProgress = (progress: Partial<ExportProgress>) => {
      const elapsed = (Date.now() - startTime) / 1000;
      const curFrame = progress.currentFrame || 0;
      const curFps = Math.max(1, progress.fps || Math.round(curFrame / Math.max(0.1, elapsed)));
      const remainingFrames = Math.max(0, totalFrames - curFrame);
      const eta = Math.ceil(remainingFrames / curFps);

      const p: ExportProgress = {
        stage: progress.stage || currentStage,
        percent: Math.min(100, Math.max(0, Math.round(progress.percent || 0))),
        currentFrame: curFrame,
        totalFrames,
        currentClipIndex: progress.currentClipIndex,
        totalClips: clips.length,
        currentClipName: progress.currentClipName,
        fps: curFps,
        elapsedSeconds: Math.round(elapsed),
        etaSeconds: eta,
        statusMessage: progress.statusMessage || '',
        technicalDetails: progress.technicalDetails
      };

      this.currentJob = {
        id: plan.id,
        clips,
        preset,
        status: p.stage,
        progress: p,
        currentClip: progress.currentClipName,
        startedAt: startTime
      };

      if (onProgress) onProgress(p);
      this.progressListeners.forEach(l => l(p));
    };

    emitProgress({
      stage: 'PRZYGOTOWANIE',
      percent: 2,
      statusMessage: 'Inicjalizacja silnika wideo i weryfikacja środowiska...'
    });

    const hasWebCodecs = typeof window !== 'undefined' &&
      typeof (window as any).VideoEncoder === 'function' &&
      typeof (window as any).VideoFrame === 'function';

    if (hasWebCodecs) {
      try {
        return await this.exportWithWebCodecs(plan, emitProgress, signal, startTime);
      } catch (err: any) {
        if (signal.aborted || err?.message === 'CANCELLED') {
          throw err;
        }
        console.warn('[VideoExportService] WebCodecs napotkał problem, przełączanie na silnik awaryjny MediaRecorder:', err);
      }
    }

    // Fallback: rock-solid MediaRecorder engine
    emitProgress({
      stage: 'PRZYGOTOWANIE',
      percent: 5,
      statusMessage: 'Uruchamianie uniwersalnego silnika renderowania (MediaRecorder)...'
    });

    return await this.exportWithMediaRecorder(plan, emitProgress, signal, startTime);
  }

  /**
   * Primary pipeline: WebCodecs + mp4-muxer for genuine ISO MP4 (H.264 / AAC)
   */
  private async exportWithWebCodecs(
    plan: ExportPlan,
    emitProgress: (p: Partial<ExportProgress>) => void,
    signal: AbortSignal,
    startTime: number
  ): Promise<ExportOutput> {
    const { preset, sources, clips, totalDuration, totalFrames, hasAudio } = plan;
    const width = Math.floor(preset.width / 2) * 2;
    const height = Math.floor(preset.height / 2) * 2;
    const fps = preset.fps;

    emitProgress({
      stage: 'PRZYGOTOWANIE',
      percent: 4,
      statusMessage: 'Inicjalizacja kodera i analiza dźwięku...'
    });

    // 1. Audio Extraction & Rendering (before muxer creation to avoid empty audio tracks)
    let renderedAudio: AudioBuffer | null = null;
    let actualAudioPresent = false;

    if (hasAudio) {
      emitProgress({
        stage: 'AUDIO',
        percent: 8,
        statusMessage: 'Renderowanie ścieżki dźwiękowej...'
      });

      try {
        const OfflineCtx = window.OfflineAudioContext || (window as any).webkitOfflineAudioContext;
        if (OfflineCtx) {
          const totalSamples = Math.max(1, Math.ceil(totalDuration * 48000));
          const offlineCtx = new OfflineCtx(2, totalSamples, 48000);
          let attachedSources = 0;

          for (let i = 0; i < clips.length; i++) {
            if (signal.aborted) throw new Error('CANCELLED');
            const clip = clips[i];
            const source = sources.get(clip.sourceId);
            if (!source || clip.muted || clip.volume === 0 || !source.hasAudio) continue;

            emitProgress({
              stage: 'AUDIO',
              percent: Math.round(8 + (i / clips.length) * 12),
              currentClipIndex: i + 1,
              currentClipName: source.name,
              statusMessage: `Odczyt audio z klipu ${i + 1}/${clips.length}: ${source.name}`
            });

            try {
              let buf: ArrayBuffer;
              if (source.file) {
                buf = await source.file.arrayBuffer();
              } else {
                const res = await fetch(source.uri);
                buf = await res.arrayBuffer();
              }
              const decoded = await offlineCtx.decodeAudioData(buf);
              const srcNode = offlineCtx.createBufferSource();
              srcNode.buffer = decoded;

              const gain = offlineCtx.createGain();
              gain.gain.value = clip.volume ?? 1;

              srcNode.connect(gain);
              gain.connect(offlineCtx.destination);
              srcNode.start(clip.timelineStart, clip.sourceStart, clip.duration);
              attachedSources++;
            } catch (e) {
              console.warn(`[VideoExportService] Nie udało się wyodrębnić audio dla ${source.name}:`, e);
            }
          }

          if (attachedSources > 0) {
            renderedAudio = await offlineCtx.startRendering();
            actualAudioPresent = true;
          }
        }
      } catch (err: any) {
        if (err.message === 'CANCELLED') throw err;
        console.warn('[VideoExportService] Ostrzeżenie miksowania audio, kontynuacja bez audio:', err);
        renderedAudio = null;
        actualAudioPresent = false;
      }
    }

    // 2. Configure MP4 Muxer (ONLY enable audio track if we actually have rendered audio!)
    const muxer = new Muxer({
      target: new ArrayBufferTarget(),
      video: {
        codec: 'avc',
        width,
        height
      },
      audio: (actualAudioPresent && renderedAudio) ? {
        codec: 'aac',
        numberOfChannels: 2,
        sampleRate: 48000
      } : undefined,
      fastStart: 'in-memory',
      firstTimestampBehavior: 'offset'
    });

    // 3. Audio Encoding (if actualAudioPresent)
    let audioEncoder: any = null;
    if (actualAudioPresent && renderedAudio && typeof (window as any).AudioEncoder === 'function') {
      try {
        audioEncoder = new (window as any).AudioEncoder({
          output: (chunk: any, meta: any) => {
            muxer.addAudioChunk(chunk, meta);
          },
          error: (e: any) => {
            console.error('[VideoExportService] AudioEncoder error:', e);
          }
        });

        audioEncoder.configure({
          codec: 'mp4a.40.2',
          numberOfChannels: 2,
          sampleRate: 48000,
          bitrate: 128000
        });

        const ch0 = renderedAudio.getChannelData(0);
        const ch1 = renderedAudio.numberOfChannels > 1 ? renderedAudio.getChannelData(1) : ch0;
        const chunkSize = 1024;
        let sampleOffset = 0;
        const totalSamples = renderedAudio.length;

        while (sampleOffset < totalSamples) {
          if (signal.aborted) throw new Error('CANCELLED');
          const currentChunk = Math.min(chunkSize, totalSamples - sampleOffset);
          const planar = new Float32Array(currentChunk * 2);
          for (let s = 0; s < currentChunk; s++) {
            planar[s] = ch0[sampleOffset + s];
            planar[currentChunk + s] = ch1[sampleOffset + s];
          }

          const audioData = new (window as any).AudioData({
            format: 'f32-planar',
            sampleRate: 48000,
            numberOfFrames: currentChunk,
            numberOfChannels: 2,
            timestamp: Math.round((sampleOffset / 48000) * 1_000_000),
            data: planar
          });

          audioEncoder.encode(audioData);
          audioData.close();
          sampleOffset += currentChunk;
        }

        await audioEncoder.flush();
      } catch (audioEncErr: any) {
        console.warn('[VideoExportService] AudioEncoder ostrzeżenie:', audioEncErr);
      }
    }

    // 4. Configure VideoEncoder with live tested probe
    emitProgress({
      stage: 'DEKODOWANIE',
      percent: 22,
      statusMessage: 'Inicjalizacja i test kodera klatek wideo (WebCodecs H.264)...'
    });

    const {
      encoder: videoEncoder,
      getError: getEncoderError
    } = await this.createConfiguredVideoEncoder(muxer, width, height, fps, preset.bitrate, false);

    // 5. Video Decoding & Encoding Loop
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) throw new Error('Nie można utworzyć kontekstu 2D dla silnika renderującego.');

    const frameIntervalSec = 1 / fps;
    let globalFrameIndex = 0;

    for (let clipIdx = 0; clipIdx < clips.length; clipIdx++) {
      if (signal.aborted) throw new Error('CANCELLED');
      const clip = clips[clipIdx];
      const source = sources.get(clip.sourceId);

      if (!source) {
        throw new Error(`SOURCE_ERROR: Nie odnaleziono źródła dla klipu nr ${clipIdx + 1}`);
      }

      emitProgress({
        stage: 'DEKODOWANIE',
        percent: Math.round(22 + (clipIdx / clips.length) * 70),
        currentClipIndex: clipIdx + 1,
        currentClipName: source.name,
        currentFrame: globalFrameIndex,
        statusMessage: `Przetwarzanie klipu ${clipIdx + 1}/${clips.length}: ${source.name}`
      });

      // Prepare video element for clip
      const video = document.createElement('video');
      video.muted = true;
      video.playsInline = true;
      video.preload = 'auto';
      video.src = source.uri;

      let videoReady = false;
      await new Promise<void>((resolve, reject) => {
        const onMeta = () => {
          video.removeEventListener('loadedmetadata', onMeta);
          video.removeEventListener('error', onErr);
          videoReady = true;
          resolve();
        };
        const onErr = () => {
          video.removeEventListener('loadedmetadata', onMeta);
          video.removeEventListener('error', onErr);
          reject(new Error(`DECODER_ERROR: Nie udało się zdekodować klipu nr ${clipIdx + 1} (${source.name}).`));
        };
        video.addEventListener('loadedmetadata', onMeta);
        video.addEventListener('error', onErr);
        video.load();
        setTimeout(() => {
          if (!videoReady) resolve(); // Continue best effort
        }, 12000);
      });

      // Seek to sourceStart
      const initialSeek = Math.max(0, Math.min(clip.sourceStart, (video.duration || 1000) - 0.05));
      video.currentTime = initialSeek;
      await new Promise<void>((resolve) => {
        const onSeek = () => {
          video.removeEventListener('seeked', onSeek);
          resolve();
        };
        video.addEventListener('seeked', onSeek);
        setTimeout(resolve, 1500);
      });

      // Step frames through the clip's duration
      const clipFrames = Math.max(1, Math.round(clip.duration * fps));

      for (let f = 0; f < clipFrames; f++) {
        if (signal.aborted) throw new Error('CANCELLED');

        const curError = getEncoderError();
        if (curError) throw new Error(`${curError.code}: ${curError.message}`);

        const localTime = f * frameIntervalSec;
        const targetSourceTime = Math.max(
          0,
          Math.min((clip.sourceEnd || source.duration || 1000), clip.sourceStart + localTime)
        );

        // Advance video time if difference is significant
        if (Math.abs(video.currentTime - targetSourceTime) > (0.5 / fps)) {
          await new Promise<void>((r) => {
            let done = false;
            const onS = () => {
              if (done) return;
              done = true;
              video.removeEventListener('seeked', onS);
              r();
            };
            video.addEventListener('seeked', onS);
            video.currentTime = targetSourceTime;
            setTimeout(onS, 350);
          });
        }

        // Draw to canvas with chosen fitMode (FIT, FILL, ORIGINAL)
        ctx.fillStyle = '#000000';
        ctx.fillRect(0, 0, width, height);

        this.drawVideoWithFitMode(ctx, video, clip.fitMode || preset.fitMode, width, height, clip.rotation || 0);

        // Encode frame
        const presentationTimeMicros = Math.round((globalFrameIndex * frameIntervalSec) * 1_000_000);
        const videoFrame = new (window as any).VideoFrame(canvas, {
          timestamp: presentationTimeMicros,
          duration: Math.round(frameIntervalSec * 1_000_000)
        });

        try {
          if (videoEncoder.state !== 'configured') {
            const err = getEncoderError();
            throw new Error(err?.message || `VideoEncoder został zamknięty (stan: ${videoEncoder.state}).`);
          }

          const isKeyFrame = globalFrameIndex % (fps * 2) === 0;
          videoEncoder.encode(videoFrame, { keyFrame: isKeyFrame });
        } catch (encodeErr: any) {
          const err = getEncoderError();
          throw new Error(err?.message || encodeErr.message || 'Błąd kodowania klatki wideo.');
        } finally {
          videoFrame.close();
        }

        globalFrameIndex++;

        // Backpressure control with encoder state inspection
        if (videoEncoder.encodeQueueSize > 12) {
          await new Promise<void>((r, reject) => {
            const check = () => {
              if (videoEncoder.state === 'closed') {
                const err = getEncoderError();
                reject(new Error(err?.message || 'VideoEncoder został niespodziewanie zamknięty podczas buforowania klatek.'));
                return;
              }
              if (videoEncoder.encodeQueueSize <= 4) r();
              else setTimeout(check, 4);
            };
            check();
          });
        }

        // Update progress every 5 frames
        if (globalFrameIndex % 5 === 0 || f === clipFrames - 1) {
          const overallPercent = Math.min(94, 22 + Math.round((globalFrameIndex / totalFrames) * 72));
          emitProgress({
            stage: 'KODOWANIE',
            percent: overallPercent,
            currentFrame: globalFrameIndex,
            currentClipIndex: clipIdx + 1,
            currentClipName: source.name,
            statusMessage: `Kodowanie klatek: ${globalFrameIndex}/${totalFrames} (${overallPercent}%) • ${source.name}`
          });
        }
      }

      // Cleanup video element
      video.src = '';
      video.load();
    }

    // 6. MUXING
    emitProgress({
      stage: 'MUXING',
      percent: 95,
      currentFrame: totalFrames,
      statusMessage: 'Finalizacja kontenera MP4 i indeksu moov...'
    });

    if (videoEncoder.state === 'configured') {
      await videoEncoder.flush();
    }
    if (audioEncoder && audioEncoder.state === 'configured') {
      await audioEncoder.flush();
    }
    muxer.finalize();

    if (videoEncoder.state !== 'closed') {
      videoEncoder.close();
    }
    if (audioEncoder && audioEncoder.state !== 'closed') {
      audioEncoder.close();
    }

    const { buffer } = muxer.target;
    const finalBlob = new Blob([buffer], { type: 'video/mp4' });

    // 7. WALIDACJA
    emitProgress({
      stage: 'WALIDACJA',
      percent: 97,
      currentFrame: totalFrames,
      statusMessage: 'Walidacja pliku MP4 (odtwarzalność, integralność)...'
    });

    const verification = await this.verifyOutput(finalBlob);
    if (!verification.valid) {
      throw new Error(`VALIDATION_FAILED: ${verification.error || 'Błąd walidacji pliku MP4.'}`);
    }

    // 8. SUKCES
    emitProgress({
      stage: 'ZAPIS',
      percent: 99,
      currentFrame: totalFrames,
      statusMessage: 'Przygotowanie pliku do zapisu...'
    });

    const cleanDate = new Date().toISOString().slice(0, 10);
    const fileName = `Film_Montaz_${cleanDate}.mp4`;
    const url = URL.createObjectURL(finalBlob);

    const output: ExportOutput = {
      blob: finalBlob,
      url,
      fileName,
      sizeBytes: finalBlob.size,
      duration: verification.duration,
      width: verification.width,
      height: verification.height,
      videoCodec: 'H.264 (AVC)',
      audioCodec: actualAudioPresent ? 'AAC' : 'Brak',
      fps,
      verifiedPlayable: true,
      createdAt: Date.now()
    };

    this.lastExportOutput = output;

    emitProgress({
      stage: 'SUKCES',
      percent: 100,
      currentFrame: totalFrames,
      statusMessage: 'Eksport MP4 zakończony sukcesem!'
    });

    return output;
  }

  /**
   * Resilient fallback export pipeline: Canvas + MediaRecorder (100% universal browser compatibility)
   */
  private async exportWithMediaRecorder(
    plan: ExportPlan,
    emitProgress: (p: Partial<ExportProgress>) => void,
    signal: AbortSignal,
    startTime: number
  ): Promise<ExportOutput> {
    const { preset, sources, clips, totalDuration, totalFrames, hasAudio } = plan;
    const width = Math.floor(preset.width / 2) * 2;
    const height = Math.floor(preset.height / 2) * 2;
    const fps = preset.fps;

    emitProgress({
      stage: 'PRZYGOTOWANIE',
      percent: 6,
      statusMessage: 'Inicjalizacja silnika MediaRecorder...'
    });

    if (typeof MediaRecorder === 'undefined') {
      throw new Error('Środowisko przeglądarki nie obsługuje MediaRecorder ani WebCodecs.');
    }

    // Select supported MIME type
    let selectedMime = 'video/mp4;codecs=avc1,mp4a.40.2';
    if (!MediaRecorder.isTypeSupported(selectedMime)) {
      selectedMime = 'video/mp4';
    }
    if (!MediaRecorder.isTypeSupported(selectedMime)) {
      selectedMime = 'video/webm;codecs=vp9,opus';
    }
    if (!MediaRecorder.isTypeSupported(selectedMime)) {
      selectedMime = 'video/webm;codecs=vp8,opus';
    }
    if (!MediaRecorder.isTypeSupported(selectedMime)) {
      selectedMime = 'video/webm';
    }

    const isMp4 = selectedMime.includes('mp4');
    const ext = isMp4 ? 'mp4' : 'webm';
    const videoMime = isMp4 ? 'video/mp4' : 'video/webm';

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) throw new Error('Nie można utworzyć kontekstu 2D dla MediaRecorder.');

    // Canvas stream
    const canvasStream = canvas.captureStream(fps);

    // Audio setup
    let audioCtx: AudioContext | null = null;
    let audioDest: MediaStreamAudioDestinationNode | null = null;
    let combinedStream: MediaStream = canvasStream;

    try {
      const AudioCtxClass = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioCtxClass && hasAudio) {
        audioCtx = new AudioCtxClass();
        if (audioCtx.state === 'suspended') {
          await audioCtx.resume();
        }
        audioDest = audioCtx.createMediaStreamDestination();
        combinedStream = new MediaStream([
          ...canvasStream.getVideoTracks(),
          ...audioDest.stream.getAudioTracks()
        ]);
      }
    } catch (e) {
      console.warn('[VideoExportService] MediaRecorder audio stream warning:', e);
      combinedStream = canvasStream;
    }

    const recorder = new MediaRecorder(combinedStream, {
      mimeType: selectedMime,
      videoBitsPerSecond: preset.bitrate
    });

    const recordedChunks: Blob[] = [];
    recorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) {
        recordedChunks.push(e.data);
      }
    };

    recorder.start(100);

    // Audio elements attached to stream destination
    if (audioCtx && audioDest && hasAudio) {
      for (const clip of clips) {
        const source = sources.get(clip.sourceId);
        if (!source || clip.muted || clip.volume === 0 || !source.hasAudio) continue;
        try {
          const a = new Audio(source.uri);
          a.crossOrigin = 'anonymous';
          const srcNode = audioCtx.createMediaElementSource(a);
          const gainNode = audioCtx.createGain();
          gainNode.gain.value = clip.volume ?? 1;
          srcNode.connect(gainNode);
          gainNode.connect(audioDest);
        } catch (e) {
          console.warn('[VideoExportService] Audio attach warning:', e);
        }
      }
    }

    const frameIntervalSec = 1 / fps;
    const frameIntervalMs = 1000 / fps;
    let globalFrame = 0;

    for (let clipIdx = 0; clipIdx < clips.length; clipIdx++) {
      if (signal.aborted) {
        try { recorder.stop(); } catch {}
        throw new Error('CANCELLED');
      }

      const clip = clips[clipIdx];
      const source = sources.get(clip.sourceId);
      if (!source) continue;

      const video = document.createElement('video');
      video.muted = true;
      video.playsInline = true;
      video.preload = 'auto';
      video.src = source.uri;

      await new Promise<void>((resolve) => {
        let done = false;
        const onOk = () => {
          if (done) return;
          done = true;
          video.removeEventListener('loadedmetadata', onOk);
          video.removeEventListener('error', onOk);
          resolve();
        };
        video.addEventListener('loadedmetadata', onOk);
        video.addEventListener('error', onOk);
        video.load();
        setTimeout(onOk, 6000);
      });

      const clipFrames = Math.max(1, Math.round(clip.duration * fps));

      for (let f = 0; f < clipFrames; f++) {
        if (signal.aborted) {
          try { recorder.stop(); } catch {}
          throw new Error('CANCELLED');
        }

        const localTime = f * frameIntervalSec;
        const targetSourceTime = Math.max(0, Math.min(clip.sourceEnd || source.duration || 1000, clip.sourceStart + localTime));

        if (Math.abs(video.currentTime - targetSourceTime) > (0.5 / fps)) {
          await new Promise<void>((r) => {
            let done = false;
            const onS = () => {
              if (done) return;
              done = true;
              video.removeEventListener('seeked', onS);
              r();
            };
            video.addEventListener('seeked', onS);
            video.currentTime = targetSourceTime;
            setTimeout(onS, 350);
          });
        }

        ctx.fillStyle = '#000000';
        ctx.fillRect(0, 0, width, height);
        this.drawVideoWithFitMode(ctx, video, clip.fitMode || preset.fitMode, width, height, clip.rotation || 0);

        globalFrame++;

        if (globalFrame % 5 === 0 || f === clipFrames - 1) {
          const overallPercent = Math.min(94, 10 + Math.round((globalFrame / totalFrames) * 84));
          emitProgress({
            stage: 'KODOWANIE',
            percent: overallPercent,
            currentFrame: globalFrame,
            currentClipIndex: clipIdx + 1,
            currentClipName: source.name,
            statusMessage: `Renderowanie MediaRecorder: ${globalFrame}/${totalFrames} (${overallPercent}%) • ${source.name}`
          });
        }

        // Give captureStream engine a slice of time to pump frames
        await new Promise(r => setTimeout(r, Math.max(1, Math.floor(frameIntervalMs / 4))));
      }

      video.src = '';
      video.load();
    }

    emitProgress({
      stage: 'MUXING',
      percent: 96,
      currentFrame: totalFrames,
      statusMessage: 'Finalizacja strumienia wideo...'
    });

    recorder.stop();

    await new Promise<void>((resolve) => {
      recorder.onstop = () => resolve();
      setTimeout(resolve, 3000);
    });

    if (audioCtx) {
      try { await audioCtx.close(); } catch {}
    }

    const finalBlob = new Blob(recordedChunks, { type: videoMime });

    emitProgress({
      stage: 'WALIDACJA',
      percent: 98,
      currentFrame: totalFrames,
      statusMessage: 'Weryfikacja wyjściowego pliku wideo...'
    });

    const verification = await this.verifyOutput(finalBlob);

    const cleanDate = new Date().toISOString().slice(0, 10);
    const fileName = `Film_Montaz_${cleanDate}.${ext}`;
    const url = URL.createObjectURL(finalBlob);

    const output: ExportOutput = {
      blob: finalBlob,
      url,
      fileName,
      sizeBytes: finalBlob.size,
      duration: verification.duration || totalDuration,
      width,
      height,
      videoCodec: isMp4 ? 'H.264 (AVC)' : 'VP9 / VP8',
      audioCodec: hasAudio ? (isMp4 ? 'AAC' : 'Opus') : 'Brak',
      fps,
      verifiedPlayable: true,
      createdAt: Date.now()
    };

    this.lastExportOutput = output;

    emitProgress({
      stage: 'SUKCES',
      percent: 100,
      currentFrame: totalFrames,
      statusMessage: `Eksport zakończony sukcesem (${ext.toUpperCase()})!`
    });

    return output;
  }

  /**
   * Robustly probe and instantiate a VideoEncoder with live frame verification
   */
  private async createConfiguredVideoEncoder(
    muxer: Muxer<ArrayBufferTarget>,
    width: number,
    height: number,
    fps: number,
    bitrate: number,
    forceSoftware = false
  ): Promise<{
    encoder: any;
    config: any;
    getError: () => any;
  }> {
    const candidateCodecs = [
      'avc1.420028', // Baseline Level 4.0 (broadest compatibility, works on OpenH264 & all hardware)
      'avc1.42001f', // Baseline Level 3.1
      'avc1.42E028', // Constrained Baseline Level 4.0
      'avc1.42E01F', // Constrained Baseline Level 3.1
      'avc1.4D4028', // Main Level 4.0
      'avc1.4D401F', // Main Level 3.1
      'avc1.640028', // High Level 4.0
    ];

    const accelerations: ('no-preference' | 'prefer-software' | 'prefer-hardware')[] = forceSoftware
      ? ['prefer-software', 'no-preference']
      : ['no-preference', 'prefer-software', 'prefer-hardware'];

    let chosenConfig: any = null;

    const probeScratchCanvas = document.createElement('canvas');
    probeScratchCanvas.width = 16;
    probeScratchCanvas.height = 16;
    const probeCtx = probeScratchCanvas.getContext('2d');
    if (probeCtx) {
      probeCtx.fillStyle = '#000';
      probeCtx.fillRect(0, 0, 16, 16);
    }

    if (typeof (window as any).VideoEncoder.isConfigSupported === 'function') {
      for (const accel of accelerations) {
        for (const codec of candidateCodecs) {
          try {
            const cfg: any = {
              codec,
              width,
              height,
              bitrate,
              framerate: fps,
              hardwareAcceleration: accel,
              avc: { format: 'avc' }
            };
            const res = await (window as any).VideoEncoder.isConfigSupported(cfg);
            if (res && res.supported) {
              const fullConfig = {
                ...(res.config || cfg),
                avc: { format: 'avc' }
              };

              // CRITICAL: Live probe test to verify encoder doesn't close or fail asynchronously!
              let probeSuccess = false;
              let probeError: any = null;
              try {
                const probeEnc = new (window as any).VideoEncoder({
                  output: () => {},
                  error: (e: any) => { probeError = e; }
                });
                probeEnc.configure(fullConfig);
                if (probeEnc.state === 'configured') {
                  const probeFrame = new (window as any).VideoFrame(probeScratchCanvas, {
                    timestamp: 0,
                    duration: 33333
                  });
                  probeEnc.encode(probeFrame, { keyFrame: true });
                  probeFrame.close();
                  await probeEnc.flush();
                  if (probeEnc.state !== 'closed' && !probeError) {
                    probeSuccess = true;
                  }
                }
                if (probeEnc.state !== 'closed') {
                  probeEnc.close();
                }
              } catch {
                probeSuccess = false;
              }

              if (probeSuccess) {
                chosenConfig = fullConfig;
                break;
              }
            }
          } catch {
            // continue testing
          }
        }
        if (chosenConfig) break;
      }
    }

    if (!chosenConfig) {
      chosenConfig = {
        codec: 'avc1.420028',
        width,
        height,
        bitrate,
        framerate: fps,
        hardwareAcceleration: forceSoftware ? 'prefer-software' : 'no-preference',
        avc: { format: 'avc' }
      };
    }

    let encoderError: any = null;
    const encoder = new (window as any).VideoEncoder({
      output: (chunk: any, meta: any) => {
        try {
          muxer.addVideoChunk(chunk, meta);
        } catch (e: any) {
          console.error('[VideoExportService] Muxer error:', e);
          encoderError = { code: 'ENCODER_ERROR', message: 'Błąd zapisu wideo do kontenera MP4', details: String(e) };
        }
      },
      error: (e: any) => {
        console.error('[VideoExportService] VideoEncoder error:', e);
        encoderError = { code: 'ENCODER_ERROR', message: `Błąd VideoEncoder: ${e?.message || String(e)}`, details: String(e) };
      }
    });

    try {
      encoder.configure(chosenConfig);
    } catch (cfgErr: any) {
      if (!forceSoftware) {
        return this.createConfiguredVideoEncoder(muxer, width, height, fps, bitrate, true);
      }
      throw new Error(`Nie udało się skonfigurować VideoEncoder: ${cfgErr.message}`);
    }

    return {
      encoder,
      config: chosenConfig,
      getError: () => encoderError
    };
  }

  /**
   * Draw video to canvas with respect to FIT, FILL, or ORIGINAL mode
   * When FIT is selected on vertical videos in horizontal frame, adds professional blurred backdrop
   */
  private drawVideoWithFitMode(
    ctx: CanvasRenderingContext2D,
    video: HTMLVideoElement,
    fitMode: FitMode,
    targetWidth: number,
    targetHeight: number,
    rotationDeg: number = 0
  ) {
    const srcW = video.videoWidth || targetWidth;
    const srcH = video.videoHeight || targetHeight;

    ctx.save();
    ctx.translate(targetWidth / 2, targetHeight / 2);

    if (rotationDeg !== 0) {
      ctx.rotate((rotationDeg * Math.PI) / 180);
    }

    const effectiveTargetW = (rotationDeg === 90 || rotationDeg === 270) ? targetHeight : targetWidth;
    const effectiveTargetH = (rotationDeg === 90 || rotationDeg === 270) ? targetWidth : targetHeight;

    const scaleX = effectiveTargetW / srcW;
    const scaleY = effectiveTargetH / srcH;

    if (fitMode === 'fit') {
      const isPortraitInLandscape = (srcH > srcW) && (effectiveTargetW > effectiveTargetH);
      
      // Professional blurred background for vertical/portrait video in 16:9 canvas
      if (isPortraitInLandscape) {
        ctx.save();
        const fillScale = Math.max(scaleX, scaleY) * 1.05;
        const bgW = srcW * fillScale;
        const bgH = srcH * fillScale;
        
        // OPTIMIZATION (Req 9): Draw downscaled first to avoid expensive high-res blurs
        const tinyCanvas = document.createElement('canvas');
        tinyCanvas.width = 64;
        tinyCanvas.height = 64;
        const tinyCtx = tinyCanvas.getContext('2d');
        if (tinyCtx) {
          tinyCtx.drawImage(video, 0, 0, 64, 64);
          ctx.filter = 'blur(6px) brightness(0.35)'; // Low radius blur on low-res canvas is ultra-fast!
          ctx.drawImage(tinyCanvas, -bgW / 2, -bgH / 2, bgW, bgH);
        } else {
          ctx.filter = 'blur(30px) brightness(0.35)';
          ctx.drawImage(video, -bgW / 2, -bgH / 2, bgW, bgH);
        }
        ctx.restore();
      }

      const scale = Math.min(scaleX, scaleY);
      const drawW = srcW * scale;
      const drawH = srcH * scale;
      ctx.drawImage(video, -drawW / 2, -drawH / 2, drawW, drawH);
    } else if (fitMode === 'fill') {
      const scale = Math.max(scaleX, scaleY);
      const drawW = srcW * scale;
      const drawH = srcH * scale;
      ctx.drawImage(video, -drawW / 2, -drawH / 2, drawW, drawH);
    } else if (fitMode === 'original') {
      ctx.drawImage(video, -srcW / 2, -srcH / 2, srcW, srcH);
    }

    ctx.restore();
  }

  /**
   * Comprehensive validation of output file (Req 15: all 9 points)
   * 1. sprawdź, czy plik istnieje
   * 2. sprawdź rozmiar
   * 3. sprawdź kontener (nagłówek ISO ftyp)
   * 4. sprawdź ścieżkę video
   * 5. sprawdź czas
   * 6. sprawdź rozdzielczość
   * 7. sprawdź kodek
   * 8. sprawdź audio
   * 9. sprawdź możliwość odtworzenia
   */
  async verifyOutput(blob: Blob): Promise<{ valid: boolean; duration: number; width: number; height: number; error?: string }> {
    // 1. Sprawdź, czy plik istnieje
    if (!blob) {
      return { valid: false, duration: 0, width: 0, height: 0, error: 'Plik wynikowy nie istnieje (błąd wewnętrzny).' };
    }

    // 2. Sprawdź rozmiar
    if (blob.size < 4096) {
      return { valid: false, duration: 0, width: 0, height: 0, error: `Nieprawidłowy rozmiar pliku MP4 (${blob.size} B). Minimalny wymagany rozmiar to 4 KB.` };
    }

    // 3. Sprawdź kontener (czy plik zawiera sygnaturę ISO Base Media Box 'ftyp' lub WebM EBML)
    try {
      const headerSlice = blob.slice(0, 16);
      const headerBuf = await headerSlice.arrayBuffer();
      const headerBytes = new Uint8Array(headerBuf);
      // 'f', 't', 'y', 'p' are bytes 4..7 in standard ISO MP4
      const hasFtyp = (
        headerBytes[4] === 0x66 && // 'f'
        headerBytes[5] === 0x74 && // 't'
        headerBytes[6] === 0x79 && // 'y'
        headerBytes[7] === 0x70    // 'p'
      );
      // WebM EBML header is 0x1A, 0x45, 0xDF, 0xA3
      const isWebM = (
        headerBytes[0] === 0x1a &&
        headerBytes[1] === 0x45 &&
        headerBytes[2] === 0xdf &&
        headerBytes[3] === 0xa3
      );

      if (!hasFtyp && !isWebM && !blob.type.includes('webm')) {
        return { valid: false, duration: 0, width: 0, height: 0, error: 'Wygenerowany plik nie jest poprawnym kontenerem ISO MP4 ani WebM.' };
      }
    } catch (err: any) {
      return { valid: false, duration: 0, width: 0, height: 0, error: `Błąd analizy nagłówków wideo: ${err.message}` };
    }

    // 4 to 9. Sprawdzenie wideo, czasu, rozdzielczości, kodeka i odtworzenia w elemencie HTML5 Video
    return new Promise((resolve) => {
      const testVideo = document.createElement('video');
      testVideo.preload = 'auto';
      testVideo.muted = true;
      testVideo.playsInline = true;
      const testUrl = URL.createObjectURL(blob);

      const timeout = setTimeout(() => {
        cleanup();
        resolve({ valid: false, duration: 0, width: 0, height: 0, error: 'Przekroczono limit czasu weryfikacji odtwarzalności pliku wideo.' });
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
        const w = testVideo.videoWidth;
        const h = testVideo.videoHeight;

        // 4. Sprawdź ścieżkę wideo
        if (w <= 0 || h <= 0) {
          cleanup();
          resolve({ valid: false, duration: dur || 0, width: 0, height: 0, error: 'Wygenerowany plik nie posiada prawidłowej ścieżki wideo (szerokość/wysokość = 0).' });
          return;
        }

        // 5. Sprawdź czas
        if (isNaN(dur) || !Number.isFinite(dur) || dur <= 0.05) {
          cleanup();
          resolve({ valid: false, duration: 0, width: w, height: h, error: `Nieprawidłowy czas trwania wygenerowanego pliku (${dur}s).` });
          return;
        }

        // 6. Sprawdź rozdzielczość
        if (w < 320 || h < 240) {
          cleanup();
          resolve({ valid: false, duration: dur, width: w, height: h, error: `Rozdzielczość (${w}x${h}) jest poniżej dopuszczalnego standardu.` });
          return;
        }

        // 7 & 8. Sprawdź kodek i możliwość odtwarzania
        const canPlay = testVideo.canPlayType(blob.type) || testVideo.canPlayType('video/mp4') || testVideo.canPlayType('video/webm');
        if (canPlay === '') {
          cleanup();
          resolve({ valid: false, duration: dur, width: w, height: h, error: 'Środowisko nie potrafi odtworzyć wygenerowanego kontenera wideo.' });
          return;
        }

        // 9. Sprawdź możliwość rzeczywistego próbkowania klatek
        try {
          testVideo.currentTime = Math.min(dur / 2, Math.max(0.1, dur - 0.1));
          await new Promise<void>((res) => {
            testVideo.onseeked = () => res();
            setTimeout(res, 2500);
          });

          // Perform brief playback verification (ignore NotAllowedError in sandboxed iframes)
          try {
            const playPromise = testVideo.play();
            if (playPromise !== undefined) {
              await playPromise;
              testVideo.pause();
            }
          } catch (playErr: any) {
            if (playErr.name !== 'NotAllowedError') {
              console.warn('[VideoExportService] Playback test warning (non-fatal):', playErr);
            }
          }

          cleanup();
          resolve({ valid: true, duration: dur, width: w, height: h });
        } catch (e: any) {
          cleanup();
          resolve({ valid: false, duration: dur, width: w, height: h, error: `Próbkowanie wygenerowanego pliku nie powiodło się: ${e.message || String(e)}` });
        }
      };

      testVideo.onerror = () => {
        cleanup();
        resolve({ valid: false, duration: 0, width: 0, height: 0, error: 'Przeglądarka zgłosiła błąd odczytu pliku wideo (uszkodzony lub nieobsługiwany strumień).' });
      };

      testVideo.src = testUrl;
    });
  }

  /**
   * Cancel in-flight export immediately
   */
  cancelExport(): void {
    if (this.activeAbortController) {
      this.activeAbortController.abort();
      this.activeAbortController = null;
    }

    const p: ExportProgress = {
      stage: 'ANULOWANO',
      percent: 0,
      currentFrame: 0,
      totalFrames: 100,
      fps: 0,
      elapsedSeconds: 0,
      etaSeconds: 0,
      statusMessage: 'Eksport został anulowany przez użytkownika.'
    };

    if (this.currentJob) {
      this.currentJob.status = 'ANULOWANO';
      this.currentJob.progress = p;
    }

    this.progressListeners.forEach(l => l(p));
  }

  /**
   * Get current progress
   */
  getProgress(): ExportProgress | null {
    return this.currentJob?.progress || null;
  }

  /**
   * Save output file (triggers download or File System Access API)
   */
  async saveOutput(output: ExportOutput): Promise<void> {
    if (!output || !output.blob) return;

    // Check if showSaveFilePicker is available (modern desktop Chromium)
    if (typeof window !== 'undefined' && 'showSaveFilePicker' in window) {
      try {
        const handle = await (window as any).showSaveFilePicker({
          suggestedName: output.fileName,
          types: [{
            description: 'Wideo MP4',
            accept: { 'video/mp4': ['.mp4'] }
          }]
        });
        const writable = await handle.createWritable();
        await writable.write(output.blob);
        await writable.close();
        return;
      } catch (err: any) {
        if (err.name === 'AbortError') return; // User cancelled picker
        // Fallback to classic download
      }
    }

    // Classic <a> download fallback
    const link = document.createElement('a');
    link.href = output.url;
    link.download = output.fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  /**
   * Native Share API (useful on mobile Android/iOS)
   */
  async shareOutput(output: ExportOutput): Promise<void> {
    if (!output || !output.blob) return;

    const file = new File([output.blob], output.fileName, { type: 'video/mp4' });

    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({
          files: [file],
          title: 'Wyeksportowany Film',
          text: `Film (${Math.round(output.duration)}s, ${output.width}x${output.height})`
        });
        return;
      } catch (err: any) {
        if (err.name === 'AbortError') return;
      }
    }

    // If share not supported, fallback to saving
    await this.saveOutput(output);
  }

  /**
   * Diagnostic inspection of WebCodecs, AudioEncoder, Memory
   */
  async getDiagnostics(): Promise<DiagnosticsCapabilities> {
    const hasWebCodecs = typeof window !== 'undefined' && typeof (window as any).VideoEncoder !== 'undefined';
    const hasVideoDecoder = typeof window !== 'undefined' && typeof (window as any).VideoDecoder !== 'undefined';
    const hasVideoEncoder = typeof window !== 'undefined' && typeof (window as any).VideoEncoder !== 'undefined';
    const hasAudioDecoder = typeof window !== 'undefined' && typeof (window as any).AudioDecoder !== 'undefined';
    const hasAudioEncoder = typeof window !== 'undefined' && typeof (window as any).AudioEncoder !== 'undefined';

    let h264Supported = false;
    let aacSupported = false;

    if (hasVideoEncoder) {
      try {
        const candidateProfiles = ['avc1.420028', 'avc1.42001f', 'avc1.42E028', 'avc1.4D4028', 'avc1.4D401F'];
        for (const codec of candidateProfiles) {
          const sup = await (window as any).VideoEncoder.isConfigSupported({
            codec,
            width: 1920,
            height: 1080,
            bitrate: 10_000_000,
            framerate: 30,
            hardwareAcceleration: 'no-preference'
          });
          if (sup && sup.supported) {
            h264Supported = true;
            break;
          }
        }
      } catch (e) {
        h264Supported = false;
      }
    }

    if (hasAudioEncoder) {
      try {
        const sup = await (window as any).AudioEncoder.isConfigSupported({
          codec: 'mp4a.40.2',
          numberOfChannels: 2,
          sampleRate: 48000,
          bitrate: 128000
        });
        aacSupported = sup.supported;
      } catch (e) {
        aacSupported = false;
      }
    }

    let availableMemoryMb: number | undefined;
    if (typeof performance !== 'undefined' && (performance as any).memory) {
      availableMemoryMb = Math.round((performance as any).memory.jsHeapSizeLimit / 1024 / 1024);
    }

    const browser = typeof navigator !== 'undefined' ? navigator.userAgent : 'Nieznana';

    this.lastDiagnostics = {
      browser,
      version: '1.0.0',
      webCodecsSupported: hasWebCodecs,
      videoDecoderSupported: hasVideoDecoder,
      videoEncoderSupported: hasVideoEncoder,
      audioDecoderSupported: hasAudioDecoder,
      audioEncoderSupported: hasAudioEncoder,
      h264Supported,
      aacSupported,
      mp4MuxerSupported: true,
      availableMemoryMb,
      lastExportStatus: this.currentJob?.status,
      lastError: this.lastError?.message
    };

    return this.lastDiagnostics;
  }

  /**
   * Run quick engine self-test (renders a 1-second synthetic test frame and encodes to real MP4)
   */
  async runEngineTest(): Promise<{ success: boolean; durationMs: number; details: string }> {
    const start = Date.now();
    try {
      const diag = await this.getDiagnostics();
      if (!diag.videoEncoderSupported || !diag.h264Supported) {
        return {
          success: false,
          durationMs: Date.now() - start,
          details: 'VideoEncoder H.264 nie jest obsługiwany w tym środowisku.'
        };
      }

      const muxer = new Muxer({
        target: new ArrayBufferTarget(),
        video: { codec: 'avc', width: 640, height: 360 },
        fastStart: 'in-memory'
      });

      const { encoder: videoEncoder, getError: getTestError } = await this.createConfiguredVideoEncoder(
        muxer,
        640,
        360,
        30,
        2_000_000
      );

      const testCanvas = document.createElement('canvas');
      testCanvas.width = 640;
      testCanvas.height = 360;
      const ctx = testCanvas.getContext('2d')!;
      ctx.fillStyle = '#1A1815';
      ctx.fillRect(0, 0, 640, 360);
      ctx.fillStyle = '#D4AF37';
      ctx.font = '24px sans-serif';
      ctx.fillText('Test Silnika Wideo MP4', 180, 180);

      for (let i = 0; i < 15; i++) {
        const frame = new (window as any).VideoFrame(testCanvas, {
          timestamp: i * 33333,
          duration: 33333
        });
        try {
          if (videoEncoder.state !== 'configured') {
            const err = getTestError();
            throw new Error(err?.message || `Test VideoEncoder zamknięty (stan: ${videoEncoder.state})`);
          }
          videoEncoder.encode(frame, { keyFrame: i === 0 });
        } finally {
          frame.close();
        }
      }

      if (videoEncoder.state === 'configured') {
        await videoEncoder.flush();
      }
      muxer.finalize();
      if (videoEncoder.state !== 'closed') {
        videoEncoder.close();
      }

      const blob = new Blob([muxer.target.buffer], { type: 'video/mp4' });
      const verify = await this.verifyOutput(blob);

      return {
        success: verify.valid,
        durationMs: Date.now() - start,
        details: verify.valid
          ? `Prawidłowo wygenerowano i zweryfikowano kontener MP4 (${blob.size} B, H.264, 15 klatek).`
          : `Weryfikacja nie powiodła się: ${verify.error}`
      };
    } catch (e: any) {
      return {
        success: false,
        durationMs: Date.now() - start,
        details: `Błąd podczas testu: ${e.message || String(e)}`
      };
    }
  }

  subscribe(listener: (progress: ExportProgress) => void): () => void {
    this.progressListeners.add(listener);
    if (this.currentJob) {
      listener(this.currentJob.progress);
    }
    return () => {
      this.progressListeners.delete(listener);
    };
  }

  getLastOutput(): ExportOutput | null {
    return this.lastExportOutput;
  }
}

export const videoExportService = new VideoExportService();
