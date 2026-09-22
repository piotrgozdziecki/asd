import React from 'react';
import { Music, Volume2 } from 'lucide-react';
import type { AudioTrackItem } from '../../types/project';

interface AudioInspectorProps {
  track: AudioTrackItem;
  onUpdate: (id: string, updates: Partial<AudioTrackItem>) => void;
}

export function AudioInspector({ track, onUpdate }: AudioInspectorProps) {
  const update = (updates: Partial<AudioTrackItem>) => {
    onUpdate(track.id, updates);
  };

  return (
    <div className="h-full w-80 border-l border-[#2A2824] bg-[#121212] flex flex-col custom-scrollbar overflow-y-auto">
      
      {/* Header */}
      <div className="p-4 border-b border-[#2A2824] shrink-0 bg-[#0A0A0A]">
        <h3 className="text-[#D4AF37] font-serif-luxury flex items-center gap-2">
          <Music className="w-4 h-4" /> Inspektor Audio
        </h3>
        <p className="text-xs text-[#AAA69D] mt-1 font-mono truncate">{track.name}</p>
      </div>

      <div className="p-4 space-y-6">
        
        {/* Głośność (Volume) */}
        <div className="space-y-3">
          <div className="flex justify-between">
            <label className="text-xs font-mono font-bold text-[#AAA69D] uppercase tracking-wider flex items-center gap-2">
              <Volume2 className="w-3.5 h-3.5" /> Głośność
            </label>
            <span className="text-xs text-[#D4AF37] font-mono">{Math.round(track.volume * 100)}%</span>
          </div>
          <input 
            type="range" 
            min="0" 
            max="2" 
            step="0.05" 
            value={track.volume}
            onChange={(e) => update({ volume: parseFloat(e.target.value) })}
            className="w-full h-8 accent-[#D4AF37]"
          />
        </div>

        {/* Zanikanie (Fades) */}
        <div className="space-y-3 pt-4 border-t border-[#2A2824]">
          <label className="text-xs font-mono font-bold text-[#AAA69D] uppercase tracking-wider">Płynne Przejścia (Fade)</label>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <span className="text-[10px] text-[#888] uppercase block">Fade In (s)</span>
              <input 
                type="number" 
                min="0" 
                step="0.1" 
                value={track.fadeIn}
                onChange={(e) => update({ fadeIn: parseFloat(e.target.value) })}
                className="w-full h-11 bg-[#1A1A1A] border border-[#2A2824] rounded-md px-3 text-sm text-white font-mono focus:outline-none focus:border-[#D4AF37]"
              />
            </div>
            <div className="space-y-1">
              <span className="text-[10px] text-[#888] uppercase block">Fade Out (s)</span>
              <input 
                type="number" 
                min="0" 
                step="0.1" 
                value={track.fadeOut}
                onChange={(e) => update({ fadeOut: parseFloat(e.target.value) })}
                className="w-full h-11 bg-[#1A1A1A] border border-[#2A2824] rounded-md px-3 text-sm text-white font-mono focus:outline-none focus:border-[#D4AF37]"
              />
            </div>
          </div>
        </div>

        {/* Trim (Przycinanie) */}
        <div className="space-y-3 pt-4 border-t border-[#2A2824]">
          <label className="text-xs font-mono font-bold text-[#AAA69D] uppercase tracking-wider">Czas na osi (Timeline)</label>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <span className="text-[10px] text-[#888] uppercase block">Początek (s)</span>
              <input 
                type="number" 
                min="0" 
                step="0.5" 
                value={track.timelineStart.toFixed(1)}
                onChange={(e) => update({ timelineStart: parseFloat(e.target.value) })}
                className="w-full h-11 bg-[#1A1A1A] border border-[#2A2824] rounded-md px-3 text-sm text-white font-mono focus:outline-none focus:border-[#D4AF37]"
              />
            </div>
            <div className="space-y-1">
              <span className="text-[10px] text-[#888] uppercase block">Koniec (s)</span>
              <input 
                type="number" 
                min="0.1" 
                step="0.5" 
                value={(track.timelineStart + track.duration).toFixed(1)}
                onChange={(e) => update({ duration: Math.max(0.1, parseFloat(e.target.value) - track.timelineStart) })}
                className="w-full h-11 bg-[#1A1A1A] border border-[#2A2824] rounded-md px-3 text-sm text-white font-mono focus:outline-none focus:border-[#D4AF37]"
              />
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
