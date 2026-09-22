import React from 'react';
import type { TimelineItem, MediaClip } from '../../types/project';
import { Scissors, Volume2, Move, Clock, Image as ImageIcon } from 'lucide-react';

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

      </div>
    </div>
  );
}
