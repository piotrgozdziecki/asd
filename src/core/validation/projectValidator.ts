import { ProjectState } from '../../types/project';

export interface ProjectCheckIssue {
  id: string;
  severity: 'error' | 'warning' | 'info';
  category: 'source' | 'timing' | 'audio' | 'track' | 'export';
  title: string;
  message: string;
  itemId?: string;
  clipId?: string;
  canAutoFix?: boolean;
}

export interface ProjectCheckResult {
  passed: boolean;
  canExport: boolean;
  errorsCount: number;
  warningsCount: number;
  issues: ProjectCheckIssue[];
  summary: string;
}

export function checkProjectHealth(project: ProjectState): ProjectCheckResult {
  const issues: ProjectCheckIssue[] = [];

  // 1. Check timeline items count
  if (!project.timelineItems || project.timelineItems.length === 0) {
    issues.push({
      id: 'empty_timeline',
      severity: 'error',
      category: 'export',
      title: 'Pusta oś czasu',
      message: 'Na osi czasu nie ma żadnych klipów wideo ani zdjęć. Dodaj materiały do montażu przed eksportem filmu.'
    });
  }

  // 2. Check total duration
  const totalDuration = project.timelineItems.reduce(
    (max, item) => Math.max(max, item.timelineStart + item.duration),
    0
  );

  if (project.timelineItems.length > 0 && totalDuration <= 0.2) {
    issues.push({
      id: 'zero_duration',
      severity: 'error',
      category: 'timing',
      title: 'Czas trwania bliski zeru',
      message: 'Całkowity czas filmu wynosi 0 sekund. Sprawdź długości klipów na osi czasu.'
    });
  }

  // 3. Check each timeline item and source media
  const clipMap = new Map(project.mediaLibrary.map(c => [c.id, c]));

  project.timelineItems.forEach((item, index) => {
    const clip = clipMap.get(item.clipId);

    if (!clip) {
      issues.push({
        id: `missing_clip_ref_${item.id}`,
        severity: 'error',
        category: 'source',
        title: `Brakujące źródło w bibliotece (Klip #${index + 1})`,
        message: `Klip na osi czasu odwołuje się do nieistniejącego pliku (ID: ${item.clipId}).`,
        itemId: item.id
      });
      return;
    }

    // Check if source file/objectUrl is missing or invalid
    if (!clip.objectUrl && !clip.file && !clip.driveFileId) {
      issues.push({
        id: `missing_source_${clip.id}`,
        severity: 'error',
        category: 'source',
        title: `Brak pliku źródłowego: "${clip.name}"`,
        message: `Plik "${clip.name}" nie jest załadowany w pamięci przeglądarki. Połącz go ponownie lub wskaż plik z dysku.`,
        itemId: item.id,
        clipId: clip.id
      });
    }

    // Check timing boundaries
    if (item.sourceStart < 0) {
      issues.push({
        id: `negative_start_${item.id}`,
        severity: 'error',
        category: 'timing',
        title: `Ujemny punkt wejścia IN w "${clip.name}"`,
        message: `Punkt początkowy klipu wynosi ${item.sourceStart.toFixed(2)}s, co jest wartością niepoprawną.`,
        itemId: item.id,
        clipId: clip.id
      });
    }

    if (item.sourceEnd <= item.sourceStart) {
      issues.push({
        id: `invalid_range_${item.id}`,
        severity: 'error',
        category: 'timing',
        title: `Błędny zakres przycięcia w "${clip.name}"`,
        message: `Punkt OUT (${item.sourceEnd.toFixed(2)}s) musi być większy niż punkt IN (${item.sourceStart.toFixed(2)}s).`,
        itemId: item.id,
        clipId: clip.id
      });
    }

    if (clip.duration > 0 && item.sourceEnd > clip.duration + 0.5) {
      issues.push({
        id: `out_of_bounds_${item.id}`,
        severity: 'warning',
        category: 'timing',
        title: `Punkt wyjścia poza końcem pliku: "${clip.name}"`,
        message: `Klip przycięto do ${item.sourceEnd.toFixed(2)}s, podczas gdy oryginalny plik ma ${clip.duration.toFixed(2)}s.`,
        itemId: item.id,
        clipId: clip.id
      });
    }
  });

  // 4. Check track mute status
  const videoTrack = project.tracks.find(t => t.id === 'v1');
  if (videoTrack?.muted) {
    issues.push({
      id: 'video_track_muted',
      severity: 'warning',
      category: 'track',
      title: 'Ścieżka wideo jest wyciszona',
      message: 'Główna ścieżka wideo ma wyciszony dźwięk oryginalny. W filmie będzie słychać tylko muzykę.'
    });
  }

  // 5. Audio tracks check
  project.audioTracks.forEach((track) => {
    if (!track.objectUrl && !track.file && !track.driveFileId) {
      issues.push({
        id: `missing_audio_${track.id}`,
        severity: 'warning',
        category: 'audio',
        title: `Brak pliku muzycznego: "${track.name}"`,
        message: `Ścieżka dźwiękowa "${track.name}" nie ma dostępnego pliku. Zostanie pominięta w miksie.`,
        itemId: track.id
      });
    }
  });

  // Summary
  const errorsCount = issues.filter(i => i.severity === 'error').length;
  const warningsCount = issues.filter(i => i.severity === 'warning').length;
  const canExport = errorsCount === 0;

  let summary = 'Projekt jest gotowy do renderowania filmu.';
  if (errorsCount > 0) {
    summary = `Wykryto ${errorsCount} ${errorsCount === 1 ? 'błąd krytyczny' : 'błędy/błędów krytycznych'}. Napraw je przed eksportem filmu.`;
  } else if (warningsCount > 0) {
    summary = `Projekt można wyeksportować, ale wykryto ${warningsCount} ${warningsCount === 1 ? 'ostrzeżenie' : 'ostrzeżeń'}.`;
  }

  return {
    passed: errorsCount === 0 && warningsCount === 0,
    canExport,
    errorsCount,
    warningsCount,
    issues,
    summary
  };
}
