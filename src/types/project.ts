export const CURRENT_PROJECT_SCHEMA_VERSION = 2;

export type ProjectVersion = {
  id: string;
  name: string;
  createdAt: string;
};

export type ClipCategory = 
  | 'unassigned' | 'opening' | 'preparations' | 'ceremony' | 'congratulations' | 'wishes' 
  | 'first_dance' | 'toast' | 'party' | 'family' | 'guests' 
  | 'cake' | 'games' | 'outdoor' | 'climax' | 'ending';

export type ClipStatus = 'READY' | 'PROCESSING' | 'USED' | 'UNUSED' | 'MISSING' | 'ERROR' | 'unused' | 'selected' | 'used' | 'rejected' | 'missing' | 'error';
export type ClipOrientation = 'landscape' | 'portrait' | 'square';

export type ClipQualityRating = 'BEST' | 'GOOD' | 'NEUTRAL' | 'PROBLEM';
export type DuplicateStatus = 'IDENTICAL' | 'VERY_SIMILAR' | 'SEQUENCE' | 'POSSIBLE_DUPLICATE' | 'NONE';

export interface ClipTechnicalAnalysis {
  qualityScore: number; // 0 - 100
  stabilityScore: number; // 0 - 100
  sharpnessScore: number; // 0 - 100
  exposureScore: number; // 0 - 100
  audioQualityScore?: number; // 0 - 100
  montagePotential: number; // 0 - 100
  ratingCategory: ClipQualityRating;
  recommendedStart: number; // Usable segment start (s)
  recommendedEnd: number; // Usable segment end (s)
  issues: string[]; // e.g. ['Poruszone ujęcie', 'Zbyt ciemne']
  analyzedAt?: string;
  duplicateStatus?: DuplicateStatus;
  similarGroupId?: string;
  bestInGroup?: boolean;
  narrativeImportance?: 'HIGH' | 'MEDIUM' | 'LOW';
  sceneType?: string;
}

export type LookPreset = 
  | 'none' 
  | 'cinematic' 
  | 'warm' 
  | 'cool' 
  | 'vintage' 
  | 'bw' 
  | 'film' 
  | 'natural' 
  | 'golden_hour';

export interface ClipColorAdjustments {
  exposure: number; // -100 to 100 (default 0)
  contrast: number; // -100 to 100 (default 0)
  brightness: number; // -100 to 100 (default 0)
  saturation: number; // -100 to 100 (default 0)
  temperature: number; // -100 to 100 (default 0, cool/warm)
  tint: number; // -100 to 100 (default 0, green/magenta)
  sharpness: number; // 0 to 100 (default 0)
  highlights: number; // -100 to 100 (default 0)
  shadows: number; // -100 to 100 (default 0)
  vignette: number; // 0 to 100 (default 0)
  lookPreset?: LookPreset;
  lookIntensity?: number; // 0 to 100 (default 100)
}

export interface MediaClip {
  id: string; // Stable ID
  file?: File;
  objectUrl?: string;
  driveFileId?: string;
  type: 'video' | 'image' | 'audio';
  mimeType?: string;
  name: string;
  duration: number; // in seconds
  width: number;
  height: number;
  aspectRatio: string; // e.g. "16:9", "9:16", "4:3"
  orientation: ClipOrientation;
  fps?: number;
  hasAudio?: boolean;
  audioChannels?: number;
  sampleRate?: number;
  videoCodec?: string;
  audioCodec?: string;
  bitrate?: number;
  size: number; // bytes
  thumbnailUrl?: string;
  category: ClipCategory;
  status: ClipStatus;
  usageCount?: number;
  isFavorite: boolean;
  tags: string[];
  comment?: string;
  createdAt: string;
  capturedAt?: string;
  missingReason?: string;

  // Smart Director & Quality Analysis
  analysis?: ClipTechnicalAnalysis;
  similarGroupId?: string;
  duplicateStatus?: DuplicateStatus;
  bestInGroup?: boolean;
  proxyUrl?: string;
  isProxyReady?: boolean;

  // Color & Audio
  colorAdjustments?: ClipColorAdjustments;
  waveform?: number[];
}

export type TransitionType = 
  | 'cut' 
  | 'fade' 
  | 'dissolve' 
  | 'dip_black' 
  | 'dip_white' 
  | 'zoom' 
  | 'slide' 
  | 'wipe' 
  | 'blur' 
  | 'light_leak' 
  | 'film_burn';

export type FitMode = 'fit' | 'fill' | 'original' | 'crop' | 'smart_crop';

export interface TitleCard {
  enabled: boolean;
  text: string;
  duration: number; // default 3 seconds
  style: 'classic' | 'elegant' | 'minimalist' | 'cinematic' | 'liturgical';
  backgroundColor: string; // hex code or 'gradient'
  subtitle?: string;
  cardType?: 'intro' | 'scene' | 'outro';
}

export interface TimelineItem {
  id: string;
  clipId: string; // Reference to MediaClip
  trackId: string;
  
  // Timing relative to the source media
  sourceStart: number;
  sourceEnd: number;
  
  // Timing relative to the timeline
  timelineStart: number;
  duration: number; // (sourceEnd - sourceStart) / speed
  speed: number; // 0.25 to 2.0 (default 1.0)
  
  // Audio Adjustments
  volume: number; // 0.0 to 2.0 (default 1.0)
  fadeIn: number; // duration in seconds
  fadeOut: number;
  pan?: number; // -1 to 1 (stereo balance)
  muted: boolean;
  solo?: boolean;
  
  // Visual Adjustments
  fitMode?: FitMode;
  smartCropFocus?: 'center' | 'top' | 'face_safe' | 'manual';
  crop?: { x: number; y: number; width: number; height: number };
  scale: number;
  position?: { x: number; y: number }; // Relative offset -1 to 1
  rotation: number; // 0, 90, 180, 270
  
  // Per-item Color Correction Override
  colorAdjustments?: ClipColorAdjustments;
  
  // Transitions
  transitionIn?: TransitionType;
  transitionOut?: TransitionType;
  transitionDuration?: number; // default 0.5s

  // Text Title Card before the clip
  titleCard?: TitleCard;

  // Text Outro Card after the clip (e.g. at the conclusion of the film)
  outroCard?: TitleCard;
}

export interface TimelineTrack {
  id: string;
  type: 'video' | 'audio' | 'voiceover' | 'text' | 'effects';
  name: string;
  muted: boolean;
  solo?: boolean;
  locked: boolean;
  hidden: boolean;
  volume: number; // 0.0 to 1.0
  height?: number; // px
}

export interface AudioTrackItem {
  id: string;
  name: string;
  file?: File;
  objectUrl?: string;
  driveFileId?: string;
  duration: number;
  trackType?: 'music' | 'voiceover' | 'sfx' | 'ambience';
  
  sourceStart: number;
  sourceEnd: number;
  timelineStart: number;
  
  volume: number;
  fadeIn: number;
  fadeOut: number;
  pan?: number; // -1 to 1
  muted?: boolean;
  solo?: boolean;
  duckingAmount?: number; // 0 to 100%
  waveform?: number[];
}

export type TextLayerType = 'title' | 'subtitle' | 'caption' | 'lower_third' | 'end_card' | 'date' | 'quote' | 'chapter';
export type TextAnimation = 'none' | 'fade' | 'slide' | 'typewriter' | 'scale' | 'blur_in';

export interface TextLayer {
  id: string;
  text: string;
  type: TextLayerType;
  style: 'classic' | 'elegant' | 'minimalist' | 'cinematic';
  timelineStart: number;
  duration: number;
  position: { x: number; y: number }; // relative 0-1
  fontSize: number;
  fontWeight?: 'normal' | 'bold' | '300' | '600' | '800';
  fontFamily?: string;
  color: string;
  backgroundColor?: string;
  outlineColor?: string;
  outlineWidth?: number;
  shadow?: boolean;
  opacity?: number;
  animation?: TextAnimation;
  subtitleSpeaker?: string;
}

export type MarkerType = 'best_moment' | 'music' | 'important' | 'ambience' | 'comment';

export interface TimelineMarker {
  id: string;
  time: number;
  type: MarkerType;
  label: string;
  color?: string;
}

export interface WeddingChapter {
  id: string;
  chapterKey: 'opening' | 'preparations' | 'ceremony' | 'congratulations' | 'wishes' | 'first_dance' | 'toast' | 'party' | 'guests' | 'family' | 'climax' | 'ending';
  name: string;
  startTime: number;
  endTime: number;
  description?: string;
}

export type ColorGradingPreset = 
  | 'none' 
  | 'golden_hour' 
  | 'cinematic_noir' 
  | 'pastel_boho' 
  | 'vintage_35mm' 
  | 'vivid_master';

export interface ProjectSettings {
  targetResolution: '720p' | '1080p' | '4k';
  targetFps: 24 | 25 | 30 | 60;
  aspectRatio: '16:9' | '9:16' | '4:3' | '1:1' | '2.39:1';
  fitMode: FitMode;
  colorGrade?: ColorGradingPreset;
  colorAdjustments?: ClipColorAdjustments;
  letterbox?: 'none' | 'cinemascope' | 'standard';
  outroCard?: TitleCard;
  audioDucking?: boolean;
  duckingIntensity?: number; // 0 to 100%
  masterVolume?: number; // 0.0 to 1.5 (default 1.0)
  audioBalance: {
    musicVolume: number; // 0 to 1
    clipVolume: number; // 0 to 1
    voiceoverVolume?: number;
    duckingEnabled?: boolean;
    duckingAmount?: number;
  };
  performanceMode?: 'quality' | 'balanced' | 'performance';
  useProxyMode?: boolean; // When enabled, uses 540p proxy for timeline & preview (final export always uses originals)
  watermark?: {
    enabled: boolean;
    text: string;
    position: 'bottom_right' | 'top_right' | 'bottom_left' | 'top_left';
    opacity: number;
  };
}

export interface ExportHistoryRecord {
  id: string;
  fileName: string;
  createdAt: number;
  duration: number;
  resolution: string;
  fps: number;
  sizeBytes: number;
  format: string;
  status: 'COMPLETED' | 'FAILED';
  url?: string;
  error?: string;
}

export interface ProjectState {
  projectSchemaVersion: number;
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  
  settings: ProjectSettings;
  
  // Resources
  mediaLibrary: MediaClip[];
  
  // Tracks & Edit State
  tracks: TimelineTrack[];
  timelineItems: TimelineItem[];
  audioTracks: AudioTrackItem[];
  textLayers: TextLayer[];
  markers: TimelineMarker[];
  chapters: WeddingChapter[];
  
  versions: ProjectVersion[];
  exportHistory?: ExportHistoryRecord[];
  audioSettings?: {
    duckingEnabled?: boolean;
    duckingAmount?: number;
    musicVolume?: number;
    voiceVolume?: number;
    originalAudioVolume?: number;
  };
}

export type AppErrorCode = 
  | 'SOURCE_ERROR'
  | 'CODEC_ERROR'
  | 'STORAGE_ERROR'
  | 'MEMORY_ERROR'
  | 'RENDER_ERROR'
  | 'UPLOAD_ERROR'
  | 'PERMISSION_ERROR'
  | 'NETWORK_ERROR'
  | 'CANCELED';

export interface AppError {
  code: AppErrorCode;
  message: string;
  technicalDetails?: string;
  timestamp: string;
  recoverable: boolean;
}
