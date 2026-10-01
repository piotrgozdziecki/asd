import type { LookPreset, ColorGradingPreset, FitMode, TitleCard, TextLayer } from './project';

export interface TemplateChapter {
  chapterKey: string;
  name: string;
  targetDurationSec: number;
  description: string;
}

export interface TemplateStructure {
  pacing?: 'cinematic' | 'dynamic' | 'emotional';
  colorGrade?: LookPreset | ColorGradingPreset | string;
  resolution?: string;
  fps?: number;
  fitMode?: FitMode;
  introCard?: TitleCard;
  outroCard?: TitleCard;
  chapters?: TemplateChapter[];
  sampleTextLayers?: TextLayer[];
  suggestedMusicPreset?: string;
  applySmartTrim?: boolean;
  applyTransitions?: boolean;
}

export interface ProjectTemplate {
  id: string;
  userId: string;
  title: string;
  description: string;
  category: 'wedding_highlights' | 'ceremony_only' | 'photo_mix' | 'party_reel' | 'custom';
  icon: string;
  isPrebuilt: boolean;
  structure: TemplateStructure;
  createdAt: string;
  updatedAt: string;
}
