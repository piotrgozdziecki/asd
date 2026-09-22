import React from 'react';
import { Keyboard, X, Command } from 'lucide-react';

interface ShortcutsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function ShortcutsModal({ isOpen, onClose }: ShortcutsModalProps) {
  if (!isOpen) return null;

  const shortcuts = [
    { key: 'Spacja', desc: 'Odtwórz / Wstrzymaj odtwarzanie (Play/Pause)' },
    { key: 'Ctrl + Z / ⌘Z', desc: 'Cofnij ostatnią operację (Undo)' },
    { key: 'Ctrl + Y / ⌘⇧Z', desc: 'Ponów operację (Redo)' },
    { key: 'S', desc: 'Rozetnij zaznaczony klip w miejscu kursora (Razor / Split)' },
    { key: 'Delete / Backspace', desc: 'Usuń zaznaczony element z osi czasu' },
    { key: 'M', desc: 'Wstaw znacznik montażowy (Marker) w miejscu kursora' },
    { key: 'K', desc: 'Przełącz tryb kinowy (Cinema Mode)' },
    { key: 'F', desc: 'Pełny ekran podglądu (Fullscreen)' },
    { key: 'I', desc: 'Ustaw punkt początkowy ujęcia (Set In)' },
    { key: 'O', desc: 'Ustaw punkt końcowy ujęcia (Set Out)' },
    { key: '← / →', desc: 'Przesuń kursor o 1 sekundę (lub 1 klatkę z Alt)' },
    { key: 'Home / End', desc: 'Przejdź na początek / koniec osi czasu' },
    { key: 'Ctrl + Shift + D', desc: 'Otwórz panel diagnostyki technicznej (Diagnostics)' }
  ];

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/85 backdrop-blur-md p-4 animate-in fade-in">
      <div className="w-full max-w-lg bg-[#141414] border border-[#2A2824] rounded-2xl shadow-2xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#2A2824] bg-[#0A0A0A]">
          <div className="flex items-center gap-2.5 text-[#D4AF37]">
            <Keyboard className="w-5 h-5" />
            <h2 className="font-serif-luxury font-bold text-base tracking-wide">Skróty Klawiszowe Studio</h2>
          </div>
          <button 
            onClick={onClose} 
            className="p-1.5 rounded-lg text-[#AAA69D] hover:text-white hover:bg-[#202020] transition-colors cursor-pointer"
            aria-label="Zamknij okno skrótów"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 max-h-[70vh] overflow-y-auto space-y-3 custom-scrollbar">
          <p className="text-xs text-[#AAA69D] mb-4">
            Używaj skrótów klawiszowych, aby przyspieszyć montaż filmu ślubnego i precyzyjnie operować na osi czasu:
          </p>

          <div className="space-y-2">
            {shortcuts.map((item, idx) => (
              <div 
                key={idx} 
                className="flex items-center justify-between py-2 px-3 rounded-lg bg-[#1A1A1A] border border-[#262626] text-xs hover:border-[#3A3A3A] transition-colors"
              >
                <span className="text-[#E0DDD5]">{item.desc}</span>
                <kbd className="px-2.5 py-1 rounded bg-[#0D0D0D] border border-[#333] font-mono text-[11px] text-[#D4AF37] font-semibold tracking-wider shrink-0 ml-3 shadow-inner">
                  {item.key}
                </kbd>
              </div>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-3 bg-[#0A0A0A] border-t border-[#2A2824] flex justify-end">
          <button 
            onClick={onClose}
            className="px-4 py-1.5 bg-[#D4AF37] text-black rounded-lg text-xs font-bold hover:bg-[#FDE047] transition-colors cursor-pointer"
          >
            Rozumiem
          </button>
        </div>
      </div>
    </div>
  );
}
