import React from 'react';
import { X, Video, Image as ImageIcon } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface MediaItem {
  id?: string;
  name: string;
  mimeType: string;
  type: 'drive' | 'local';
  base64?: string;
  blobUrl?: string;
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
        className="fixed inset-0 z-50 bg-black/90 backdrop-blur-md flex flex-col justify-between p-4"
        onClick={onClose}
      >
        <div className="flex items-center justify-between z-10 pt-safe">
          <div className="flex items-center gap-2 text-slate-200">
            {isVideo ? <Video className="w-5 h-5 text-rose-400" /> : <ImageIcon className="w-5 h-5 text-emerald-400" />}
            <span className="text-sm font-medium truncate max-w-[240px] sm:max-w-md">{item.name}</span>
          </div>
          <button 
            id="close-viewer-btn"
            onClick={onClose}
            className="w-10 h-10 rounded-full bg-white/10 active:bg-white/20 text-white flex items-center justify-center transition-transform active:scale-95"
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
            item.blobUrl || item.base64 ? (
              <video 
                controls 
                autoPlay 
                playsInline
                className="max-h-full max-w-full rounded-2xl shadow-2xl border border-white/10"
                src={item.blobUrl || `data:${item.mimeType};base64,${item.base64}`}
              />
            ) : (
              <div className="text-center p-8 bg-slate-900/80 rounded-2xl border border-slate-800">
                <Video className="w-12 h-12 text-rose-400 mx-auto mb-2" />
                <p className="text-slate-300 text-sm">Plik z Google Drive: {item.name}</p>
                <p className="text-xs text-slate-500 mt-1">Podgląd bezpośredni jest w chmurze Drive</p>
              </div>
            )
          ) : (
            item.blobUrl || item.base64 ? (
              <img 
                src={item.blobUrl || `data:${item.mimeType};base64,${item.base64}`}
                alt={item.name} 
                className="max-h-full max-w-full object-contain rounded-2xl shadow-2xl border border-white/10"
              />
            ) : (
              <div className="text-center p-8 bg-slate-900/80 rounded-2xl border border-slate-800">
                <ImageIcon className="w-12 h-12 text-emerald-400 mx-auto mb-2" />
                <p className="text-slate-300 text-sm">Zdjęcie z Google Drive: {item.name}</p>
              </div>
            )
          )}
        </div>

        <div className="text-center text-xs text-slate-400 pb-safe">
          Dotknij w dowolnym miejscu, aby zamknąć
        </div>
      </div>
    </AnimatePresence>
  );
}
