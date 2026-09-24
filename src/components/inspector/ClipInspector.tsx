import React from 'react';
import type { TimelineItem, MediaClip } from '../../types/project';
import { Scissors, Volume2, Move, Clock, Image as ImageIcon, Sparkles, Type } from 'lucide-react';

interface ClipInspectorProps {
  item: TimelineItem;
  media: MediaClip;
  onUpdate: (id: string, updates: Partial<TimelineItem>) => void;
  onSplit?: (id: string, splitAtSourceTime: number) => void;
}

export function ClipInspector({ item, media, onUpdate, onSplit }: ClipInspectorProps) {
  
  const handleUpdate = (field: keyof TimelineItem, value: any) => {
    onUpdate(item.id, { [field]: value });
  };

  const handleTrimChange = (type: 'start' | 'end', val: string) => {
    const num = parseFloat(val);
    if (isNaN(num)) return;
    
    if (type === 'start') {
      const newStart = Math.max(0, Math.min(num, item.sourceEnd - 0.5));
      const newDuration = item.sourceEnd - newStart;
      onUpdate(item.id, { sourceStart: newStart, duration: newDuration });
    } else {
      const newEnd = Math.max(item.sourceStart + 0.5, Math.min(num, media.duration));
      const newDuration = newEnd - item.sourceStart;
      onUpdate(item.id, { sourceEnd: newEnd, duration: newDuration });
    }
  };

  const handleSplit = () => {
    if (!onSplit) return;
    // Split in the middle for simplicity if we don't have playhead
    const midPoint = item.sourceStart + ((item.sourceEnd - item.sourceStart) / 2);
    onSplit(item.id, midPoint);
  };

  return (
    <div className="h-full flex flex-col bg-[#121212] border-l border-[#2A2824] overflow-hidden w-full md:w-80 shrink-0">
      <div className="h-14 border-b border-[#2A2824] flex items-center px-4 shrink-0">
        <h3 className="font-serif-luxury font-bold text-[#F2EFE8]">Inspektor</h3>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-6 custom-scrollbar">
        
        {/* Basic Info */}
        <div className="space-y-3">
          <div className="flex items-start gap-3">
            <div className="w-16 h-12 bg-black rounded-md overflow-hidden shrink-0 border border-white/10">
              {media.thumbnailUrl ? (
                <img src={media.thumbnailUrl} alt="Thumb" className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <ImageIcon className="w-4 h-4 text-[#555]" />
                </div>
              )}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-white truncate" title={media.name}>{media.name}</p>
              <p className="text-xs text-[#AAA69D] font-mono mt-1">
                {(item.duration).toFixed(1)}s
              </p>
            </div>
          </div>
        </div>

        {/* Trim Controls */}
        <div className="space-y-3 pt-4 border-t border-[#2A2824]">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-bold text-[#D4AF37] uppercase flex items-center gap-1.5">
              <Scissors className="w-3.5 h-3.5" /> Przycinanie
            </h4>
            {onSplit && (
              <button 
                onClick={handleSplit}
                className="text-[10px] bg-[#2A2824] text-white px-2 py-1 rounded hover:bg-[#D4AF37] hover:text-black transition-colors"
              >
                Podziel w połowie
              </button>
            )}
          </div>
          
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-[10px] font-mono text-[#AAA69D]">START (s)</label>
              <input 
                type="number" 
                min="0" 
                max={item.sourceEnd - 0.5} 
                step="0.1"
                value={item.sourceStart.toFixed(1)}
                onChange={(e) => handleTrimChange('start', e.target.value)}
                className="w-full h-11 bg-[#1A1A1A] border border-[#2A2824] rounded-md px-3 text-sm text-white focus:border-[#D4AF37] focus:outline-none transition-colors"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-[10px] font-mono text-[#AAA69D]">KONIEC (s)</label>
              <input 
                type="number" 
                min={item.sourceStart + 0.5} 
                max={media.duration} 
                step="0.1"
                value={item.sourceEnd.toFixed(1)}
                onChange={(e) => handleTrimChange('end', e.target.value)}
                className="w-full h-11 bg-[#1A1A1A] border border-[#2A2824] rounded-md px-3 text-sm text-white focus:border-[#D4AF37] focus:outline-none transition-colors"
              />
            </div>
          </div>
        </div>

        {/* Audio Controls */}
        <div className="space-y-3 pt-4 border-t border-[#2A2824]">
          <h4 className="text-xs font-bold text-[#D4AF37] uppercase flex items-center gap-1.5">
            <Volume2 className="w-3.5 h-3.5" /> Dźwięk Oryginalny
          </h4>
          
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-[#F2EFE8]">Wycisz</span>
              <button 
                onClick={() => handleUpdate('muted', !item.muted)}
                className={`w-10 h-5 rounded-full relative transition-colors ${item.muted ? 'bg-[#D4AF37]' : 'bg-[#2A2824]'}`}
              >
                <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${item.muted ? 'left-5' : 'left-0.5'}`} />
              </button>
            </div>

            {!item.muted && (
              <div className="space-y-1.5">
                <div className="flex justify-between text-[10px] font-mono text-[#AAA69D]">
                  <label>GŁOŚNOŚĆ</label>
                  <span>{Math.round(item.volume * 100)}%</span>
                </div>
                <input 
                  type="range" 
                  min="0" 
                  max="1" 
                  step="0.05"
                  value={item.volume}
                  onChange={(e) => handleUpdate('volume', parseFloat(e.target.value))}
                  className="w-full h-8 accent-[#D4AF37]"
                />
              </div>
            )}
          </div>
        </div>

        {/* Framing & Normalization (Req 10: FIT, FILL, ORIGINAL) */}
        <div className="space-y-3 pt-4 border-t border-[#2A2824]">
          <h4 className="text-xs font-bold text-[#D4AF37] uppercase flex items-center gap-1.5 font-mono">
            <Move className="w-3.5 h-3.5" /> Kadr i Dopasowanie
          </h4>
          
          <div className="space-y-2">
            <label className="text-[10px] font-mono text-[#AAA69D] uppercase">Tryb Kadrowania</label>
            <div className="grid grid-cols-3 gap-1.5 bg-[#181818] p-1 rounded-lg border border-[#2E2E2E]">
              {(['fit', 'fill', 'original'] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => handleUpdate('fitMode', mode)}
                  className={`py-1.5 text-xs font-semibold rounded-md transition-all uppercase cursor-pointer ${
                    (item.fitMode || 'fit') === mode
                      ? 'bg-[#D4AF37] text-black shadow-md'
                      : 'text-[#888] hover:text-white'
                  }`}
                >
                  {mode === 'fit' ? 'FIT' : (mode === 'fill' ? 'FILL' : 'ORIG')}
                </button>
              ))}
            </div>
            <p className="text-[10px] text-[#777] font-mono">
              {(item.fitMode || 'fit') === 'fit' && 'Cały obraz widoczny bez przycinania.'}
              {item.fitMode === 'fill' && 'Wypełnia cały kadr (może przyciąć krawędzie).'}
              {item.fitMode === 'original' && 'Oryginalne proporcje bez skalowania.'}
            </p>
          </div>

          <div className="space-y-1.5 pt-1">
            <label className="text-[10px] font-mono text-[#AAA69D] uppercase">Obrót (Stopnie)</label>
            <div className="grid grid-cols-4 gap-1.5 bg-[#181818] p-1 rounded-lg border border-[#2E2E2E]">
              {[0, 90, 180, 270].map((deg) => (
                <button
                  key={deg}
                  type="button"
                  onClick={() => handleUpdate('rotation', deg)}
                  className={`py-1 text-xs font-mono font-bold rounded-md transition-all cursor-pointer ${
                    (item.rotation || 0) === deg
                      ? 'bg-[#D4AF37] text-black'
                      : 'text-[#888] hover:text-white'
                  }`}
                >
                  {deg}°
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Transitions (Basic) */}
        <div className="space-y-3 pt-4 border-t border-[#2A2824]">
          <h4 className="text-xs font-bold text-[#D4AF37] uppercase flex items-center gap-1.5">
            <Move className="w-3.5 h-3.5" /> Przejścia
          </h4>
          
          <div className="space-y-1.5">
            <label className="text-[10px] font-mono text-[#AAA69D]">EFEKT WEJŚCIA</label>
            <select 
              value={item.transitionIn || 'cut'}
              onChange={(e) => handleUpdate('transitionIn', e.target.value)}
              className="w-full h-11 bg-[#1A1A1A] border border-[#2A2824] rounded-md px-3 text-sm text-white focus:border-[#D4AF37] focus:outline-none"
            >
              <option value="cut">Ostre cięcie (Cut)</option>
              <option value="fade">Zanik z czerni (Fade)</option>
              <option value="dissolve">Przenikanie (Dissolve)</option>
            </select>
          </div>
        </div>

        {/* Text Title Card Section (Plansze Tekstowe) */}
        <div className="space-y-4 pt-4 border-t border-[#2A2824]">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-bold text-[#D4AF37] uppercase flex items-center gap-1.5 font-mono">
              <Type className="w-3.5 h-3.5" /> Plansza Tekstowa (Intro)
            </h4>
            <span className="text-[9px] bg-[#2D2411] border border-[#D4AF37]/30 text-[#FDE047] font-bold px-1.5 py-0.5 rounded uppercase">NOWOŚĆ</span>
          </div>

          <div className="flex items-center justify-between">
            <span className="text-sm text-[#F2EFE8]">Dodaj przed ujęciem</span>
            <button 
              onClick={() => {
                const isEnabled = !(item.titleCard?.enabled);
                handleUpdate('titleCard', {
                  enabled: isEnabled,
                  text: item.titleCard?.text || 'Rozdział',
                  duration: item.titleCard?.duration || 3,
                  style: item.titleCard?.style || 'elegant',
                  backgroundColor: item.titleCard?.backgroundColor || '#0A0A0A',
                  subtitle: item.titleCard?.subtitle || ''
                });
              }}
              className={`w-10 h-5 rounded-full relative transition-colors ${item.titleCard?.enabled ? 'bg-[#D4AF37]' : 'bg-[#2A2824]'}`}
            >
              <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${item.titleCard?.enabled ? 'left-5' : 'left-0.5'}`} />
            </button>
          </div>

          {item.titleCard?.enabled && (
            <div className="space-y-4 bg-[#181818] p-3 rounded-xl border border-[#2E2E2E]">
              {/* AI Auto Generate Button */}
              <button
                type="button"
                onClick={() => {
                  // Smart AI narrative generator based on clip metadata
                  const clipNameLower = media.name.toLowerCase();
                  let aiTitle = 'Piękny Dzień';
                  let aiSub = 'Ujęcia z przygotowań i zabawy';

                  if (clipNameLower.includes('przygotow') || clipNameLower.includes('makeup') || clipNameLower.includes('ubier')) {
                    if (clipNameLower.includes('mlodego') || clipNameLower.includes('pan_')) {
                      aiTitle = 'PRZYGOTOWANIA PANA MŁODEGO';
                      aiSub = 'Ostatnie detale przed najważniejszą drogą';
                    } else if (clipNameLower.includes('mlodej') || clipNameLower.includes('panna')) {
                      aiTitle = 'PRZYGOTOWANIA PANNY MŁODEJ';
                      aiSub = 'Chwile czułości i najpiękniejszych emocji';
                    } else {
                      aiTitle = 'PRZYGOTOWANIA ŚLUBNE';
                      aiSub = 'Oczekiwanie, uśmiech i chwile z najbliższymi';
                    }
                  } else if (clipNameLower.includes('koscio') || clipNameLower.includes('slub') || clipNameLower.includes('ceremon')) {
                    aiTitle = 'UROCZYSTA CEREMONIA';
                    aiSub = 'Słowa, które połączyły dwa serca na zawsze';
                  } else if (clipNameLower.includes('tanie') || clipNameLower.includes('pierwsz')) {
                    aiTitle = 'PIERWSZY TANIEC';
                    aiSub = 'Wspólny krok w nową drogę życia';
                  } else if (clipNameLower.includes('bram') || clipNameLower.includes('gosc')) {
                    aiTitle = 'WESELNI GOŚCIE';
                    aiSub = 'Radość, uśmiechy i wspólne gratulacje';
                  } else if (clipNameLower.includes('plener') || clipNameLower.includes('sesja') || clipNameLower.includes('garden')) {
                    aiTitle = 'ROMANTYCZNA SESJA';
                    aiSub = 'Zakochani w świetle zachodzącego słońca';
                  } else if (clipNameLower.includes('zabawa') || clipNameLower.includes('oczepin') || clipNameLower.includes('party')) {
                    aiTitle = 'WESELNE ŚWIĘTOWANIE';
                    aiSub = 'Niezapomniana zabawa na parkiecie do białego rana';
                  } else if (clipNameLower.includes('obraczk') || clipNameLower.includes('pierscie')) {
                    aiTitle = 'SYMBOLE MIŁOŚCI';
                    aiSub = 'Obrączki jako znak wiecznej wierności';
                  } else {
                    aiTitle = media.name.replace(/\.[^/.]+$/, "").toUpperCase();
                    aiSub = 'Magiczne momenty uchwycone w kadrze';
                  }

                  handleUpdate('titleCard', {
                    ...item.titleCard,
                    text: aiTitle,
                    subtitle: aiSub
                  });
                }}
                className="w-full py-2 bg-gradient-to-r from-[#D4AF37] to-[#FDE047] hover:from-[#B5922C] hover:to-[#D4AF37] text-black font-bold rounded-lg text-xs flex items-center justify-center gap-1.5 transition-all shadow-md cursor-pointer"
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>Generuj tytuł przez WeseleAI</span>
              </button>

              {/* Text Inputs */}
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-mono text-[#AAA69D]">GŁÓWNY TEKST PLANSZY</label>
                  <input 
                    type="text" 
                    value={item.titleCard.text}
                    onChange={(e) => handleUpdate('titleCard', { ...item.titleCard, text: e.target.value })}
                    placeholder="Wpisz tekst planszy..."
                    className="w-full h-10 bg-[#121212] border border-[#2E2E2E] rounded-md px-3 text-sm text-white focus:border-[#D4AF37] focus:outline-none"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-mono text-[#AAA69D]">PODTYTUŁ / OPIS</label>
                  <input 
                    type="text" 
                    value={item.titleCard.subtitle || ''}
                    onChange={(e) => handleUpdate('titleCard', { ...item.titleCard, subtitle: e.target.value })}
                    placeholder="Opcjonalny podtytuł planszy..."
                    className="w-full h-10 bg-[#121212] border border-[#2E2E2E] rounded-md px-3 text-sm text-white focus:border-[#D4AF37] focus:outline-none"
                  />
                </div>
              </div>

              {/* Style Selection */}
              <div className="space-y-1.5">
                <label className="text-[10px] font-mono text-[#AAA69D]">STYL TYPOGRAFII</label>
                <select
                  value={item.titleCard.style || 'elegant'}
                  onChange={(e) => handleUpdate('titleCard', { ...item.titleCard, style: e.target.value })}
                  className="w-full h-10 bg-[#121212] border border-[#2E2E2E] rounded-md px-2 text-xs text-white focus:border-[#D4AF37] focus:outline-none"
                >
                  <option value="classic">Retro Classic (Serif)</option>
                  <option value="elegant">Luksusowy Gold (Serif N.Y.)</option>
                  <option value="minimalist">Modern Minimal (Sans-Serif)</option>
                  <option value="cinematic">Cinematic Bold (Impact)</option>
                </select>
              </div>

              {/* Background Color */}
              <div className="space-y-1.5">
                <label className="text-[10px] font-mono text-[#AAA69D]">TŁO PLANSZY</label>
                <select
                  value={item.titleCard.backgroundColor || '#0A0A0A'}
                  onChange={(e) => handleUpdate('titleCard', { ...item.titleCard, backgroundColor: e.target.value })}
                  className="w-full h-10 bg-[#121212] border border-[#2E2E2E] rounded-md px-2 text-xs text-white focus:border-[#D4AF37] focus:outline-none"
                >
                  <option value="#0A0A0A">Głęboka Czerń (#0A0A0A)</option>
                  <option value="#1C1917">Ciepły Ciemny Brąz (#1C1917)</option>
                  <option value="#0F172A">Nastrojowy Granat (#0F172A)</option>
                  <option value="gradient">Kinowy Gradient (Slate-Gray)</option>
                </select>
              </div>

              {/* Duration Slider */}
              <div className="space-y-1.5">
                <div className="flex justify-between text-[10px] font-mono text-[#AAA69D]">
                  <label>CZAS TRWANIA PLANSZY</label>
                  <span>{item.titleCard.duration || 3}s</span>
                </div>
                <input 
                  type="range" 
                  min="2" 
                  max="6" 
                  step="1"
                  value={item.titleCard.duration || 3}
                  onChange={(e) => handleUpdate('titleCard', { ...item.titleCard, duration: parseInt(e.target.value) })}
                  className="w-full h-6 accent-[#D4AF37]"
                />
              </div>
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
