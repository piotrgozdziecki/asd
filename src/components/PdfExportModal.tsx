import React, { useState } from 'react';
import { 
  FileDown, 
  Printer, 
  Share2, 
  CheckCircle2, 
  Loader2, 
  X, 
  FileText, 
  Sparkles,
  ShieldCheck
} from 'lucide-react';
import { Storyboard, MediaItem } from '../types/legacy';
import { 
  generateStoryboardPdf, 
  downloadStoryboardPdfFile, 
  shareStoryboardPdfFile, 
  PdfExportProgress 
} from '../lib/pdfExport';

interface PdfExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  storyboard: Storyboard | null;
  mediaItems: MediaItem[];
}

export const PdfExportModal: React.FC<PdfExportModalProps> = ({
  isOpen,
  onClose,
  storyboard,
  mediaItems
}) => {
  const [isExporting, setIsExporting] = useState(false);
  const [progress, setProgress] = useState<PdfExportProgress | null>(null);
  const [pdfBlob, setPdfBlob] = useState<Blob | null>(null);
  const [pdfFilename, setPdfFilename] = useState<string | null>(null);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  if (!isOpen || !storyboard) return null;

  const handleStartExport = async (action: 'download' | 'share' | 'print') => {
    setIsExporting(true);
    setErrorMessage(null);

    try {
      if (action === 'download') {
        const result = await downloadStoryboardPdfFile(storyboard, mediaItems, setProgress);
        setPdfFilename(result.filename);
      } else if (action === 'share') {
        await shareStoryboardPdfFile(storyboard, mediaItems, setProgress);
      } else if (action === 'print') {
        const result = await generateStoryboardPdf(storyboard, mediaItems, setProgress);
        const url = URL.createObjectURL(result.blob);
        setPdfUrl(url);
        setPdfFilename(result.filename);
        setPdfBlob(result.blob);
        
        // Open print window
        const printWindow = window.open(url, '_blank');
        if (printWindow) {
          printWindow.onload = () => {
            printWindow.print();
          };
        }
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Wystąpił błąd podczas eksportu pliku PDF.');
    } finally {
      setIsExporting(false);
    }
  };

  const canNativeShare = typeof navigator !== 'undefined' && !!navigator.share;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
      <div 
        className="w-full max-w-lg rounded-3xl glass-panel p-6 sm:p-8 border border-[#D4AF37]/40 shadow-2xl relative space-y-6 text-white"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-5 right-5 p-2 rounded-full text-stone-400 hover:text-white hover:bg-white/10 transition cursor-pointer"
          title="Zamknij"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Modal Header */}
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-[#D4AF37] to-[#9e7b36] flex items-center justify-center shrink-0 shadow-lg text-black">
            <FileDown className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[0.6875rem] font-mono-label uppercase tracking-widest text-[#D4AF37] font-bold">
                Eksport Dokumentu Produkcyjnego
              </span>
              <span className="px-2 py-0.5 rounded-full text-[0.625rem] font-mono-label uppercase bg-emerald-500/20 text-emerald-300 font-bold">
                A4 • 300 DPI
              </span>
            </div>
            <h3 className="text-xl sm:text-2xl font-serif-luxury font-bold mt-1 text-white">
              Pobierz Scenariusz (PDF)
            </h3>
            <p className="text-xs font-sans-modern text-stone-300 mt-1">
              Kompletny dokument reżyserski gotowy do wydruku, zabrania na plan zdjęciowy lub przesłania kamerzyście.
            </p>
          </div>
        </div>

        {/* Storyboard Summary Card */}
        <div className="p-4 rounded-2xl bg-white/5 border border-white/10 space-y-2 text-xs">
          <div className="flex items-center justify-between">
            <span className="font-mono-label text-stone-400 uppercase text-[0.6875rem]">Tytuł filmu:</span>
            <span className="font-bold text-white truncate max-w-[240px]">{storyboard.title}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="font-mono-label text-stone-400 uppercase text-[0.6875rem]">Format & Nastrój:</span>
            <span className="text-[#FDE047] font-bold">
              {storyboard.format || 'Highlight'} • {storyboard.mood || 'Romantyczny'}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="font-mono-label text-stone-400 uppercase text-[0.6875rem]">Liczba scen:</span>
            <span className="text-stone-200 font-mono">
              {storyboard.timeline?.length || 0} sekwencji reżyserskich
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="font-mono-label text-stone-400 uppercase text-[0.6875rem]">Zawartość PDF:</span>
            <span className="text-emerald-400 font-bold text-[0.6875rem]">
              Metryka, kody czasowe, wskazówki dla ekipy, kadr & akcja
            </span>
          </div>
        </div>

        {/* Progress Display */}
        {isExporting && progress && (
          <div className="p-4 rounded-2xl glass-panel-gold border border-[#D4AF37]/50 space-y-2.5">
            <div className="flex items-center justify-between text-xs font-mono-label font-bold text-[#FDE047]">
              <span className="flex items-center gap-2">
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                {progress.message}
              </span>
              <span>{progress.percent}%</span>
            </div>
            <div className="w-full h-2 rounded-full bg-black/50 overflow-hidden">
              <div 
                className="h-full bg-gradient-to-r from-[#D4AF37] to-[#FDE047] transition-all duration-300"
                style={{ width: `${progress.percent}%` }}
              />
            </div>
          </div>
        )}

        {/* Success Notice */}
        {pdfFilename && !isExporting && (
          <div className="p-3.5 rounded-2xl bg-emerald-950/60 border border-emerald-500/40 text-emerald-200 text-xs font-sans-modern flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>Plik został pobrany: <strong>{pdfFilename}</strong></span>
            </div>
          </div>
        )}

        {/* Error Notice */}
        {errorMessage && (
          <div className="p-3.5 rounded-2xl bg-rose-950/60 border border-rose-500/40 text-rose-200 text-xs font-sans-modern">
            {errorMessage}
          </div>
        )}

        {/* Features Checklist */}
        <div className="grid grid-cols-2 gap-2 text-[0.6875rem] font-sans-modern text-stone-300">
          <div className="flex items-center gap-1.5">
            <ShieldCheck className="w-3.5 h-3.5 text-[#D4AF37]" />
            <span>Format A4 do druku bez użycia tuszu ciemnego</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-[#D4AF37]" />
            <span>Pełne polskie znaki diakrytyczne</span>
          </div>
          <div className="flex items-center gap-1.5">
            <FileText className="w-3.5 h-3.5 text-[#D4AF37]" />
            <span>Pola na duble i notatki kamerzysty</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Share2 className="w-3.5 h-3.5 text-[#D4AF37]" />
            <span>Udostępnianie offline bez dostępu do sieci</span>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="space-y-2.5 pt-2">
          <button
            onClick={() => handleStartExport('download')}
            disabled={isExporting}
            className="w-full py-3.5 px-4 rounded-xl luxury-btn-primary text-xs font-mono-label uppercase font-extrabold tracking-wider flex items-center justify-center gap-2 shadow-lg cursor-pointer disabled:opacity-50"
          >
            {isExporting ? (
              <Loader2 className="w-4 h-4 animate-spin text-black" />
            ) : (
              <FileDown className="w-4 h-4 text-black" />
            )}
            <span>Pobierz Plik PDF (.pdf)</span>
          </button>

          <div className="flex items-center gap-2">
            {canNativeShare && (
              <button
                onClick={() => handleStartExport('share')}
                disabled={isExporting}
                className="flex-1 py-2.5 px-3 rounded-xl luxury-btn-ghost text-xs font-mono-label uppercase font-bold flex items-center justify-center gap-2 text-stone-200 hover:text-white border-white/20 cursor-pointer disabled:opacity-50"
              >
                <Share2 className="w-3.5 h-3.5 text-[#D4AF37]" />
                <span>Udostępnij</span>
              </button>
            )}

            <button
              onClick={() => handleStartExport('print')}
              disabled={isExporting}
              className="flex-1 py-2.5 px-3 rounded-xl luxury-btn-ghost text-xs font-mono-label uppercase font-bold flex items-center justify-center gap-2 text-stone-200 hover:text-white border-white/20 cursor-pointer disabled:opacity-50"
            >
              <Printer className="w-3.5 h-3.5 text-[#D4AF37]" />
              <span>Drukuj / Podgląd</span>
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};
