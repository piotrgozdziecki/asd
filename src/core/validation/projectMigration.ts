import { 
  ProjectState, 
  CURRENT_PROJECT_SCHEMA_VERSION, 
  TimelineTrack, 
  WeddingChapter,
  TimelineItem,
  MediaClip,
  ProjectSettings
} from '../../types/project';
import { deepCleanObject } from '../../lib/safeJson';

export const DEFAULT_TRACKS: TimelineTrack[] = [
  { id: 'v1', type: 'video', name: 'Wideo 1', muted: false, locked: false, hidden: false, volume: 1 },
  { id: 'a1', type: 'audio', name: 'Muzyka w tle', muted: false, locked: false, hidden: false, volume: 1 },
  { id: 'a2', type: 'voiceover', name: 'Głos / Lektor', muted: false, locked: false, hidden: false, volume: 1 },
  { id: 't1', type: 'text', name: 'Napisy i Tytuły', muted: false, locked: false, hidden: false, volume: 1 },
];

export const DEFAULT_CHAPTERS: WeddingChapter[] = [
  { id: 'ch_open', chapterKey: 'opening', name: 'Wstęp i Czołówka', startTime: 0, endTime: 15 },
  { id: 'ch_prep', chapterKey: 'preparations', name: 'Przygotowania', startTime: 15, endTime: 60 },
  { id: 'ch_cere', chapterKey: 'ceremony', name: 'Ceremonia Ślubna', startTime: 60, endTime: 180 },
  { id: 'ch_wish', chapterKey: 'wishes', name: 'Życzenia i Gratulacje', startTime: 180, endTime: 240 },
  { id: 'ch_dance', chapterKey: 'first_dance', name: 'Pierwszy Taniec', startTime: 240, endTime: 300 },
  { id: 'ch_party', chapterKey: 'party', name: 'Zabawa Weselna i Oczepiny', startTime: 300, endTime: 480 },
  { id: 'ch_end', chapterKey: 'ending', name: 'Zakończenie i Podziękowania', startTime: 480, endTime: 540 }
];

export const DEFAULT_SETTINGS: ProjectSettings = {
  targetResolution: '1080p',
  targetFps: 30,
  aspectRatio: '16:9',
  fitMode: 'fit',
  audioBalance: {
    musicVolume: 0.8,
    clipVolume: 0.7
  }
};

export function createInitialProject(id: string = `proj_${Date.now()}`): ProjectState {
  return {
    projectSchemaVersion: CURRENT_PROJECT_SCHEMA_VERSION,
    id,
    name: 'Ślub oraz Wesele Joanny i Piotra',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    settings: { ...DEFAULT_SETTINGS },
    mediaLibrary: [],
    tracks: [...DEFAULT_TRACKS],
    timelineItems: [],
    audioTracks: [],
    textLayers: [
      {
        id: `t_intro_${Date.now()}`,
        text: '14.09.2024',
        type: 'title',
        style: 'cinematic',
        timelineStart: 2,
        duration: 5,
        position: { x: 0.5, y: 0.6 },
        fontSize: 24,
        color: '#F7F4EE'
      }
    ],
    markers: [],
    chapters: [...DEFAULT_CHAPTERS],
    versions: []
  };
}

/**
 * Validates and migrates any project data to current schema (version 2).
 * Handles legacy v1 formats safely.
 */
export function migrateProjectToLatest(input: any): ProjectState {
  if (!input || typeof input !== 'object') {
    return createInitialProject();
  }

  const raw = { ...input };
  const schemaVersion = Number(raw.projectSchemaVersion) || 1;

  // 1. Settings migration
  const rawSettings = raw.settings || {};
  const settings: ProjectSettings = {
    targetResolution: ['720p', '1080p', '4k'].includes(rawSettings.targetResolution)
      ? rawSettings.targetResolution
      : '1080p',
    targetFps: [24, 25, 30, 60].includes(Number(rawSettings.targetFps))
      ? Number(rawSettings.targetFps) as any
      : 30,
    aspectRatio: ['16:9', '9:16', '4:3'].includes(rawSettings.aspectRatio)
      ? rawSettings.aspectRatio
      : '16:9',
    fitMode: ['fit', 'fill', 'original', 'crop', 'blurred_background'].includes(rawSettings.fitMode)
      ? rawSettings.fitMode
      : 'blurred_background',
    audioBalance: {
      musicVolume: typeof rawSettings.audioBalance?.musicVolume === 'number' ? rawSettings.audioBalance.musicVolume : 0.8,
      clipVolume: typeof rawSettings.audioBalance?.clipVolume === 'number' ? rawSettings.audioBalance.clipVolume : 0.7
    },
    useProxyMode: Boolean(rawSettings.useProxyMode)
  };

  // 2. Media clips migration
  const mediaLibraryRaw: MediaClip[] = Array.isArray(raw.mediaLibrary)
    ? raw.mediaLibrary.map((clip: any, idx: number): MediaClip => {
        const width = Number(clip.width) || 1920;
        const height = Number(clip.height) || 1080;
        const orientation = height > width ? 'portrait' : 'landscape';
        const aspectRatio = height > width ? '9:16' : '16:9';

        return {
          id: String(clip.id || `clip_${Date.now()}_${idx}`),
          name: String(clip.name || `Ujęcie ${idx + 1}`),
          type: clip.type === 'image' ? 'image' : clip.type === 'audio' ? 'audio' : 'video',
          duration: Math.max(0.1, Number(clip.duration) || 5),
          width,
          height,
          aspectRatio,
          orientation,
          fps: Number(clip.fps) || 30,
          size: Number(clip.size) || 0,
          category: clip.category || 'unassigned',
          status: clip.status || 'unused',
          isFavorite: Boolean(clip.isFavorite),
          tags: Array.isArray(clip.tags) ? clip.tags : [],
          comment: clip.comment || '',
          thumbnailUrl: clip.thumbnailUrl || '',
          objectUrl: clip.objectUrl || '',
          driveFileId: clip.driveFileId || undefined,
          hasAudio: clip.hasAudio !== undefined ? Boolean(clip.hasAudio) : true,
          createdAt: clip.createdAt || new Date().toISOString(),
          capturedAt: clip.capturedAt || clip.createdAt || new Date().toISOString(),
          analysis: clip.analysis ? { ...clip.analysis } : undefined,
          isProxyReady: Boolean(clip.isProxyReady)
        };
      })
    : [];

  // Deduplicate media clips by ID to prevent duplicate key errors in React
  const seenIds = new Set<string>();
  const mediaLibrary = mediaLibraryRaw.filter(clip => {
    if (seenIds.has(clip.id)) return false;
    seenIds.add(clip.id);
    return true;
  });

  // 3. Timeline Items migration
  const timelineItems: TimelineItem[] = Array.isArray(raw.timelineItems)
    ? raw.timelineItems.map((item: any, idx: number): TimelineItem => {
        const sourceStart = Math.max(0, Number(item.sourceStart) || 0);
        const sourceEnd = Math.max(sourceStart + 0.1, Number(item.sourceEnd) || (sourceStart + 5));
        const speed = Math.max(0.25, Math.min(4, Number(item.speed) || 1));
        const duration = Math.max(0.1, Number(item.duration) || ((sourceEnd - sourceStart) / speed));

        return {
          id: String(item.id || `ti_${Date.now()}_${idx}`),
          clipId: String(item.clipId || ''),
          trackId: String(item.trackId || 'v1'),
          sourceStart,
          sourceEnd,
          timelineStart: Math.max(0, Number(item.timelineStart) || 0),
          duration,
          speed,
          volume: typeof item.volume === 'number' ? Math.max(0, Math.min(2, item.volume)) : 1,
          fadeIn: Math.max(0, Number(item.fadeIn) || 0),
          fadeOut: Math.max(0, Number(item.fadeOut) || 0),
          muted: Boolean(item.muted),
          fitMode: item.fitMode || settings.fitMode || 'fit',
          scale: typeof item.scale === 'number' ? item.scale : 1,
          rotation: Number(item.rotation) || 0,
          transitionIn: item.transitionIn || 'cut',
          transitionOut: item.transitionOut || 'cut',
          transitionDuration: Number(item.transitionDuration) || 0.5
        };
      })
    : [];

  return {
    projectSchemaVersion: CURRENT_PROJECT_SCHEMA_VERSION,
    id: String(raw.id || `proj_${Date.now()}`),
    name: String(raw.name || 'Ślub oraz Wesele Joanny i Piotra'),
    createdAt: String(raw.createdAt || new Date().toISOString()),
    updatedAt: new Date().toISOString(),
    settings,
    mediaLibrary,
    tracks: Array.isArray(raw.tracks) && raw.tracks.length > 0 ? raw.tracks : [...DEFAULT_TRACKS],
    timelineItems,
    audioTracks: Array.isArray(raw.audioTracks) ? raw.audioTracks : [],
    textLayers: Array.isArray(raw.textLayers) ? raw.textLayers : [],
    markers: Array.isArray(raw.markers) ? raw.markers : [],
    chapters: Array.isArray(raw.chapters) && raw.chapters.length > 0 ? raw.chapters : [...DEFAULT_CHAPTERS],
    versions: Array.isArray(raw.versions) ? raw.versions : []
  };
}

/**
 * Deeply sanitizes project state so it is 100% safe to serialize with JSON or IndexedDB structuredClone.
 * Strips DOM elements (e.g. HTMLVideoElement, Fiber nodes), functions, circular references, and raw File/Blob instances.
 */
export function sanitizeProjectForStorage(project: ProjectState): ProjectState {
  if (!project || typeof project !== 'object') {
    return createInitialProject();
  }

  const cleanClip = (clip: MediaClip): MediaClip => {
    if (!clip || typeof clip !== 'object') {
      return {
        id: `clip_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        name: 'Bez nazwy',
        type: 'video',
        duration: 5,
        width: 1920,
        height: 1080,
        aspectRatio: '16:9',
        orientation: 'landscape',
        fps: 30,
        size: 0,
        category: 'unassigned',
        status: 'unused',
        isFavorite: false,
        tags: [],
        comment: '',
        thumbnailUrl: '',
        objectUrl: '',
        hasAudio: true,
        createdAt: new Date().toISOString(),
        file: undefined
      };
    }

    return {
      id: String(clip.id || `clip_${Date.now()}`),
      name: String(clip.name || 'Bez nazwy'),
      type: clip.type === 'image' ? 'image' : clip.type === 'audio' ? 'audio' : 'video',
      duration: Math.max(0.1, Number(clip.duration) || 5),
      width: Number(clip.width) || 1920,
      height: Number(clip.height) || 1080,
      aspectRatio: clip.aspectRatio || '16:9',
      orientation: clip.orientation || 'landscape',
      fps: Number(clip.fps) || 30,
      size: Number(clip.size) || 0,
      category: clip.category || 'unassigned',
      status: clip.status || 'unused',
      isFavorite: Boolean(clip.isFavorite),
      tags: Array.isArray(clip.tags) ? clip.tags.map(t => String(t)) : [],
      comment: clip.comment ? String(clip.comment) : '',
      thumbnailUrl: clip.thumbnailUrl && typeof clip.thumbnailUrl === 'string' ? clip.thumbnailUrl : '',
      objectUrl: clip.objectUrl && typeof clip.objectUrl === 'string' && !clip.objectUrl.startsWith('blob:') ? clip.objectUrl : '',
      driveFileId: clip.driveFileId ? String(clip.driveFileId) : undefined,
      hasAudio: clip.hasAudio !== undefined ? Boolean(clip.hasAudio) : true,
      createdAt: clip.createdAt ? String(clip.createdAt) : new Date().toISOString(),
      capturedAt: clip.capturedAt ? String(clip.capturedAt) : (clip.createdAt ? String(clip.createdAt) : new Date().toISOString()),
      analysis: clip.analysis ? {
        qualityScore: Number(clip.analysis.qualityScore) || 0,
        stabilityScore: Number(clip.analysis.stabilityScore) || 0,
        sharpnessScore: Number(clip.analysis.sharpnessScore) || 0,
        exposureScore: Number(clip.analysis.exposureScore) || 0,
        audioQualityScore: typeof clip.analysis.audioQualityScore === 'number' ? clip.analysis.audioQualityScore : undefined,
        montagePotential: Number(clip.analysis.montagePotential) || 0,
        ratingCategory: ['BEST', 'GOOD', 'NEUTRAL', 'PROBLEM'].includes(clip.analysis.ratingCategory) ? clip.analysis.ratingCategory : 'NEUTRAL',
        recommendedStart: Number(clip.analysis.recommendedStart) || 0,
        recommendedEnd: Number(clip.analysis.recommendedEnd) || (Number(clip.duration) || 5),
        issues: Array.isArray(clip.analysis.issues) ? clip.analysis.issues.map((i: any) => String(i)) : [],
        analyzedAt: clip.analysis.analyzedAt ? String(clip.analysis.analyzedAt) : undefined
      } : undefined,
      isProxyReady: Boolean(clip.isProxyReady),
      // Explicitly omit `file` and any DOM/circular properties
      file: undefined
    };
  };

  const cleanState: ProjectState = {
    projectSchemaVersion: CURRENT_PROJECT_SCHEMA_VERSION,
    id: String(project.id || `proj_${Date.now()}`),
    name: String(project.name || 'Ślub oraz Wesele Joanny i Piotra'),
    createdAt: String(project.createdAt || new Date().toISOString()),
    updatedAt: new Date().toISOString(),
    settings: {
      targetResolution: project.settings?.targetResolution || '1080p',
      targetFps: project.settings?.targetFps || 30,
      aspectRatio: project.settings?.aspectRatio || '16:9',
      fitMode: project.settings?.fitMode || 'fit',
      audioBalance: {
        musicVolume: typeof project.settings?.audioBalance?.musicVolume === 'number' ? project.settings.audioBalance.musicVolume : 0.8,
        clipVolume: typeof project.settings?.audioBalance?.clipVolume === 'number' ? project.settings.audioBalance.clipVolume : 0.7
      },
      useProxyMode: Boolean(project.settings?.useProxyMode)
    },
    mediaLibrary: Array.isArray(project.mediaLibrary) 
      ? (() => {
          const seenIds = new Set<string>();
          return project.mediaLibrary
            .map(cleanClip)
            .filter(clip => {
              if (seenIds.has(clip.id)) return false;
              seenIds.add(clip.id);
              return true;
            });
        })()
      : [],
    tracks: Array.isArray(project.tracks) ? project.tracks.map(t => ({
      id: String(t.id),
      type: (t.type === 'audio' || t.type === 'voiceover' || t.type === 'text') ? t.type : 'video',
      name: String(t.name || ''),
      muted: Boolean(t.muted),
      locked: Boolean(t.locked),
      hidden: Boolean(t.hidden),
      volume: typeof t.volume === 'number' ? Math.max(0, Math.min(1, t.volume)) : 1
    })) : [...DEFAULT_TRACKS],
    timelineItems: Array.isArray(project.timelineItems) ? project.timelineItems.map(item => ({
      id: String(item.id),
      clipId: String(item.clipId),
      trackId: String(item.trackId || 'v1'),
      sourceStart: Math.max(0, Number(item.sourceStart) || 0),
      sourceEnd: Math.max(0.1, Number(item.sourceEnd) || 5),
      timelineStart: Math.max(0, Number(item.timelineStart) || 0),
      duration: Math.max(0.1, Number(item.duration) || 5),
      speed: Math.max(0.25, Math.min(4, Number(item.speed) || 1)),
      volume: typeof item.volume === 'number' ? Math.max(0, Math.min(2, item.volume)) : 1,
      fadeIn: Math.max(0, Number(item.fadeIn) || 0),
      fadeOut: Math.max(0, Number(item.fadeOut) || 0),
      muted: Boolean(item.muted),
      fitMode: item.fitMode || 'fit',
      scale: typeof item.scale === 'number' ? item.scale : 1,
      rotation: Number(item.rotation) || 0,
      transitionIn: item.transitionIn,
      transitionOut: item.transitionOut,
      transitionDuration: typeof item.transitionDuration === 'number' ? item.transitionDuration : 0.5,
      position: item.position ? {
        x: Number(item.position.x) || 0,
        y: Number(item.position.y) || 0
      } : undefined
    })) : [],
    audioTracks: Array.isArray(project.audioTracks) ? project.audioTracks.map(track => ({
      id: String(track.id),
      name: String(track.name || 'Dźwięk'),
      objectUrl: track.objectUrl && typeof track.objectUrl === 'string' ? track.objectUrl : undefined,
      driveFileId: track.driveFileId ? String(track.driveFileId) : undefined,
      duration: Number(track.duration) || 0,
      sourceStart: Number(track.sourceStart) || 0,
      sourceEnd: Number(track.sourceEnd) || Number(track.duration) || 0,
      timelineStart: Number(track.timelineStart) || 0,
      volume: typeof track.volume === 'number' ? track.volume : 1,
      fadeIn: Number(track.fadeIn) || 0,
      fadeOut: Number(track.fadeOut) || 0,
      muted: Boolean(track.muted),
      file: undefined
    })) : [],
    textLayers: Array.isArray(project.textLayers) ? project.textLayers.map(layer => ({
      id: String(layer.id),
      text: String(layer.text || ''),
      type: layer.type || 'title',
      style: layer.style || 'cinematic',
      timelineStart: Number(layer.timelineStart) || 0,
      duration: Math.max(0.1, Number(layer.duration) || 5),
      position: {
        x: typeof layer.position?.x === 'number' ? layer.position.x : 0.5,
        y: typeof layer.position?.y === 'number' ? layer.position.y : 0.85
      },
      fontSize: Number(layer.fontSize) || 36,
      color: String(layer.color || '#F7F4EE'),
      backgroundColor: layer.backgroundColor ? String(layer.backgroundColor) : undefined
    })) : [],
    markers: Array.isArray(project.markers) ? project.markers.map(m => ({
      id: String(m.id),
      time: Number(m.time) || 0,
      type: m.type || 'comment',
      label: String(m.label || ''),
      color: m.color ? String(m.color) : undefined
    })) : [],
    chapters: Array.isArray(project.chapters) ? project.chapters.map(c => ({
      id: String(c.id),
      chapterKey: c.chapterKey || 'opening',
      name: String(c.name || ''),
      startTime: Number(c.startTime) || 0,
      endTime: Number(c.endTime) || 60,
      description: c.description ? String(c.description) : undefined
    })) : [...DEFAULT_CHAPTERS],
    versions: Array.isArray(project.versions) ? project.versions.map(v => ({
      id: String(v.id || `v_${Date.now()}`),
      name: String(v.name || 'Wersja'),
      createdAt: String(v.createdAt || new Date().toISOString())
    })) : []
  };

  return deepCleanObject(cleanState) as ProjectState;
}

/**
 * Validates a JSON string as a valid project file.
 */
export function validateAndParseProjectJson(jsonString: string): { valid: boolean; project?: ProjectState; error?: string } {
  try {
    const parsed = JSON.parse(jsonString);
    if (!parsed || typeof parsed !== 'object') {
      return { valid: false, error: 'Plik nie zawiera poprawnego obiektu JSON.' };
    }

    if (!Array.isArray(parsed.timelineItems) && !Array.isArray(parsed.mediaLibrary) && !parsed.name) {
      return { valid: false, error: 'Plik nie jest poprawnym projektem montażowym (brak osi czasu lub biblioteki mediów).' };
    }

    const migrated = migrateProjectToLatest(parsed);
    return { valid: true, project: migrated };
  } catch (err: any) {
    return { valid: false, error: `Błąd parsowania pliku JSON: ${err?.message || 'Nieznany błąd'}` };
  }
}
