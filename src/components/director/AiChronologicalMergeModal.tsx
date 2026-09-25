import React, { useState, useEffect, useMemo } from 'react';
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
  FileVideo
} from 'lucide-react';
import type { MediaClip, ClipCategory, ProjectState, TimelineItem, TextLayer, WeddingChapter } from '../../types/project';
import { useStudioToast } from '../common/ToastContext';

interface SequencedItem {
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
  onApplyToTimeline: (items: { clip: MediaClip; smartTitle: string; subtitleCaption: string; category: ClipCategory; transition: string; trimStart: number; trimEnd: number }[]) => void;
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
  const [activeTab, setActiveTab] = useState<'sequence' | 'captions'>('sequence');
  const [previewClip, setPreviewClip] = useState<{ url: string; title: string; caption: string } | null>(null);

  const toast = useStudioToast();

  const handleStartAnalysis = async () => {
    if (clips.length === 0) return;
    setIsLoading(true);

    try {
      const response = await fetch('/api/smart-chronological-sequencing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clips: clips.map(c => ({
            id: c.id,
            name: c.name,
            duration: c.duration,
            capturedAt: c.capturedAt || c.createdAt,
            tags: c.tags,
            comment: c.comment
          })),
          pacing,
          coupleNames,
          weddingDate
        })
      });

      if (!response.ok) throw new Error('Nie udało się uzyskać odpowiedzi od serwera AI');
      const data = await response.json();

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
            trimStart: typeof item.trimStart === 'number' ? item.trimStart : 0.5,
            trimEnd: typeof item.trimEnd === 'number' ? item.trimEnd : Math.max(0.5, foundClip.duration - 0.5),
            directorReason: item.directorReason || 'Płynne dopasowanie do osi czasu.',
            includeInTimeline: true
          });
        }
      });

      // Include any clips that were not part of response at the end
      clips.forEach((c, idx) => {
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
            directorReason: 'Dodano z biblioteki.',
            includeInTimeline: true
          });
        }
      });

      setSequencedItems(formatted);
      toast.showSuccess(`✨ AI ułożyło ${formatted.length} ujęć w spójną chronologię z podpisami!`);
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
        trimStart: 0.5,
        trimEnd: Math.max(0.5, c.duration - 0.5),
        directorReason: 'Dopasowano chronologicznie według czasu nagrania.',
        includeInTimeline: true
      }));

      setSequencedItems(fallbackSeq);
      setStoryConcept('Chronologiczna narracja dnia ślubu ułożona według czasu rejestracji.');
      setMusicSuggestion('Spokojna kompozycja fortepianowa z narastającym finałem');
      toast.showSuccess('Ułożono chronologicznie ujęcia według osi czasu.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen && clips.length > 0 && sequencedItems.length === 0) {
      handleStartAnalysis();
    }
  }, [isOpen, clips.length]);

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

  const handleApplyToTimeline = () => {
    const active = sequencedItems.filter(i => i.includeInTimeline);
    if (active.length === 0) {
      toast.showWarning('Wybierz przynajmniej jedno ujęcie do dodania na oś czasu.');
      return;
    }

    onApplyToTimeline(active.map(i => ({
      clip: i.clip,
      smartTitle: i.smartTitle,
      subtitleCaption: i.subtitleCaption,
      category: i.category,
      transition: i.transition,
      trimStart: i.trimStart,
      trimEnd: i.trimEnd
    })));

    toast.showSuccess(`🎬 Zbudowano Oś Czasu z ${active.length} ujęć z podpisami i przejściami!`);
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
    return sequencedItems
      .filter(i => i.includeInTimeline)
      .reduce((acc, i) => acc + Math.max(0, i.trimEnd - i.trimStart), 0);
  }, [sequencedItems]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/85 backdrop-blur-md animate-fadeIn">
      <div className="relative w-full max-w-5xl max-h-[92vh] flex flex-col bg-[#14120D] border border-[#D4AF37]/40 rounded-2xl shadow-[0_24px_64px_rgba(0,0,0,0.9)] overflow-hidden">
        
        {/* Header */}
        <div className="px-6 py-4 border-b border-[#2D261A] bg-gradient-to-r from-[#1A160F] via-[#241E13] to-[#16130C] flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#2D2412] border border-[#D4AF37]/50 flex items-center justify-center shadow-[0_0_15px_rgba(212,175,55,0.3)]">
              <Sparkles className="w-5 h-5 text-[#FDE047] animate-pulse" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-cinematic font-bold text-transparent bg-clip-text bg-gradient-to-r from-[#FFF0A0] via-[#D4AF37] to-[#AA852C]">
                Inteligentne Scalanie & Automatyczne Podpisy AI
              </h2>
              <p className="text-xs text-[#A89C82]">
                Zaawansowane układanie chronologii, redukcja drgań, płynne przejścia i kinowe napisy dla {clips.length} ujęć
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
        <div className="flex-1 overflow-y-auto custom-scrollbar p-5 space-y-5">
          
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
                Para Młoda / Tytuł
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
              <span>Łączny czas po docięciu: <strong>{Math.floor(totalDuration / 60)}m {Math.round(totalDuration % 60)}s</strong></span>
            </div>
          </div>

          {/* Loading state */}
          {isLoading ? (
            <div className="py-16 flex flex-col items-center justify-center gap-3">
              <div className="w-12 h-12 rounded-full border-2 border-[#D4AF37] border-t-transparent animate-spin" />
              <p className="text-sm font-semibold text-[#FDE047]">
                AI analizuje ujęcia, układa chronologię i tworzy podpisy scen...
              </p>
              <p className="text-xs text-[#8C7E64]">
                Rozpoznawanie faz ceremonii, optymalizacja cięć początkowych i synchronizacja nastroju
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {sequencedItems.map((item, index) => {
                const catInfo = CATEGORY_LABELS[item.category] || CATEGORY_LABELS.unassigned;
                const duration = Math.max(0, item.trimEnd - item.trimStart);

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
                            <span className="font-mono text-[#FDE047]">{item.trimStart.toFixed(1)}s - {item.trimEnd.toFixed(1)}s</span>
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
        <div className="px-6 py-4 border-t border-[#2D261A] bg-[#17130D] flex flex-wrap items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-2">
            <button
              onClick={handleApplyCaptions}
              disabled={isLoading || sequencedItems.length === 0}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-[#221C11] border border-[#D4AF37]/50 text-xs font-bold text-[#FDE047] hover:bg-[#2D2415] hover:border-[#D4AF37] transition-all cursor-pointer shadow-sm"
              title="Zaktualizuj nazwy, kategorie i podpisy w bibliotece ujęć"
            >
              <TypeIcon className="w-3.5 h-3.5" />
              <span>Zastosuj Podpisy w Bibliotece</span>
            </button>
          </div>

          <div className="flex items-center gap-2">
            {onOpenQuickMerge && (
              <button
                onClick={() => {
                  handleApplyCaptions();
                  onClose();
                  onOpenQuickMerge();
                }}
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#1E180E] border border-[#3E311A] text-xs font-semibold text-[#DDD0B8] hover:text-white hover:border-[#D4AF37]/50 transition-all cursor-pointer"
              >
                <Download className="w-3.5 h-3.5 text-[#D4AF37]" />
                <span>Szybkie Scalenie MP4</span>
              </button>
            )}

            <button
              onClick={handleApplyToTimeline}
              disabled={isLoading || sequencedItems.length === 0}
              className="luxury-btn-primary px-5 py-2 rounded-xl text-xs font-bold uppercase tracking-wider flex items-center gap-2 cursor-pointer shadow-[0_4px_20px_rgba(212,175,55,0.4)]"
            >
              <Layers className="w-4 h-4" />
              <span>Zbuduj Oś Czasu (Montaż)</span>
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
              <button onClick={() => setPreviewClip(null)} className="p-1 text-[#8C7E64] hover:text-white">
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
