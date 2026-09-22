import { MediaClip, ClipTechnicalAnalysis, ClipQualityRating, DuplicateStatus } from '../../types/project';
import { resolveClipMediaUrl } from '../media/mediaResolver';

export interface AnalysisProgressCallback {
  (progress: number, message: string): void;
}

/**
 * Fast client-side frame sampling for video stability, exposure, sharpness, and motion.
 */
export async function analyzeClipVideo(
  clip: MediaClip,
  signal?: AbortSignal,
  onProgress?: AnalysisProgressCallback
): Promise<ClipTechnicalAnalysis> {
  const issues: string[] = [];

  // Default values
  let qualityScore = 70;
  let stabilityScore = 80;
  let sharpnessScore = 75;
  let exposureScore = 80;
  let montagePotential = 70;
  let recommendedStart = 0;
  let recommendedEnd = Math.max(1, clip.duration);

  // If clip is an image
  if (clip.type === 'image') {
    stabilityScore = 100;
    sharpnessScore = Math.min(100, Math.round((clip.width * clip.height) / (1920 * 1080) * 85));
    exposureScore = 85;
    qualityScore = Math.round((sharpnessScore * 0.5) + 45);
    montagePotential = 65;
    recommendedStart = 0;
    recommendedEnd = Math.min(5, Math.max(2, clip.duration));

    const ratingCategory: ClipQualityRating = qualityScore >= 80 ? 'BEST' : qualityScore >= 60 ? 'GOOD' : 'NEUTRAL';

    return {
      qualityScore,
      stabilityScore,
      sharpnessScore,
      exposureScore,
      audioQualityScore: undefined,
      montagePotential,
      ratingCategory,
      recommendedStart,
      recommendedEnd,
      issues: [],
      analyzedAt: new Date().toISOString()
    };
  }

  // If clip is audio only
  if (clip.type === 'audio') {
    return {
      qualityScore: 85,
      stabilityScore: 100,
      sharpnessScore: 100,
      exposureScore: 100,
      audioQualityScore: 90,
      montagePotential: 80,
      ratingCategory: 'GOOD',
      recommendedStart: 0,
      recommendedEnd: clip.duration,
      issues: [],
      analyzedAt: new Date().toISOString()
    };
  }

  // Video Analysis:
  const mediaUrl = await resolveClipMediaUrl(clip);
  if (!mediaUrl) {
    return {
      qualityScore: 20,
      stabilityScore: 20,
      sharpnessScore: 20,
      exposureScore: 20,
      montagePotential: 10,
      ratingCategory: 'PROBLEM',
      recommendedStart: 0,
      recommendedEnd: clip.duration,
      issues: ['Brak dostępnego pliku źródłowego'],
      analyzedAt: new Date().toISOString()
    };
  }

  const duration = Math.max(0.5, clip.duration);
  const sampleCount = Math.min(8, Math.max(3, Math.floor(duration / 3)));
  const sampleTimes: number[] = [];
  for (let i = 0; i < sampleCount; i++) {
    const t = (duration * (i + 0.5)) / sampleCount;
    sampleTimes.push(Math.max(0.1, Math.min(duration - 0.1, t)));
  }

  // Offscreen test video & canvas
  const video = document.createElement('video');
  video.preload = 'auto';
  video.muted = true;
  video.playsInline = true;
  video.crossOrigin = 'anonymous';
  video.src = mediaUrl;

  const canvas = document.createElement('canvas');
  canvas.width = 160;
  canvas.height = 90;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });

  const frameDataList: { luminance: number; sharpness: number; frameDiff: number }[] = [];
  let prevImageData: ImageData | null = null;

  try {
    await new Promise<void>((resolve, reject) => {
      const onLoaded = () => {
        cleanup();
        resolve();
      };
      const onError = () => {
        cleanup();
        reject(new Error('Nie można załadować wideo do analizy'));
      };
      const cleanup = () => {
        video.removeEventListener('loadeddata', onLoaded);
        video.removeEventListener('error', onError);
      };
      video.addEventListener('loadeddata', onLoaded);
      video.addEventListener('error', onError);

      // Fallback timeout
      setTimeout(() => {
        cleanup();
        resolve();
      }, 5000);
    });

    if (signal?.aborted) {
      throw new Error('Analiza została anulowana przez użytkownika');
    }

    for (let i = 0; i < sampleTimes.length; i++) {
      if (signal?.aborted) {
        throw new Error('Analiza została anulowana przez użytkownika');
      }

      const targetTime = sampleTimes[i];
      video.currentTime = targetTime;

      await new Promise<void>((res) => {
        const onSeeked = () => {
          video.removeEventListener('seeked', onSeeked);
          res();
        };
        video.addEventListener('seeked', onSeeked);
        setTimeout(onSeeked, 800);
      });

      if (!ctx) continue;

      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const data = imgData.data;

      // 1. Luminance
      let totalLuminance = 0;
      let totalDiff = 0;
      let edgeVariance = 0;

      const pixelCount = canvas.width * canvas.height;
      for (let p = 0; p < data.length; p += 4) {
        const r = data[p];
        const g = data[p + 1];
        const b = data[p + 2];
        const lum = (0.299 * r + 0.587 * g + 0.114 * b);
        totalLuminance += lum;

        // Horizontal gradient (rough edge sharpness)
        if ((p / 4) % canvas.width < canvas.width - 1) {
          const nextR = data[p + 4];
          const nextG = data[p + 5];
          const nextB = data[p + 6];
          const nextLum = (0.299 * nextR + 0.587 * nextG + 0.114 * nextB);
          edgeVariance += Math.abs(lum - nextLum);
        }

        // Inter-frame difference
        if (prevImageData) {
          const prevLum = (0.299 * prevImageData.data[p] + 0.587 * prevImageData.data[p + 1] + 0.114 * prevImageData.data[p + 2]);
          totalDiff += Math.abs(lum - prevLum);
        }
      }

      const avgLuminance = totalLuminance / pixelCount;
      const avgSharpness = (edgeVariance / pixelCount) * 4;
      const avgDiff = prevImageData ? (totalDiff / pixelCount) : 10;

      frameDataList.push({
        luminance: avgLuminance,
        sharpness: avgSharpness,
        frameDiff: avgDiff
      });

      prevImageData = imgData;

      if (onProgress) {
        onProgress(Math.round(((i + 1) / sampleTimes.length) * 100), `Próbkowanie klatki ${i + 1}/${sampleTimes.length}`);
      }
    }
  } catch (err) {
    console.warn(`Analiza ujęcia "${clip.name}" napotkała ograniczenie przeglądarki:`, err);
  } finally {
    video.src = '';
    video.load();
  }

  // Calculate scores from sampled frames
  if (frameDataList.length > 0) {
    const avgLum = frameDataList.reduce((acc, f) => acc + f.luminance, 0) / frameDataList.length;
    const avgSharp = frameDataList.reduce((acc, f) => acc + f.sharpness, 0) / frameDataList.length;
    const avgDiff = frameDataList.reduce((acc, f) => acc + f.frameDiff, 0) / frameDataList.length;

    // Exposure score (Optimal luminance is around 100-160)
    if (avgLum < 40) {
      exposureScore = Math.max(15, Math.round((avgLum / 40) * 50));
      issues.push('Niedoświetlone ujęcie (bardzo ciemno)');
    } else if (avgLum > 220) {
      exposureScore = Math.max(20, Math.round(100 - (avgLum - 220) * 2));
      issues.push('Prześwietlone ujęcie (zbyt jasno)');
    } else {
      exposureScore = Math.min(100, Math.round(75 + (1 - Math.abs(avgLum - 128) / 128) * 25));
    }

    // Sharpness score
    sharpnessScore = Math.min(100, Math.max(25, Math.round(avgSharp * 3.5)));
    if (sharpnessScore < 35) {
      issues.push('Niska ostrość / rozmycie');
    }

    // Stability score (Very high diff between sampled frames indicates heavy shaking or erratic camera)
    if (avgDiff > 45) {
      stabilityScore = Math.max(15, Math.round(100 - (avgDiff - 45) * 1.5));
      issues.push('Poruszone ujęcie / silne drgania kamery');
    } else if (avgDiff > 25) {
      stabilityScore = Math.round(85 - (avgDiff - 25));
    } else {
      stabilityScore = Math.min(100, Math.round(85 + (25 - avgDiff) * 0.6));
    }

    // Resolution bonus/penalty
    const pixels = clip.width * clip.height;
    if (pixels < 1280 * 720) {
      issues.push('Niska rozdzielczość (poniżej HD)');
      qualityScore = Math.round(qualityScore * 0.85);
    }
  }

  // Duration checks
  if (clip.duration < 1.5) {
    issues.push('Bardzo krótkie ujęcie (< 1.5s)');
  }

  // Calculate Overall Quality and Montage Potential
  qualityScore = Math.round((stabilityScore * 0.4) + (sharpnessScore * 0.3) + (exposureScore * 0.3));
  montagePotential = Math.round((qualityScore * 0.6) + (stabilityScore * 0.4));

  // Smart Cut: Recommend usable golden sub-range
  if (clip.duration > 10) {
    // Cut off the first 1.5s (camera button press) and last 1.5s
    recommendedStart = Math.min(2.0, clip.duration * 0.15);
    // Ideal wedding snippet length: 4 to 7 seconds
    const desiredSnippet = Math.min(6.5, clip.duration - recommendedStart - 1.5);
    recommendedEnd = recommendedStart + Math.max(3.0, desiredSnippet);
  } else if (clip.duration > 5) {
    recommendedStart = Math.min(0.5, clip.duration * 0.08);
    recommendedEnd = Math.max(recommendedStart + 3.0, clip.duration - 0.5);
  } else {
    recommendedStart = 0;
    recommendedEnd = clip.duration;
  }

  // Category determination
  let ratingCategory: ClipQualityRating = 'GOOD';
  if (issues.some(i => i.includes('Poruszone') || i.includes('Niedoświetlone') || i.includes('Prześwietlone')) || qualityScore < 45) {
    ratingCategory = 'PROBLEM';
  } else if (qualityScore >= 78 && stabilityScore >= 75) {
    ratingCategory = 'BEST';
  } else if (qualityScore >= 55) {
    ratingCategory = 'GOOD';
  } else {
    ratingCategory = 'NEUTRAL';
  }

  return {
    qualityScore,
    stabilityScore,
    sharpnessScore,
    exposureScore,
    audioQualityScore: clip.hasAudio ? 85 : 0,
    montagePotential,
    ratingCategory,
    recommendedStart: Number(recommendedStart.toFixed(2)),
    recommendedEnd: Number(recommendedEnd.toFixed(2)),
    issues,
    analyzedAt: new Date().toISOString()
  };
}

export interface SimilarityGroup {
  groupId: string;
  name: string;
  clipIds: string[];
  bestClipId: string;
  type: DuplicateStatus;
}

/**
 * Detects IDENTICAL, VERY SIMILAR, SEQUENCE, and POSSIBLE DUPLICATE clips.
 * Groups them together, ranks them, and identifies the best take for the editor.
 */
export function detectDuplicatesAndSimilarShots(
  clips: MediaClip[],
  analysisMap?: Map<string, ClipTechnicalAnalysis>
): {
  groups: SimilarityGroup[];
  clipAnalysisUpdates: Map<string, Partial<ClipTechnicalAnalysis>>;
} {
  const groups: SimilarityGroup[] = [];
  const clipAnalysisUpdates = new Map<string, Partial<ClipTechnicalAnalysis>>();
  const assigned = new Set<string>();

  for (let i = 0; i < clips.length; i++) {
    const a = clips[i];
    if (assigned.has(a.id)) continue;

    const similar: { clip: MediaClip; status: DuplicateStatus }[] = [];
    const timeA = new Date(a.capturedAt || a.createdAt).getTime();

    for (let j = i + 1; j < clips.length; j++) {
      const b = clips[j];
      if (assigned.has(b.id)) continue;

      const timeB = new Date(b.capturedAt || b.createdAt).getTime();
      const timeDiffSec = Math.abs(timeA - timeB) / 1000;
      const durDiffSec = Math.abs(a.duration - b.duration);

      // Check for IDENTICAL: exact size + exact duration (<0.05s)
      if (a.size > 0 && a.size === b.size && durDiffSec < 0.05) {
        similar.push({ clip: b, status: 'IDENTICAL' });
        continue;
      }

      // Check for VERY_SIMILAR: taken within 10 seconds + same orientation + duration within 2.5s
      if (timeDiffSec <= 10 && a.orientation === b.orientation && durDiffSec <= 2.5) {
        similar.push({ clip: b, status: 'VERY_SIMILAR' });
        continue;
      }

      // Check for SEQUENCE: taken within 45 seconds of each other in the same category
      if (timeDiffSec <= 45 && a.category === b.category && a.category !== 'unassigned') {
        similar.push({ clip: b, status: 'SEQUENCE' });
        continue;
      }

      // Check for POSSIBLE_DUPLICATE: same normalized base name (e.g. VID_001.mp4 and VID_001(1).mp4) or same duration (<0.1s) and resolution
      const normA = a.name.replace(/\(\d+\)|\scopy|\s\d+$/i, '').toLowerCase().trim();
      const normB = b.name.replace(/\(\d+\)|\scopy|\s\d+$/i, '').toLowerCase().trim();
      if ((normA === normB && normA.length > 3) || (durDiffSec < 0.08 && a.width === b.width && a.height === b.height && a.duration > 2)) {
        similar.push({ clip: b, status: 'POSSIBLE_DUPLICATE' });
        continue;
      }
    }

    if (similar.length > 0) {
      const groupId = `grp_${a.id}`;
      const allClipsInGroup = [a, ...similar.map(s => s.clip)];
      allClipsInGroup.forEach(c => assigned.add(c.id));

      // Find best take in group based on qualityScore, stability, and sharpness
      let bestClip = a;
      let bestScore = -1;

      for (const c of allClipsInGroup) {
        const an = analysisMap?.get(c.id) || c.analysis;
        const score = an ? (an.qualityScore * 0.45 + an.stabilityScore * 0.35 + an.sharpnessScore * 0.20) : 50;
        if (score > bestScore) {
          bestScore = score;
          bestClip = c;
        }
      }

      const groupType: DuplicateStatus = similar.some(s => s.status === 'IDENTICAL')
        ? 'IDENTICAL'
        : similar.some(s => s.status === 'VERY_SIMILAR')
        ? 'VERY_SIMILAR'
        : similar.some(s => s.status === 'SEQUENCE')
        ? 'SEQUENCE'
        : 'POSSIBLE_DUPLICATE';

      groups.push({
        groupId,
        name: `Seria (${allClipsInGroup.length}): ${a.name}`,
        clipIds: allClipsInGroup.map(c => c.id),
        bestClipId: bestClip.id,
        type: groupType
      });

      // Update analysis records
      allClipsInGroup.forEach(c => {
        const isBest = c.id === bestClip.id;
        clipAnalysisUpdates.set(c.id, {
          duplicateStatus: isBest ? 'NONE' : groupType,
          similarGroupId: groupId,
          bestInGroup: isBest
        });
      });
    }
  }

  return { groups, clipAnalysisUpdates };
}

/**
 * Runs full batch analysis across the library with real-time progress and abort control.
 */
export async function analyzeWholeLibrary(
  clips: MediaClip[],
  signal?: AbortSignal,
  onProgress?: (progressPercent: number, statusMessage: string) => void
): Promise<Map<string, ClipTechnicalAnalysis>> {
  const analysisMap = new Map<string, ClipTechnicalAnalysis>();
  const total = clips.length;

  if (total === 0) return analysisMap;

  for (let i = 0; i < total; i++) {
    if (signal?.aborted) {
      throw new Error('Operacja została przerwana');
    }

    const clip = clips[i];
    const percent = Math.round((i / total) * 88);
    if (onProgress) {
      onProgress(percent, `Analiza ujęcia [${i + 1}/${total}]: "${clip.name}"`);
    }

    const analysis = await analyzeClipVideo(clip, signal);
    analysisMap.set(clip.id, analysis);
  }

  if (onProgress) {
    onProgress(92, 'Wykrywanie duplikatów i grupowanie serii ujęć...');
  }

  // Run duplicate and similarity detection pass
  const { clipAnalysisUpdates } = detectDuplicatesAndSimilarShots(clips, analysisMap);
  clipAnalysisUpdates.forEach((updates, clipId) => {
    const existing = analysisMap.get(clipId);
    if (existing) {
      analysisMap.set(clipId, { ...existing, ...updates });
    }
  });

  if (onProgress) {
    onProgress(100, 'Zakończono analizę biblioteki i identyfikację ujęć.');
  }

  return analysisMap;
}
