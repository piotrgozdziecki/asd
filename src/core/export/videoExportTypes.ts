/**
 * Core types for the unified VideoExportService
 */

export type ExportErrorCode =
  | 'SOURCE_NOT_FOUND'
  | 'UNSUPPORTED_CODEC'
  | 'DECODER_ERROR'
  | 'ENCODER_ERROR'
  | 'AUDIO_ERROR'
  | 'NO_STORAGE'
  | 'EXPORT_FAILED'
  | 'VALIDATION_FAILED'
  | 'CANCELLED';

export type ExportStage =
  | 'PRZYGOTOWANIE'
  | 'ANALIZA'
  | 'DEKODOWANIE'
  | 'KODOWANIE'
  | 'AUDIO'
  | 'MUXING'
  | 'WALIDACJA'
  | 'ZAPIS'
  | 'SUKCES'
  | 'BLAD'
  | 'ANULOWANO';

export type FitMode = 'fit' | 'fill' | 'original';

export interface MediaSource {
  id: string;
  uri: string; // Object URL or file reference URL
  file?: File;
  name: string;
  size: number;
  duration: number;
  width: number;
  height: number;
  fps: number;
  videoCodec: string; // e.g. "H.264", "HEVC", "VP9", "AV1", "Unknown"
  audioCodec: string; // e.g. "AAC", "Opus", "PCM", "Brak"
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
  volume: number; // 0.0 to 2.0 (1.0 default)
  muted: boolean;
  rotation: number; // 0, 90, 180, 270
  crop?: { x: number; y: number; width: number; height: number };
  fitMode: FitMode;
  titleCard?: any; // Text Title Card configuration before the clip
  transitionIn?: string; // 'cut' | 'fade' | 'dissolve' | 'dip_black' | 'dip_white'
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
  bitrate: number; // bps
  quality: 'standard' | 'high' | 'maximum';
  fitMode: FitMode;
}

export interface ExportProgress {
  stage: ExportStage;
  percent: number;
  currentFrame: number;
  totalFrames: number;
  currentClipIndex?: number;
  totalClips?: number;
  currentClipName?: string;
  fps: number;
  elapsedSeconds: number;
  etaSeconds: number;
  statusMessage: string;
  technicalDetails?: string;
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
}

export interface ExportPlan {
  id: string;
  preset: ExportPreset;
  sources: Map<string, MediaSource>;
  clips: TimelineClip[];
  totalDuration: number;
  totalFrames: number;
  hasAudio: boolean;
  createdAt: number;
}

export interface ExportJob {
  id: string;
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
  aacSupported: boolean;
  mp4MuxerSupported: boolean;
  availableMemoryMb?: number;
  lastExportStatus?: string;
  lastError?: string;
}
