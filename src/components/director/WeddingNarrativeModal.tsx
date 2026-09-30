import React, { useState } from 'react';
import { 
  Heart, 
  Sparkles, 
  Calendar, 
  User, 
  MapPin, 
  Type, 
  Film, 
  CheckCircle2, 
  X, 
  Sliders, 
  Wand2, 
  RotateCcw,
  BookOpen,
  Volume2
} from 'lucide-react';
import type { 
  ProjectState, 
  TextLayer, 
  WeddingChapter, 
  ColorGradingPreset, 
  TimelineItem 
} from '../../types/project';
import { useStudioToast } from '../common/ToastContext';

interface WeddingNarrativeModalProps {
  isOpen: boolean;
  onClose: () => void;
  project: ProjectState;
  onApplyProject: (updatedState: ProjectState) => void;
}

export type NarrativeStyleVibe = 'nostalgic' | 'cinematic' | 'fairytale' | 'modern';

interface MomentSceneDef {
  id: string;
  actTitle: string;
  chapterKey: WeddingChapter['chapterKey'];
  title: string;
  description: string;
  dateText: string;
}

export function WeddingNarrativeModal({
  isOpen,
  onClose,
  project,
  onApplyProject
}: WeddingNarrativeModalProps) {
  const toast = useStudioToast();

  // Primary user settings
  const [brideName, setBrideName] = useState('Joanna');
  const [groomName, setGroomName] = useState('Piotr');
  const [weddingDate, setWeddingDate] = useState('15 Sierpnia 2026');
  const [locationName, setLocationName] = useState('Kościół Św. Anny & Dwór Pod Lipami');
  const [selectedVibe, setSelectedVibe] = useState<NarrativeStyleVibe>('nostalgic');

  // Moments / Acts in narrative story
  const [moments, setMoments] = useState<MomentSceneDef[]>([
    {
      id: 'm1',
      actTitle: 'Akt I: Prolog',
      chapterKey: 'opening',
      title: 'Joanna & Piotr',
      description: 'Początek naszej wspólnej drogi przepełnionej miłością i nadzieją.',
      dateText: '15 Sierpnia 2026'
    },
    {
      id: 'm2',
      actTitle: 'Akt II: Przygotowania',
      chapterKey: 'preparations',
      title: 'Chwile Przed "Tak"',
      description: 'Subtelne emocje, błogosławieństwo i pierwsze wzruszające spojrzenie Piotra na Joannę.',
      dateText: 'Poranek Ślubny'
    },
    {
      id: 'm3',
      actTitle: 'Akt III: Ceremonia',
      chapterKey: 'ceremony',
      title: 'Przysięga Małżeńska',
      description: 'Ślubuję Ci miłość, wierność i uczciwość małżeńską... Słowa połączone w jedno na zawsze.',
      dateText: 'Godzina 16:00'
    },
    {
      id: 'm4',
      actTitle: 'Akt IV: Życzenia i Toast',
      chapterKey: 'congratulations',
      title: 'Radość i Ciepło Bliskich',
      description: 'Ciepłe uściski, wzruszające gratulacje oraz pierwszy toast za pomyślność Nowożeńców.',
      dateText: 'Przyjęcie Weselne'
    },
    {
      id: 'm5',
      actTitle: 'Akt V: Pierwszy Taniec',
      chapterKey: 'first_dance',
      title: 'Pierwszy Taniec w Chmurach',
      description: 'Wpatrzeni w siebie, jakby cały świat na tę jedną chwilę się zatrzymał.',
      dateText: 'Wieczór Magii'
    },
    {
      id: 'm6',
      actTitle: 'Akt VI: Zabawa & Tort',
      chapterKey: 'party',
      title: 'Noc Pełna Radości & Tort Ślubny',
      description: 'Niezapomniane tańce, wspólny tort i świętowanie z przyjaciółmi do samego świtu.',
      dateText: 'Noc Weselna'
    },
    {
      id: 'm7',
      actTitle: 'Akt VII: Epilog',
      chapterKey: 'ending',
      title: 'I żyli długo i szczęśliwie...',
      description: '15.08.2026 • Na zawsze razem — Joanna & Piotr.',
      dateText: 'Na Zawsze'
    }
  ]);

  if (!isOpen) return null;

  const handleUpdateMoment = (id: string, field: keyof MomentSceneDef, value: string) => {
    setMoments(prev => prev.map(m => m.id === id ? { ...m, [field]: value } : m));
  };

  const handleApplyNarrative = () => {
    // Determine overall project duration from timeline or estimate
    const timelineDuration = project.timelineItems.length > 0 
      ? project.timelineItems.reduce((max, i) => Math.max(max, i.timelineStart + i.duration), 0)
      : 120; // 2 minutes default if timeline is empty

    const totalMoments = moments.length;
    const segmentDuration = timelineDuration > 0 ? timelineDuration / totalMoments : 15;

    // Build new TextLayers
    const newTextLayers: TextLayer[] = [];
    const newChapters: WeddingChapter[] = [];

    // Color preset mapping based on selected vibe
    let colorGrade: ColorGradingPreset = 'vintage_35mm';
    let textStyle: 'cinematic' | 'elegant' | 'classic' | 'minimalist' = 'elegant';
    let textColor = '#F2EFE8';

    if (selectedVibe === 'nostalgic') {
      colorGrade = 'vintage_35mm';
      textStyle = 'elegant';
      textColor = '#F5E6C8'; // Warm ivory
    } else if (selectedVibe === 'cinematic') {
      colorGrade = 'golden_hour';
      textStyle = 'cinematic';
      textColor = '#FFFFFF';
    } else if (selectedVibe === 'fairytale') {
      colorGrade = 'pastel_boho';
      textStyle = 'classic';
      textColor = '#FFF5F8';
    } else {
      colorGrade = 'vivid_master';
      textStyle = 'minimalist';
      textColor = '#FFFFFF';
    }

    moments.forEach((moment, idx) => {
      const startTime = idx * segmentDuration;
      const endTime = Math.min(timelineDuration, (idx + 1) * segmentDuration);

      // Chapter
      newChapters.push({
        id: `chap_wedding_${idx}_${Date.now()}`,
        chapterKey: moment.chapterKey,
        name: moment.title,
        startTime,
        endTime,
        description: moment.description
      });

      // 1. Main Title Layer for Chapter
      newTextLayers.push({
        id: `tl_wedding_title_${idx}_${Date.now()}`,
        text: moment.title,
        type: 'title',
        style: textStyle,
        timelineStart: startTime + 0.5,
        duration: Math.min(4.5, Math.max(2.5, segmentDuration - 1)),
        position: { x: 0.5, y: 0.22 },
        fontSize: 2.8,
        fontWeight: 'bold',
        color: textColor,
        backgroundColor: 'rgba(0, 0, 0, 0.45)',
        shadow: true,
        animation: 'fade'
      });

      // 2. Subtitle Date / Location stamp
      const subText = `${moment.dateText} • ${brideName} & ${groomName}`;
      newTextLayers.push({
        id: `tl_wedding_sub_${idx}_${Date.now()}`,
        text: subText,
        type: 'date',
        style: 'minimalist',
        timelineStart: startTime + 0.8,
        duration: Math.min(4.0, Math.max(2.0, segmentDuration - 1.5)),
        position: { x: 0.5, y: 0.32 },
        fontSize: 1.4,
        fontWeight: 'normal',
        color: '#D4AF37', // Gold accent
        shadow: true,
        animation: 'slide'
      });

      // 3. Short Description / Emotional Caption
      if (moment.description && moment.description.trim()) {
        newTextLayers.push({
          id: `tl_wedding_desc_${idx}_${Date.now()}`,
          text: moment.description,
          type: 'caption',
          style: textStyle,
          timelineStart: startTime + 1.2,
          duration: Math.min(5.0, Math.max(3.0, segmentDuration - 2)),
          position: { x: 0.5, y: 0.84 },
          fontSize: 1.6,
          fontWeight: 'normal',
          color: '#FFFFFF',
          backgroundColor: 'rgba(15, 15, 15, 0.7)',
          shadow: true,
          animation: 'fade'
        });
      }
    });

    // Update timeline items with cinematic transitions & title cards where appropriate
    const updatedTimelineItems: TimelineItem[] = project.timelineItems.map((item, idx) => {
      const isActStart = idx % Math.max(1, Math.floor(project.timelineItems.length / totalMoments)) === 0;
      const correspondingMoment = moments[Math.floor((idx / project.timelineItems.length) * totalMoments)] || moments[0];

      if (idx === 0) {
        return {
          ...item,
          transitionIn: 'dip_black',
          titleCard: {
            enabled: true,
            text: `Ślub ${brideName} & ${groomName}`,
            subtitle: `${weddingDate} • ${locationName}`,
            duration: 3.5,
            style: 'liturgical',
            backgroundColor: '#0F0E0C',
            cardType: 'intro'
          }
        };
      }

      if (idx === project.timelineItems.length - 1 && project.timelineItems.length > 1) {
        return {
          ...item,
          outroCard: {
            enabled: true,
            text: 'Dziękujemy za Wspólne Chwile',
            subtitle: `${brideName} & ${groomName} • ${weddingDate}`,
            duration: 4.0,
            style: 'elegant',
            backgroundColor: '#0A0805',
            cardType: 'outro'
          }
        };
      }

      return {
        ...item,
        transitionIn: isActStart ? 'dissolve' : item.transitionIn || 'cut',
        titleCard: isActStart ? {
          enabled: false,
          text: correspondingMoment.title,
          subtitle: `${brideName} & ${groomName} • ${weddingDate}`,
          duration: 2.5,
          style: textStyle,
          backgroundColor: '#0F0E0C'
        } : item.titleCard
      };
    });

    // Construct updated project state
    const updatedState: ProjectState = {
      ...project,
      name: `Ślub ${brideName} & ${groomName} — ${weddingDate}`,
      settings: {
        ...project.settings,
        colorGrade: colorGrade,
        letterbox: 'cinemascope'
      },
      textLayers: newTextLayers,
      chapters: newChapters,
      timelineItems: updatedTimelineItems,
      updatedAt: new Date().toISOString()
    };

    onApplyProject(updatedState);
    toast.showSuccess(`Spójna narracja ślubna dla ${brideName} i ${groomName} została wygenerowana! Podgląd i linia czasu zostały zaktualizowane.`);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-black/80 backdrop-blur-md animate-fadeIn">
      <div className="bg-[#141414] border border-[#332F28] w-full max-w-4xl max-h-[92vh] rounded-2xl shadow-2xl flex flex-col overflow-hidden text-slate-200">
        
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#2A2722] bg-[#1A1814]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#D4AF37]/20 to-[#997A15]/30 border border-[#D4AF37]/40 flex items-center justify-center text-[#D4AF37] shadow-inner">
              <Heart className="w-5 h-5 fill-[#D4AF37]/20" />
            </div>
            <div>
              <h2 className="text-lg font-serif-luxury font-bold text-[#F2EFE8] flex items-center gap-2">
                Kreator Narracji Ślubnej
                <span className="text-xs px-2 py-0.5 rounded-full bg-[#D4AF37]/15 text-[#D4AF37] border border-[#D4AF37]/30 font-sans font-medium">
                  Love Story Studio
                </span>
              </h2>
              <p className="text-xs text-slate-400">
                Twórz nostalgiczne, emocjonalne opowieści z datami, imionami i opisami kluczowych momentów
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar">
          
          {/* Main Info Box */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 p-4 rounded-xl bg-[#1A1916] border border-[#2D2A24]">
            
            {/* Bride & Groom */}
            <div className="space-y-1.5">
              <label className="text-[11px] font-semibold text-[#D4AF37] uppercase tracking-wider flex items-center gap-1.5">
                <User className="w-3.5 h-3.5" />
                Imiona Nowożeńców
              </label>
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="text"
                  value={brideName}
                  onChange={(e) => setBrideName(e.target.value)}
                  placeholder="Panna Młoda"
                  className="w-full px-3 py-1.5 bg-[#111] border border-[#3A352D] rounded-lg text-xs text-white focus:border-[#D4AF37] focus:outline-none"
                />
                <input
                  type="text"
                  value={groomName}
                  onChange={(e) => setGroomName(e.target.value)}
                  placeholder="Pan Młody"
                  className="w-full px-3 py-1.5 bg-[#111] border border-[#3A352D] rounded-lg text-xs text-white focus:border-[#D4AF37] focus:outline-none"
                />
              </div>
            </div>

            {/* Wedding Date */}
            <div className="space-y-1.5">
              <label className="text-[11px] font-semibold text-[#D4AF37] uppercase tracking-wider flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5" />
                Data Ślubu
              </label>
              <input
                type="text"
                value={weddingDate}
                onChange={(e) => setWeddingDate(e.target.value)}
                placeholder="np. 15 Sierpnia 2026"
                className="w-full px-3 py-1.5 bg-[#111] border border-[#3A352D] rounded-lg text-xs text-white focus:border-[#D4AF37] focus:outline-none"
              />
            </div>

            {/* Location */}
            <div className="space-y-1.5">
              <label className="text-[11px] font-semibold text-[#D4AF37] uppercase tracking-wider flex items-center gap-1.5">
                <MapPin className="w-3.5 h-3.5" />
                Miejsce / Pałac
              </label>
              <input
                type="text"
                value={locationName}
                onChange={(e) => setLocationName(e.target.value)}
                placeholder="np. Kościół & Pałacyk Ślubny"
                className="w-full px-3 py-1.5 bg-[#111] border border-[#3A352D] rounded-lg text-xs text-white focus:border-[#D4AF37] focus:outline-none"
              />
            </div>

          </div>

          {/* Style & Vibe Selector */}
          <div className="space-y-2">
            <label className="text-xs font-semibold text-[#D4AF37] uppercase tracking-wider flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5" />
              Klimat i Ton Emocjonalny Filmowej Opowieści
            </label>
            
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              {[
                { 
                  key: 'nostalgic', 
                  label: 'Nostalgiczny 35mm', 
                  desc: 'Aksamitne barwy retro, ciepły odcień taśmy filmowej, romantyczny klimat memories',
                  badge: 'Polecane'
                },
                { 
                  key: 'cinematic', 
                  label: 'Złota Godzina', 
                  desc: 'Kinowy dramatyzm, bursztynowe światło, wysoki kontrast, dojrzała elegancja',
                  badge: 'Luksus'
                },
                { 
                  key: 'fairytale', 
                  label: 'Bajkowa Sielanka', 
                  desc: 'Pastelowa jasność, miękkie światło, powiew swobody i poetyckie podpisy',
                  badge: 'Romantyczne'
                },
                { 
                  key: 'modern', 
                  label: 'Nowoczesne Love Story', 
                  desc: 'Czysty minimalizm, wyrazista typografia, dynamiczny montaż',
                  badge: 'Nowoczesne'
                }
              ].map(vibe => (
                <button
                  key={vibe.key}
                  onClick={() => setSelectedVibe(vibe.key as NarrativeStyleVibe)}
                  className={`p-3 rounded-xl border text-left transition-all cursor-pointer flex flex-col justify-between ${
                    selectedVibe === vibe.key
                      ? 'bg-[#1F1C16] border-[#D4AF37] ring-1 ring-[#D4AF37]/50 shadow-lg'
                      : 'bg-[#181714] border-[#2A2823] hover:border-[#423E37]'
                  }`}
                >
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-semibold text-xs text-[#F2EFE8]">{vibe.label}</span>
                      <span className="text-[10px] px-1.5 py-0.2 rounded bg-[#D4AF37]/10 text-[#D4AF37] border border-[#D4AF37]/20">
                        {vibe.badge}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-400 leading-relaxed line-clamp-2">
                      {vibe.desc}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Timeline Acts & Moments Customizer */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-[#D4AF37] uppercase tracking-wider flex items-center gap-1.5">
                <BookOpen className="w-3.5 h-3.5" />
                Scenariusz Kluczowych Momentów Ślubnych ({moments.length} Aktów)
              </label>
              <span className="text-[11px] text-slate-400">
                Łatwa edycja podpisów i nostalgicznych opisów
              </span>
            </div>

            <div className="space-y-3">
              {moments.map((moment, idx) => (
                <div 
                  key={moment.id} 
                  className="p-3.5 bg-[#181714] border border-[#2D2A24] rounded-xl hover:border-[#3D3830] transition-colors flex flex-col sm:flex-row gap-3 items-start sm:items-center"
                >
                  <div className="shrink-0 w-24">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-[#D4AF37] block">
                      {moment.actTitle}
                    </span>
                    <input
                      type="text"
                      value={moment.dateText}
                      onChange={(e) => handleUpdateMoment(moment.id, 'dateText', e.target.value)}
                      className="mt-1 w-full px-2 py-1 bg-[#111] border border-[#332F28] rounded text-[11px] text-slate-300 focus:border-[#D4AF37] focus:outline-none"
                      placeholder="Etykieta czasu"
                    />
                  </div>

                  <div className="flex-1 w-full space-y-1.5">
                    <input
                      type="text"
                      value={moment.title}
                      onChange={(e) => handleUpdateMoment(moment.id, 'title', e.target.value)}
                      className="w-full px-2.5 py-1 bg-[#111] border border-[#332F28] rounded text-xs font-semibold text-[#F2EFE8] focus:border-[#D4AF37] focus:outline-none"
                      placeholder="Tytuł sceny"
                    />
                    <input
                      type="text"
                      value={moment.description}
                      onChange={(e) => handleUpdateMoment(moment.id, 'description', e.target.value)}
                      className="w-full px-2.5 py-1 bg-[#111] border border-[#332F28] rounded text-xs text-slate-300 focus:border-[#D4AF37] focus:outline-none"
                      placeholder="Krótki, wzruszający opis kluczowego momentu..."
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

        </div>

        {/* Footer Actions */}
        <div className="px-6 py-4 border-t border-[#2A2722] bg-[#1A1814] flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="text-xs text-slate-400 flex items-center gap-1.5">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>Generuje warstwy tekstu, rozdziały, daty, efekt CinemaScope oraz podgląd w czasie rzeczywistym.</span>
          </div>

          <div className="flex items-center gap-3 w-full sm:w-auto justify-end">
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-xs font-medium text-slate-300 hover:bg-white/10 transition-colors cursor-pointer"
            >
              Anuluj
            </button>

            <button
              onClick={handleApplyNarrative}
              className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-[#D4AF37] to-[#B59226] text-black font-semibold text-xs hover:brightness-110 active:scale-95 transition-all shadow-lg flex items-center justify-center gap-2 cursor-pointer"
            >
              <Wand2 className="w-4 h-4" />
              <span>Aplikuj Narrację Ślubną & Odśwież Preview</span>
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}
