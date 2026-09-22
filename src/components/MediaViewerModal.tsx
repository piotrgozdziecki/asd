import React from 'react';
import { X, Video, Image as ImageIcon } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface MediaItem {
  id?: string;
  name: string;
  mimeType: string;
  type: 'drive' | 'local' | 'cloud';
  base64?: string;
  blobUrl?: string;
  cloudUrl?: string;
}

interface MediaViewerModalProps {
  item: MediaItem | null;
  onClose: () => void;
}

export function MediaViewerModal({ item, onClose }: MediaViewerModalProps) {
  if (!item) return null;

  const isVideo = item.mimeType.startsWith('video');

  return (
    <AnimatePresence>
      <div 
        id="media-viewer-backdrop"
        className="fixed inset-0 z-50 bg-black/90 backdrop-blur-xl flex flex-col justify-between p-4 sm:p-6"
        onClick={onClose}
      >
        <div className="flex items-center justify-between z-10 pt-safe">
          <div className="flex items-center gap-3 text-white">
            <div className="w-10 h-10 rounded-2xl bg-[#D4AF37]/20 border border-[#D4AF37]/40 flex items-center justify-center text-[#D4AF37]">
              {isVideo ? <Video className="w-5 h-5" /> : <ImageIcon className="w-5 h-5" />}
            </div>
            <span className="text-sm font-serif-luxury font-bold truncate max-w-[15rem] sm:max-w-md">{item.name}</span>
          </div>
          <button 
            id="close-viewer-btn"
            onClick={onClose}
            className="w-10 h-10 rounded-full glass-card hover:bg-white/20 text-white flex items-center justify-center transition-transform active:scale-95"
            aria-label="Zamknij podgląd"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div 
          className="flex-1 flex items-center justify-center py-4 max-h-[75vh]"
          onClick={e => e.stopPropagation()}
        >
          {isVideo ? (
            item.cloudUrl || item.blobUrl || item.base64 ? (
              <video 
                controls 
                autoPlay 
                playsInline
                className="max-h-full max-w-full rounded-2xl shadow-2xl border border-white/20"
                src={item.cloudUrl || item.blobUrl || `data:${item.mimeType};base64,${item.base64}`}
              />
            ) : (
              <div className="text-center p-8 glass-panel rounded-3xl border border-white/15">
                <Video className="w-12 h-12 text-[#D4AF37] mx-auto mb-2" />
                <p className="text-white font-serif-luxury font-bold text-sm">Plik z Google Drive: {item.name}</p>
                <p className="text-xs font-sans-modern opacity-70 mt-1">Podgląd bezpośredni jest w chmurze Drive</p>
              </div>
            )
          ) : (
            item.cloudUrl || item.blobUrl || item.base64 ? (
              <img 
                src={item.cloudUrl || item.blobUrl || `data:${item.mimeType};base64,${item.base64}`}
                alt={item.name} 
                className="max-h-full max-w-full object-contain rounded-2xl shadow-2xl border border-white/20"
              />
            ) : (
              <div className="text-center p-8 glass-panel rounded-3xl border border-white/15">
                <ImageIcon className="w-12 h-12 text-[#D4AF37] mx-auto mb-2" />
                <p className="text-white font-serif-luxury font-bold text-sm">Zdjęcie z Google Drive: {item.name}</p>
              </div>
            )
          )}
        </div>

        <div className="text-center text-xs font-mono-label opacity-60 pb-safe">
          Dotknij w dowolnym miejscu, aby zamknąć
        </div>
      </div>
    </AnimatePresence>
  );
}
