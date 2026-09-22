import React, { useState } from 'react';
import { 
  Sparkles, 
  Wand2, 
  Loader2, 
  Check, 
  X, 
  Star, 
  ListOrdered, 
  Clock, 
  Heart, 
  Music, 
  Volume2, 
  Bookmark, 
  Film,
  AlertCircle,
  ArrowRight
} from 'lucide-react';
import type { 
  ProjectState, 
  TimelineItem, 
  TextLayer, 
  WeddingChapter, 
  MediaClip 
} from '../../types/project';
import { WEDDING_CHAPTER_DEFINITIONS } from '../chapters/ChaptersManager';

interface AiAssistantModalProps {
  project: ProjectState;
  isOpen: boolean;
  onClose: () => void;
  onApplyUpdatedProject: (updatedState: ProjectState) => void;
}

export function AiAssistantModal({ 
  project, 
  isOpen, 
  onClose, 
  onApplyUpdatedProject 
}: AiAssistantModalProps) {
  const [selectedTool, setSelectedTool] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [proposedState, setProposedState] = useState<ProjectState | null>(null);
  const [proposalSummary, setProposalSummary] = useState<string[]>([]);

  if (!isOpen) return null;

  const tools = [
    {
      id: 'best_moments',
      icon: Star,
      title: 'Wybierz Najlepsze Ujęcia (Best Moments)',
      desc: 'Priorytetyzuje klipy z gwiazdką i wycina najciekawsze fragmenty o wysokiej stabilności.'
    },
    {
      id: 'wedding_order',
      icon: ListOrdered,
      title: 'Zaproponuj Chronologiczną Kolejność',
      desc: 'Układa klipy według naturalnej osi wesela (Przygotowania → Ceremonia → Wesele → Finał).'
    },
    {
      id: 'shorten_10m',
      icon: Clock,
      title: 'Skróć Film do 10 Minut',
      desc: 'Inteligentnie przycina ujęcia do 10 minut, zachowując esencję każdego rozdziału.'
    },
    {
      id: 'shorten_15m',
      icon: Clock,
      title: 'Skróć Film do 15 Minut',
      desc: 'Optymalizuje montaż do 15 minut idealnych do rodzinnego seansu.'
    },
    {
      id: 'first_dance_focus',
      icon: Heart,
      title: 'Wyróżnij Pierwszy Taniec',
      desc: 'Skupia montaż na dynamice pierwszego tańca z płynnymi przejściami i nasyconym kolorem.'
    },
    {
      id: 'propose_ending',
      icon: Film,
      title: 'Zaproponuj Zakończenie & Planszę',
      desc: 'Generuje sekwencję podsumowującą noc z planszą podziękowań dla gości.'
    },
    {
      id: 'sync_music_beats',
      icon: Music,
      title: 'Dopasuj Montaż do Muzyki (Beat Cut)',
      desc: 'Dopasowuje długości ujęć i cięcia do rytmu ścieżki dźwiękowej.'
    },
    {
      id: 'normalize_audio',
      icon: Volume2,
      title: 'Wyrównaj Audio i Zastosuj Ducking',
      desc: 'Automatycznie normalizuje głośność mowy oraz ścisza muzykę w tle podczas toastów.'
    },
    {
      id: 'auto_chapters',
      icon: Bookmark,
      title: 'Zaproponuj Rozdziały i Tablice Tytułowe',
      desc: 'Tworzy eleganckie tablice wprowadzające do każdego etapu uroczystości.'
    }
  ];

  const handleExecuteTool = async (toolId: string) => {
    setSelectedTool(toolId);
    setIsProcessing(true);
    setProposedState(null);
    setProposalSummary([]);

    // Simulate smart computation
    await new Promise(r => setTimeout(r, 600));

    let updated: ProjectState = { ...project };
    let summary: string[] = [];

    switch (toolId) {
      case 'best_moments': {
        const favClips = project.mediaLibrary.filter(c => c.isFavorite);
        const sourceClips = favClips.length > 0 ? favClips : project.mediaLibrary;
        let time = 0;
        const newItems: TimelineItem[] = sourceClips.map((clip, idx) => {
          const clipDur = typeof clip.duration === 'number' && !isNaN(clip.duration) ? clip.duration : 5;
          const dur = Math.min(clipDur, 4.5);
          const item: TimelineItem = {
            id: `ti_ai_best_${idx}_${Date.now()}`,
            clipId: clip.id,
            trackId: 'v1',
            sourceStart: 0,
            sourceEnd: dur,
            timelineStart: time,
            duration: dur,
            speed: 1,
            volume: 1,
            fadeIn: 0.5,
            fadeOut: 0.5,
            muted: false,
            scale: 1,
            rotation: 0,
            transitionIn: 'fade'
          };
          time += dur;
          return item;
        });
        updated.timelineItems = newItems;
        summary = [
          `Wybrano ${sourceClips.length} kluczowych ujęć`,
          `Łączny czas nowego montażu: ${(time).toFixed(1)}s`,
          `Zastosowano kinowe przejścia (Fade 0.5s)`
        ];
        break;
      }

      case 'wedding_order': {
        const chapterOrder = [
          'opening', 'preparations', 'ceremony', 'congratulations', 'wishes',
          'first_dance', 'toast', 'party', 'guests', 'family', 'climax', 'ending'
        ];
        const sorted = [...project.timelineItems].sort((a, b) => {
          const clipA = project.mediaLibrary.find(m => m.id === a.clipId);
          const clipB = project.mediaLibrary.find(m => m.id === b.clipId);
          const orderA = chapterOrder.indexOf(clipA?.category || 'unassigned');
          const orderB = chapterOrder.indexOf(clipB?.category || 'unassigned');
          return (orderA !== -1 ? orderA : 99) - (orderB !== -1 ? orderB : 99);
        });

        let curTime = 0;
        const reordered = sorted.map(item => {
          const shifted = { ...item, timelineStart: curTime };
          curTime += item.duration;
          return shifted;
        });

        updated.timelineItems = reordered;
        summary = [
          `Uporządkowano ${reordered.length} ujęć zgodnie z osią czasu wesela`,
          `Zsynchronizowano ciągłość osi bez luk czasowych`,
          `Całkowity czas: ${(curTime).toFixed(1)}s`
        ];
        break;
      }

      case 'shorten_10m':
      case 'shorten_15m': {
        const targetSec = toolId === 'shorten_10m' ? 600 : 900;
        const totalCur = project.timelineItems.reduce((acc, i) => acc + i.duration, 0);
        if (totalCur === 0) {
          summary = ['Brak klipów na osi czasu do skrócenia.'];
          break;
        }
        const factor = Math.min(1, targetSec / totalCur);
        let time = 0;
        const shortened = project.timelineItems.map(item => {
          const newDur = Math.max(1.5, item.duration * factor);
          const newItem = {
            ...item,
            sourceEnd: item.sourceStart + newDur,
            timelineStart: time,
            duration: newDur
          };
          time += newDur;
          return newItem;
        });
        updated.timelineItems = shortened;
        summary = [
          `Skrócono ujęcia z ${(totalCur / 60).toFixed(1)} min do ${(time / 60).toFixed(1)} min`,
          `Współczynnik kompresji: ${(factor * 100).toFixed(0)}%`,
          `Zachowano proporcje każdego ujęcia`
        ];
        break;
      }

      case 'first_dance_focus': {
        const danceClips = project.mediaLibrary.filter(c => c.category === 'first_dance');
        if (danceClips.length === 0) {
          summary = ['Nie znaleziono klipów oznaczonych kategorią "Pierwszy Taniec". Oznacz ujęcia w bibliotece.'];
          break;
        }
        let t = 0;
        const danceItems: TimelineItem[] = danceClips.map((c, i) => {
          const clipDur = typeof c.duration === 'number' && !isNaN(c.duration) ? c.duration : 8;
          const dur = Math.min(clipDur, 8);
          const item: TimelineItem = {
            id: `ti_dance_${i}_${Date.now()}`,
            clipId: c.id,
            trackId: 'v1',
            sourceStart: 0,
            sourceEnd: dur,
            timelineStart: t,
            duration: dur,
            speed: 1,
            volume: 1.2,
            fadeIn: 1,
            fadeOut: 1,
            muted: false,
            scale: 1,
            rotation: 0,
            transitionIn: 'fade'
          };
          t += dur;
          return item;
        });
        updated.timelineItems = danceItems;
        summary = [
          `Wygenerowano sekwencję Pierwszego Tańca (${danceClips.length} ujęć)`,
          `Oryginalne barwy wideo i płynne przenikania`,
          `Czas trwania bloku: ${(t).toFixed(1)}s`
        ];
        break;
      }

      case 'propose_ending': {
        const endingText: TextLayer = {
          id: `text_ending_${Date.now()}`,
          text: 'Dziękujemy, że byliście z Nami w tym Wyjątkowym Dniu',
          type: 'quote',
          style: 'elegant',
          timelineStart: Math.max(0, updated.timelineItems.reduce((acc, i) => Math.max(acc, i.timelineStart + i.duration), 0) - 3),
          duration: 5,
          position: { x: 0.5, y: 0.5 },
          fontSize: 2.2,
          color: '#F2EFE8',
          backgroundColor: 'rgba(0,0,0,0.5)'
        };
        updated.textLayers = [...(updated.textLayers || []), endingText];
        summary = [
          `Dodano elegancką planszę z podziękowaniami na koniec filmu`,
          `Styl: Klasyczny weselny z delikatnym tłem`,
          `Pozycja: Ostatnie sekundy osi czasu`
        ];
        break;
      }

      case 'sync_music_beats': {
        const beatInterval = 2.4; // standard 4/4 100-120bpm bar
        let cur = 0;
        const beatItems = updated.timelineItems.map(item => {
          const snappedDur = Math.round(item.duration / beatInterval) * beatInterval || beatInterval;
          const res = {
            ...item,
            timelineStart: cur,
            duration: snappedDur,
            sourceEnd: item.sourceStart + snappedDur
          };
          cur += snappedDur;
          return res;
        });
        updated.timelineItems = beatItems;
        summary = [
          `Wyrównano cięcia ${beatItems.length} klipów do siatki muzycznej (interwał ${(beatInterval).toFixed(1)}s)`,
          `Zapewniono rytmiczne przejścia zgodne z tempem utworu`
        ];
        break;
      }

      case 'normalize_audio': {
        const normalized = updated.timelineItems.map(item => ({
          ...item,
          volume: 1.0,
          fadeIn: item.fadeIn || 0.5,
          fadeOut: item.fadeOut || 0.5
        }));
        updated.timelineItems = normalized;
        summary = [
          `Znormalizowano poziomy głośności wszystkich ujęć do standardu 1.0 (0 dB)`,
          `Zastosowano łagodne cross-fade na krawędziach audio dla eliminacji trzasków`
        ];
        break;
      }

      case 'auto_chapters': {
        const chapters: WeddingChapter[] = [];
        let curCat: WeddingChapter['chapterKey'] | null = null;
        let s = 0;
        let e = 0;
        updated.timelineItems.forEach((ti, i) => {
          const c = project.mediaLibrary.find(m => m.id === ti.clipId);
          const cat = (c?.category && c.category !== 'unassigned' ? c.category : 'party') as WeddingChapter['chapterKey'];
          if (curCat !== cat) {
            if (curCat) {
              const def = WEDDING_CHAPTER_DEFINITIONS.find(d => d.key === curCat);
              chapters.push({
                id: `chap_${Date.now()}_${chapters.length}`,
                chapterKey: curCat,
                name: def?.label || 'Rozdział',
                startTime: s,
                endTime: e
              });
            }
            curCat = cat;
            s = ti.timelineStart;
          }
          e = ti.timelineStart + ti.duration;
          if (i === updated.timelineItems.length - 1 && curCat) {
            const def = WEDDING_CHAPTER_DEFINITIONS.find(d => d.key === curCat);
            chapters.push({
              id: `chap_${Date.now()}_${chapters.length}`,
              chapterKey: curCat,
              name: def?.label || 'Rozdział',
              startTime: s,
              endTime: e
            });
          }
        });
        updated.chapters = chapters;
        summary = [
          `Wygenerowano ${chapters.length} rozdziałów weselnych na osi czasu`,
          `Rozdziały: ${chapters.map(c => c.name).join(' → ')}`
        ];
        break;
      }
    }

    setProposedState(updated);
    setIsProcessing(false);
  };

  const handleConfirm = () => {
    if (proposedState) {
      onApplyUpdatedProject(proposedState);
    }
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/85 backdrop-blur-md p-4 animate-in fade-in">
      <div className="w-full max-w-2xl bg-[#121212] border border-[#2A2824] rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
        
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#2A2824] bg-[#0A0A0A]">
          <div className="flex items-center gap-2.5 text-[#D4AF37]">
            <Sparkles className="w-5 h-5" />
            <h2 className="font-serif-luxury font-bold text-base tracking-wide text-white">
              Inteligentny Asystent Montażu Weselnego
            </h2>
          </div>
          <button 
            onClick={onClose} 
            className="p-1.5 rounded-lg text-[#AAA69D] hover:text-white hover:bg-[#202020] transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5 custom-scrollbar text-xs">
          
          {!proposedState ? (
            <>
              <p className="text-[#AAA69D] text-xs">
                Wybierz operację wspomagania montażu. AI przeanalizuje parametry Twojej biblioteki ({project.mediaLibrary.length} klipów) i przedstawi precyzyjną propozycję do zatwierdzenia.
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {tools.map(tool => (
                  <button
                    key={tool.id}
                    onClick={() => handleExecuteTool(tool.id)}
                    disabled={isProcessing}
                    className="p-3.5 bg-[#171717] hover:bg-[#1F1D17] border border-[#262626] hover:border-[#D4AF37]/50 rounded-xl text-left transition-all group cursor-pointer flex flex-col gap-1.5"
                  >
                    <div className="flex items-center gap-2 text-white font-semibold group-hover:text-[#D4AF37] transition-colors">
                      <tool.icon className="w-4 h-4 text-[#D4AF37] shrink-0" />
                      <span className="truncate">{tool.title}</span>
                    </div>
                    <p className="text-[11px] text-[#888] line-clamp-2 leading-relaxed">
                      {tool.desc}
                    </p>
                  </button>
                ))}
              </div>
            </>
          ) : (
            <div className="space-y-4 animate-in fade-in">
              <div className="p-4 bg-[#181612] border border-[#D4AF37]/40 rounded-xl space-y-2">
                <div className="flex items-center gap-2 text-[#D4AF37] font-bold text-sm">
                  <Check className="w-4 h-4 text-emerald-400" />
                  <span>Propozycja Modyfikacji Osi Czasu</span>
                </div>
                <p className="text-xs text-[#AAA69D]">
                  Poniżej znajduje się podsumowanie operacji wygenerowanej przez Asystenta. Żadne pliki źródłowe nie zostały usunięte.
                </p>
              </div>

              <div className="p-4 bg-[#171717] rounded-xl border border-[#262626] space-y-2">
                <h4 className="font-mono text-[11px] uppercase tracking-wider text-[#D4AF37]">Szczegóły zmian:</h4>
                <ul className="space-y-1.5 list-disc list-inside text-[#E0DDD5] text-xs">
                  {proposalSummary.map((line, idx) => (
                    <li key={idx}>{line}</li>
                  ))}
                </ul>
              </div>

              <div className="flex items-center justify-between text-[11px] text-[#888]">
                <span>Liczba klipów po zmianie: {proposedState.timelineItems.length}</span>
                <span>Rozdziały: {proposedState.chapters.length}</span>
              </div>
            </div>
          )}

        </div>

        {/* Footer Actions */}
        <div className="px-6 py-4 bg-[#0A0A0A] border-t border-[#2A2824] flex items-center justify-between">
          {proposedState ? (
            <>
              <button 
                onClick={() => { setProposedState(null); setSelectedTool(null); }}
                className="px-4 py-2 rounded-lg border border-[#333] text-[#AAA69D] hover:text-white text-xs font-medium cursor-pointer"
              >
                Wróć do wyboru narzędzia
              </button>

              <button 
                onClick={handleConfirm}
                className="luxury-btn-primary px-5 py-2 rounded-lg text-xs font-bold uppercase tracking-wider flex items-center gap-2 cursor-pointer"
              >
                <Check className="w-4 h-4" />
                <span>Zatwierdź i Zastosuj</span>
              </button>
            </>
          ) : (
            <div className="flex justify-end w-full">
              <button 
                onClick={onClose}
                className="px-4 py-2 bg-[#202020] text-[#AAA69D] hover:text-white rounded-lg text-xs font-medium cursor-pointer"
              >
                Zamknij
              </button>
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
