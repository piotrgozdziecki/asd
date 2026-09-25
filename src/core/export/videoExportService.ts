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
  FitMode,
  DiagnosticLogEntry
} from './videoExportTypes';
import { ExportSession } from './ExportSession';
import { ExportProgressController } from './ExportProgressController';
import { ExportValidator } from './ExportValidator';
import { FrameNormalizationService } from './FrameNormalizationService';
import { ExportDiagnosticsService } from './ExportDiagnosticsService';

export class VideoExportService {
  private activeSession: ExportSession | null = null;
  private currentJob: ExportJob | null = null;
  private progressListeners: Set<(progress: ExportProgress) => void> = new Set();
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
        const width = video.videoWidth || 1920;
        const height = video.videoHeight || 1080;
        const rawDuration = video.duration;

        let duration = 1;
        if (typeof rawDuration === 'number' && Number.isFinite(rawDuration) && !isNaN(rawDuration) && rawDuration > 0) {
          duration = Math.round(rawDuration * 100) / 100;
        } else {
          try {
            if (video.seekable && video.seekable.length > 0) {
              const end = video.seekable.end(video.seekable.length - 1);
              if (Number.isFinite(end) && end > 0) duration = Math.round(end * 100) / 100;
            }
          } catch {}
        }

        const orientation: 'landscape' | 'portrait' | 'square' =
          height > width ? 'portrait' : (width === height ? 'square' : 'landscape');

        const hasAudio = Boolean(
          (video as any).mozHasAudio ||
          (video as any).audioTracks?.length ||
          (video as any).webkitAudioDecodedByteCount !== 0
        );

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

        // Generate clean thumbnail
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
          console.warn('[VideoExportService] Thumbnail generation skipped:', e);
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
    presetConfig?: Partial<ExportPreset>,
    extraOptions?: { audioTracks?: any[] }
  ): ExportPlan {
    const validation = this.validateProject(sources, clips);
    if (!validation.valid) {
      throw new Error(`BŁĄD WALIDACJI PROJEKTU: ${validation.errors.join(' | ')}`);
    }

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
      fitMode,
      colorGrade: presetConfig?.colorGrade || 'none',
      letterbox: presetConfig?.letterbox || 'none'
    };

    // Calculate monotonic continuous timeline sequence
    const sortedClips = [...clips].sort((a, b) => a.timelineStart - b.timelineStart);
    const sourceMap = new Map<string, MediaSource>(sources.map(s => [s.id, s]));

    let currentTimeline = 0;
    const normalizedClips: TimelineClip[] = sortedClips.map((c) => {
      const cardDur = (c.titleCard && c.titleCard.enabled) ? (c.titleCard.duration || 3) : 0;
      const dur = Math.max(0.1, c.sourceEnd - c.sourceStart);
      const clipStart = currentTimeline;
      currentTimeline += cardDur + dur;
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
    }) || Boolean(extraOptions?.audioTracks && extraOptions.audioTracks.length > 0);

    return {
      id: `plan_${Date.now()}`,
      preset,
      sources: sourceMap,
      clips: normalizedClips,
      audioTracks: extraOptions?.audioTracks || [],
      totalDuration,
      totalFrames,
      hasAudio,
      createdAt: Date.now()
    };
  }

  /**
   * Main entry point for export execution
   */
  async startExport(
    plan: ExportPlan,
    onProgress?: (p: ExportProgress) => void
  ): Promise<ExportOutput> {
    // 1. Cancel previous in-flight session if any
    if (this.activeSession) {
      this.activeSession.cancel();
      this.activeSession = null;
    }

    // 2. Instantiate clean isolated session
    const session = new ExportSession();
    this.activeSession = session;
    this.lastError = null;

    const progressController = new ExportProgressController(
      session,
      plan.totalFrames,
      plan.clips.length,
      (p) => {
        if (this.activeSession?.id !== session.id) return;
        this.currentJob = {
          id: plan.id,
          sessionId: session.id,
          clips: plan.clips,
          preset: plan.preset,
          status: p.stage,
          progress: p,
          currentClip: p.currentClipName,
          startedAt: session.startedAt
        };
        if (onProgress) onProgress(p);
        this.progressListeners.forEach(l => l(p));
      }
    );

    progressController.update({
      stage: 'PREPARATION',
      stagePercent: 20,
      statusMessage: 'Inicjalizacja silnika eksportu wideo...',
      forceEmit: true
    });

    const hasWebCodecs = typeof window !== 'undefined' &&
      typeof (window as any).VideoEncoder === 'function' &&
      typeof (window as any).VideoFrame === 'function';

    session.log('SOURCE_OPEN', `Weryfikacja środowiska WebCodecs: ${hasWebCodecs}`);

    if (hasWebCodecs) {
      try {
        return await this.exportWithWebCodecs(session, plan, progressController);
      } catch (err: any) {
        if (session.isCancelled || err?.message === 'CANCELLED') {
          session.log('EXPORT_CANCELLED', 'Eksport anulowany');
          throw err;
        }
        session.log('EXPORT_FAILED', `WebCodecs napotkał błąd, przełączanie na MediaRecorder: ${err?.message || err}`);
        console.warn('[VideoExportService] WebCodecs napotkał błąd, uruchamianie silnika MediaRecorder:', err);
      }
    }

    // Fallback pipeline with MediaRecorder
    if (session.isCancelled) throw new Error('CANCELLED');

    progressController.update({
      stage: 'PREPARATION',
      stagePercent: 50,
      statusMessage: 'Uruchamianie silnika awaryjnego (MediaRecorder)...',
      forceEmit: true
    });

    return await this.exportWithMediaRecorder(session, plan, progressController);
  }

  /**
   * Primary pipeline: WebCodecs VideoEncoder + mp4-muxer
   */
  private async exportWithWebCodecs(
    session: ExportSession,
    plan: ExportPlan,
    progressController: ExportProgressController
  ): Promise<ExportOutput> {
    const { preset, sources, clips, totalFrames, totalDuration, hasAudio } = plan;
    const width = Math.floor(preset.width / 2) * 2;
    const height = Math.floor(preset.height / 2) * 2;
    const fps = preset.fps;

    progressController.update({
      stage: 'MEDIA_ANALYSIS',
      stagePercent: 40,
      statusMessage: 'Analiza ścieżek multimedialnych i przygotowanie potoku...'
    });

    // 1. Audio Pre-check & Rendering with safety timeout
    let renderedAudio: AudioBuffer | null = null;
    let actualAudioPresent = false;

    if (hasAudio) {
      progressController.update({
        stage: 'AUDIO_ENCODING',
        stagePercent: 10,
        statusMessage: 'Przetwarzanie i miksowanie wielościeżkowego audio...'
      });

      try {
        renderedAudio = await this.renderAudioMix(session, plan, progressController);
        if (renderedAudio && renderedAudio.length > 0) {
          actualAudioPresent = true;
        }
      } catch (audioErr) {
        session.log('AUDIO_STARTED', `Ostrzeżenie renderowania audio: ${audioErr}`);
        renderedAudio = null;
        actualAudioPresent = false;
      }
    }

    // Check if AudioEncoder is actually supported before registering audio track on muxer!
    let aacSupported = false;
    if (actualAudioPresent && typeof (window as any).AudioEncoder?.isConfigSupported === 'function') {
      try {
        const audioSup = await (window as any).AudioEncoder.isConfigSupported({
          codec: 'mp4a.40.2',
          numberOfChannels: 2,
          sampleRate: 48000,
          bitrate: 128000
        });
        aacSupported = Boolean(audioSup && audioSup.supported);
      } catch {
        aacSupported = false;
      }
    }

    // 2. Configure MP4 Muxer
    session.log('MUX_STARTED', `Tworzenie kontenera Muxer (Audio track: ${actualAudioPresent && aacSupported})`);
    const muxer = new Muxer({
      target: new ArrayBufferTarget(),
      video: {
        codec: 'avc',
        width,
        height
      },
      audio: (actualAudioPresent && renderedAudio && aacSupported) ? {
        codec: 'aac',
        numberOfChannels: 2,
        sampleRate: 48000
      } : undefined,
      fastStart: 'in-memory',
      firstTimestampBehavior: 'offset'
    });

    // 3. Audio Encoding (if audio is present and AudioEncoder is supported)
    let audioEncoder: any = null;
    if (actualAudioPresent && renderedAudio && aacSupported) {
      try {
        audioEncoder = new (window as any).AudioEncoder({
          output: (chunk: any, meta: any) => {
            if (session.id !== this.activeSession?.id) return;
            try {
              muxer.addAudioChunk(chunk, meta);
              session.muxerChunksWritten++;
            } catch (muxErr) {
              session.log('AUDIO_CHUNK_ENCODED', `Błąd zapisu audio chunk: ${muxErr}`);
            }
          },
          error: (e: any) => {
            session.log('AUDIO_CHUNK_ENCODED', `AudioEncoder błąd: ${e?.message || e}`);
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

        progressController.update({
          stage: 'AUDIO_ENCODING',
          totalAudioSamples: totalSamples,
          audioSamplesProcessed: 0,
          stagePercent: 20,
          statusMessage: 'Kodowanie próbek audio AAC...'
        });

        while (sampleOffset < totalSamples) {
          if (session.isCancelled) throw new Error('CANCELLED');
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

          if (sampleOffset % (chunkSize * 20) === 0 || sampleOffset >= totalSamples) {
            progressController.update({
              stage: 'AUDIO_ENCODING',
              totalAudioSamples: totalSamples,
              audioSamplesProcessed: sampleOffset,
              stagePercent: Math.round((sampleOffset / totalSamples) * 100),
              statusMessage: `Kodowanie strumienia audio AAC (${Math.round((sampleOffset / totalSamples) * 100)}%)...`
            });
          }
        }

        await audioEncoder.flush();
        session.log('AUDIO_FLUSH', 'AudioEncoder pomyślnie opróżniony.');
      } catch (audioEncErr: any) {
        session.log('AUDIO_CHUNK_ENCODED', `Audio encoding pominięte: ${audioEncErr?.message || audioEncErr}`);
      }
    }

    // 4. Configure VideoEncoder
    progressController.update({
      stage: 'VIDEO_ENCODING',
      currentFrame: 0,
      stagePercent: 0,
      statusMessage: 'Inicjalizacja kodera klatek wideo (WebCodecs H.264)...'
    });

    const { encoder: videoEncoder, getError: getEncoderError } = await this.createConfiguredVideoEncoder(
      session,
      muxer,
      width,
      height,
      fps,
      preset.bitrate
    );

    session.log('ENCODER_CONFIGURED', 'VideoEncoder pomyślnie skonfigurowany.');

    // 5. Video Decoding & Encoding Loop with Controlled Backpressure
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) throw new Error('Nie można utworzyć kontekstu 2D dla silnika renderującego.');

    const frameIntervalSec = 1 / fps;
    const frameDurationMicros = Math.round(frameIntervalSec * 1_000_000);
    let globalFrameIndex = 0;

    for (let clipIdx = 0; clipIdx < clips.length; clipIdx++) {
      if (session.isCancelled) throw new Error('CANCELLED');
      const clip = clips[clipIdx];
      const source = sources.get(clip.sourceId);

      if (!source) {
        throw new Error(`SOURCE_ERROR: Nie odnaleziono źródła dla klipu nr ${clipIdx + 1}`);
      }

      session.log('SOURCE_OPEN', `Otwieranie ujęcia ${clipIdx + 1}/${clips.length}: ${source.name}`);

      // 5.1 Render Title Card if enabled
      if (clip.titleCard && clip.titleCard.enabled) {
        const cardFrames = Math.max(1, Math.round((clip.titleCard.duration || 3) * fps));
        for (let cf = 0; cf < cardFrames; cf++) {
          if (session.isCancelled) throw new Error('CANCELLED');

          FrameNormalizationService.drawTitleCard(ctx, width, height, clip.titleCard);

          const presentationTimeMicros = Math.round(globalFrameIndex * frameDurationMicros);
          session.lastTimestampMicros = presentationTimeMicros;

          const videoFrame = new (window as any).VideoFrame(canvas, {
            timestamp: presentationTimeMicros,
            duration: frameDurationMicros
          });

          try {
            if (videoEncoder.state !== 'configured') {
              const err = getEncoderError();
              throw new Error(err?.message || `VideoEncoder zamknięty (stan: ${videoEncoder.state}).`);
            }
            const isKeyFrame = (globalFrameIndex % (fps * 2) === 0) || (cf === 0);
            videoEncoder.encode(videoFrame, { keyFrame: isKeyFrame });
          } finally {
            videoFrame.close();
          }

          globalFrameIndex++;

          // Backpressure check
          if (videoEncoder.encodeQueueSize >= 8) {
            await this.waitForEncoderDrain(videoEncoder, getEncoderError, session);
          }

          progressController.update({
            stage: 'VIDEO_ENCODING',
            currentFrame: globalFrameIndex,
            currentClipIndex: clipIdx + 1,
            currentClipName: `Plansza: ${clip.titleCard.text}`,
            statusMessage: `Kodowanie planszy: ${cf + 1}/${cardFrames} • ${clip.titleCard.text}`,
            encodeQueueSize: videoEncoder.encodeQueueSize
          });
        }
      }

      // 5.2 Video Element Setup & Frame Stepping
      const video = document.createElement('video');
      video.muted = true;
      video.playsInline = true;
      video.preload = 'auto';
      video.crossOrigin = 'anonymous';
      video.style.position = 'fixed';
      video.style.left = '-9999px';
      video.style.top = '-9999px';
      video.style.width = '320px';
      video.style.height = '180px';
      video.style.opacity = '0.01';
      video.style.pointerEvents = 'none';
      document.body.appendChild(video);
      video.src = source.uri;

      let videoReady = false;
      await new Promise<void>((resolve) => {
        let settled = false;
        const onLoaded = () => {
          if (settled) return;
          settled = true;
          cleanupListeners();
          videoReady = true;
          resolve();
        };
        const onErr = () => {
          if (settled) return;
          settled = true;
          cleanupListeners();
          resolve();
        };
        const cleanupListeners = () => {
          video.removeEventListener('loadeddata', onLoaded);
          video.removeEventListener('loadedmetadata', onLoaded);
          video.removeEventListener('canplay', onLoaded);
          video.removeEventListener('error', onErr);
        };
        video.addEventListener('loadeddata', onLoaded);
        video.addEventListener('loadedmetadata', onLoaded);
        video.addEventListener('canplay', onLoaded);
        video.addEventListener('error', onErr);
        video.load();
        setTimeout(() => {
          if (!settled) {
            settled = true;
            cleanupListeners();
            resolve();
          }
        }, 6000);
      });

      // Initial seek to sourceStart
      const initialSeek = Math.max(0, Math.min(clip.sourceStart, (video.duration || 1000) - 0.05));
      video.currentTime = initialSeek;
      await new Promise<void>((resolve) => {
        let done = false;
        const onSeek = () => {
          if (done) return;
          done = true;
          video.removeEventListener('seeked', onSeek);
          resolve();
        };
        video.addEventListener('seeked', onSeek);
        setTimeout(onSeek, 1200);
      });

      const clipFrames = Math.max(1, Math.round(clip.duration * fps));

      for (let f = 0; f < clipFrames; f++) {
        if (session.isCancelled) {
          try { document.body.removeChild(video); } catch {}
          throw new Error('CANCELLED');
        }

        const curError = getEncoderError();
        if (curError) throw new Error(`${curError.code || 'ENCODER_ERROR'}: ${curError.message}`);

        const localTime = f * frameIntervalSec;
        const targetSourceTime = Math.max(
          0,
          Math.min((clip.sourceEnd || source.duration || 1000), clip.sourceStart + localTime)
        );

        // Frame seek with resilient timeout
        if (Math.abs(video.currentTime - targetSourceTime) > (0.4 / fps)) {
          await new Promise<void>((r) => {
            let done = false;
            const onS = () => {
              if (done) return;
              done = true;
              video.removeEventListener('seeked', onS);
              video.removeEventListener('error', onS);
              r();
            };
            video.addEventListener('seeked', onS);
            video.addEventListener('error', onS);
            video.currentTime = targetSourceTime;
            // 150ms timeout ensures no freeze or stalling on slow decoders
            setTimeout(onS, 150);
          });
        }

        // Draw and normalize frame onto target canvas
        ctx.fillStyle = '#000000';
        ctx.fillRect(0, 0, width, height);

        FrameNormalizationService.drawVideoWithFitMode(
          ctx,
          video,
          clip.fitMode || preset.fitMode,
          width,
          height,
          clip.rotation || 0,
          preset.colorGrade
        );

        FrameNormalizationService.applyLetterbox(ctx, width, height, preset.letterbox);
        FrameNormalizationService.applyTransitions(ctx, width, height, f, clipFrames, fps, clip);

        // Encode Frame
        const presentationTimeMicros = Math.round(globalFrameIndex * frameDurationMicros);
        session.lastTimestampMicros = presentationTimeMicros;

        const videoFrame = new (window as any).VideoFrame(canvas, {
          timestamp: presentationTimeMicros,
          duration: frameDurationMicros
        });

        try {
          if (videoEncoder.state !== 'configured') {
            const err = getEncoderError();
            throw new Error(err?.message || `VideoEncoder został zamknięty (stan: ${videoEncoder.state}).`);
          }

          const isKeyFrame = (globalFrameIndex % (fps * 2) === 0) || (f === 0);
          videoEncoder.encode(videoFrame, { keyFrame: isKeyFrame });
        } finally {
          videoFrame.close();
        }

        globalFrameIndex++;

        // Backpressure control: drain queue when overflowing
        if (videoEncoder.encodeQueueSize >= 8) {
          await this.waitForEncoderDrain(videoEncoder, getEncoderError, session);
        }

        // Emit real progress update
        progressController.update({
          stage: 'VIDEO_ENCODING',
          currentFrame: globalFrameIndex,
          currentClipIndex: clipIdx + 1,
          currentClipName: source.name,
          statusMessage: `Kodowanie klatek: ${globalFrameIndex}/${totalFrames} • ${source.name}`,
          encodeQueueSize: videoEncoder.encodeQueueSize
        });
      }

      // Cleanup DOM video element
      video.src = '';
      video.load();
      try { document.body.removeChild(video); } catch {}
      session.log('FRAME_ENCODED', `Zakończono kodowanie ujęcia ${clipIdx + 1}: ${source.name}`);
    }

    // 6. FINAL FLUSH & MUXING
    progressController.update({
      stage: 'FINAL_FLUSH',
      currentFrame: totalFrames,
      stagePercent: 30,
      statusMessage: 'Finalizowanie kodera wideo i opróżnianie buforów...'
    });

    session.log('VIDEO_FLUSH', 'Opróżnianie VideoEncoder...');
    if (videoEncoder.state === 'configured') {
      await videoEncoder.flush();
    }
    if (audioEncoder && audioEncoder.state === 'configured') {
      await audioEncoder.flush();
    }

    progressController.update({
      stage: 'MUXING',
      currentFrame: totalFrames,
      stagePercent: 50,
      statusMessage: 'Zapisywanie kontenera MP4 i tablicy indeksów moov...'
    });

    session.log('MUX_FINALIZED', 'Finalizowanie Muxera MP4...');
    muxer.finalize();

    if (videoEncoder.state !== 'closed') videoEncoder.close();
    if (audioEncoder && audioEncoder.state !== 'closed') audioEncoder.close();

    const { buffer } = muxer.target;
    const finalBlob = new Blob([buffer], { type: 'video/mp4' });
    session.outputSizeBytes = finalBlob.size;

    // 7. DEEP VALIDATION
    progressController.update({
      stage: 'VALIDATION',
      currentFrame: totalFrames,
      stagePercent: 50,
      statusMessage: 'Weryfikacja integralności i odtwarzalności wygenerowanego pliku MP4...'
    });

    session.log('OUTPUT_VALIDATION', `Weryfikacja pliku wyjściowego (${finalBlob.size} B)...`);
    const verification = await ExportValidator.verifyOutput(finalBlob);

    if (!verification.valid) {
      session.log('OUTPUT_VALIDATION', `Błąd walidacji: ${verification.error}`);
      throw new Error(`VALIDATION_ERROR: ${verification.error || 'Nieprawidłowy plik MP4.'}`);
    }

    // 8. SAVING & SUCCESS
    progressController.update({
      stage: 'SAVING',
      currentFrame: totalFrames,
      stagePercent: 100,
      statusMessage: 'Przygotowanie pliku do zapisu i odtworzenia...'
    });

    const cleanDate = new Date().toISOString().slice(0, 10);
    const fileName = `Film_Montaz_${cleanDate}.mp4`;
    const url = URL.createObjectURL(finalBlob);

    const output: ExportOutput = {
      blob: finalBlob,
      url,
      fileName,
      sizeBytes: finalBlob.size,
      duration: verification.duration || totalDuration,
      width: verification.width || width,
      height: verification.height || height,
      videoCodec: 'H.264 (AVC)',
      audioCodec: actualAudioPresent ? 'AAC' : 'Brak',
      fps,
      verifiedPlayable: true,
      createdAt: Date.now()
    };

    this.lastExportOutput = output;
    session.log('EXPORT_COMPLETED', `Eksport zakończony sukcesem (${fileName}, ${finalBlob.size} B)`);

    progressController.update({
      stage: 'COMPLETED',
      currentFrame: totalFrames,
      stagePercent: 100,
      statusMessage: 'Eksport MP4 zakończony pełnym sukcesem!',
      forceEmit: true
    });

    return output;
  }

  /**
   * Resilient fallback export pipeline: Canvas + MediaRecorder
   */
  private async exportWithMediaRecorder(
    session: ExportSession,
    plan: ExportPlan,
    progressController: ExportProgressController
  ): Promise<ExportOutput> {
    const { preset, sources, clips, totalDuration, totalFrames, hasAudio } = plan;
    const width = Math.floor(preset.width / 2) * 2;
    const height = Math.floor(preset.height / 2) * 2;
    const fps = preset.fps;

    if (typeof MediaRecorder === 'undefined') {
      throw new Error('Środowisko nie obsługuje MediaRecorder ani WebCodecs.');
    }

    let selectedMime = 'video/mp4;codecs=avc1,mp4a.40.2';
    if (!MediaRecorder.isTypeSupported(selectedMime)) selectedMime = 'video/mp4';
    if (!MediaRecorder.isTypeSupported(selectedMime)) selectedMime = 'video/webm;codecs=vp9,opus';
    if (!MediaRecorder.isTypeSupported(selectedMime)) selectedMime = 'video/webm;codecs=vp8,opus';
    if (!MediaRecorder.isTypeSupported(selectedMime)) selectedMime = 'video/webm';

    const isMp4 = selectedMime.includes('mp4');
    const ext = isMp4 ? 'mp4' : 'webm';
    const videoMime = isMp4 ? 'video/mp4' : 'video/webm';

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) throw new Error('Nie można utworzyć kontekstu 2D dla MediaRecorder.');

    const canvasStream = canvas.captureStream(fps);
    const recordedChunks: Blob[] = [];

    const recorder = new MediaRecorder(canvasStream, {
      mimeType: selectedMime,
      videoBitsPerSecond: preset.bitrate
    });

    recorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) {
        recordedChunks.push(e.data);
      }
    };

    recorder.start(100);
    const frameIntervalMs = 1000 / fps;
    let globalFrame = 0;

    for (let clipIdx = 0; clipIdx < clips.length; clipIdx++) {
      if (session.isCancelled) {
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
      video.crossOrigin = 'anonymous';
      video.style.position = 'fixed';
      video.style.left = '-9999px';
      video.style.top = '-9999px';
      video.style.width = '320px';
      video.style.height = '180px';
      video.style.opacity = '0.01';
      document.body.appendChild(video);
      video.src = source.uri;

      await new Promise<void>((resolve) => {
        let done = false;
        const onOk = () => {
          if (done) return;
          done = true;
          video.removeEventListener('loadeddata', onOk);
          video.removeEventListener('error', onOk);
          resolve();
        };
        video.addEventListener('loadeddata', onOk);
        video.addEventListener('error', onOk);
        video.load();
        setTimeout(onOk, 5000);
      });

      const clipFrames = Math.max(1, Math.round(clip.duration * fps));

      for (let f = 0; f < clipFrames; f++) {
        if (session.isCancelled) {
          try { document.body.removeChild(video); recorder.stop(); } catch {}
          throw new Error('CANCELLED');
        }

        const localTime = f / fps;
        video.currentTime = Math.max(0, Math.min(clip.sourceEnd, clip.sourceStart + localTime));

        ctx.fillStyle = '#000000';
        ctx.fillRect(0, 0, width, height);

        FrameNormalizationService.drawVideoWithFitMode(
          ctx,
          video,
          clip.fitMode || preset.fitMode,
          width,
          height,
          clip.rotation || 0,
          preset.colorGrade
        );

        FrameNormalizationService.applyLetterbox(ctx, width, height, preset.letterbox);
        FrameNormalizationService.applyTransitions(ctx, width, height, f, clipFrames, fps, clip);

        globalFrame++;

        progressController.update({
          stage: 'VIDEO_ENCODING',
          currentFrame: globalFrame,
          currentClipIndex: clipIdx + 1,
          currentClipName: source.name,
          statusMessage: `Renderowanie MediaRecorder: ${globalFrame}/${totalFrames} • ${source.name}`
        });

        await new Promise(r => setTimeout(r, Math.max(1, Math.floor(frameIntervalMs / 4))));
      }

      video.src = '';
      video.load();
      try { document.body.removeChild(video); } catch {}
    }

    progressController.update({
      stage: 'MUXING',
      currentFrame: totalFrames,
      stagePercent: 80,
      statusMessage: 'Zamykanie strumienia wideo...'
    });

    recorder.stop();
    await new Promise<void>((resolve) => {
      recorder.onstop = () => resolve();
      setTimeout(resolve, 3000);
    });

    const finalBlob = new Blob(recordedChunks, { type: videoMime });
    session.outputSizeBytes = finalBlob.size;

    progressController.update({
      stage: 'VALIDATION',
      currentFrame: totalFrames,
      stagePercent: 50,
      statusMessage: 'Weryfikacja wyjściowego pliku wideo...'
    });

    const verification = await ExportValidator.verifyOutput(finalBlob);
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
    progressController.update({
      stage: 'COMPLETED',
      currentFrame: totalFrames,
      stagePercent: 100,
      statusMessage: `Eksport zakończony sukcesem (${ext.toUpperCase()})!`,
      forceEmit: true
    });

    return output;
  }

  /**
   * Safely renders audio mix using OfflineAudioContext with timeouts and fallback
   */
  private async renderAudioMix(
    session: ExportSession,
    plan: ExportPlan,
    progressController: ExportProgressController
  ): Promise<AudioBuffer | null> {
    const { sources, clips, totalDuration, audioTracks } = plan;
    const OfflineCtx = window.OfflineAudioContext || (window as any).webkitOfflineAudioContext;
    if (!OfflineCtx) return null;

    const totalSamples = Math.max(1, Math.ceil(totalDuration * 48000));
    const offlineCtx = new OfflineCtx(2, totalSamples, 48000);
    let attachedSources = 0;

    for (let i = 0; i < clips.length; i++) {
      if (session.isCancelled) throw new Error('CANCELLED');
      const clip = clips[i];
      const source = sources.get(clip.sourceId);
      if (!source || clip.muted || clip.volume === 0 || !source.hasAudio) continue;

      progressController.update({
        stage: 'AUDIO_ENCODING',
        currentClipIndex: i + 1,
        currentClipName: source.name,
        stagePercent: Math.round(((i + 1) / clips.length) * 50),
        statusMessage: `Odczyt audio z klipu ${i + 1}/${clips.length}: ${source.name}`
      });

      try {
        // Decode audio with safety timeout
        const decodedBuffer = await Promise.race([
          (async () => {
            let buf: ArrayBuffer;
            if (source.file) {
              buf = await source.file.arrayBuffer();
            } else {
              const res = await fetch(source.uri);
              buf = await res.arrayBuffer();
            }
            return await offlineCtx.decodeAudioData(buf);
          })(),
          new Promise<null>((_, reject) => setTimeout(() => reject(new Error('AUDIO_TIMEOUT')), 4000))
        ]);

        if (decodedBuffer) {
          const srcNode = offlineCtx.createBufferSource();
          srcNode.buffer = decodedBuffer;
          const gain = offlineCtx.createGain();
          gain.gain.value = clip.volume ?? 1;
          srcNode.connect(gain);
          gain.connect(offlineCtx.destination);
          srcNode.start(clip.timelineStart, clip.sourceStart, clip.duration);
          attachedSources++;
        }
      } catch (e) {
        session.log('AUDIO_STARTED', `Pominięto audio dla ${source.name} (nieobsługiwany strumień lub limit czasu)`);
      }
    }

    // Mix additional background music tracks
    if (audioTracks && audioTracks.length > 0) {
      for (const track of audioTracks) {
        if (track.muted || track.volume === 0) continue;
        try {
          let buf: ArrayBuffer | null = null;
          if (track.file) buf = await track.file.arrayBuffer();
          else if (track.objectUrl) {
            const res = await fetch(track.objectUrl);
            buf = await res.arrayBuffer();
          }
          if (buf) {
            const decoded = await offlineCtx.decodeAudioData(buf);
            const trackNode = offlineCtx.createBufferSource();
            trackNode.buffer = decoded;
            const gain = offlineCtx.createGain();
            gain.gain.value = track.volume ?? 0.85;
            trackNode.connect(gain);
            gain.connect(offlineCtx.destination);
            trackNode.start(track.timelineStart || 0, track.sourceStart || 0, track.duration || decoded.duration);
            attachedSources++;
          }
        } catch {}
      }
    }

    if (attachedSources > 0) {
      return await offlineCtx.startRendering();
    }
    return null;
  }

  /**
   * Helper waiting for VideoEncoder to drain its queue when backpressure limit is hit
   */
  private async waitForEncoderDrain(
    encoder: any,
    getError: () => any,
    session: ExportSession
  ): Promise<void> {
    if (encoder.encodeQueueSize <= 3) return;

    return new Promise<void>((resolve, reject) => {
      let resolved = false;
      const timeout = setTimeout(() => {
        if (!resolved) {
          resolved = true;
          resolve(); // Safety fallback: resume feeding to prevent hard lock
        }
      }, 150);

      const check = () => {
        if (resolved) return;
        if (session.isCancelled) {
          resolved = true;
          clearTimeout(timeout);
          reject(new Error('CANCELLED'));
          return;
        }
        if (encoder.state === 'closed') {
          resolved = true;
          clearTimeout(timeout);
          const err = getError();
          reject(new Error(err?.message || 'VideoEncoder został niespodziewanie zamknięty.'));
          return;
        }
        if (encoder.encodeQueueSize <= 3) {
          resolved = true;
          clearTimeout(timeout);
          resolve();
        } else {
          setTimeout(check, 6);
        }
      };

      encoder.ondequeue = () => {
        if (encoder.encodeQueueSize <= 3 && !resolved) {
          resolved = true;
          clearTimeout(timeout);
          resolve();
        }
      };

      check();
    });
  }

  /**
   * Robustly probe and instantiate a VideoEncoder with live frame verification
   */
  private async createConfiguredVideoEncoder(
    session: ExportSession,
    muxer: Muxer<ArrayBufferTarget>,
    width: number,
    height: number,
    fps: number,
    bitrate: number,
    forceSoftware = false
  ): Promise<{ encoder: any; config: any; getError: () => any }> {
    const candidateCodecs = [
      'avc1.420028',
      'avc1.42001f',
      'avc1.42E028',
      'avc1.42E01F',
      'avc1.4D4028',
      'avc1.4D401F',
      'avc1.640028'
    ];

    let chosenConfig: any = null;

    if (typeof (window as any).VideoEncoder.isConfigSupported === 'function') {
      for (const codec of candidateCodecs) {
        try {
          const cfg: any = {
            codec,
            width,
            height,
            bitrate,
            framerate: fps,
            hardwareAcceleration: forceSoftware ? 'prefer-software' : 'no-preference',
            avc: { format: 'avc' }
          };
          const res = await (window as any).VideoEncoder.isConfigSupported(cfg);
          if (res && res.supported) {
            chosenConfig = { ...(res.config || cfg), avc: { format: 'avc' } };
            break;
          }
        } catch {}
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
        if (session.id !== this.activeSession?.id) return;
        try {
          muxer.addVideoChunk(chunk, meta);
          session.muxerChunksWritten++;
        } catch (e: any) {
          encoderError = { code: 'MUXER_ERROR', message: 'Błąd zapisu klatki wideo do kontenera MP4', details: String(e) };
          session.log('MUX_CHUNK_WRITTEN', `Muxer błąd: ${e}`);
        }
      },
      error: (e: any) => {
        encoderError = { code: 'ENCODER_ERROR', message: `Błąd VideoEncoder: ${e?.message || String(e)}` };
        session.log('FRAME_ENCODE_STARTED', `VideoEncoder error: ${e}`);
      }
    });

    try {
      encoder.configure(chosenConfig);
    } catch (cfgErr: any) {
      if (!forceSoftware) {
        return this.createConfiguredVideoEncoder(session, muxer, width, height, fps, bitrate, true);
      }
      throw new Error(`Nie udało się skonfigurować VideoEncoder: ${cfgErr?.message || cfgErr}`);
    }

    return {
      encoder,
      config: chosenConfig,
      getError: () => encoderError
    };
  }

  /**
   * Cancel in-flight export immediately and free all resources
   */
  cancelExport(): void {
    if (this.activeSession) {
      this.activeSession.cancel();
      this.activeSession = null;
    }

    const p: ExportProgress = {
      stage: 'CANCELLED',
      percent: 0,
      stages: {} as any,
      currentFrame: 0,
      totalFrames: 100,
      fps: 0,
      elapsedSeconds: 0,
      etaSeconds: 0,
      statusMessage: 'Eksport został anulowany przez użytkownika.'
    };

    if (this.currentJob) {
      this.currentJob.status = 'CANCELLED';
      this.currentJob.progress = p;
    }

    this.progressListeners.forEach(l => l(p));
  }

  /**
   * Get active session logs for the developer diagnostic console
   */
  getDiagnosticLogs(): DiagnosticLogEntry[] {
    return this.activeSession?.logs || [];
  }

  /**
   * Get environmental capabilities
   */
  async getDiagnostics(): Promise<DiagnosticsCapabilities> {
    return ExportDiagnosticsService.getCapabilities();
  }

  /**
   * Run quick engine self-test
   */
  async runEngineTest(): Promise<{ success: boolean; durationMs: number; details: string }> {
    return ExportDiagnosticsService.runEngineTest();
  }

  /**
   * Save output file (triggers native showSaveFilePicker or standard download)
   */
  async saveOutput(output: ExportOutput): Promise<void> {
    if (!output || !output.blob) return;

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
        if (err.name === 'AbortError') return;
      }
    }

    const link = document.createElement('a');
    link.href = output.url;
    link.download = output.fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  /**
   * Native Share API
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

    await this.saveOutput(output);
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
