import { ProjectState, MediaClip, TimelineItem } from '../../types/project';
import { analyzeWholeLibrary } from './videoAnalysisEngine';
import { ExportResolution, ExportPreset } from '../export/videoExportTypes';

export async function runExpressAiProduction(
  project: ProjectState,
  onProgress: (percent: number, message: string) => void
): Promise<ProjectState> {
  const clips = project.mediaLibrary;
  if (clips.length === 0) throw new Error('Brak klipów w bibliotece.');

  // 1. Full Quality Analysis (Phase 4.1)
  onProgress(10, 'Rozpoczynanie inteligentnego audytu jakości...');
  const analysisMap = await analyzeWholeLibrary(clips, undefined, (p, msg) => {
    onProgress(10 + (p * 0.4), msg);
  });

  // 2. Attach analysis and determine orientation
  const analyzedClips = clips.map(c => ({
    ...c,
    analysis: analysisMap.get(c.id) || c.analysis
  }));

  const portraitCount = analyzedClips.filter(c => c.orientation === 'portrait').length;
  const landscapeCount = analyzedClips.length - portraitCount;
  const targetResolution: ExportResolution = portraitCount > landscapeCount ? 'vertical_1080p' : '1080p';

  // 3. Sort by quality (Phase 4.1 & 4.3)
  const sortedClips = [...analyzedClips].sort((a, b) => {
    const scoreA = a.analysis?.qualityScore || 0;
    const scoreB = b.analysis?.qualityScore || 0;
    return scoreB - scoreA;
  });

  // 4. Build Express Timeline
  onProgress(60, 'Układanie narracji ekspresowej...');
  let currentTimelineTime = 0;
  const newTimelineItems: TimelineItem[] = sortedClips.map((clip, index) => {
    const analysis = clip.analysis;
    const start = analysis?.recommendedStart || 0;
    const end = analysis?.recommendedEnd || clip.duration;
    const duration = end - start;

    const item: TimelineItem = {
      id: `ti_express_${Date.now()}_${index}`,
      clipId: clip.id,
      trackId: 'v1',
      sourceStart: start,
      sourceEnd: end,
      timelineStart: currentTimelineTime,
      duration: duration,
      speed: 1,
      volume: 1,
      fadeIn: index === 0 ? 1.0 : 0,
      fadeOut: index === sortedClips.length - 1 ? 1.5 : 0,
      muted: false,
      scale: 1,
      rotation: 0,
      fitMode: 'fit',
      transitionIn: index === 0 ? 'fade' : 'dissolve',
      transitionDuration: 0.5,
      // Add project title to the first clip (Phase 4.1)
      titleCard: index === 0 ? {
        enabled: true,
        text: project.name || 'Nasz Ślub',
        subtitle: 'Produkcja ekspresowa AI',
        duration: 3.5,
        style: 'elegant',
        backgroundColor: 'black'
      } : undefined
    };

    currentTimelineTime += duration;
    return item;
  });

  onProgress(90, 'Finalizacja scenariusza AI...');
  
  return {
    ...project,
    mediaLibrary: analyzedClips,
    timelineItems: newTimelineItems,
    updatedAt: new Date().toISOString()
  };
}
