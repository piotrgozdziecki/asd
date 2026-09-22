import { ProjectState, TimelineItem } from '../../types/project';
import { resolveClipMediaUrl } from '../media/mediaResolver';
import { localIndexedDB } from '../storage/indexedDBProvider';

export type HealthStatus = 'OK' | 'WARNING' | 'ERROR' | 'UNTESTED';

export interface HealthModuleResult {
  module: 'media' | 'timeline' | 'audio' | 'render' | 'storage';
  name: string;
  status: HealthStatus;
  issues: string[];
  metrics?: string;
  testedAt?: string;
  canAutoFix?: boolean;
}

export interface ProjectHealthReport {
  tested: boolean;
  testedAt?: string;
  overallStatus: 'OK' | 'WARNING' | 'ERROR';
  canExport: boolean;
  modules: {
    media: HealthModuleResult;
    timeline: HealthModuleResult;
    audio: HealthModuleResult;
    render: HealthModuleResult;
    storage: HealthModuleResult;
  };
  exportReadiness: {
    ready: boolean;
    status: 'READY TO EXPORT' | 'FIX BEFORE EXPORT';
    blockers: string[];
    warnings: string[];
  };
}

/**
 * Creates the initial UNTESTED state so the UI never falsely displays "100% OK" without a real test.
 */
export function createInitialUntestedHealthReport(): ProjectHealthReport {
  return {
    tested: false,
    overallStatus: 'WARNING',
    canExport: false,
    modules: {
      media: {
        module: 'media',
        name: 'Media (Pliki źródłowe)',
        status: 'UNTESTED',
        issues: ['Wymagany rzeczywisty test dostępności plików']
      },
      timeline: {
        module: 'timeline',
        name: 'Oś Czasu (Montaż)',
        status: 'UNTESTED',
        issues: ['Wymagany test granic czasowych i powiązań']
      },
      audio: {
        module: 'audio',
        name: 'Dźwięk & Muzyka',
        status: 'UNTESTED',
        issues: ['Wymagany test ścieżek dźwiękowych']
      },
      render: {
        module: 'render',
        name: 'Silnik Renderowania',
        status: 'UNTESTED',
        issues: ['Wymagany test sprzętowego VideoEncoder']
      },
      storage: {
        module: 'storage',
        name: 'Pamięć & IndexedDB',
        status: 'UNTESTED',
        issues: ['Wymagany test limitu miejsca w przeglądarce']
      }
    },
    exportReadiness: {
      ready: false,
      status: 'FIX BEFORE EXPORT',
      blockers: ['Wykonaj audyt przed eksportem'],
      warnings: []
    }
  };
}

/**
 * Performs authentic runtime verification across all 5 project modules.
 */
export async function runRealRuntimeHealthCheck(project: ProjectState): Promise<ProjectHealthReport> {
  const timestamp = new Date().toLocaleTimeString('pl-PL');
  const blockers: string[] = [];
  const warnings: string[] = [];

  // ==========================================
  // 1. MEDIA MODULE (Real Runtime Test)
  // ==========================================
  const mediaIssues: string[] = [];
  let availableMediaCount = 0;
  let missingMediaCount = 0;
  const clipMap = new Map(project.mediaLibrary.map(c => [c.id, c]));

  if (project.mediaLibrary.length === 0) {
    mediaIssues.push('Biblioteka mediów jest pusta.');
    warnings.push('Dodaj zdjęcia i filmy do biblioteki mediów.');
  }

  for (const clip of project.mediaLibrary) {
    const url = await resolveClipMediaUrl(clip);
    if (!url) {
      mediaIssues.push(`Brak pliku w pamięci: "${clip.name}"`);
      missingMediaCount++;
    } else {
      availableMediaCount++;
    }
  }

  let mediaStatus: HealthStatus = 'OK';
  if (missingMediaCount > 0) {
    mediaStatus = 'ERROR';
    blockers.push(`Brakujące pliki w bibliotece (${missingMediaCount} szt.)`);
  } else if (project.mediaLibrary.length === 0) {
    mediaStatus = 'WARNING';
  }

  const mediaResult: HealthModuleResult = {
    module: 'media',
    name: 'Media (Pliki źródłowe)',
    status: mediaStatus,
    issues: mediaIssues,
    metrics: `${availableMediaCount}/${project.mediaLibrary.length} gotowych`,
    testedAt: timestamp,
    canAutoFix: false
  };

  // ==========================================
  // 2. TIMELINE MODULE (Real Runtime Test)
  // ==========================================
  const timelineIssues: string[] = [];
  let hasTimelineAutoFix = false;

  if (project.timelineItems.length === 0) {
    timelineIssues.push('Oś czasu jest pusta - brak klipów do wyrenderowania.');
    blockers.push('Brak klipów na osi czasu');
  }

  let totalTimelineDuration = 0;
  project.timelineItems.forEach((item, index) => {
    const clip = clipMap.get(item.clipId);
    if (!clip) {
      timelineIssues.push(`Klip #${index + 1} odwołuje się do usuniętego pliku (ID: ${item.clipId})`);
      hasTimelineAutoFix = true;
      blockers.push(`Uszkodzone dowiązanie na osi czasu (element #${index + 1})`);
      return;
    }

    if (item.sourceStart < 0) {
      timelineIssues.push(`Ujemny start w "${clip.name}" (${item.sourceStart.toFixed(2)}s)`);
      hasTimelineAutoFix = true;
    }

    if (item.sourceEnd <= item.sourceStart) {
      timelineIssues.push(`Błędne cięcie w "${clip.name}": OUT <= IN`);
      hasTimelineAutoFix = true;
      blockers.push(`Błędne granice cięcia w "${clip.name}"`);
    }

    if (clip.duration > 0 && item.sourceEnd > clip.duration + 0.5) {
      timelineIssues.push(`Cięcie wykracza poza czas pliku "${clip.name}" (${item.sourceEnd.toFixed(1)}s > ${clip.duration.toFixed(1)}s)`);
      hasTimelineAutoFix = true;
      warnings.push(`Przycięcie poza długość pliku w "${clip.name}"`);
    }

    totalTimelineDuration = Math.max(totalTimelineDuration, item.timelineStart + item.duration);
  });

  let timelineStatus: HealthStatus = 'OK';
  if (project.timelineItems.length === 0 || timelineIssues.some(i => i.includes('usuniętego') || i.includes('OUT <= IN'))) {
    timelineStatus = 'ERROR';
  } else if (timelineIssues.length > 0) {
    timelineStatus = 'WARNING';
  }

  const timelineResult: HealthModuleResult = {
    module: 'timeline',
    name: 'Oś Czasu (Montaż)',
    status: timelineStatus,
    issues: timelineIssues,
    metrics: `${project.timelineItems.length} ujęć (${totalTimelineDuration.toFixed(1)}s)`,
    testedAt: timestamp,
    canAutoFix: hasTimelineAutoFix
  };

  // ==========================================
  // 3. AUDIO MODULE (Real Runtime Test)
  // ==========================================
  const audioIssues: string[] = [];
  let hasAudioAutoFix = false;
  const videoTrack = project.tracks.find(t => t.id === 'v1');
  const hasAudioTracks = project.audioTracks.length > 0;

  if (videoTrack?.muted && !hasAudioTracks) {
    audioIssues.push('Ścieżka wideo jest wyciszona, a projekt nie zawiera żadnej muzyki (film będzie całkowicie niemy).');
    warnings.push('Film będzie całkowicie niemy (wyciszone wideo bez muzyki)');
    hasAudioAutoFix = true;
  }

  project.audioTracks.forEach((track, idx) => {
    if (!track.objectUrl && !track.file && !track.driveFileId) {
      audioIssues.push(`Brak pliku audio dla ścieżki "${track.name}".`);
      warnings.push(`Niedostępny plik podkładu muzycznego: "${track.name}"`);
    }

    if (track.timelineStart < 0) {
      audioIssues.push(`Ścieżka muzyczna "${track.name}" ma ujemny czas startu (${track.timelineStart.toFixed(1)}s).`);
      hasAudioAutoFix = true;
    }

    if (track.duration <= 0) {
      audioIssues.push(`Ścieżka muzyczna "${track.name}" ma zerowy czas trwania.`);
      hasAudioAutoFix = true;
    }

    if (track.volume === 0 && !track.muted) {
      audioIssues.push(`Ścieżka muzyczna "${track.name}" ma ustawioną zerową głośność (0%).`);
    }
  });

  // Check orientation and aspect ratio consistency
  const targetAspect = project.settings?.aspectRatio || '16:9';
  let portraitClipsOnTimeline = 0;
  project.timelineItems.forEach(item => {
    const clip = clipMap.get(item.clipId);
    if (clip && clip.orientation === 'portrait' && targetAspect === '16:9') {
      portraitClipsOnTimeline++;
    }
  });
  if (portraitClipsOnTimeline > 0) {
    warnings.push(`Wykryto ${portraitClipsOnTimeline} pionowych ujęć (9:16) w poziomym projekcie 16:9. Zastosowano dopasowanie kadrów.`);
  }

  let audioStatus: HealthStatus = 'OK';
  if (audioIssues.some(i => i.includes('Brak pliku audio'))) {
    audioStatus = 'WARNING';
  } else if (audioIssues.length > 0) {
    audioStatus = 'WARNING';
  }

  const audioResult: HealthModuleResult = {
    module: 'audio',
    name: 'Dźwięk & Muzyka',
    status: audioStatus,
    issues: audioIssues,
    metrics: `${project.audioTracks.length} ścieżek muzycznych`,
    testedAt: timestamp,
    canAutoFix: hasAudioAutoFix
  };

  // ==========================================
  // 4. RENDER MODULE (Real Runtime Test)
  // ==========================================
  const renderIssues: string[] = [];
  let webCodecsSupported = false;

  if (typeof window !== 'undefined' && 'VideoEncoder' in window) {
    try {
      const res = await (window as any).VideoEncoder.isConfigSupported({
        codec: 'avc1.42001f', // H.264 Baseline
        width: 1280,
        height: 720,
        bitrate: 3_000_000,
        framerate: 30
      });
      webCodecsSupported = !!res.supported;
      if (!webCodecsSupported) {
        renderIssues.push('WebCodecs nie wspiera akceleracji sprzętowej H.264 - użyty zostanie silnik MediaRecorder.');
      }
    } catch {
      renderIssues.push('Błąd testu profilu kodera WebCodecs.');
    }
  } else {
    renderIssues.push('Brak API WebCodecs w przeglądarce (użyty zostanie MediaRecorder).');
  }

  // Canvas 2D check
  const testCanvas = document.createElement('canvas');
  const testCtx = testCanvas.getContext('2d');
  if (!testCtx) {
    renderIssues.push('Brak akceleracji sprzętowej Canvas 2D.');
    blockers.push('Brak wsparcia dla Canvas 2D');
  }

  let renderStatus: HealthStatus = 'OK';
  if (!testCtx) {
    renderStatus = 'ERROR';
  } else if (!webCodecsSupported) {
    renderStatus = 'WARNING';
    warnings.push('Eksport z użyciem silnika zapasowego (MediaRecorder)');
  }

  const renderResult: HealthModuleResult = {
    module: 'render',
    name: 'Silnik Renderowania',
    status: renderStatus,
    issues: renderIssues,
    metrics: webCodecsSupported ? 'WebCodecs H.264 (Aktywny)' : 'MediaRecorder Fallback',
    testedAt: timestamp,
    canAutoFix: false
  };

  // ==========================================
  // 5. STORAGE MODULE (Real Runtime Test)
  // ==========================================
  const storageIssues: string[] = [];
  let quotaMB = 0;
  let usedMB = 0;

  try {
    const stats = await localIndexedDB.getStorageStats();
    quotaMB = Math.round(stats.quotaBytes / (1024 * 1024));
    usedMB = Math.round(stats.usedBytes / (1024 * 1024));

    if (stats.quotaBytes > 0 && stats.usedBytes > stats.quotaBytes * 0.9) {
      storageIssues.push('Pamięć podręczna przeglądarki jest zapełniona w ponad 90%.');
      warnings.push('Niski poziom wolnego miejsca w pamięci przeglądarki');
    }
  } catch (e) {
    storageIssues.push('Nie udało się odczytać limitu pamięci przeglądarki.');
  }

  let storageStatus: HealthStatus = 'OK';
  if (storageIssues.length > 0) {
    storageStatus = 'WARNING';
  }

  const storageResult: HealthModuleResult = {
    module: 'storage',
    name: 'Pamięć & IndexedDB',
    status: storageStatus,
    issues: storageIssues,
    metrics: `${usedMB} MB / ${quotaMB} MB zajęte`,
    testedAt: timestamp,
    canAutoFix: false
  };

  // ==========================================
  // OVERALL STATUS & EXPORT READINESS
  // ==========================================
  const hasErrors = [mediaResult, timelineResult, audioResult, renderResult, storageResult].some(m => m.status === 'ERROR');
  const hasWarnings = [mediaResult, timelineResult, audioResult, renderResult, storageResult].some(m => m.status === 'WARNING');

  const overallStatus: 'OK' | 'WARNING' | 'ERROR' = hasErrors ? 'ERROR' : hasWarnings ? 'WARNING' : 'OK';
  const canExport = !hasErrors && project.timelineItems.length > 0;

  return {
    tested: true,
    testedAt: timestamp,
    overallStatus,
    canExport,
    modules: {
      media: mediaResult,
      timeline: timelineResult,
      audio: audioResult,
      render: renderResult,
      storage: storageResult
    },
    exportReadiness: {
      ready: canExport,
      status: canExport ? 'READY TO EXPORT' : 'FIX BEFORE EXPORT',
      blockers,
      warnings
    }
  };
}

/**
 * Automatically repairs common project health issues:
 * - Trims out-of-bounds clip ends to real clip duration.
 * - Resets negative sourceStart to 0.
 * - Removes timeline items referencing non-existent clips.
 * - Unmutes video track if no music is present.
 */
export function autoFixProjectHealthIssues(project: ProjectState): {
  updatedProject: ProjectState;
  fixedCount: number;
  fixedItems: string[];
} {
  const clipMap = new Map(project.mediaLibrary.map(c => [c.id, c]));
  const fixedItems: string[] = [];
  let fixedCount = 0;

  // 1. Repair timeline items
  const validItems: TimelineItem[] = [];

  project.timelineItems.forEach(item => {
    const clip = clipMap.get(item.clipId);
    if (!clip) {
      fixedItems.push(`Usunięto osierocony element osi czasu (ID: ${item.id})`);
      fixedCount++;
      return;
    }

    let modified = false;
    let newStart = item.sourceStart;
    let newEnd = item.sourceEnd;

    if (newStart < 0) {
      newStart = 0;
      modified = true;
      fixedItems.push(`Naprawiono ujemny punkt wejścia w "${clip.name}"`);
      fixedCount++;
    }

    if (clip.duration > 0 && newEnd > clip.duration) {
      newEnd = clip.duration;
      modified = true;
      fixedItems.push(`Dopasowano punkt wyjścia do długości pliku "${clip.name}"`);
      fixedCount++;
    }

    if (newEnd <= newStart) {
      newEnd = Math.min(clip.duration, newStart + 3);
      modified = true;
      fixedItems.push(`Skorygowano zerowe cięcie w "${clip.name}"`);
      fixedCount++;
    }

    const duration = Math.max(0.1, (newEnd - newStart) / (item.speed || 1));

    validItems.push(modified ? {
      ...item,
      sourceStart: Number(newStart.toFixed(2)),
      sourceEnd: Number(newEnd.toFixed(2)),
      duration: Number(duration.toFixed(2))
    } : item);
  });

  // 2. Repair audio tracks
  const updatedAudioTracks = project.audioTracks.map(track => {
    let trackModified = false;
    let newStart = track.timelineStart;
    let newDur = track.duration;

    if (newStart < 0) {
      newStart = 0;
      trackModified = true;
      fixedItems.push(`Skorygowano ujemny czas startu ścieżki audio "${track.name}"`);
      fixedCount++;
    }

    if (newDur <= 0) {
      newDur = 10;
      trackModified = true;
      fixedItems.push(`Przywrócono domyślny czas trwania dla ścieżki audio "${track.name}"`);
      fixedCount++;
    }

    return trackModified ? { ...track, timelineStart: newStart, duration: newDur } : track;
  });

  // 3. Unmute video track if needed
  let updatedTracks = project.tracks;
  const hasMusic = updatedAudioTracks.length > 0;
  const v1 = project.tracks.find(t => t.id === 'v1');
  if (v1 && v1.muted && !hasMusic) {
    updatedTracks = project.tracks.map(t => t.id === 'v1' ? { ...t, muted: false } : t);
    fixedItems.push('Przywrócono dźwięk wideo (ścieżka v1 została odciszona)');
    fixedCount++;
  }

  const updatedProject: ProjectState = {
    ...project,
    tracks: updatedTracks,
    timelineItems: validItems,
    audioTracks: updatedAudioTracks,
    updatedAt: new Date().toISOString()
  };

  return {
    updatedProject,
    fixedCount,
    fixedItems
  };
}
