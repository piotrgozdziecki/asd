import React, { useState, useEffect, useMemo } from 'react';
import { 
  Sparkles, 
  Wand2, 
  Loader2, 
  Check, 
  X, 
  Star, 
  Copy, 
  ListOrdered, 
  Film,
  AlertTriangle,
  Play,
  Pause,
  ArrowRight,
  ShieldCheck,
  Eye,
  Sliders
} from 'lucide-react';
import { 
  ProjectState, 
  TimelineItem, 
  MediaClip, 
  ClipCategory, 
  WeddingChapter 
} from '../../types/project';
import { analyzeWholeLibrary } from '../../core/director/videoAnalysisEngine';
import { resolveClipMediaUrl } from '../../core/media/mediaResolver';

interface AiWeddingDirectorModalProps {
  project: ProjectState;
  isOpen: boolean;
  onClose: () => void;
  onApplyProject: (updatedState: ProjectState) => void;
  onUpdateClipAnalysis?: (clipId: string, analysis: any) => void;
}

interface ProposedItem {
  id: string;
  clip: MediaClip;
  sourceStart: number;
  sourceEnd: number;
  duration: number;
  category: ClipCategory;
  reason: string;
  qualityTag: 'BEST' | 'GOOD' | 'NEUTRAL' | 'PROBLEM';
  isIncluded: boolean;
  duplicateStatus?: string;
  bestInGroup?: boolean;
  similarGroupId?: string;
  rhythmNotice?: string;
}

export function AiWeddingDirectorModal({
  project,
  isOpen,
  onClose,
  onApplyProject
}: AiWeddingDirectorModalProps) {
  const [step, setStep] = useState<'ANALYZE' | 'PREVIEW' | 'APPLY'>('ANALYZE');
  const [isAnalyzing, setIsAnalyzing] = useState<boolean>(false);
  const [analysisProgress, setAnalysisProgress] = useState<number>(0);
  const [statusMessage, setStatusMessage] = useState<string>('');
  const [abortController, setAbortController] = useState<AbortController | null>(null);

  // Director settings
  const [filterOutProblems, setFilterOutProblems] = useState<boolean>(true);
  const [applySmartCuts, setApplySmartCuts] = useState<boolean>(true);
  const [targetDurationMinutes, setTargetDurationMinutes] = useState<number>(12);

  // Proposals
  const [proposedItems, setProposedItems] = useState<ProposedItem[]>([]);
  const [previewClip, setPreviewClip] = useState<{ clip: MediaClip; url: string; start: number; end: number } | null>(null);

  if (!isOpen) return null;

  const handleStartAnalysis = async () => {
    const controller = new AbortController();
    setAbortController(controller);
    setIsAnalyzing(true);
    setAnalysisProgress(0);
    setStatusMessage('Rozpoczynanie zaawansowanej analizy biblioteki ślubnej...');

    try {
      // 1. Analyze video frames & duplicates
      const analysisMap = await analyzeWholeLibrary(
        project.mediaLibrary,
        controller.signal,
        (p, msg) => {
          setAnalysisProgress(p);
          setStatusMessage(msg);
        }
      );

      // Attach analyses to clips
      const analyzedClips: MediaClip[] = project.mediaLibrary.map(c => {
        const a = analysisMap.get(c.id);
        return a ? { ...c, analysis: a } : c;
      });

      // 2. Generate curated proposal
      setStatusMessage('Układanie narracji reżyserskiej i chronologii wydarzeń...');
      const proposals = generateDirectorProposals(analyzedClips, {
        filterOutProblems,
        applySmartCuts,
        targetDurationMinutes
      });

      setProposedItems(proposals);
      setStep('PREVIEW');
    } catch (err: any) {
      if (err?.message !== 'Operacja została przerwana') {
        alert('Błąd podczas analizy: ' + err?.message);
      }
    } finally {
      setIsAnalyzing(false);
      setAbortController(null);
    }
  };

  const handleCancelAnalysis = () => {
    if (abortController) {
      abortController.abort();
      setStatusMessage('Anulowano operację.');
    }
    setIsAnalyzing(false);
  };

  const toggleItemInclusion = (itemId: string) => {
    setProposedItems(prev => prev.map(item => 
      item.id === itemId ? { ...item, isIncluded: !item.isIncluded } : item
    ));
  };

  const handleApplyToTimeline = () => {
    const included = proposedItems.filter(p => p.isIncluded);
    if (included.length === 0) {
      alert('Zaznacz co najmniej jedno ujęcie do montażu.');
      return;
    }

    let currentTimelineTime = 0;
    const newTimelineItems: TimelineItem[] = included.map((p, index) => {
      const start = currentTimelineTime;
      currentTimelineTime += p.duration;

      return {
        id: `ti_director_${Date.now()}_${index}`,
        clipId: p.clip.id,
        trackId: 'v1',
        sourceStart: p.sourceStart,
        sourceEnd: p.sourceEnd,
        timelineStart: Number(start.toFixed(2)),
        duration: Number(p.duration.toFixed(2)),
        speed: 1,
        volume: 1,
        fadeIn: index === 0 ? 0.8 : 0,
        fadeOut: index === included.length - 1 ? 1.0 : 0,
        muted: false,
        scale: 1,
        rotation: 0,
        fitMode: 'fit',
        transitionIn: index === 0 ? 'fade' : 'cut',
        transitionDuration: 0.5
      };
    });

    const updatedState: ProjectState = {
      ...project,
      timelineItems: newTimelineItems,
      updatedAt: new Date().toISOString()
    };

    onApplyProject(updatedState);
    onClose();
  };

  const totalProposedDuration = useMemo(() => {
    return proposedItems
      .filter(p => p.isIncluded)
      .reduce((acc, p) => acc + p.duration, 0);
  }, [proposedItems]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/80 backdrop-blur-md animate-fadeIn">
      <div className="relative w-full max-w-4xl max-h-[92vh] flex flex-col bg-[#141412] border border-[#2A2824] rounded-2xl shadow-2xl overflow-hidden">
        
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#2A2824] bg-[#1A1916]">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-[#D4AF37]/20 text-[#D4AF37] border border-[#D4AF37]/30 shadow-inner">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold text-white tracking-wide flex items-center gap-2">
                AI WEDDING DIRECTOR
                <span className="text-[11px] font-semibold text-[#D4AF37] bg-[#D4AF37]/10 px-2.5 py-0.5 rounded-full border border-[#D4AF37]/30">
                  Inteligentny Asystent
                </span>
              </h2>
              <p className="text-xs text-[#AAA69D]">
                Analiza techniczna i montażowa • PROPOZYCJA → PODGLĄD → ZASTOSUJ
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 text-[#888] hover:text-white rounded-lg hover:bg-[#222] transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar">
          
          {/* STEP 1: ANALYZE & CONFIGURE */}
          {step === 'ANALYZE' && (
            <div className="space-y-6">
              <div className="p-4 rounded-xl bg-[#1B1A17] border border-[#2A2824] text-xs text-[#DDD] space-y-2">
                <div className="flex items-center gap-2 text-sm font-semibold text-[#D4AF37]">
                  <Wand2 className="w-4 h-4" />
                  <span>Jak działa Asystent Reżysera?</span>
                </div>
                <p className="text-[#AAA69D] leading-relaxed">
                  Asystent bada klatki filmów w pamięci podręcznej przeglądarki pod kątem stabilności, ostrości,
                  oświetlenia oraz duplikatów. Na tej podstawie układa optymalną sekwencję wesela,
                  eliminując ujęcia poruszone i serie niemal identycznych powtórek.
                </p>
                <div className="flex items-center gap-2 text-emerald-400 font-medium pt-1">
                  <ShieldCheck className="w-4 h-4 shrink-0" />
                  <span>Zasada bezpieczeństwa: Żadne oryginalne pliki wideo z biblioteki nigdy nie zostaną usunięte.</span>
                </div>
              </div>

              {/* Director Settings */}
              <div className="space-y-3">
                <h3 className="text-xs font-bold text-[#D4AF37] uppercase tracking-wider flex items-center gap-2">
                  <Sliders className="w-3.5 h-3.5" /> Preferencje Reżyserskie
                </h3>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                  <label className="flex items-start gap-3 p-3 rounded-xl bg-[#181816] border border-[#282622] cursor-pointer hover:border-[#D4AF37]/50 transition-all">
                    <input
                      type="checkbox"
                      checked={filterOutProblems}
                      onChange={(e) => setFilterOutProblems(e.target.checked)}
                      className="mt-0.5 accent-[#D4AF37]"
                    />
                    <div>
                      <div className="font-semibold text-white">Odrzucaj bardzo poruszone i ciemne klipy</div>
                      <div className="text-[11px] text-[#888]">Eliminuje materiały o niskiej stabilności (&lt; 40%)</div>
                    </div>
                  </label>

                  <label className="flex items-start gap-3 p-3 rounded-xl bg-[#181816] border border-[#282622] cursor-pointer hover:border-[#D4AF37]/50 transition-all">
                    <input
                      type="checkbox"
                      checked={applySmartCuts}
                      onChange={(e) => setApplySmartCuts(e.target.checked)}
                      className="mt-0.5 accent-[#D4AF37]"
                    />
                    <div>
                      <div className="font-semibold text-white">Smart Cut (Najlepsze fragmenty)</div>
                      <div className="text-[11px] text-[#888]">Wycina najstabilniejsze 4-8s z długich nagrań</div>
                    </div>
                  </label>

                  <div className="p-3 rounded-xl bg-[#181816] border border-[#282622] flex flex-col justify-between">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-white">Docelowy czas filmu:</span>
                      <span className="font-bold text-[#D4AF37]">{targetDurationMinutes} min</span>
                    </div>
                    <input
                      type="range"
                      min="3"
                      max="30"
                      step="1"
                      value={targetDurationMinutes}
                      onChange={(e) => setTargetDurationMinutes(Number(e.target.value))}
                      className="w-full mt-2 accent-[#D4AF37]"
                    />
                  </div>
                </div>
              </div>

              {/* Action / Progress */}
              {isAnalyzing ? (
                <div className="p-4 rounded-xl bg-[#161614] border border-[#2A2824] space-y-3">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-[#DDD] font-medium flex items-center gap-2">
                      <Loader2 className="w-4 h-4 animate-spin text-[#D4AF37]" />
                      {statusMessage}
                    </span>
                    <span className="font-bold text-[#D4AF37]">{analysisProgress}%</span>
                  </div>
                  <div className="w-full h-2 bg-[#222] rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-gradient-to-r from-[#D4AF37] to-amber-300 transition-all duration-300"
                      style={{ width: `${analysisProgress}%` }}
                    />
                  </div>
                  <button
                    onClick={handleCancelAnalysis}
                    className="px-3 py-1.5 rounded-lg bg-red-950/60 border border-red-500/40 text-red-300 text-xs font-medium hover:bg-red-900/60 cursor-pointer"
                  >
                    Anuluj analizę
                  </button>
                </div>
              ) : (
                <div className="flex justify-center pt-4">
                  <button
                    onClick={handleStartAnalysis}
                    className="flex items-center gap-2 px-6 py-3 rounded-xl bg-gradient-to-r from-[#D4AF37] to-amber-500 text-black font-bold text-sm shadow-lg hover:brightness-110 active:scale-95 transition-all cursor-pointer"
                  >
                    <Sparkles className="w-4 h-4" />
                    <span>Uruchom Asystenta Reżysera (Generuj Propozycję)</span>
                  </button>
                </div>
              )}
            </div>
          )}

          {/* STEP 2: PREVIEW & CURATE */}
          {step === 'PREVIEW' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between p-3 rounded-xl bg-[#1A1916] border border-[#2A2824]">
                <div className="text-xs space-y-0.5">
                  <div className="font-bold text-white flex items-center gap-2">
                    <span>Zaproponowano: {proposedItems.filter(p => p.isIncluded).length} ujęć</span>
                    <span className="text-[#D4AF37]">
                      (Łączny czas: {Math.floor(totalProposedDuration / 60)}m {Math.round(totalProposedDuration % 60)}s)
                    </span>
                  </div>
                  <p className="text-[#888]">
                    Przejrzyj ujęcia przed zatwierdzeniem. Możesz odznaczyć dowolny fragment.
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setStep('ANALYZE')}
                    className="px-3 py-1.5 rounded-lg border border-[#333] bg-[#181818] text-[#AAA] hover:text-white text-xs cursor-pointer"
                  >
                    Wróć do ustawień
                  </button>
                  <button
                    onClick={handleApplyToTimeline}
                    className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-[#D4AF37] text-black font-bold text-xs hover:bg-[#E5C158] cursor-pointer shadow"
                  >
                    <Check className="w-4 h-4" />
                    <span>Zastosuj do Osi Czasu</span>
                  </button>
                </div>
              </div>

              {/* List of proposed clips */}
              <div className="space-y-2 max-h-[50vh] overflow-y-auto custom-scrollbar pr-1">
                {proposedItems.map((item, index) => (
                  <div 
                    key={item.id}
                    className={`flex items-center gap-3 p-3 rounded-xl border transition-all ${
                      item.isIncluded 
                        ? 'bg-[#181715] border-[#2C2923]' 
                        : 'bg-[#121211] border-[#1E1E1C] opacity-50'
                    }`}
                  >
                    {/* Checkbox */}
                    <input
                      type="checkbox"
                      checked={item.isIncluded}
                      onChange={() => toggleItemInclusion(item.id)}
                      className="accent-[#D4AF37] w-4 h-4 cursor-pointer shrink-0"
                    />

                    {/* Sequence number */}
                    <span className="text-xs font-mono font-bold text-[#666] w-5 text-center shrink-0">
                      {index + 1}
                    </span>

                    {/* Thumbnail */}
                    <div className="w-16 h-10 rounded bg-[#222] overflow-hidden shrink-0 border border-[#333] relative">
                      {item.clip.thumbnailUrl ? (
                        <img 
                          src={item.clip.thumbnailUrl} 
                          alt="" 
                          className="w-full h-full object-cover" 
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-[10px] text-[#555]">
                          <Film className="w-4 h-4" />
                        </div>
                      )}
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-xs font-bold text-white truncate">
                          {item.clip.name}
                        </span>

                        {/* Chapter Tag */}
                        {item.category && item.category !== 'unassigned' && (
                          <span className="text-[10px] font-semibold text-[#D4AF37] bg-[#D4AF37]/10 px-1.5 py-0.2 rounded border border-[#D4AF37]/20">
                            {item.category}
                          </span>
                        )}
                        
                        {/* Rating Badge */}
                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                          item.qualityTag === 'BEST' ? 'bg-emerald-950 text-emerald-400 border border-emerald-500/30' :
                          item.qualityTag === 'GOOD' ? 'bg-blue-950 text-blue-400 border border-blue-500/30' :
                          item.qualityTag === 'PROBLEM' ? 'bg-red-950 text-red-400 border border-red-500/30' :
                          'bg-[#222] text-[#AAA]'
                        }`}>
                          {item.qualityTag} {item.clip.analysis?.qualityScore ? `(${item.clip.analysis.qualityScore})` : ''}
                        </span>

                        {/* Best in group badge */}
                        {item.bestInGroup && (
                          <span className="flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30">
                            <Star className="w-3 h-3 fill-current" />
                            Główne ujęcie z serii
                          </span>
                        )}

                        {/* Duplicate badge */}
                        {item.duplicateStatus && item.duplicateStatus !== 'NONE' && (
                          <span className="flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded bg-purple-950/60 text-purple-300 border border-purple-500/30">
                            <Copy className="w-3 h-3" />
                            {item.duplicateStatus}
                          </span>
                        )}
                      </div>

                      <div className="flex flex-wrap items-center gap-2 text-[11px] text-[#888] mt-0.5">
                        <span className="font-mono text-[#AAA]">
                          {item.sourceStart.toFixed(1)}s - {item.sourceEnd.toFixed(1)}s ({item.duration.toFixed(1)}s)
                        </span>
                        <span>•</span>
                        <span className="text-[#AAA69D] truncate">{item.reason}</span>
                        {item.rhythmNotice && (
                          <>
                            <span>•</span>
                            <span className="text-cyan-400/90 italic">{item.rhythmNotice}</span>
                          </>
                        )}
                      </div>
                    </div>

                    {/* Preview Button */}
                    <button
                      onClick={async () => {
                        const url = await resolveClipMediaUrl(item.clip);
                        if (url) {
                          setPreviewClip({
                            clip: item.clip,
                            url,
                            start: item.sourceStart,
                            end: item.sourceEnd
                          });
                        }
                      }}
                      className="p-1.5 rounded-lg bg-[#222] hover:bg-[#333] text-[#AAA] hover:text-white cursor-pointer shrink-0"
                      title="Podgląd fragmentu"
                    >
                      <Eye className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

        </div>

        {/* Video preview popup inside director */}
        {previewClip && (
          <div className="absolute inset-0 z-30 bg-black/90 flex flex-col items-center justify-center p-6">
            <div className="relative w-full max-w-lg bg-[#141412] border border-[#2A2824] rounded-xl overflow-hidden shadow-2xl">
              <div className="flex items-center justify-between p-3 border-b border-[#2A2824] bg-[#1A1916]">
                <span className="text-xs font-bold text-white truncate">{previewClip.clip.name}</span>
                <button
                  onClick={() => setPreviewClip(null)}
                  className="p-1 rounded text-[#888] hover:text-white"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <video
                src={previewClip.url}
                autoPlay
                controls
                className="w-full max-h-72 bg-black object-contain"
                onLoadedMetadata={(e) => {
                  (e.target as HTMLVideoElement).currentTime = previewClip.start;
                }}
              />
              <div className="p-3 text-[11px] text-[#888] text-center bg-[#1A1916]">
                Podgląd sugerowanego fragmentu: {previewClip.start.toFixed(1)}s - {previewClip.end.toFixed(1)}s
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}

const CHAPTER_ORDER: Record<string, number> = {
  'opening': 1,
  'preparations': 2,
  'ceremony': 3,
  'congratulations': 4,
  'wishes': 5,
  'first_dance': 6,
  'toast': 7,
  'party': 8,
  'family': 9,
  'guests': 10,
  'cake': 11,
  'games': 12,
  'outdoor': 13,
  'climax': 14,
  'ending': 15,
  'unassigned': 99
};

/**
 * Advanced heuristic rules to generate a wedding director proposal.
 * Preserves wedding narrative flow, pacing rhythm, smart cuts, and duplicate prevention.
 */
function generateDirectorProposals(
  clips: MediaClip[],
  options: {
    filterOutProblems: boolean;
    applySmartCuts: boolean;
    targetDurationMinutes: number;
  }
): ProposedItem[] {
  // Sort by chapter sequence first (if categorized), then chronologically
  const sorted = [...clips].sort((a, b) => {
    const orderA = CHAPTER_ORDER[a.category] ?? 99;
    const orderB = CHAPTER_ORDER[b.category] ?? 99;

    if (orderA !== orderB && orderA !== 99 && orderB !== 99) {
      return orderA - orderB;
    }

    const timeA = new Date(a.capturedAt || a.createdAt).getTime();
    const timeB = new Date(b.capturedAt || b.createdAt).getTime();
    return timeA - timeB;
  });

  const proposals: ProposedItem[] = [];
  let consecutiveSameCat = 0;
  let lastCat = '';

  for (const clip of sorted) {
    const analysis = clip.analysis;
    const isProblem = analysis?.ratingCategory === 'PROBLEM';

    // Filter out severe problem clips if requested
    if (options.filterOutProblems && isProblem) {
      continue;
    }

    // Determine timing (Smart Cut)
    let sourceStart = 0;
    let sourceEnd = clip.duration;
    let reason = 'Wysoki potencjał montażowy';

    if (options.applySmartCuts && analysis) {
      sourceStart = analysis.recommendedStart;
      sourceEnd = analysis.recommendedEnd;
      reason = `Stabilność: ${analysis.stabilityScore}%, Ostrość: ${analysis.sharpnessScore}%`;
    } else if (options.applySmartCuts && clip.duration > 8) {
      // General smart cut fallback for clips without full analysis
      sourceStart = Math.min(1.5, clip.duration * 0.1);
      sourceEnd = Math.min(clip.duration - 0.5, sourceStart + 6.0);
      reason = `Smart Cut: dynamiczne okno 6.0s`;
    }

    const duration = Math.max(0.5, sourceEnd - sourceStart);

    // Duplicate detection & inclusion decision
    const isDuplicate = Boolean(
      (analysis?.duplicateStatus && analysis.duplicateStatus !== 'NONE') ||
      (clip.duplicateStatus && clip.duplicateStatus !== 'NONE')
    );
    const isBestInGroup = Boolean(analysis?.bestInGroup || clip.bestInGroup);

    let isIncluded = true;
    let duplicateLabel = analysis?.duplicateStatus || clip.duplicateStatus;

    if (isDuplicate && !isBestInGroup) {
      // Exclude secondary takes by default to prevent repetitive cuts
      isIncluded = false;
      reason = `Powtórzenie z serii (${duplicateLabel}) — wybrano lepsze ujęcie`;
    } else if (isBestInGroup) {
      reason = `Główne ujęcie z serii (${analysis?.qualityScore || 85} pkt)`;
    }

    // Rhythm and pacing check
    let rhythmNotice: string | undefined;
    if (clip.category === lastCat && clip.category !== 'unassigned') {
      consecutiveSameCat++;
      if (consecutiveSameCat >= 3) {
        rhythmNotice = 'Rytm: zalecany montaż dynamiczny / przebitka';
      }
    } else {
      consecutiveSameCat = 1;
      lastCat = clip.category;
    }

    proposals.push({
      id: `prop_${clip.id}`,
      clip,
      sourceStart,
      sourceEnd,
      duration,
      category: clip.category,
      reason,
      qualityTag: analysis?.ratingCategory || (clip.duration > 3 ? 'GOOD' : 'NEUTRAL'),
      isIncluded,
      duplicateStatus: duplicateLabel,
      bestInGroup: isBestInGroup,
      similarGroupId: analysis?.similarGroupId || clip.similarGroupId,
      rhythmNotice
    });
  }

  return proposals;
}
