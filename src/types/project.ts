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

  // Etap 7: Smart Director & Quality Analysis
  analysis?: ClipTechnicalAnalysis;
  similarGroupId?: string;
  duplicateStatus?: DuplicateStatus;
  bestInGroup?: boolean;
  proxyUrl?: string;
  isProxyReady?: boolean;
}

export type TransitionType = 'cut' | 'fade' | 'dissolve' | 'dip_black' | 'dip_white';
export type FitMode = 'fit' | 'fill' | 'original' | 'crop';

export interface TitleCard {
  enabled: boolean;
  text: string;
  duration: number; // default 3 seconds
  style: 'classic' | 'elegant' | 'minimalist' | 'cinematic';
  backgroundColor: string; // hex code or 'gradient'
  subtitle?: string;
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
  speed: number; // 0.5 to 2.0 (default 1.0)
  
  // Audio Adjustments
  volume: number; // 0.0 to 2.0 (default 1.0)
  fadeIn: number; // duration in seconds
  fadeOut: number;
  muted: boolean;
  
  // Visual Adjustments
  fitMode?: FitMode;
  crop?: { x: number; y: number; width: number; height: number };
  scale: number;
  position?: { x: number; y: number }; // Relative offset -1 to 1
  rotation: number; // 0, 90, 180, 270
  
  // Transitions
  transitionIn?: TransitionType;
  transitionOut?: TransitionType;
  transitionDuration?: number; // default 0.5s

  // Text Title Card (Intertitles / Plansza Tekstowa) before the clip
  titleCard?: TitleCard;
}

export interface TimelineTrack {
  id: string;
  type: 'video' | 'audio' | 'voiceover' | 'text';
  name: string;
  muted: boolean;
  locked: boolean;
  hidden: boolean;
  volume: number; // 0.0 to 1.0
}

export interface AudioTrackItem {
  id: string;
  name: string;
  file?: File;
  objectUrl?: string;
  driveFileId?: string;
  duration: number;
  
  sourceStart: number;
  sourceEnd: number;
  timelineStart: number;
  
  volume: number;
  fadeIn: number;
  fadeOut: number;
  muted?: boolean;
}

export interface TextLayer {
  id: string;
  text: string;
  type: 'title' | 'caption' | 'date' | 'quote' | 'chapter';
  style: 'classic' | 'elegant' | 'minimalist' | 'cinematic';
  timelineStart: number;
  duration: number;
  position: { x: number; y: number }; // relative 0-1
  fontSize: number;
  color: string;
  backgroundColor?: string;
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
  aspectRatio: '16:9' | '9:16' | '4:3';
  fitMode: FitMode;
  colorGrade?: ColorGradingPreset;
  letterbox?: 'none' | 'cinemascope' | 'standard';
  audioDucking?: boolean;
  audioBalance: {
    musicVolume: number; // 0 to 1
    clipVolume: number; // 0 to 1
  };
  useProxyMode?: boolean; // When enabled, uses 540p proxy for timeline & preview (final export always uses originals)
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
