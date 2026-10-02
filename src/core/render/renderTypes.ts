import { ProjectState } from '../../types/project';

export interface RenderOptions {
  resolution: '720p' | '1080p' | '4k';
  fps: number;
  format?: 'mp4' | 'webm';
  aspectRatio?: '16:9' | '9:16';
  bitrateKbps?: number;
  watermark?: boolean;
  useProxyMedia?: boolean;
  startFromFrame?: number;
  videoCodec?: string;
}

export type RenderStage = 
  | 'idle' 
  | 'preparing' 
  | 'loading' 
  | 'decoding' 
  | 'rendering' 
  | 'encoding_video' 
  | 'encoding_audio' 
  | 'audio_mix'
  | 'muxing' 
  | 'finalizing' 
  | 'validating' 
  | 'completed' 
  | 'cancelled' 
  | 'error';

export interface RenderStatistics {
  startTime: number;
  endTime?: number;
  totalDurationMs?: number;
  averageFps?: number;
  encodedSizeMb?: number;
  hardwareAcceleration?: 'hardware' | 'software' | 'unknown';
}

export interface RenderProgress {
  stage: RenderStage;
  percent: number;
  currentFrame: number;
  totalFrames: number;
  fps: number; // Current rendering speed
  targetFps: number; // Desired output FPS
  statusMessage: string;
  etaSeconds?: number; // Estimated seconds remaining
  elapsedSeconds?: number; // Elapsed seconds so far
  estimatedFinishTime?: string; // e.g. 15:42:10
  speedMultiplier?: number; // Render speed ratio (e.g. 2.4x real-time)
  statistics?: RenderStatistics;
  diagnostics?: {
    lastClipName?: string;
    lastError?: string;
    stageDetails?: string;
    encoderConfig?: any;
    provider?: string;
    mimeType?: string;
    size?: number;
    memoryUsageMb?: number;
    failureStage?: 'initialization' | 'loading' | 'decoding' | 'rendering' | 'encoding_video' | 'encoding_audio' | 'muxing' | 'validating';
    failureDetails?: any;
    browserInfo?: string;
    fallbackReason?: string;
    [key: string]: any;
  };
}

export interface RenderResult {
  blob: Blob;
  mimeType: string;
  duration: number;
  width: number;
  height: number;
  sizeBytes: number;
  fileName: string;
  blobUrl: string;
  verifiedPlayable: boolean;
  diagnostics?: any;
}

export interface IRenderProvider {
  id: string;
  name: string;
  description: string;
  isSupported(): boolean;
  render(
    project: ProjectState,
    options: RenderOptions,
    onProgress: (p: RenderProgress) => void,
    signal?: AbortSignal
  ): Promise<RenderResult>;
  verifyOutput(blob: Blob): Promise<{ valid: boolean; duration: number; error?: string }>;
}
