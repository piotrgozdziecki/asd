/**
 * Core types for the unified VideoExportService and Export Pipeline
 */
import { 
  ClipColorAdjustments, 
  LookPreset, 
  FitMode, 
  TransitionType, 
  TextLayer, 
  TitleCard 
} from '../../types/project';

export type { 
  ClipColorAdjustments, 
  LookPreset, 
  FitMode, 
  TransitionType, 
  TextLayer, 
  TitleCard 
};

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
  blob?: Blob;
  type?: 'video' | 'image' | 'audio';
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
  pan?: number;
  speed?: number;
  rotation: number;
  crop?: { x: number; y: number; width: number; height: number };
  fitMode: FitMode;
  smartCropFocus?: 'center' | 'top' | 'face_safe' | 'manual';
  colorAdjustments?: ClipColorAdjustments;
  titleCard?: TitleCard;
  outroCard?: TitleCard;
  transitionIn?: TransitionType;
  transitionOut?: TransitionType;
  transitionDuration?: number;
}

export type ExportResolution = 
  | '720p' 
  | '1080p' 
  | '1440p' 
  | '4k' 
  | 'vertical_1080p' 
  | 'vertical_4k' 
  | 'square_1080p';

export type VideoCodecOption = 'auto' | 'H.264' | 'H.265' | 'AV1' | 'VP9' | 'ProRes_Master' | 'FFMPEG_X264';

export type ContainerFormat = 'auto' | 'mp4' | 'webm';

export interface ExportPreset {
  resolution: ExportResolution;
  width: number;
  height: number;
  fps: number;
  videoCodec: VideoCodecOption;
  container?: ContainerFormat;
  audioCodec: 'AAC' | 'Opus';
  bitrate: number;
  quality: 'standard' | 'high' | 'maximum';
  fitMode: FitMode;
  colorGrade?: string;
  colorAdjustments?: ClipColorAdjustments;
  letterbox?: string;
  watermark?: {
    enabled: boolean;
    text: string;
    position: 'bottom_right' | 'top_right' | 'bottom_left' | 'top_left';
    opacity: number;
  };
}

export interface DiagnosticLogEntry {
  timestamp: number;
  category: 
    | 'EXPORT_START'
    | 'MEDIA_ANALYSIS'
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
  textLayers?: TextLayer[];
  outroCard?: TitleCard;
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

export type ExportTaskStatus = 'queued' | 'processing' | 'completed' | 'failed' | 'cancelled';

export interface ExportTaskConfig {
  presetMode: 'FAST' | 'BALANCED' | 'QUALITY' | 'MAX_QUALITY';
  resolution: ExportResolution;
  fps: number;
  videoCodec?: VideoCodecOption;
  container?: ContainerFormat;
  fitMode: FitMode;
  colorGrade: 'none' | 'golden_hour' | 'vivid_master' | 'pastel_boho' | 'vintage_35mm' | 'cinematic_noir';
  letterbox: 'none' | 'cinemascope';
  title?: string;
  clipCount?: number;
  durationSec?: number;
}

export interface SerialExportTask {
  id: string;
  title: string;
  projectName: string;
  config: ExportTaskConfig;
  plan: ExportPlan;
  status: ExportTaskStatus;
  progress: ExportProgress | null;
  output: ExportOutput | null;
  error: ExportError | null;
  logs: DiagnosticLogEntry[];
  createdAt: number;
  startedAt?: number;
  completedAt?: number;
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
  hevcSupported: boolean;
  hevcHardware?: boolean;
  av1Supported: boolean;
  av1Hardware?: boolean;
  vp9Supported: boolean;
  vp9Hardware?: boolean;
  aacSupported: boolean;
  opusSupported?: boolean;
  mp4MuxerSupported: boolean;
  webmMuxerSupported?: boolean;
  recommendedCodec?: string;
  availableMemoryMb?: number;
  lastExportStatus?: string;
  lastError?: string;
}
