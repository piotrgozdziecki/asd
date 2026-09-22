import React, { useState, useEffect } from 'react';
import { Smartphone, Download, X, ExternalLink, AlertTriangle } from 'lucide-react';
import { usePWAInstall } from '../../hooks/usePWAInstall';

export const PWAInstallButton: React.FC<{ className?: string }> = ({ className }) => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showIOSGuide, setShowIOSGuide] = useState(false);
  const [isInIframe, setIsInIframe] = useState(false);

  useEffect(() => {
    setIsInIframe(window.self !== window.top);
  }, []);

  // If already running as an installed PWA, hide the button
  if (isInstalled) {
    return null;
  }

  // If in iframe, suggest opening in new tab for installation
  if (isInIframe) {
    return (
      <a
        href={window.location.href}
        target="_blank"
        rel="noopener noreferrer"
        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-[#1A1A1A] border border-[#D4AF37]/40 text-[#D4AF37] hover:bg-[#D4AF37]/10 transition-all ${className}`}
        title="Otwórz w nowej karcie, aby móc zainstalować aplikację"
      >
        <ExternalLink className="w-3.5 h-3.5" />
        <span className="hidden sm:inline">Otwórz aby zainstalować</span>
        <span className="sm:hidden">Otwórz</span>
      </a>
    );
  }

  // Chromium / Android / Desktop flow
  if (isInstallable) {
    return (
      <button
        onClick={install}
        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-[#D4AF37] text-black hover:bg-[#FDE047] transition-all shadow-lg shadow-[#D4AF37]/10 animate-pulse-subtle ${className}`}
        title="Zainstaluj aplikację na Androidzie / Windows"
      >
        <Smartphone className="w-3.5 h-3.5" />
        <span className="hidden sm:inline">Instaluj Aplikację</span>
        <span className="sm:hidden">Instaluj</span>
      </button>
    );
  }

  // iOS Safari flow (beforeinstallprompt is not supported by WebKit)
  if (isIOS) {
    return (
      <>
        <button
          onClick={() => setShowIOSGuide(true)}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold border border-[#D4AF37] text-[#D4AF37] hover:bg-[#D4AF37]/10 transition-all ${className}`}
        >
          <Smartphone className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Instaluj na iOS</span>
          <span className="sm:hidden">Instaluj</span>
        </button>
        {/* ... existing guide ... */}

        {showIOSGuide && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
            <div className="w-full max-w-sm rounded-2xl bg-[#121212] border border-[#2A2824] p-6 shadow-2xl animate-in fade-in zoom-in duration-300">
              <div className="flex justify-between items-start mb-4">
                <h3 className="text-lg font-serif-luxury font-bold text-[#D4AF37]">Instalacja na iPhone / iPad</h3>
                <button onClick={() => setShowIOSGuide(false)} className="text-[#AAA69D] hover:text-white">
                  <X className="w-5 h-5" />
                </button>
              </div>
              
              <div className="space-y-4 text-sm text-[#F2EFE8]">
                <div className="flex gap-3">
                  <div className="w-6 h-6 rounded-full bg-[#1A1A1A] flex items-center justify-center shrink-0 text-[#D4AF37] border border-[#D4AF37]/30">1</div>
                  <p>Dotknij przycisku <strong className="text-[#D4AF37]">Udostępnij</strong> (ikona kwadratu ze strzałką) na pasku narzędzi Safari.</p>
                </div>
                <div className="flex gap-3">
                  <div className="w-6 h-6 rounded-full bg-[#1A1A1A] flex items-center justify-center shrink-0 text-[#D4AF37] border border-[#D4AF37]/30">2</div>
                  <p>Przewiń w dół i wybierz opcję <strong className="text-[#D4AF37]">Do ekranu początkowego</strong>.</p>
                </div>
                <div className="flex gap-3">
                  <div className="w-6 h-6 rounded-full bg-[#1A1A1A] flex items-center justify-center shrink-0 text-[#D4AF37] border border-[#D4AF37]/30">3</div>
                  <p>Aplikacja pojawi się na Twoim ekranie głównym jako natywna apka.</p>
                </div>
              </div>

              <button
                onClick={() => setShowIOSGuide(false)}
                className="mt-6 w-full rounded-xl bg-[#1A1A1A] border border-[#2A2824] py-2.5 text-sm font-medium text-[#AAA69D] hover:text-white hover:border-[#D4AF37]/50 transition-all"
              >
                Zamknij
              </button>
            </div>
          </div>
        )}
      </>
    );
  }

  return null;
};
