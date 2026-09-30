import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  Sparkles, 
  Film, 
  Clock, 
  Check, 
  X, 
  Play, 
  ArrowRight, 
  Layers, 
  Sliders, 
  Calendar, 
  Heart, 
  Music, 
  Wand2, 
  RotateCw, 
  CheckCircle2, 
  ChevronDown, 
  ChevronUp, 
  Scissors, 
  Type as TypeIcon, 
  Download,
  AlertCircle,
  FileVideo,
  Palette,
  Bookmark,
  Tv,
  CheckSquare,
  Square
} from 'lucide-react';
import type { MediaClip, ClipCategory, ProjectState, TimelineItem, TextLayer, WeddingChapter, LookPreset } from '../../types/project';
import { useStudioToast } from '../common/ToastContext';

export interface DirectorMergeOptions {
  includeIntroTitleCard: boolean;
  introTitle: string;
  introSubtitle: string;
  introDuration: number;
  introStyle: 'liturgical' | 'cinematic' | 'elegant' | 'classic';
  includeOutroTitleCard: boolean;
  outroTitle: string;
  outroSubtitle: string;
  outroDuration: number;
  includeSceneTitles: boolean;
  includeSubtitles: boolean;
  applyTransitions: boolean;
  applySmartTrim: boolean;
  colorGrade: LookPreset;
  generateChapters: boolean;
  includeSoundtrack: boolean;
  soundtrackPresetId?: string;
  targetTab: 'montage' | 'export';
}

export interface SequencedItem {
  clipId: string;
  clip: MediaClip;
  targetOrder: number;
  smartTitle: string;
  subtitleCaption: string;
  category: ClipCategory;
  transition: string;
  trimStart: number;
  trimEnd: number;
  directorReason: string;
  includeInTimeline: boolean;
}

interface AiChronologicalMergeModalProps {
  isOpen: boolean;
  onClose: () => void;
  clips: MediaClip[];
  onApplyToTimeline: (
    items: {
      clip: MediaClip;
      smartTitle: string;
      subtitleCaption: string;
      category: ClipCategory;
      transition: string;
      trimStart: number;
      trimEnd: number;
    }[],
    options?: DirectorMergeOptions
  ) => void;
  onApplyCaptionsToLibrary: (updates: { id: string; name: string; category: ClipCategory; comment: string; tags: string[] }[]) => void;
  onOpenQuickMerge?: () => void;
}

const CATEGORY_LABELS: Record<string, { label: string; color: string; icon: string }> = {
  preparations: { label: 'Przygotowania', color: 'bg-amber-500/20 text-amber-300 border-amber-500/40', icon: '💍' },
  ceremony: { label: 'Ceremonia i Przysięga', color: 'bg-rose-500/20 text-rose-300 border-rose-500/40', icon: '⛪' },
  congratulations: { label: 'Życzenia od gości', color: 'bg-purple-500/20 text-purple-300 border-purple-500/40', icon: '🥂' },
  first_dance: { label: 'Pierwszy Taniec', color: 'bg-yellow-500/20 text-yellow-300 border-yellow-500/40', icon: '💃' },
  toast: { label: 'Toasty i Przemowy', color: 'bg-orange-500/20 text-orange-300 border-orange-500/40', icon: '🍾' },
  party: { label: 'Zabawa Weselna', color: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40', icon: '🎉' },
  cake: { label: 'Tort Weselny', color: 'bg-pink-500/20 text-pink-300 border-pink-500/40', icon: '🎂' },
  outdoor: { label: 'Plener / Sesja', color: 'bg-sky-500/20 text-sky-300 border-sky-500/40', icon: '🌳' },
  ending: { label: 'Zimne Ognie / Finał', color: 'bg-indigo-500/20 text-indigo-300 border-indigo-500/40', icon: '✨' },
  unassigned: { label: 'Pozostałe ujęcie', color: 'bg-stone-500/20 text-stone-300 border-stone-500/40', icon: '🎬' }
};

export function AiChronologicalMergeModal({
  isOpen,
  onClose,
  clips,
  onApplyToTimeline,
  onApplyCaptionsToLibrary,
  onOpenQuickMerge
}: AiChronologicalMergeModalProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [pacing, setPacing] = useState<'cinematic' | 'dynamic' | 'emotional'>('cinematic');
  const [captionStyle, setCaptionStyle] = useState<'cinematic_poetic' | 'elegant_classic' | 'modern_short'>('cinematic_poetic');
  const [sequencedItems, setSequencedItems] = useState<SequencedItem[]>([]);
  const [storyConcept, setStoryConcept] = useState<string>('');
  const [musicSuggestion, setMusicSuggestion] = useState<string>('');
  const [coupleNames, setCoupleNames] = useState<string>('Joanna & Piotr');
  const [weddingDate, setWeddingDate] = useState<string>('14.09.2024');
  const [activeTab, setActiveTab] = useState<'sequence' | 'options' | 'captions'>('sequence');
  const [previewClip, setPreviewClip] = useState<{ url: string; title: string; caption: string } | null>(null);

  // Director Options (Wybrane Dodatki - Wszystkie aktywne od razu w 1 przycisku!)
  const [includeIntroTitleCard, setIncludeIntroTitleCard] = useState<boolean>(true);
  const [introTitle, setIntroTitle] = useState<string>('ŚLUB JOANNY I PIOTRA');
  const [introSubtitle, setIntroSubtitle] = useState<string>('14.09.2024 • Sakrament Małżeństwa');
  const [introDuration, setIntroDuration] = useState<number>(3.5);
  const [introStyle, setIntroStyle] = useState<'liturgical' | 'cinematic' | 'elegant' | 'classic'>('liturgical');
  const [includeSceneTitles, setIncludeSceneTitles] = useState<boolean>(true);
  const [includeOutroTitleCard, setIncludeOutroTitleCard] = useState<boolean>(true);
  const [outroTitle, setOutroTitle] = useState<string>('PODZIĘKOWANIA');
  const [outroSubtitle, setOutroSubtitle] = useState<string>(
    'Z całego serca dziękujemy Rodzicom za dar życia i miłość, Świadkom za pomoc i wsparcie, oraz wszystkim wspaniałym Gościom za modlitwę, radość i wspólne świętowanie. Joanna & Piotr • 14.09.2024'
  );
  const [outroDuration, setOutroDuration] = useState<number>(4.0);
  const [includeSubtitles, setIncludeSubtitles] = useState<boolean>(true);
  const [applyTransitions, setApplyTransitions] = useState<boolean>(true);
  const [applySmartTrim, setApplySmartTrim] = useState<boolean>(true);
  const [colorGrade, setColorGrade] = useState<LookPreset>('golden_hour');
  const [generateChapters, setGenerateChapters] = useState<boolean>(true);
  const [includeSoundtrack, setIncludeSoundtrack] = useState<boolean>(true);
  const [soundtrackPresetId, setSoundtrackPresetId] = useState<string>('altar_procession');

  const prevClipsIdsRef = useRef<string>('');
  const toast = useStudioToast();

  // Sync intro and outro fields with coupleNames and weddingDate
  useEffect(() => {
    if (coupleNames) {
      setIntroTitle(`ŚLUB ${coupleNames.toUpperCase()}`);
      setIntroSubtitle(weddingDate ? `${weddingDate} • Sakrament Małżeństwa` : 'Niezapomniane Chwile');
      setOutroSubtitle(
        `Z całego serca dziękujemy Rodzicom za dar życia i miłość, Świadkom za pomoc i wsparcie, oraz wszystkim wspaniałym Gościom za modlitwę, radość i wspólne świętowanie. ${coupleNames}${weddingDate ? ` • ${weddingDate}` : ''}`
      );
    }
  }, [coupleNames, weddingDate]);

  const handleStartAnalysis = async () => {
    if (clips.length === 0) return;
    setIsLoading(true);

    try {
      const abortController = new AbortController();
      const timeoutId = setTimeout(() => abortController.abort(), 120000); // 120s timeout for AI analysis

      const response = await fetch('/api/smart-chronological-sequencing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: abortController.signal,
        body: JSON.stringify({
          clips: clips.map(c => ({
            id: c.id,
            name: String(c.name || 'Bez nazwy'),
            duration: typeof c.duration === 'number' ? c.duration : 0,
            capturedAt: c.capturedAt || c.createdAt || '',
            tags: Array.isArray(c.tags) ? [...c.tags] : [],
            comment: String(c.comment || '')
          })),
          pacing,
          coupleNames: String(coupleNames || 'Młoda Para'),
          weddingDate: String(weddingDate || '')
        })
      });

      clearTimeout(timeoutId);

      let data: any = null;
      const contentType = response.headers.get('content-type') || '';
      
      if (!response.ok) {
        const errorText = await response.text().catch(() => 'No error details');
        console.error('[MergeModal] API Error:', response.status, errorText);
        throw new Error(`Błąd serwera (${response.status}): ${errorText.substring(0, 100)}`);
      }

      if (contentType.includes('application/json')) {
        data = await response.json().catch((e) => {
          console.error('[MergeModal] JSON Parse Error:', e);
          return null;
        });
      } else {
        const rawText = await response.text().catch(() => '');
        console.warn('[MergeModal] Otrzymano odpowiedź nie będącą JSON (Content-Type:', contentType, '):', rawText.substring(0, 200));
        try {
          data = JSON.parse(rawText);
        } catch {
          throw new Error('Otrzymano nieprawidłowy format danych z serwera (wymagany JSON).');
        }
      }

      if (!data) {
        throw new Error('Serwer zwrócił pustą odpowiedź.');
      }

      setStoryConcept(data.storyConcept || 'Inteligentnie skomponowana chronologia dnia ślubu.');
      setMusicSuggestion(data.musicSuggestion || 'Akustyczny fortepian i ciepłe smyczki (Master Mix)');

      const clipMap = new Map<string, MediaClip>();
      clips.forEach(c => clipMap.set(c.id, c));

      const rawSeq = data.orderedSequence || [];
      const formatted: SequencedItem[] = [];

      rawSeq.forEach((item: any, idx: number) => {
        const foundClip = clipMap.get(item.clipId);
        if (foundClip) {
          formatted.push({
            clipId: item.clipId,
            clip: foundClip,
            targetOrder: item.targetOrder || (idx + 1),
            smartTitle: item.smartTitle || foundClip.name,
            subtitleCaption: item.subtitleCaption || `Pamiątkowa chwila – ${foundClip.name}`,
            category: (item.category as ClipCategory) || foundClip.category || 'unassigned',
            transition: item.transition || (idx === 0 ? 'dip_black' : 'dissolve'),
            trimStart: typeof item.trimStart === 'number' ? item.trimStart : (applySmartTrim ? 0.5 : 0),
            trimEnd: typeof item.trimEnd === 'number' ? item.trimEnd : Math.max(0.5, foundClip.duration - (applySmartTrim ? 0.5 : 0)),
            directorReason: item.directorReason || 'Płynne dopasowanie do osi czasu.',
            includeInTimeline: true
          });
        }
      });

      // Include any clips that were not part of response at the end
      clips.forEach((c) => {
        if (!formatted.some(f => f.clipId === c.id)) {
          formatted.push({
            clipId: c.id,
            clip: c,
            targetOrder: formatted.length + 1,
            smartTitle: c.name,
            subtitleCaption: `Ujęcie z wesela – ${c.name}`,
            category: c.category || 'unassigned',
            transition: 'dissolve',
            trimStart: 0,
            trimEnd: c.duration,
            directorReason: 'Dodano z zaznaczenia.',
            includeInTimeline: true
          });
        }
      });

      setSequencedItems(formatted);
      toast.showSuccess(`✨ AI ułożyło ${formatted.length} ujęć w spójną chronologię z dodatkami!`);
    } catch (err: any) {
      console.error('Sequencing error:', err);
      // Fallback: sort chronologically by date
      const sorted = [...clips].sort((a, b) => {
        const tA = new Date(a.capturedAt || a.createdAt || 0).getTime();
        const tB = new Date(b.capturedAt || b.createdAt || 0).getTime();
        return tA - tB;
      });

      const fallbackSeq: SequencedItem[] = sorted.map((c, i) => ({
        clipId: c.id,
        clip: c,
        targetOrder: i + 1,
        smartTitle: `Scena ${i + 1}: ${c.name}`,
        subtitleCaption: `Niezapomniana chwila – ${c.name}`,
        category: c.category || 'unassigned',
        transition: i === 0 ? 'dip_black' : 'dissolve',
        trimStart: applySmartTrim ? 0.5 : 0,
        trimEnd: Math.max(0.5, c.duration - (applySmartTrim ? 0.5 : 0)),
        directorReason: 'Dopasowano chronologicznie według czasu nagrania.',
        includeInTimeline: true
      }));

      setSequencedItems(fallbackSeq);
      setStoryConcept('Chronologiczna narracja ułożona według czasu nagrania.');
      setMusicSuggestion('Spokojna kompozycja fortepianowa z narastającym finałem');
      toast.showSuccess('Ułożono chronologicznie ujęcia według osi czasu.');
    } finally {
      setIsLoading(false);
    }
  };

  // Re-trigger analysis when modal opens or clips list changes
  useEffect(() => {
    if (!isOpen || clips.length === 0) return;
    const currentClipsKey = clips.map(c => c.id).sort().join(',');
    if (currentClipsKey !== prevClipsIdsRef.current) {
      prevClipsIdsRef.current = currentClipsKey;
      handleStartAnalysis();
    }
  }, [isOpen, clips]);

  const handleUpdateItem = (clipId: string, updates: Partial<SequencedItem>) => {
    setSequencedItems(prev => prev.map(item => item.clipId === clipId ? { ...item, ...updates } : item));
  };

  const handleMoveOrder = (index: number, direction: 'up' | 'down') => {
    const targetIdx = direction === 'up' ? index - 1 : index + 1;
    if (targetIdx < 0 || targetIdx >= sequencedItems.length) return;

    const copy = [...sequencedItems];
    const temp = copy[index];
    copy[index] = copy[targetIdx];
    copy[targetIdx] = temp;

    // Recalculate targetOrder
    copy.forEach((item, i) => {
      item.targetOrder = i + 1;
    });

    setSequencedItems(copy);
  };

  const buildDirectorOptions = (targetTab: 'montage' | 'export'): DirectorMergeOptions => ({
    includeIntroTitleCard,
    introTitle,
    introSubtitle,
    introDuration,
    introStyle,
    includeOutroTitleCard,
    outroTitle,
    outroSubtitle,
    outroDuration,
    includeSceneTitles,
    includeSubtitles,
    applyTransitions,
    applySmartTrim,
    colorGrade,
    generateChapters,
    includeSoundtrack,
    soundtrackPresetId,
    targetTab
  });

  const handleApplyAllDirectorOptionsAtOnce = (targetTab: 'montage' | 'export' = 'montage') => {
    const active = sequencedItems.filter(i => i.includeInTimeline);
    if (active.length === 0) {
      toast.showWarning('Wybierz przynajmniej jedno ujęcie do filmu.');
      return;
    }

    const options: DirectorMergeOptions = {
      includeIntroTitleCard: true,
      introTitle: introTitle || 'ŚLUB JOANNY I PIOTRA',
      introSubtitle: introSubtitle || '14.09.2024 • Sakrament Małżeństwa',
      introDuration: 3.5,
      introStyle: 'liturgical',
      includeOutroTitleCard: true,
      outroTitle: outroTitle || 'PODZIĘKOWANIA',
      outroSubtitle: outroSubtitle || 'Z całego serca dziękujemy Rodzicom za dar życia i miłość, Świadkom za pomoc i wsparcie, oraz wszystkim wspaniałym Gościom za modlitwę, radość i wspólne świętowanie. Joanna & Piotr • 14.09.2024',
      outroDuration: 4.0,
      includeSceneTitles: true,
      includeSubtitles: true,
      applyTransitions: true,
      applySmartTrim: true,
      colorGrade: 'golden_hour',
      generateChapters: true,
      includeSoundtrack: true,
      soundtrackPresetId: 'altar_procession',
      targetTab
    };

    onApplyToTimeline(active.map(i => ({
      clip: i.clip,
      smartTitle: i.smartTitle,
      subtitleCaption: i.subtitleCaption,
      category: i.category,
      transition: 'dissolve',
      trimStart: applySmartTrim ? i.trimStart : 0,
      trimEnd: applySmartTrim ? i.trimEnd : i.clip.duration
    })), options);

    toast.showSuccess(`✨ Reżyser AI zastosował wszystkie opcje (Intro Liturgiczne, Karty Scen, Podziękowania i Muzyka)!`);
    onClose();
  };

  const handleApplyToTimeline = () => {
    const active = sequencedItems.filter(i => i.includeInTimeline);
    if (active.length === 0) {
      toast.showWarning('Wybierz przynajmniej jedno ujęcie do dodania na oś czasu.');
      return;
    }

    const options = buildDirectorOptions('montage');

    onApplyToTimeline(active.map(i => ({
      clip: i.clip,
      smartTitle: i.smartTitle,
      subtitleCaption: i.subtitleCaption,
      category: i.category,
      transition: applyTransitions ? i.transition : 'cut',
      trimStart: applySmartTrim ? i.trimStart : 0,
      trimEnd: applySmartTrim ? i.trimEnd : i.clip.duration
    })), options);

    toast.showSuccess(`🎬 Zbudowano Oś Czasu z ${active.length} ujęć z wybranymi dodatkami!`);
    onClose();
  };

  const handleMergeAndExportDirectly = () => {
    const active = sequencedItems.filter(i => i.includeInTimeline);
    if (active.length === 0) {
      toast.showWarning('Wybierz przynajmniej jedno ujęcie do filmu.');
      return;
    }

    const options = buildDirectorOptions('export');

    onApplyToTimeline(active.map(i => ({
      clip: i.clip,
      smartTitle: i.smartTitle,
      subtitleCaption: i.subtitleCaption,
      category: i.category,
      transition: applyTransitions ? i.transition : 'cut',
      trimStart: applySmartTrim ? i.trimStart : 0,
      trimEnd: applySmartTrim ? i.trimEnd : i.clip.duration
    })), options);

    toast.showSuccess(`⚡ Scalono ${active.length} filmów z dodatkami. Przechodzę do okna eksportu!`);
    onClose();
  };

  const handleApplyCaptions = () => {
    onApplyCaptionsToLibrary(sequencedItems.map(i => ({
      id: i.clipId,
      name: i.smartTitle,
      category: i.category,
      comment: i.subtitleCaption,
      tags: [i.category, 'ai_chronological']
    })));

    toast.showSuccess(`🏷️ Zaktualizowano tytuły, podpisy i kategorie ${sequencedItems.length} ujęć w bibliotece!`);
  };

  const totalDuration = useMemo(() => {
    const clipsDur = sequencedItems
      .filter(i => i.includeInTimeline)
      .reduce((acc, i) => {
        const start = applySmartTrim ? i.trimStart : 0;
        const end = applySmartTrim ? i.trimEnd : i.clip.duration;
        return acc + Math.max(0, end - start);
      }, 0);
    const introDur = includeIntroTitleCard ? introDuration : 0;
    return clipsDur + introDur;
  }, [sequencedItems, applySmartTrim, includeIntroTitleCard, introDuration]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-black/85 backdrop-blur-md animate-fadeIn">
      <div className="relative w-full max-w-5xl max-h-[94vh] flex flex-col bg-[#14120D] border border-[#D4AF37]/50 rounded-2xl shadow-[0_24px_64px_rgba(0,0,0,0.95)] overflow-hidden">
        
        {/* Header */}
        <div className="px-5 py-4 border-b border-[#2D261A] bg-gradient-to-r from-[#1A160F] via-[#241E13] to-[#16130C] flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#2D2412] border border-[#D4AF37]/50 flex items-center justify-center shadow-[0_0_15px_rgba(212,175,55,0.3)] shrink-0">
              <Sparkles className="w-5 h-5 text-[#FDE047] animate-pulse" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-cinematic font-bold text-transparent bg-clip-text bg-gradient-to-r from-[#FFF0A0] via-[#D4AF37] to-[#AA852C]">
                Reżyser AI • Scalanie Filmów z Wybranymi Dodatkami
              </h2>
              <p className="text-xs text-[#A89C82]">
                Inteligentne łączenie {clips.length} zaznaczonych filmów, plansza tytułowa, napisy, przejścia i mastering
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleStartAnalysis}
              disabled={isLoading}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#221C11] border border-[#D4AF37]/40 text-xs font-semibold text-[#FDE047] hover:border-[#D4AF37] transition-all cursor-pointer shadow-sm"
              title="Przelicz ponownie chronologię i napisy"
            >
              <RotateCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline">Przelicz AI</span>
            </button>

            <button
              onClick={onClose}
              className="p-2 rounded-xl bg-[#1D1912] text-[#A69C87] hover:text-white hover:bg-white/[0.08] transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Content Controls & Body */}
        <div className="flex-1 overflow-y-auto custom-scrollbar p-4 sm:p-5 space-y-4">
          
          {/* Top Options Bar */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 p-3.5 rounded-xl bg-[#19150E] border border-[#2D261A]">
            <div>
              <label className="text-[11px] font-semibold text-[#C5BAA2] uppercase tracking-wider block mb-1.5">
                Styl i tempo montażu
              </label>
              <select
                value={pacing}
                onChange={(e: any) => setPacing(e.target.value)}
                className="w-full bg-[#110E09] border border-[#3A301E] rounded-lg px-2.5 py-1.5 text-xs text-[#F5EAD4] focus:border-[#D4AF37] focus:outline-none"
              >
                <option value="cinematic">Kinowy i emocjonalny (płynny przepływ)</option>
                <option value="dynamic">Dynamiczny teledysk (szybkie tempo)</option>
                <option value="emotional">Wzruszający reportaż (akcent na przysięgę)</option>
              </select>
            </div>

            <div>
              <label className="text-[11px] font-semibold text-[#C5BAA2] uppercase tracking-wider block mb-1.5">
                Styl podpisów i narracji
              </label>
              <select
                value={captionStyle}
                onChange={(e: any) => setCaptionStyle(e.target.value)}
                className="w-full bg-[#110E09] border border-[#3A301E] rounded-lg px-2.5 py-1.5 text-xs text-[#F5EAD4] focus:border-[#D4AF37] focus:outline-none"
              >
                <option value="cinematic_poetic">Poetycki i wzruszający</option>
                <option value="elegant_classic">Klasyczny i elegancki</option>
                <option value="modern_short">Nowoczesny i zwięzły</option>
              </select>
            </div>

            <div>
              <label className="text-[11px] font-semibold text-[#C5BAA2] uppercase tracking-wider block mb-1.5">
                Para Młoda / Tytuł Główny
              </label>
              <input
                type="text"
                value={coupleNames}
                onChange={(e) => setCoupleNames(e.target.value)}
                placeholder="Joanna & Piotr"
                className="w-full bg-[#110E09] border border-[#3A301E] rounded-lg px-2.5 py-1.5 text-xs text-[#F5EAD4] focus:border-[#D4AF37] focus:outline-none"
              />
            </div>
          </div>

          {/* Wybrane Dodatki Reżyserskie Panel */}
          <div className="p-4 rounded-xl bg-gradient-to-r from-[#221B11] via-[#1A150D] to-[#20180F] border border-[#D4AF37]/40 shadow-lg space-y-3">
            <div className="flex items-center justify-between border-b border-[#352B1B] pb-2">
              <h3 className="text-xs font-bold uppercase tracking-wider text-[#FDE047] flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-[#D4AF37]" />
                Wybrane Dodatki Reżysera (Aktywne w Scalonym Filmie)
              </h3>
              <span className="text-[11px] text-[#A69777]">
                Wszystkie zaznaczone opcje zostaną wkomponowane w wynikowy film
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 pt-1">
              {/* Dodatek 1: Plansza Intro (Liturgiczna / Kościelna) */}
              <div className={`p-3 rounded-lg border transition-all ${
                includeIntroTitleCard ? 'bg-[#2A2113] border-[#D4AF37]/60' : 'bg-[#15120B] border-[#2B2317] opacity-60'
              }`}>
                <label className="flex items-center justify-between cursor-pointer mb-2">
                  <span className="text-xs font-bold text-white flex items-center gap-1.5">
                    <Tv className="w-3.5 h-3.5 text-[#D4AF37]" />
                    Wstępna karta (Intro)
                  </span>
                  <input
                    type="checkbox"
                    checked={includeIntroTitleCard}
                    onChange={(e) => setIncludeIntroTitleCard(e.target.checked)}
                    className="accent-[#D4AF37] w-4 h-4 rounded cursor-pointer"
                  />
                </label>
                {includeIntroTitleCard && (
                  <div className="space-y-1.5 text-[11px]">
                    <input
                      type="text"
                      value={introTitle}
                      onChange={(e) => setIntroTitle(e.target.value)}
                      placeholder="Wielki napis (np. Ślub Joanny i Piotra)"
                      className="w-full bg-[#110E09] border border-[#3E311B] rounded px-2 py-1 text-white font-medium focus:border-[#D4AF37]"
                    />
                    <input
                      type="text"
                      value={introSubtitle}
                      onChange={(e) => setIntroSubtitle(e.target.value)}
                      placeholder="Podtytuł / Data (np. 14.09.2024)"
                      className="w-full bg-[#110E09] border border-[#3E311B] rounded px-2 py-1 text-[#C5BBA7] focus:border-[#D4AF37]"
                    />
                    <div className="flex items-center justify-between text-[10px] text-[#8C7E64]">
                      <span>Styl tła:</span>
                      <select
                        value={introStyle}
                        onChange={(e: any) => setIntroStyle(e.target.value)}
                        className="bg-[#110E09] border border-[#3E311B] rounded px-1.5 py-0.5 text-[#FDE047]"
                      >
                        <option value="liturgical">Kościelno-Liturgiczny (Katedra & Krzyż)</option>
                        <option value="cinematic">Kinowy Zmierzch</option>
                        <option value="elegant">Elegancki Złoty Monogram</option>
                        <option value="classic">Klasyczny</option>
                      </select>
                    </div>
                  </div>
                )}
              </div>

              {/* Dodatek 2: Karty Pomiędzy Filmami (Opisujące co się dzieje) */}
              <div className={`p-3 rounded-lg border transition-all ${
                includeSceneTitles ? 'bg-[#2A2113] border-[#D4AF37]/60' : 'bg-[#15120B] border-[#2B2317] opacity-60'
              }`}>
                <label className="flex items-center justify-between cursor-pointer mb-2">
                  <span className="text-xs font-bold text-white flex items-center gap-1.5">
                    <Layers className="w-3.5 h-3.5 text-[#D4AF37]" />
                    Karty pomiędzy filmami (Sceny)
                  </span>
                  <input
                    type="checkbox"
                    checked={includeSceneTitles}
                    onChange={(e) => setIncludeSceneTitles(e.target.checked)}
                    className="accent-[#D4AF37] w-4 h-4 rounded cursor-pointer"
                  />
                </label>
                <p className="text-[11px] text-[#B0A48E] leading-relaxed">
                  Eleganckie plansze wprowadzające między etapami wesela opisujące co się dzieje (Przysięga, Życzenia, Pierwszy Taniec, Tort).
                </p>
              </div>

              {/* Dodatek 3: Karta Końcowa (Podziękowania dla rodziców, świadków, gości) */}
              <div className={`p-3 rounded-lg border transition-all ${
                includeOutroTitleCard ? 'bg-[#2A2113] border-[#D4AF37]/60' : 'bg-[#15120B] border-[#2B2317] opacity-60'
              }`}>
                <label className="flex items-center justify-between cursor-pointer mb-2">
                  <span className="text-xs font-bold text-white flex items-center gap-1.5">
                    <Heart className="w-3.5 h-3.5 text-[#D4AF37]" />
                    Karta końcowa (Podziękowania)
                  </span>
                  <input
                    type="checkbox"
                    checked={includeOutroTitleCard}
                    onChange={(e) => setIncludeOutroTitleCard(e.target.checked)}
                    className="accent-[#D4AF37] w-4 h-4 rounded cursor-pointer"
                  />
                </label>
                {includeOutroTitleCard && (
                  <div className="space-y-1.5 text-[11px]">
                    <input
                      type="text"
                      value={outroTitle}
                      onChange={(e) => setOutroTitle(e.target.value)}
                      placeholder="Tytuł podziękowań"
                      className="w-full bg-[#110E09] border border-[#3E311B] rounded px-2 py-1 text-white font-medium focus:border-[#D4AF37]"
                    />
                    <textarea
                      value={outroSubtitle}
                      onChange={(e) => setOutroSubtitle(e.target.value)}
                      placeholder="Podziękowania dla rodziców, świadków i gości..."
                      rows={2}
                      className="w-full bg-[#110E09] border border-[#3E311B] rounded px-2 py-1 text-[10px] text-[#C5BBA7] focus:border-[#D4AF37] resize-none leading-tight"
                    />
                  </div>
                )}
              </div>

              {/* Dodatek 4: Oprawa Muzyczna (Dźwięk jako podstawa) */}
              <div className={`p-3 rounded-lg border transition-all ${
                includeSoundtrack ? 'bg-[#2A2113] border-[#D4AF37]/60' : 'bg-[#15120B] border-[#2B2317] opacity-60'
              }`}>
                <label className="flex items-center justify-between cursor-pointer mb-2">
                  <span className="text-xs font-bold text-white flex items-center gap-1.5">
                    <Music className="w-3.5 h-3.5 text-[#D4AF37]" />
                    Podkład dźwiękowy (Audio)
                  </span>
                  <input
                    type="checkbox"
                    checked={includeSoundtrack}
                    onChange={(e) => setIncludeSoundtrack(e.target.checked)}
                    className="accent-[#D4AF37] w-4 h-4 rounded cursor-pointer"
                  />
                </label>
                <div className="space-y-1 text-[11px]">
                  <select
                    value={soundtrackPresetId}
                    onChange={(e) => setSoundtrackPresetId(e.target.value)}
                    className="w-full bg-[#110E09] border border-[#3E311B] rounded px-2 py-1 text-xs text-[#FDE047] focus:border-[#D4AF37] cursor-pointer"
                  >
                    <option value="altar_procession">Droga do Ołtarza (Dzwony & Chóry)</option>
                    <option value="golden_hour_piano">Złoty Zmierzch (Fortepian & Smyczki)</option>
                    <option value="first_dance_waltz">Pierwszy Taniec (Walc Akustyczny)</option>
                    <option value="venice_strings">Wenecja Nocą (Smyczki & Harfa)</option>
                  </select>
                  <p className="text-[10px] text-[#A69777]">
                    Dźwięk stanowi bazę montażu z automatycznym wyciszaniem (ducking) pod mowę z ujęć.
                  </p>
                </div>
              </div>

              {/* Dodatek 5: Napisy scen */}
              <div className={`p-3 rounded-lg border transition-all ${
                includeSubtitles ? 'bg-[#2A2113] border-[#D4AF37]/60' : 'bg-[#15120B] border-[#2B2317] opacity-60'
              }`}>
                <label className="flex items-center justify-between cursor-pointer mb-2">
                  <span className="text-xs font-bold text-white flex items-center gap-1.5">
                    <TypeIcon className="w-3.5 h-3.5 text-[#D4AF37]" />
                    Kinowe napisy / podpisy scen
                  </span>
                  <input
                    type="checkbox"
                    checked={includeSubtitles}
                    onChange={(e) => setIncludeSubtitles(e.target.checked)}
                    className="accent-[#D4AF37] w-4 h-4 rounded cursor-pointer"
                  />
                </label>
                <p className="text-[11px] text-[#B0A48E] leading-relaxed">
                  Automatycznie generuje podpisy narracyjne na dole ekranu, zsynchronizowane z każdym ujęciem.
                </p>
              </div>

              {/* Dodatek 6: Płynne przejścia */}
              <div className={`p-3 rounded-lg border transition-all ${
                applyTransitions ? 'bg-[#2A2113] border-[#D4AF37]/60' : 'bg-[#15120B] border-[#2B2317] opacity-60'
              }`}>
                <label className="flex items-center justify-between cursor-pointer mb-2">
                  <span className="text-xs font-bold text-white flex items-center gap-1.5">
                    <Sliders className="w-3.5 h-3.5 text-[#D4AF37]" />
                    Płynne przejścia (Crossfade)
                  </span>
                  <input
                    type="checkbox"
                    checked={applyTransitions}
                    onChange={(e) => setApplyTransitions(e.target.checked)}
                    className="accent-[#D4AF37] w-4 h-4 rounded cursor-pointer"
                  />
                </label>
                <p className="text-[11px] text-[#B0A48E] leading-relaxed">
                  Eliminuje ostre cięcia, nakłada przenikanie (dissolve) oraz ściemnienie (dip black) na zmiany scen.
                </p>
              </div>

              {/* Dodatek 7: Smart Trim */}
              <div className={`p-3 rounded-lg border transition-all ${
                applySmartTrim ? 'bg-[#2A2113] border-[#D4AF37]/60' : 'bg-[#15120B] border-[#2B2317] opacity-60'
              }`}>
                <label className="flex items-center justify-between cursor-pointer mb-2">
                  <span className="text-xs font-bold text-white flex items-center gap-1.5">
                    <Scissors className="w-3.5 h-3.5 text-[#D4AF37]" />
                    Inteligentne cięcie (Smart Trim)
                  </span>
                  <input
                    type="checkbox"
                    checked={applySmartTrim}
                    onChange={(e) => setApplySmartTrim(e.target.checked)}
                    className="accent-[#D4AF37] w-4 h-4 rounded cursor-pointer"
                  />
                </label>
                <p className="text-[11px] text-[#B0A48E] leading-relaxed">
                  Obcina niestabilne pierwsze i ostatnie klatki nagrań smartfonowych i kamerowych.
                </p>
              </div>

              {/* Dodatek 8: Kolorystyka i Grading */}
              <div className="p-3 rounded-lg border bg-[#2A2113] border-[#D4AF37]/60">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-bold text-white flex items-center gap-1.5">
                    <Palette className="w-3.5 h-3.5 text-[#D4AF37]" />
                    Profil barwny filmu (LUT)
                  </span>
                </div>
                <select
                  value={colorGrade}
                  onChange={(e: any) => setColorGrade(e.target.value)}
                  className="w-full bg-[#110E09] border border-[#3E311B] rounded px-2 py-1 text-xs text-[#FDE047] focus:border-[#D4AF37] cursor-pointer"
                >
                  <option value="golden_hour">Złota Godzina (Ciepłe złoto ślubne)</option>
                  <option value="cinematic">Kinowy Romans (Głęboki kontrast)</option>
                  <option value="warm">Ciepły i miękki</option>
                  <option value="vintage">Styl Retro / Vintage</option>
                  <option value="natural">Naturalny (Wierne kolory)</option>
                  <option value="none">Brak korekcji (Oryginał)</option>
                </select>
              </div>

              {/* Dodatek 9: Rozdziały filmu */}
              <div className={`p-3 rounded-lg border transition-all ${
                generateChapters ? 'bg-[#2A2113] border-[#D4AF37]/60' : 'bg-[#15120B] border-[#2B2317] opacity-60'
              }`}>
                <label className="flex items-center justify-between cursor-pointer mb-2">
                  <span className="text-xs font-bold text-white flex items-center gap-1.5">
                    <Bookmark className="w-3.5 h-3.5 text-[#D4AF37]" />
                    Rozdziały filmu (Chapters)
                  </span>
                  <input
                    type="checkbox"
                    checked={generateChapters}
                    onChange={(e) => setGenerateChapters(e.target.checked)}
                    className="accent-[#D4AF37] w-4 h-4 rounded cursor-pointer"
                  />
                </label>
                <p className="text-[11px] text-[#B0A48E] leading-relaxed">
                  Dzieli scalony film na logiczne rozdziały (Przygotowania, Ślub, Taniec, Tort, Finał).
                </p>
              </div>
            </div>
          </div>

          {/* Story Concept Banner */}
          {storyConcept && (
            <div className="p-3.5 rounded-xl bg-gradient-to-r from-[#261E0F]/80 to-[#19150E] border border-[#D4AF37]/30 flex items-start gap-3">
              <div className="p-2 rounded-lg bg-[#3D3014] text-[#FDE047] shrink-0 mt-0.5">
                <Heart className="w-4 h-4" />
              </div>
              <div className="space-y-1">
                <h4 className="text-xs font-bold text-[#FDE047] uppercase tracking-wider">
                  Koncept Reżyserski Scalania
                </h4>
                <p className="text-xs text-[#DDD2BC] leading-relaxed">
                  {storyConcept}
                </p>
                {musicSuggestion && (
                  <p className="text-[11px] text-[#A69777] flex items-center gap-1.5 pt-0.5">
                    <Music className="w-3 h-3 text-[#D4AF37]" />
                    <span>Sugerowana oprawa muzyczna: <strong>{musicSuggestion}</strong></span>
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Tabs for Sequence / Quick Captions */}
          <div className="flex items-center justify-between border-b border-[#2A2317] pb-2">
            <div className="flex items-center gap-2">
              <button
                onClick={() => setActiveTab('sequence')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold tracking-wide transition-all cursor-pointer ${
                  activeTab === 'sequence' 
                    ? 'bg-[#2A2213] text-[#FDE047] border border-[#D4AF37]/50' 
                    : 'text-[#A0957F] hover:text-white'
                }`}
              >
                🎬 Oś Chronologiczna & Cięcia ({sequencedItems.length} ujęć)
              </button>
              <button
                onClick={() => setActiveTab('captions')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold tracking-wide transition-all cursor-pointer ${
                  activeTab === 'captions' 
                    ? 'bg-[#2A2213] text-[#FDE047] border border-[#D4AF37]/50' 
                    : 'text-[#A0957F] hover:text-white'
                }`}
              >
                🏷️ Generator Podpisów & Tagi
              </button>
            </div>

            <div className="text-xs text-[#A89C82] flex items-center gap-2 font-mono">
              <Clock className="w-3.5 h-3.5 text-[#D4AF37]" />
              <span>Łączny czas z dodatkami: <strong>{Math.floor(totalDuration / 60)}m {Math.round(totalDuration % 60)}s</strong></span>
            </div>
          </div>

          {/* Loading state */}
          {isLoading ? (
            <div className="py-16 flex flex-col items-center justify-center gap-3">
              <div className="w-12 h-12 rounded-full border-2 border-[#D4AF37] border-t-transparent animate-spin" />
              <p className="text-sm font-semibold text-[#FDE047]">
                AI analizuje ujęcia, układa chronologię i przygotowuje dodatki...
              </p>
              <p className="text-xs text-[#8C7E64]">
                Rozpoznawanie etapów uroczystości, optymalizacja cięć i generowanie podpisów
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {sequencedItems.map((item, index) => {
                const catInfo = CATEGORY_LABELS[item.category] || CATEGORY_LABELS.unassigned;
                const start = applySmartTrim ? item.trimStart : 0;
                const end = applySmartTrim ? item.trimEnd : item.clip.duration;
                const duration = Math.max(0, end - start);

                return (
                  <div
                    key={item.clipId}
                    className={`p-3.5 rounded-xl border transition-all ${
                      item.includeInTimeline 
                        ? 'bg-[#18140E]/90 border-[#3D321F] hover:border-[#D4AF37]/50 shadow-md' 
                        : 'bg-[#110E0A]/60 border-[#221C14] opacity-50'
                    }`}
                  >
                    <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                      
                      {/* Left: Reorder, Number & Thumbnail */}
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="flex flex-col gap-0.5 items-center">
                          <button
                            onClick={() => handleMoveOrder(index, 'up')}
                            disabled={index === 0}
                            className="p-1 rounded hover:bg-white/[0.08] text-[#8C7E64] hover:text-white disabled:opacity-20 cursor-pointer"
                            title="Przesuń wcześniej"
                          >
                            <ChevronUp className="w-3.5 h-3.5" />
                          </button>
                          <span className="w-6 h-6 rounded-md bg-[#241D10] border border-[#3E321D] flex items-center justify-center text-[11px] font-bold text-[#FDE047] font-mono">
                            {index + 1}
                          </span>
                          <button
                            onClick={() => handleMoveOrder(index, 'down')}
                            disabled={index === sequencedItems.length - 1}
                            className="p-1 rounded hover:bg-white/[0.08] text-[#8C7E64] hover:text-white disabled:opacity-20 cursor-pointer"
                            title="Przesuń później"
                          >
                            <ChevronDown className="w-3.5 h-3.5" />
                          </button>
                        </div>

                        {/* Thumbnail / Video icon */}
                        <div className="w-20 h-14 rounded-lg bg-[#0C0A07] border border-[#2B2316] overflow-hidden relative shrink-0 flex items-center justify-center">
                          {item.clip.thumbnailUrl ? (
                            <img src={item.clip.thumbnailUrl} alt={item.clip.name} className="w-full h-full object-cover" />
                          ) : (
                            <FileVideo className="w-6 h-6 text-[#A89872]" />
                          )}
                          <span className="absolute bottom-1 right-1 bg-black/80 px-1 py-0.5 rounded text-[9px] font-mono text-white">
                            {Math.round(duration)}s
                          </span>
                        </div>

                        {/* Middle: Title, Captions & Controls */}
                        <div className="min-w-0 flex-1 space-y-1.5">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${catInfo.color}`}>
                              {catInfo.icon} {catInfo.label}
                            </span>
                            <span className="text-[10px] text-[#8C7E64] font-mono">
                              Oryginał: {item.clip.name}
                            </span>
                          </div>

                          {/* Editable Smart Title */}
                          <input
                            type="text"
                            value={item.smartTitle}
                            onChange={(e) => handleUpdateItem(item.clipId, { smartTitle: e.target.value })}
                            className="w-full bg-[#120F0A] border border-[#2D2416] rounded-lg px-2.5 py-1 text-xs text-[#FFF0D0] font-semibold focus:border-[#D4AF37] focus:outline-none"
                            placeholder="Tytuł ujęcia..."
                          />

                          {/* Editable Subtitle Caption */}
                          <div className="flex items-center gap-1.5 text-xs text-[#B5A890]">
                            <span className="text-[10px] uppercase font-bold text-[#D4AF37]/80 shrink-0">Podpis:</span>
                            <input
                              type="text"
                              value={item.subtitleCaption}
                              onChange={(e) => handleUpdateItem(item.clipId, { subtitleCaption: e.target.value })}
                              className="w-full bg-[#120F0A] border border-[#241D12] rounded-md px-2 py-0.5 text-[11px] text-[#DDD0B8] italic focus:border-[#D4AF37] focus:outline-none"
                              placeholder="Podpis narracyjny..."
                            />
                          </div>
                        </div>
                      </div>

                      {/* Right: Trimming, Transitions & Toggle */}
                      <div className="flex flex-wrap lg:flex-col items-end gap-2 shrink-0 border-t lg:border-t-0 border-[#221B12] pt-2 lg:pt-0">
                        <div className="flex items-center gap-2 text-xs">
                          <div className="flex items-center gap-1 bg-[#100D09] px-2 py-1 rounded-md border border-[#282014] text-[11px]">
                            <Scissors className="w-3 h-3 text-[#D4AF37]" />
                            <span className="text-[#8C7E64]">Cięcie:</span>
                            <span className="font-mono text-[#FDE047]">{start.toFixed(1)}s - {end.toFixed(1)}s</span>
                          </div>

                          <select
                            value={item.transition}
                            onChange={(e) => handleUpdateItem(item.clipId, { transition: e.target.value })}
                            className="bg-[#100D09] border border-[#282014] rounded-md px-2 py-1 text-[11px] text-[#C5B89F] focus:border-[#D4AF37]"
                          >
                            <option value="dissolve">Przenikanie (Dissolve)</option>
                            <option value="cut">Cięcie proste (Cut)</option>
                            <option value="dip_black">Przez czerń (Dip Black)</option>
                            <option value="dip_white">Przez biel (Dip White)</option>
                          </select>
                        </div>

                        <div className="flex items-center gap-2">
                          {item.clip.objectUrl && (
                            <button
                              onClick={() => setPreviewClip({
                                url: item.clip.objectUrl!,
                                title: item.smartTitle,
                                caption: item.subtitleCaption
                              })}
                              className="p-1.5 rounded-lg bg-[#1D170E] hover:bg-[#2C2314] text-[#D4AF37] text-xs flex items-center gap-1 cursor-pointer transition-colors"
                              title="Odtwórz podgląd z podpisem"
                            >
                              <Play className="w-3 h-3" />
                              <span className="text-[10px]">Podgląd</span>
                            </button>
                          )}

                          <label className="flex items-center gap-1.5 text-xs text-[#C5BAA2] cursor-pointer bg-[#1D170E] px-2.5 py-1 rounded-lg border border-[#2E2416]">
                            <input
                              type="checkbox"
                              checked={item.includeInTimeline}
                              onChange={(e) => handleUpdateItem(item.clipId, { includeInTimeline: e.target.checked })}
                              className="accent-[#D4AF37] rounded"
                            />
                            <span>Dołącz do filmu</span>
                          </label>
                        </div>
                      </div>

                    </div>
                  </div>
                );
              })}
            </div>
          )}

        </div>

        {/* Footer Actions */}
        <div className="px-5 py-4 border-t border-[#2D261A] bg-[#17130D] flex flex-wrap items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-2">
            <button
              onClick={handleApplyCaptions}
              disabled={isLoading || sequencedItems.length === 0}
              className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-[#221C11] border border-[#D4AF37]/50 text-xs font-bold text-[#FDE047] hover:bg-[#2D2415] hover:border-[#D4AF37] transition-all cursor-pointer shadow-sm"
              title="Zaktualizuj nazwy, kategorie i podpisy w bibliotece ujęć"
            >
              <TypeIcon className="w-3.5 h-3.5" />
              <span>Zastosuj Podpisy w Bibliotece</span>
            </button>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={() => handleApplyAllDirectorOptionsAtOnce('montage')}
              disabled={isLoading || sequencedItems.length === 0}
              className="bg-gradient-to-r from-[#D4AF37] via-[#FDE047] to-[#E5C158] hover:brightness-110 text-black px-6 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider flex items-center gap-2 cursor-pointer shadow-[0_4px_24px_rgba(212,175,55,0.45)] transition-all hover:scale-105 active:scale-95"
              title="Wszystkie opcje reżyserskie naraz: wstępna karta liturgiczna, chronologia, karty scen, napisy, podziękowania dla rodziców i gości oraz muzyka"
            >
              <Sparkles className="w-4 h-4 fill-black" />
              <span>REŻYSER AI: SCAL I PODPISZ (WSZYSTKO W 1 KLIKNIĘCIU)</span>
            </button>

            <button
              onClick={handleMergeAndExportDirectly}
              disabled={isLoading || sequencedItems.length === 0}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#241E13] hover:bg-[#342B1A] border border-[#D4AF37]/70 text-xs font-bold text-[#FDE047] cursor-pointer transition-all shadow-md"
              title="Scal wszystkie ujęcia z wybranymi dodatkami i przejdź bezpośrednio do okna eksportu"
            >
              <Play className="w-4 h-4 text-[#D4AF37]" />
              <span>Scal & Eksportuj</span>
            </button>
          </div>
        </div>

      </div>

      {/* Mini Video Preview Modal with Caption Overlay */}
      {previewClip && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-black/90 animate-fadeIn">
          <div className="relative w-full max-w-2xl bg-[#110E09] border border-[#D4AF37]/50 rounded-2xl overflow-hidden shadow-2xl">
            <div className="p-3 border-b border-[#2A2214] flex items-center justify-between bg-[#19150E]">
              <span className="text-xs font-bold text-[#FDE047]">{previewClip.title}</span>
              <button onClick={() => setPreviewClip(null)} className="p-1 text-[#8C7E64] hover:text-white cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </div>
            
            <div className="relative aspect-video bg-black flex items-center justify-center">
              <video
                src={previewClip.url}
                controls
                autoPlay
                className="w-full h-full object-contain"
              />
              
              {/* Caption Overlay */}
              <div className="absolute bottom-6 inset-x-6 text-center pointer-events-none">
                <span className="bg-black/75 backdrop-blur-sm border border-white/10 px-4 py-1.5 rounded-lg text-xs md:text-sm font-serif-luxury text-white italic drop-shadow-md inline-block max-w-lg">
                  "{previewClip.caption}"
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
