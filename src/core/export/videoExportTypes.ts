/**
 * Core types for the unified VideoExportService and Export Pipeline
 */

export type ExportErrorCode =
  | 'DECODER_ERROR'
  | 'ENCODER_ERROR'
  | 'AUDIO_DECODER_ERROR'
  | 'AUDIO_ENCODER_ERROR'
  | 'MUXER_ERROR'
  | 'TIMESTAMP_ERROR'
  | 'UNSUPPORTED_CODEC'
  | 'INVALID_CONFIG'
  | 'OUT_OF_MEMORY'
  | 'STORAGE_ERROR'
  | 'EXPORT_CANCELLED'
  | 'VALIDATION_ERROR'
  | 'SOURCE_NOT_FOUND'
  | 'TIMEOUT_ERROR'
  | 'UNKNOWN_EXPORT_ERROR';

export type ExportStage =
  | 'PREPARATION'
  | 'MEDIA_ANALYSIS'
  | 'DECODING'
  | 'FRAME_NORMALIZATION'
  | 'VIDEO_ENCODING'
  | 'AUDIO_ENCODING'
  | 'MUXING'
  | 'FINAL_FLUSH'
  | 'VALIDATION'
  | 'SAVING'
  | 'COMPLETED'
  | 'FAILED'
  | 'CANCELLED';

export type FitMode = 'fit' | 'fill' | 'original';

export interface StageDetail {
  stage: ExportStage;
  name: string;
  status: 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'SKIPPED';
  startedAt?: number;
  completedAt?: number;
  durationMs?: number;
  progressPercent: number; // 0..100 within this stage
  message?: string;
  errorMessage?: string;
}

export interface MediaSource {
  id: string;
  uri: string;
  file?: File;
  name: string;
  size: number;
  duration: number;
  width: number;
  height: number;
  fps: number;
  videoCodec: string;
  audioCodec: string;
  audioChannels: number;
  sampleRate: number;
  orientation: 'landscape' | 'portrait' | 'square';
  hasAudio: boolean;
  supported: boolean;
  unsupportedReason?: string;
  thumbnailUrl?: string;
}

export interface TimelineClip {
  id: string;
  sourceId: string;
  sourceStart: number;
  sourceEnd: number;
  timelineStart: number;
  duration: number;
  volume: number;
  muted: boolean;
  rotation: number;
  crop?: { x: number; y: number; width: number; height: number };
  fitMode: FitMode;
  titleCard?: any;
  transitionIn?: string;
  transitionOut?: string;
  transitionDuration?: number;
}

export interface ExportPreset {
  resolution: '720p' | '1080p' | '4k';
  width: number;
  height: number;
  fps: number;
  videoCodec: 'H.264';
  audioCodec: 'AAC';
  bitrate: number;
  quality: 'standard' | 'high' | 'maximum';
  fitMode: FitMode;
  colorGrade?: string;
  letterbox?: string;
}

export interface DiagnosticLogEntry {
  timestamp: number;
  category: 
    | 'EXPORT_START'
    | 'SOURCE_OPEN'
    | 'SOURCE_PROBED'
    | 'DECODER_CONFIGURED'
    | 'DECODER_STARTED'
    | 'FRAME_DECODED'
    | 'FRAME_NORMALIZED'
    | 'ENCODER_CONFIGURED'
    | 'FRAME_ENCODE_STARTED'
    | 'FRAME_ENCODED'
    | 'AUDIO_STARTED'
    | 'AUDIO_CHUNK_ENCODED'
    | 'MUX_STARTED'
    | 'MUX_CHUNK_WRITTEN'
    | 'VIDEO_FLUSH'
    | 'AUDIO_FLUSH'
    | 'MUX_FINALIZED'
    | 'OUTPUT_VALIDATION'
    | 'OUTPUT_SAVED'
    | 'EXPORT_COMPLETED'
    | 'EXPORT_FAILED'
    | 'EXPORT_CANCELLED';
  message: string;
  details?: any;
}

export interface ExportProgress {
  stage: ExportStage;
  percent: number;
  stages: Record<ExportStage, StageDetail>;
  currentFrame: number;
  totalFrames: number;
  currentClipIndex?: number;
  totalClips?: number;
  currentClipName?: string;
  fps: number;
  encodeQueueSize?: number;
  lastTimestampMicros?: number;
  droppedFrames?: number;
  elapsedSeconds: number;
  etaSeconds: number;
  statusMessage: string;
  technicalDetails?: string;
  audioSamplesProcessed?: number;
  totalAudioSamples?: number;
  muxerChunksWritten?: number;
}

export interface ExportOutput {
  blob: Blob;
  url: string;
  fileName: string;
  sizeBytes: number;
  duration: number;
  width: number;
  height: number;
  videoCodec: string;
  audioCodec: string;
  fps: number;
  verifiedPlayable: boolean;
  createdAt: number;
}

export interface ExportError {
  code: ExportErrorCode;
  message: string;
  technicalDetails?: string;
  clipName?: string;
  stage?: ExportStage;
  timestamp?: number;
}

export interface ExportPlan {
  id: string;
  preset: ExportPreset;
  sources: Map<string, MediaSource>;
  clips: TimelineClip[];
  audioTracks?: any[];
  totalDuration: number;
  totalFrames: number;
  hasAudio: boolean;
  createdAt: number;
}

export interface ExportJob {
  id: string;
  sessionId: string;
  clips: TimelineClip[];
  preset: ExportPreset;
  status: ExportStage;
  progress: ExportProgress;
  currentClip?: string;
  startedAt: number;
  finishedAt?: number;
  output?: ExportOutput;
  error?: ExportError;
}

export interface DiagnosticsCapabilities {
  browser: string;
  version: string;
  webCodecsSupported: boolean;
  videoDecoderSupported: boolean;
  videoEncoderSupported: boolean;
  audioDecoderSupported: boolean;
  audioEncoderSupported: boolean;
  h264Supported: boolean;
  supportedH264Codecs: string[];
  aacSupported: boolean;
  mp4MuxerSupported: boolean;
  availableMemoryMb?: number;
  lastExportStatus?: string;
  lastError?: string;
}
