import { ExportProgress, ExportStage } from './videoExportTypes';
import { ExportSession } from './ExportSession';

export class ExportProgressController {
  private session: ExportSession;
  private totalFrames: number;
  private totalClips: number;
  private onProgressCallback?: (p: ExportProgress) => void;
  private lastEmitTime = 0;
  private fpsSamples: number[] = [];
  private lastFrameCount = 0;
  private lastFrameTimestamp = Date.now();

  constructor(session: ExportSession, totalFrames: number, totalClips: number, onProgress?: (p: ExportProgress) => void) {
    this.session = session;
    this.totalFrames = Math.max(1, totalFrames);
    this.totalClips = Math.max(1, totalClips);
    this.onProgressCallback = onProgress;
  }

  update(params: {
    stage: ExportStage;
    currentFrame?: number;
    currentClipIndex?: number;
    currentClipName?: string;
    statusMessage?: string;
    technicalDetails?: string;
    encodeQueueSize?: number;
    droppedFrames?: number;
    audioSamplesProcessed?: number;
    totalAudioSamples?: number;
    muxerChunksWritten?: number;
    stagePercent?: number;
    forceEmit?: boolean;
  }): ExportProgress {
    this.session.stage = params.stage;
    if (typeof params.currentFrame === 'number') {
      this.session.processedFrames = params.currentFrame;
    }
    if (typeof params.encodeQueueSize === 'number') {
      this.session.encodeQueueSize = params.encodeQueueSize;
    }
    if (typeof params.droppedFrames === 'number') {
      this.session.droppedFrames = params.droppedFrames;
    }
    if (params.currentClipName) {
      this.session.activeClipName = params.currentClipName;
    }
    if (typeof params.audioSamplesProcessed === 'number') {
      this.session.audioSamplesProcessed = params.audioSamplesProcessed;
    }
    if (typeof params.totalAudioSamples === 'number') {
      this.session.totalAudioSamples = params.totalAudioSamples;
    }
    if (typeof params.muxerChunksWritten === 'number') {
      this.session.muxerChunksWritten = params.muxerChunksWritten;
    }

    const now = Date.now();
    const elapsedSec = Math.max(0.1, (now - this.session.startedAt) / 1000);

    // Dynamic FPS computation
    const frameDelta = this.session.processedFrames - this.lastFrameCount;
    const timeDelta = (now - this.lastFrameTimestamp) / 1000;
    if (timeDelta >= 0.4 && frameDelta >= 0) {
      const instantaneousFps = frameDelta / timeDelta;
      this.fpsSamples.push(instantaneousFps);
      if (this.fpsSamples.length > 6) this.fpsSamples.shift();
      this.lastFrameCount = this.session.processedFrames;
      this.lastFrameTimestamp = now;
    }

    const avgFps = this.fpsSamples.length > 0
      ? Math.max(1, Math.round(this.fpsSamples.reduce((a, b) => a + b, 0) / this.fpsSamples.length))
      : Math.max(1, Math.round(this.session.processedFrames / elapsedSec)) || 30;

    // Real mathematical percentage calculation based on actual stage progress:
    // Stages breakdown:
    // 0..2%: PREPARATION
    // 2..5%: MEDIA_ANALYSIS
    // 5..15%: AUDIO_ENCODING (based on actual sampleOffset / totalSamples)
    // 15..90%: VIDEO DECODING & ENCODING (based on actual currentFrame / totalFrames)
    // 90..94%: FINAL_FLUSH
    // 94..97%: MUXING
    // 97..99%: VALIDATION
    // 99..100%: SAVING & COMPLETED
    let percent = 0;
    const stagePct = typeof params.stagePercent === 'number' ? params.stagePercent : 0;

    switch (params.stage) {
      case 'PREPARATION':
        percent = Math.min(2, Math.round((stagePct / 100) * 2));
        this.session.setStageStatus('PREPARATION', 'RUNNING', stagePct, params.statusMessage);
        break;

      case 'MEDIA_ANALYSIS':
        percent = Math.min(5, 2 + Math.round((stagePct / 100) * 3));
        this.session.setStageStatus('PREPARATION', 'COMPLETED', 100);
        this.session.setStageStatus('MEDIA_ANALYSIS', 'RUNNING', stagePct, params.statusMessage);
        break;

      case 'AUDIO_ENCODING': {
        const audioRatio = this.session.totalAudioSamples > 0
          ? Math.min(1, this.session.audioSamplesProcessed / this.session.totalAudioSamples)
          : (stagePct / 100);
        percent = Math.min(15, 5 + Math.round(audioRatio * 10));
        this.session.setStageStatus('MEDIA_ANALYSIS', 'COMPLETED', 100);
        this.session.setStageStatus('AUDIO_ENCODING', 'RUNNING', Math.round(audioRatio * 100), params.statusMessage);
        break;
      }

      case 'DECODING':
      case 'FRAME_NORMALIZATION':
      case 'VIDEO_ENCODING': {
        const frameRatio = Math.min(1, this.session.processedFrames / this.totalFrames);
        percent = Math.min(90, 15 + Math.round(frameRatio * 75));
        this.session.setStageStatus('AUDIO_ENCODING', 'COMPLETED', 100);
        this.session.setStageStatus('DECODING', 'RUNNING', Math.round(frameRatio * 100), params.statusMessage);
        this.session.setStageStatus('FRAME_NORMALIZATION', 'RUNNING', Math.round(frameRatio * 100), params.statusMessage);
        this.session.setStageStatus('VIDEO_ENCODING', 'RUNNING', Math.round(frameRatio * 100), params.statusMessage);
        break;
      }

      case 'FINAL_FLUSH':
        percent = Math.min(94, 90 + Math.round((stagePct / 100) * 4));
        this.session.setStageStatus('DECODING', 'COMPLETED', 100);
        this.session.setStageStatus('FRAME_NORMALIZATION', 'COMPLETED', 100);
        this.session.setStageStatus('VIDEO_ENCODING', 'COMPLETED', 100);
        this.session.setStageStatus('FINAL_FLUSH', 'RUNNING', stagePct, params.statusMessage);
        break;

      case 'MUXING':
        percent = Math.min(97, 94 + Math.round((stagePct / 100) * 3));
        this.session.setStageStatus('FINAL_FLUSH', 'COMPLETED', 100);
        this.session.setStageStatus('MUXING', 'RUNNING', stagePct, params.statusMessage);
        break;

      case 'VALIDATION':
        percent = Math.min(99, 97 + Math.round((stagePct / 100) * 2));
        this.session.setStageStatus('MUXING', 'COMPLETED', 100);
        this.session.setStageStatus('VALIDATION', 'RUNNING', stagePct, params.statusMessage);
        break;

      case 'SAVING':
        percent = 99;
        this.session.setStageStatus('VALIDATION', 'COMPLETED', 100);
        this.session.setStageStatus('SAVING', 'RUNNING', 99, params.statusMessage);
        break;

      case 'COMPLETED':
        percent = 100;
        this.session.setStageStatus('SAVING', 'COMPLETED', 100);
        this.session.setStageStatus('COMPLETED', 'COMPLETED', 100, params.statusMessage);
        break;

      case 'FAILED':
        percent = Math.min(99, Math.round((this.session.processedFrames / this.totalFrames) * 100));
        this.session.setStageStatus(this.session.stage, 'FAILED', percent, undefined, params.statusMessage);
        break;

      case 'CANCELLED':
        percent = Math.min(99, Math.round((this.session.processedFrames / this.totalFrames) * 100));
        this.session.setStageStatus('CANCELLED', 'FAILED', percent, 'Anulowano');
        break;
    }

    const remainingFrames = Math.max(0, this.totalFrames - this.session.processedFrames);
    const etaSec = avgFps > 0 ? Math.ceil(remainingFrames / avgFps) : 0;

    const progress: ExportProgress = {
      stage: params.stage,
      percent,
      stages: { ...this.session.stages },
      currentFrame: this.session.processedFrames,
      totalFrames: this.totalFrames,
      currentClipIndex: params.currentClipIndex,
      totalClips: this.totalClips,
      currentClipName: params.currentClipName || this.session.activeClipName,
      fps: avgFps,
      encodeQueueSize: this.session.encodeQueueSize,
      droppedFrames: this.session.droppedFrames,
      lastTimestampMicros: this.session.lastTimestampMicros,
      elapsedSeconds: Math.round(elapsedSec),
      etaSeconds: etaSec,
      statusMessage: params.statusMessage || '',
      technicalDetails: params.technicalDetails,
      audioSamplesProcessed: this.session.audioSamplesProcessed,
      totalAudioSamples: this.session.totalAudioSamples,
      muxerChunksWritten: this.session.muxerChunksWritten
    };

    // Throttle UI emissions to at most every 50ms unless forceEmit is true
    if (params.forceEmit || (now - this.lastEmitTime >= 50)) {
      this.lastEmitTime = now;
      if (this.onProgressCallback) {
        this.onProgressCallback(progress);
      }
    }

    return progress;
  }
}
