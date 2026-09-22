export type StoryMood = 'high_quality' | 'romantic' | 'energetic' | 'cinematic' | 'modern' | 'nostalgic';
export type StoryFormat = 'original' | 'reel' | 'highlight' | 'documentary';
export type AppViewTab = 'studio' | 'timeline' | 'cinema' | 'vault';

export type MediaItem = {
  id?: string;
  name: string;
  mimeType: string;
  type: 'drive' | 'local' | 'cloud';
  base64?: string;
  blobUrl?: string;
  cloudUrl?: string;
  storagePath?: string;
  file?: File;
  comment?: string;
  durationSec?: number;
  startTimeSec?: number;
  endTimeSec?: number;
  originalDuration?: number;
  audioVolume?: number;
  exifDate?: string;
  isUploadingToCloud?: boolean;
  cloudUploadProgress?: number;
};

export type Storyboard = {
  id?: string;
  title: string;
  concept: string;
  musicSuggestion: string;
  timeline: { time: string; elementName: string; action: string; directorNote?: string }[];
  voiceover: string;
  exifDate?: string;
  mood?: StoryMood; format?: StoryFormat; genre?: string;
};
