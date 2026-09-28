import React, { useState } from 'react';
import type { 
  TimelineItem, 
  MediaClip, 
  ClipColorAdjustments, 
  LookPreset, 
  FitMode, 
  TransitionType 
} from '../../types/project';
import { 
  Scissors, 
  Volume2, 
  Sliders, 
  RotateCw, 
  Maximize2, 
  Sparkles, 
  Type, 
  Layers, 
  Gauge, 
  Sun, 
  Eye, 
  RotateCcw,
  Film,
  Zap
} from 'lucide-react';

interface ClipInspectorProps {
  item: TimelineItem;
  media: MediaClip;
  onUpdate: (id: string, updates: Partial<TimelineItem>) => void;
  onSplit?: (id: string, splitAtSourceTime: number) => void;
}

type InspectorTab = 'TRANSFORM' | 'COLOR' | 'AUDIO' | 'TRANSITION' | 'TITLE';

export function ClipInspector({ item, media, onUpdate, onSplit }: ClipInspectorProps) {
  const [activeTab, setActiveTab] = useState<InspectorTab>('TRANSFORM');

  const colorAdj: ClipColorAdjustments = item.colorAdjustments || media.colorAdjustments || {
    exposure: 0,
    contrast: 0,
    brightness: 0,
    saturation: 0,
    temperature: 0,
    tint: 0,
    sharpness: 0,
    highlights: 0,
    shadows: 0,
    vignette: 0,
    lookPreset: 'none',
    lookIntensity: 100
  };

  const handleUpdate = (field: keyof TimelineItem, value: any) => {
    onUpdate(item.id, { [field]: value });
  };

  const handleColorUpdate = (field: keyof ClipColorAdjustments, value: any) => {
    const updated: ClipColorAdjustments = {
      ...colorAdj,
      [field]: value
    };
    onUpdate(item.id, { colorAdjustments: updated });
  };

  const handleResetColor = () => {
    const clean: ClipColorAdjustments = {
      exposure: 0,
      contrast: 0,
      brightness: 0,
      saturation: 0,
      temperature: 0,
      tint: 0,
      sharpness: 0,
      highlights: 0,
      shadows: 0,
      vignette: 0,
      lookPreset: 'none',
      lookIntensity: 100
    };
    onUpdate(item.id, { colorAdjustments: clean });
  };

  const handleTrimChange = (type: 'start' | 'end', val: string) => {
    const num = parseFloat(val);
    if (isNaN(num)) return;
    const speed = item.speed || 1;
    
    if (type === 'start') {
      const newStart = Math.max(0, Math.min(num, item.sourceEnd - 0.2));
      const newDuration = (item.sourceEnd - newStart) / speed;
      onUpdate(item.id, { sourceStart: newStart, duration: newDuration });
    } else {
      const newEnd = Math.max(item.sourceStart + 0.2, Math.min(num, media.duration));
      const newDuration = (newEnd - item.sourceStart) / speed;
      onUpdate(item.id, { sourceEnd: newEnd, duration: newDuration });
    }
  };

  const handleSplit = () => {
    if (!onSplit) return;
    const midPoint = item.sourceStart + ((item.sourceEnd - item.sourceStart) / 2);
    onSplit(item.id, midPoint);
  };

  // Convert seconds to Timecode HH:MM:SS:FF at 30 FPS
  const toTimecode = (sec: number) => {
    const s = Math.max(0, sec);
    const hrs = Math.floor(s / 3600);
    const mins = Math.floor((s % 3600) / 60);
    const secs = Math.floor(s % 60);
    const frames = Math.floor((s % 1) * 30);
    return `${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}:${frames.toString().padStart(2, '0')}`;
  };

  return (
    <div className="h-full flex flex-col bg-[#111114] border-l border-[#24242A] overflow-hidden w-full md:w-84 shrink-0 shadow-2xl">
      {/* Header */}
      <div className="p-3.5 border-b border-[#24242A] flex items-center justify-between bg-[#16161C]">
        <div className="flex items-center gap-2 min-w-0">
          <Layers className="w-4 h-4 text-[#D4AF37] shrink-0" />
          <h3 className="font-bold text-xs uppercase tracking-wider text-white truncate font-mono">
            Inspektor Ujęcia
          </h3>
        </div>
        <span className="text-[11px] font-mono text-[#D4AF37] bg-[#2A2414] px-2 py-0.5 rounded border border-[#3E3420]">
          {toTimecode(item.duration)}
        </span>
      </div>

      {/* Clip Mini Preview & Specs */}
      <div className="p-3.5 bg-[#141418] border-b border-[#222228] flex items-center gap-3">
        <div className="w-16 h-12 bg-black rounded-lg overflow-hidden shrink-0 border border-[#2E2E36] relative">
          {media.thumbnailUrl ? (
            <img src={media.thumbnailUrl} alt="Thumb" className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center bg-[#1A1A20]">
              <Film className="w-4 h-4 text-[#666]" />
            </div>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-bold text-white truncate" title={media.name}>{media.name}</p>
          <div className="flex items-center gap-2 text-[10px] text-[#888892] font-mono mt-0.5">
            <span>{media.width}×{media.height}</span>
            <span>•</span>
            <span>{media.fps || 30} FPS</span>
          </div>
        </div>
      </div>

      {/* Navigation Sub-Tabs */}
      <div className="grid grid-cols-5 bg-[#16161A] border-b border-[#222228] text-[10px] font-mono font-bold">
        {[
          { id: 'TRANSFORM', label: 'Kadr', icon: Maximize2 },
          { id: 'COLOR', label: 'Kolor', icon: Sun },
          { id: 'AUDIO', label: 'Audio', icon: Volume2 },
          { id: 'TRANSITION', label: 'Przejścia', icon: Sparkles },
          { id: 'TITLE', label: 'Plansza', icon: Type }
        ].map(tab => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as InspectorTab)}
              className={`py-2.5 flex flex-col items-center justify-center gap-1 border-b-2 transition-all cursor-pointer ${
                isActive 
                  ? 'border-[#D4AF37] text-[#D4AF37] bg-[#221D12]' 
                  : 'border-transparent text-[#777782] hover:text-white hover:bg-[#1A1A20]'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* Main Tab Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-5 custom-scrollbar text-xs">
        
        {/* TAB 1: TRANSFORM & TRIM */}
        {activeTab === 'TRANSFORM' && (
          <div className="space-y-4">
            {/* Precise Trim */}
            <div className="space-y-2.5 p-3 rounded-xl bg-[#17171C] border border-[#26262E]">
              <div className="flex items-center justify-between">
                <span className="font-bold text-[#D4AF37] uppercase flex items-center gap-1.5 font-mono text-[11px]">
                  <Scissors className="w-3.5 h-3.5" /> Precyzyjne Cięcie
                </span>
                {onSplit && (
                  <button 
                    onClick={handleSplit}
                    className="text-[10px] bg-[#2A2414] border border-[#3E3420] text-[#D4AF37] hover:text-white px-2 py-1 rounded-md transition-colors cursor-pointer"
                  >
                    Podziel na pół
                  </button>
                )}
              </div>

              <div className="grid grid-cols-2 gap-2.5 font-mono">
                <div className="space-y-1">
                  <label className="text-[10px] text-[#888892]">PUNKT IN (s)</label>
                  <input 
                    type="number" 
                    min="0" 
                    max={item.sourceEnd - 0.2} 
                    step="0.033"
                    value={item.sourceStart.toFixed(2)}
                    onChange={(e) => handleTrimChange('start', e.target.value)}
                    className="w-full bg-[#121215] border border-[#2E2E36] rounded-lg px-2.5 py-1.5 text-xs text-white focus:border-[#D4AF37] focus:outline-none"
                  />
                  <span className="text-[9px] text-[#666] block">{toTimecode(item.sourceStart)}</span>
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] text-[#888892]">PUNKT OUT (s)</label>
                  <input 
                    type="number" 
                    min={item.sourceStart + 0.2} 
                    max={media.duration} 
                    step="0.033"
                    value={item.sourceEnd.toFixed(2)}
                    onChange={(e) => handleTrimChange('end', e.target.value)}
                    className="w-full bg-[#121215] border border-[#2E2E36] rounded-lg px-2.5 py-1.5 text-xs text-white focus:border-[#D4AF37] focus:outline-none"
                  />
                  <span className="text-[9px] text-[#666] block">{toTimecode(item.sourceEnd)}</span>
                </div>
              </div>
            </div>

            {/* Fit & Aspect Ratio */}
            <div className="space-y-2">
              <label className="text-[11px] font-bold text-white uppercase font-mono block">
                Tryb Dopasowania Kadru
              </label>
              <div className="grid grid-cols-3 gap-1.5">
                {[
                  { id: 'fit', label: 'FIT (Całość)' },
                  { id: 'fill', label: 'FILL (Wypełnij)' },
                  { id: 'original', label: 'ORIGINAL' }
                ].map(mode => (
                  <button
                    key={mode.id}
                    onClick={() => handleUpdate('fitMode', mode.id as FitMode)}
                    className={`p-2 rounded-lg border text-center font-mono text-[10px] transition-all cursor-pointer ${
                      (item.fitMode || 'fit') === mode.id
                        ? 'bg-[#2A2414] border-[#D4AF37] text-[#D4AF37] font-bold'
                        : 'bg-[#18181D] border-[#2A2A32] text-[#888892] hover:text-white'
                    }`}
                  >
                    {mode.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Rotation & Speed */}
            <div className="grid grid-cols-2 gap-3 pt-2">
              <div className="space-y-1">
                <label className="text-[10px] text-[#888892] uppercase font-mono">Obrót Kątowy</label>
                <button
                  onClick={() => {
                    const currentRot = item.rotation || 0;
                    const nextRot = (currentRot + 90) % 360;
                    handleUpdate('rotation', nextRot);
                  }}
                  className="w-full py-2 bg-[#18181D] border border-[#2A2A32] hover:border-[#D4AF37] rounded-lg text-white font-mono flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <RotateCw className="w-3 h-3 text-[#D4AF37]" />
                  <span>{item.rotation || 0}°</span>
                </button>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] text-[#888892] uppercase font-mono">Prędkość Odtwarzania</label>
                <select
                  value={item.speed || 1.0}
                  onChange={(e) => {
                    const spd = parseFloat(e.target.value);
                    const dur = (item.sourceEnd - item.sourceStart) / spd;
                    onUpdate(item.id, { speed: spd, duration: dur });
                  }}
                  className="w-full bg-[#18181D] border border-[#2A2A32] rounded-lg px-2.5 py-2 text-white font-mono focus:border-[#D4AF37] focus:outline-none"
                >
                  <option value={0.25}>0.25× (Super Slow)</option>
                  <option value={0.5}>0.5× (Slow Motion)</option>
                  <option value={0.75}>0.75× (Subtle Slow)</option>
                  <option value={1.0}>1.0× (Normalna)</option>
                  <option value={1.25}>1.25× (Lekko szybciej)</option>
                  <option value={1.5}>1.5× (Szybka)</option>
                  <option value={2.0}>2.0× (Timelapse)</option>
                </select>
              </div>
            </div>

            {/* Scale Slider */}
            <div className="space-y-1 pt-2">
              <div className="flex justify-between text-[10px] font-mono text-[#888892]">
                <label>SKALA POWIĘKSZENIA</label>
                <span className="text-[#D4AF37] font-bold">{Math.round((item.scale || 1.0) * 100)}%</span>
              </div>
              <input 
                type="range" 
                min="0.5" 
                max="2.5" 
                step="0.05"
                value={item.scale || 1.0}
                onChange={(e) => handleUpdate('scale', parseFloat(e.target.value))}
                className="w-full h-2 bg-[#24242C] rounded-lg appearance-none cursor-pointer accent-[#D4AF37]"
              />
            </div>
          </div>
        )}

        {/* TAB 2: COLOR GRADING & LOOKS */}
        {activeTab === 'COLOR' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="font-bold text-[#D4AF37] uppercase font-mono text-[11px] flex items-center gap-1.5">
                <Sun className="w-3.5 h-3.5" /> Korekcja Barwna
              </span>
              <button
                onClick={handleResetColor}
                className="text-[10px] text-[#AAA] hover:text-white flex items-center gap-1 bg-[#1F1F24] px-2 py-1 rounded border border-[#2E2E36] cursor-pointer"
              >
                <RotateCcw className="w-2.5 h-2.5" />
                <span>Resetuj</span>
              </button>
            </div>

            {/* Look Preset Selector */}
            <div className="space-y-1.5">
              <label className="text-[10px] text-[#888892] uppercase font-mono">LUT / Styl Kinowy</label>
              <select
                value={colorAdj.lookPreset || 'none'}
                onChange={(e) => handleColorUpdate('lookPreset', e.target.value as LookPreset)}
                className="w-full bg-[#18181D] border border-[#2E2E36] rounded-lg px-2.5 py-2 text-white font-mono focus:border-[#D4AF37] focus:outline-none"
              >
                <option value="none">Brak (Naturalny)</option>
                <option value="golden_hour">✨ Golden Hour (Ciepły blask)</option>
                <option value="cinematic">🎬 Cinematic Film Look</option>
                <option value="warm">🔥 Ciepły Romantyczny</option>
                <option value="cool">❄️ Chłodny Pastel</option>
                <option value="vintage">🎞️ Vintage 35mm</option>
                <option value="bw">🖤 Czarno-Biały (B&W)</option>
                <option value="vivid_master">💎 Czysty Master Kontrast</option>
              </select>
            </div>

            {/* Sliders Grid */}
            <div className="space-y-3 pt-1">
              {[
                { id: 'exposure', label: 'Ekspozycja', min: -100, max: 100, step: 1, val: colorAdj.exposure },
                { id: 'contrast', label: 'Kontrast', min: -100, max: 100, step: 1, val: colorAdj.contrast },
                { id: 'brightness', label: 'Jasność', min: -100, max: 100, step: 1, val: colorAdj.brightness },
                { id: 'saturation', label: 'Nasycenie', min: -100, max: 100, step: 1, val: colorAdj.saturation },
                { id: 'temperature', label: 'Temperatura (Zimny / Ciepły)', min: -100, max: 100, step: 1, val: colorAdj.temperature },
                { id: 'vignette', label: 'Winieta (Kinowe przyciemnienie)', min: 0, max: 100, step: 1, val: colorAdj.vignette }
              ].map(sl => (
                <div key={sl.id} className="space-y-1">
                  <div className="flex justify-between text-[10px] font-mono text-[#888892]">
                    <label>{sl.label}</label>
                    <span className="text-white font-bold">{sl.val > 0 ? `+${sl.val}` : sl.val}</span>
                  </div>
                  <input 
                    type="range" 
                    min={sl.min} 
                    max={sl.max} 
                    step={sl.step}
                    value={sl.val}
                    onChange={(e) => handleColorUpdate(sl.id as keyof ClipColorAdjustments, parseInt(e.target.value, 10))}
                    className="w-full h-1.5 bg-[#24242C] rounded-lg appearance-none cursor-pointer accent-[#D4AF37]"
                  />
                </div>
              ))}
            </div>
          </div>
        )}

        {/* TAB 3: AUDIO STUDIO */}
        {activeTab === 'AUDIO' && (
          <div className="space-y-4">
            <span className="font-bold text-[#D4AF37] uppercase font-mono text-[11px] flex items-center gap-1.5">
              <Volume2 className="w-3.5 h-3.5" /> Dźwięk Ścieżki Ujęcia
            </span>

            <div className="p-3 bg-[#17171C] rounded-xl border border-[#26262E] space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-white font-medium">Wycisz ujęcie</span>
                <button 
                  onClick={() => handleUpdate('muted', !item.muted)}
                  className={`w-11 h-6 rounded-full relative transition-colors cursor-pointer ${item.muted ? 'bg-rose-600' : 'bg-[#2E2E36]'}`}
                >
                  <div className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-transform ${item.muted ? 'left-6' : 'left-1'}`} />
                </button>
              </div>

              {!item.muted && (
                <div className="space-y-3 pt-2 border-t border-[#222228]">
                  <div className="space-y-1">
                    <div className="flex justify-between text-[10px] font-mono text-[#888892]">
                      <label>GŁOŚNOŚĆ</label>
                      <span className="text-[#D4AF37] font-bold">{Math.round(item.volume * 100)}%</span>
                    </div>
                    <input 
                      type="range" 
                      min="0" 
                      max="2" 
                      step="0.05"
                      value={item.volume}
                      onChange={(e) => handleUpdate('volume', parseFloat(e.target.value))}
                      className="w-full h-2 bg-[#24242C] rounded-lg appearance-none cursor-pointer accent-[#D4AF37]"
                    />
                  </div>

                  <div className="space-y-1">
                    <div className="flex justify-between text-[10px] font-mono text-[#888892]">
                      <label>PANORAMA STEREO (L / R)</label>
                      <span className="text-white font-bold">{item.pan ? (item.pan > 0 ? `R +${Math.round(item.pan * 100)}%` : `L ${Math.round(item.pan * 100)}%`) : 'Środek'}</span>
                    </div>
                    <input 
                      type="range" 
                      min="-1" 
                      max="1" 
                      step="0.1"
                      value={item.pan || 0}
                      onChange={(e) => handleUpdate('pan', parseFloat(e.target.value))}
                      className="w-full h-1.5 bg-[#24242C] rounded-lg appearance-none cursor-pointer accent-[#D4AF37]"
                    />
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB 4: TRANSITIONS 2.0 */}
        {activeTab === 'TRANSITION' && (
          <div className="space-y-4">
            <span className="font-bold text-[#D4AF37] uppercase font-mono text-[11px] flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5" /> Przejścia Kinowe 2.0
            </span>

            <div className="space-y-3">
              <div className="space-y-1.5">
                <label className="text-[10px] text-[#888892] uppercase font-mono">Przejście Początkowe (IN)</label>
                <select
                  value={item.transitionIn || 'cut'}
                  onChange={(e) => handleUpdate('transitionIn', e.target.value as TransitionType)}
                  className="w-full bg-[#18181D] border border-[#2E2E36] rounded-lg px-2.5 py-2 text-white font-mono focus:border-[#D4AF37] focus:outline-none"
                >
                  <option value="cut">Cięcie (Cut)</option>
                  <option value="fade">Zanikanie (Fade)</option>
                  <option value="dissolve">Przenikanie (Cross Dissolve)</option>
                  <option value="dip_black">Do czerni (Dip to Black)</option>
                  <option value="dip_white">Do bieli (Dip to White)</option>
                  <option value="zoom">Zoom In/Out</option>
                  <option value="slide">Przesunięcie (Slide)</option>
                  <option value="wipe">Wipe (Odsłonięcie)</option>
                  <option value="blur">Kinowy Blur</option>
                  <option value="light_leak">✨ Błysk Światła (Light Leak)</option>
                  <option value="film_burn">🔥 Spalenizna Taśmy (Film Burn)</option>
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] text-[#888892] uppercase font-mono">Przejście Końcowe (OUT)</label>
                <select
                  value={item.transitionOut || 'cut'}
                  onChange={(e) => handleUpdate('transitionOut', e.target.value as TransitionType)}
                  className="w-full bg-[#18181D] border border-[#2E2E36] rounded-lg px-2.5 py-2 text-white font-mono focus:border-[#D4AF37] focus:outline-none"
                >
                  <option value="cut">Cięcie (Cut)</option>
                  <option value="fade">Zanikanie (Fade)</option>
                  <option value="dissolve">Przenikanie (Cross Dissolve)</option>
                  <option value="dip_black">Do czerni (Dip to Black)</option>
                  <option value="dip_white">Do bieli (Dip to White)</option>
                  <option value="zoom">Zoom Out</option>
                  <option value="slide">Przesunięcie (Slide)</option>
                  <option value="wipe">Wipe (Odsłonięcie)</option>
                  <option value="blur">Kinowy Blur</option>
                  <option value="light_leak">✨ Błysk Światła (Light Leak)</option>
                  <option value="film_burn">🔥 Spalenizna Taśmy (Film Burn)</option>
                </select>
              </div>

              <div className="space-y-1 pt-1">
                <div className="flex justify-between text-[10px] font-mono text-[#888892]">
                  <label>CZAS TRWANIA PRZEJŚCIA</label>
                  <span className="text-[#D4AF37] font-bold">{(item.transitionDuration || 0.5).toFixed(1)}s</span>
                </div>
                <input 
                  type="range" 
                  min="0.2" 
                  max="2.0" 
                  step="0.1"
                  value={item.transitionDuration || 0.5}
                  onChange={(e) => handleUpdate('transitionDuration', parseFloat(e.target.value))}
                  className="w-full h-1.5 bg-[#24242C] rounded-lg appearance-none cursor-pointer accent-[#D4AF37]"
                />
              </div>
            </div>
          </div>
        )}

        {/* TAB 5: TITLE CARDS */}
        {activeTab === 'TITLE' && (
          <div className="space-y-4">
            <span className="font-bold text-[#D4AF37] uppercase font-mono text-[11px] flex items-center gap-1.5">
              <Type className="w-3.5 h-3.5" /> Plansza Tekstowa Przed Klipem
            </span>

            <div className="p-3 bg-[#17171C] rounded-xl border border-[#26262E] space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-white font-medium">Włącz planszę</span>
                <button 
                  onClick={() => {
                    const currentCard = item.titleCard || {
                      enabled: false,
                      text: media.name.replace(/\.[^/.]+$/, ''),
                      duration: 3,
                      style: 'cinematic',
                      backgroundColor: '#0A0A0A'
                    };
                    handleUpdate('titleCard', {
                      ...currentCard,
                      enabled: !currentCard.enabled
                    });
                  }}
                  className={`w-11 h-6 rounded-full relative transition-colors cursor-pointer ${item.titleCard?.enabled ? 'bg-[#D4AF37]' : 'bg-[#2E2E36]'}`}
                >
                  <div className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-transform ${item.titleCard?.enabled ? 'left-6' : 'left-1'}`} />
                </button>
              </div>

              {item.titleCard?.enabled && (
                <div className="space-y-3 pt-2 border-t border-[#222228]">
                  <div className="space-y-1">
                    <label className="text-[10px] text-[#888892] uppercase font-mono">Napis Główny</label>
                    <input 
                      type="text"
                      value={item.titleCard.text}
                      onChange={(e) => handleUpdate('titleCard', { ...item.titleCard, text: e.target.value })}
                      className="w-full bg-[#121215] border border-[#2E2E36] rounded-lg px-2.5 py-1.5 text-xs text-white focus:border-[#D4AF37] focus:outline-none"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-[10px] text-[#888892] uppercase font-mono">Podtytuł</label>
                    <input 
                      type="text"
                      value={item.titleCard.subtitle || ''}
                      placeholder="Opcjonalny podtytuł..."
                      onChange={(e) => handleUpdate('titleCard', { ...item.titleCard, subtitle: e.target.value })}
                      className="w-full bg-[#121215] border border-[#2E2E36] rounded-lg px-2.5 py-1.5 text-xs text-white focus:border-[#D4AF37] focus:outline-none"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <label className="text-[10px] text-[#888892] uppercase font-mono">Styl</label>
                      <select
                        value={item.titleCard.style}
                        onChange={(e) => handleUpdate('titleCard', { ...item.titleCard, style: e.target.value as any })}
                        className="w-full bg-[#121215] border border-[#2E2E36] rounded-lg px-2 py-1.5 text-white text-xs focus:border-[#D4AF37] focus:outline-none"
                      >
                        <option value="cinematic">Kinowy Złoty</option>
                        <option value="elegant">Elegancki Serif</option>
                        <option value="classic">Klasyczny</option>
                        <option value="minimalist">Minimalistyczny</option>
                      </select>
                    </div>

                    <div className="space-y-1">
                      <label className="text-[10px] text-[#888892] uppercase font-mono">Czas trwania (s)</label>
                      <input 
                        type="number"
                        min="1"
                        max="10"
                        step="0.5"
                        value={item.titleCard.duration}
                        onChange={(e) => handleUpdate('titleCard', { ...item.titleCard, duration: parseFloat(e.target.value) || 3 })}
                        className="w-full bg-[#121215] border border-[#2E2E36] rounded-lg px-2 py-1.5 text-white text-xs focus:border-[#D4AF37] focus:outline-none"
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
