import React from 'react';
import { Type, AlignLeft, AlignCenter, AlignRight } from 'lucide-react';
import type { TextLayer } from '../../types/project';

interface TextInspectorProps {
  layer: TextLayer;
  onUpdate: (id: string, updates: Partial<TextLayer>) => void;
}

export function TextInspector({ layer, onUpdate }: TextInspectorProps) {
  const update = (updates: Partial<TextLayer>) => {
    onUpdate(layer.id, updates);
  };

  return (
    <div className="h-full w-80 border-l border-[#2A2824] bg-[#121212] flex flex-col custom-scrollbar overflow-y-auto">
      
      {/* Header */}
      <div className="p-4 border-b border-[#2A2824] shrink-0 bg-[#0A0A0A]">
        <h3 className="text-[#D4AF37] font-serif-luxury flex items-center gap-2">
          <Type className="w-4 h-4" /> Inspektor Tekstu
        </h3>
      </div>

      <div className="p-4 space-y-6">
        
        {/* Treść (Content) */}
        <div className="space-y-3">
          <label className="text-xs font-mono font-bold text-[#AAA69D] uppercase tracking-wider">Treść tekstu</label>
          <textarea 
            className="w-full bg-[#1A1A1A] border border-[#2A2824] rounded-md p-3 text-white focus:outline-none focus:border-[#D4AF37] transition-colors resize-none h-24"
            value={layer.text}
            onChange={(e) => update({ text: e.target.value })}
            placeholder="Wpisz tekst..."
          />
        </div>

        {/* Styl i Typografia (Style & Typography) */}
        <div className="space-y-3">
          <label className="text-xs font-mono font-bold text-[#AAA69D] uppercase tracking-wider">Styl i Typografia</label>
          
          <div className="grid grid-cols-2 gap-2">
            {(['standard', 'elegant', 'minimalist', 'cinematic'] as const).map(style => (
              <button
                key={style}
                onClick={() => update({ style: style as TextLayer['style'] })}
                className={`py-2 px-3 rounded-md text-xs border ${layer.style === style ? 'border-[#D4AF37] bg-[#D4AF37]/10 text-[#D4AF37]' : 'border-[#2A2824] bg-[#1A1A1A] text-[#AAA69D] hover:border-[#444]'}`}
              >
                {style.charAt(0).toUpperCase() + style.slice(1)}
              </button>
            ))}
          </div>
        </div>

        {/* Rozmiar (Size) */}
        <div className="space-y-3">
          <div className="flex justify-between">
            <label className="text-xs font-mono font-bold text-[#AAA69D] uppercase tracking-wider">Rozmiar</label>
            <span className="text-xs text-[#D4AF37] font-mono">{layer.fontSize.toFixed(1)}x</span>
          </div>
          <input 
            type="range" 
            min="0.5" 
            max="10" 
            step="0.1" 
            value={layer.fontSize}
            onChange={(e) => update({ fontSize: parseFloat(e.target.value) })}
            className="w-full h-8 accent-[#D4AF37]"
          />
        </div>

        {/* Kolor (Color) */}
        <div className="space-y-3">
          <label className="text-xs font-mono font-bold text-[#AAA69D] uppercase tracking-wider">Kolor</label>
          <div className="flex items-center gap-3">
            <input 
              type="color" 
              value={layer.color}
              onChange={(e) => update({ color: e.target.value })}
              className="w-8 h-8 rounded border-none bg-transparent cursor-pointer"
            />
            <input 
              type="text" 
              value={layer.color}
              onChange={(e) => update({ color: e.target.value })}
              className="flex-1 h-11 bg-[#1A1A1A] border border-[#2A2824] rounded-md px-3 text-sm text-white font-mono focus:outline-none focus:border-[#D4AF37]"
            />
          </div>
        </div>

        {/* Pozycja (Position X/Y) */}
        <div className="space-y-3">
          <label className="text-xs font-mono font-bold text-[#AAA69D] uppercase tracking-wider">Pozycja na ekranie</label>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <div className="flex justify-between text-xs">
                <span className="text-[#888]">Poziomo (X)</span>
                <span className="text-white font-mono">{(layer.position.x * 100).toFixed(0)}%</span>
              </div>
              <input 
                type="range" 
                min="0" max="1" step="0.01" 
                value={layer.position.x}
                onChange={(e) => update({ position: { ...layer.position, x: parseFloat(e.target.value) }})}
                className="w-full accent-[#D4AF37]"
              />
            </div>
            <div className="space-y-2">
              <div className="flex justify-between text-xs">
                <span className="text-[#888]">Pionowo (Y)</span>
                <span className="text-white font-mono">{(layer.position.y * 100).toFixed(0)}%</span>
              </div>
              <input 
                type="range" 
                min="0" max="1" step="0.01" 
                value={layer.position.y}
                onChange={(e) => update({ position: { ...layer.position, y: parseFloat(e.target.value) }})}
                className="w-full accent-[#D4AF37]"
              />
            </div>
          </div>
        </div>

        {/* Timing (Czas trwania) */}
        <div className="space-y-3 pt-4 border-t border-[#2A2824]">
          <label className="text-xs font-mono font-bold text-[#AAA69D] uppercase tracking-wider">Czas wyświetlania</label>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <span className="text-[10px] text-[#888] uppercase block">Start (s)</span>
              <input 
                type="number" 
                min="0" 
                step="0.5" 
                value={layer.timelineStart.toFixed(1)}
                onChange={(e) => update({ timelineStart: parseFloat(e.target.value) })}
                className="w-full h-11 bg-[#1A1A1A] border border-[#2A2824] rounded-md px-3 text-sm text-white font-mono focus:outline-none focus:border-[#D4AF37]"
              />
            </div>
            <div className="space-y-1">
              <span className="text-[10px] text-[#888] uppercase block">Czas trwania (s)</span>
              <input 
                type="number" 
                min="0.1" 
                step="0.5" 
                value={layer.duration.toFixed(1)}
                onChange={(e) => update({ duration: parseFloat(e.target.value) })}
                className="w-full h-11 bg-[#1A1A1A] border border-[#2A2824] rounded-md px-3 text-sm text-white font-mono focus:outline-none focus:border-[#D4AF37]"
              />
            </div>
          </div>
        </div>
        
      </div>
    </div>
  );
}
