import React, { useState } from 'react';
import { usePWAInstall } from '../hooks/usePWAInstall';
import { Download, Smartphone, X, Check, Share2, PlusSquare, MoreVertical, Monitor } from 'lucide-react';

interface PWAInstallButtonProps {
  className?: string;
}

export const PWAInstallButton: React.FC<PWAInstallButtonProps> = ({ className }) => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showIOSGuide, setShowIOSGuide] = useState(false);
  const [showDesktopGuide, setShowDesktopGuide] = useState(false);

  // If already running as an installed PWA, hide the button
  if (isInstalled) {
    return null;
  }

  // Chromium / Android / Desktop flow (Native prompt available)
  if (isInstallable) {
    return (
      <button
        id="pwa-install-btn"
        onClick={install}
        className={className || "min-h-[2.75rem] flex items-center gap-2 rounded-none border border-[#1a1a1a]/15 bg-[#1a1a1a] hover:bg-[#B48E23] hover:border-[#B48E23] px-4 py-2 text-[0.625rem] font-mono-label uppercase tracking-widest text-white transition"}
      >
        <Download className="w-3.5 h-3.5" />
        <span>Zainstaluj</span>
      </button>
    );
  }

  // iOS Safari flow (beforeinstallprompt is not supported by WebKit)
  if (isIOS) {
    return (
      <>
        <button
          id="pwa-ios-install-btn"
          onClick={() => setShowIOSGuide(true)}
          className={className || "min-h-[2.75rem] flex items-center gap-2 rounded-none border border-[#1a1a1a]/15 bg-transparent hover:bg-[#1a1a1a] hover:text-white px-4 py-2 text-[0.625rem] font-mono-label uppercase tracking-widest text-[#1a1a1a] transition"}
        >
          <Smartphone className="w-3.5 h-3.5" />
          <span>Instaluj (iOS)</span>
        </button>

        {showIOSGuide && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#1a1a1a]/40 backdrop-blur-sm p-4 animate-in fade-in">
            <div className="w-full max-w-sm bg-[#f8f7f4] border border-[#1a1a1a]/15 p-8 shadow-2xl text-[#1a1a1a] relative">
              <button 
                onClick={() => setShowIOSGuide(false)}
                className="absolute top-4 right-4 w-8 h-8 flex items-center justify-center text-[#1a1a1a]/50 hover:text-[#1a1a1a] transition"
              >
                <X className="w-4 h-4" />
              </button>

              <div className="w-12 h-12 bg-white border border-[#1a1a1a]/10 flex items-center justify-center text-[#B48E23] mb-5 shadow-sm">
                <Smartphone className="w-5 h-5" />
              </div>

              <h3 className="text-xl font-medium font-serif-luxury tracking-wide">
                Zainstaluj na iOS
              </h3>
              
              <div className="mt-6 space-y-4 text-xs font-sans-modern leading-relaxed text-[#1a1a1a]/80">
                <div className="flex items-start gap-4 p-4 bg-white border border-[#1a1a1a]/5">
                  <div className="w-6 h-6 bg-[#f8f7f4] flex items-center justify-center text-[#B48E23] shrink-0 font-mono-label text-[0.625rem]">
                    1
                  </div>
                  <p>
                    Dotknij ikony <strong>Udostępnij</strong> (<Share2 className="w-3.5 h-3.5 inline text-[#B48E23]" />) na dolnym pasku przeglądarki Safari.
                  </p>
                </div>

                <div className="flex items-start gap-4 p-4 bg-white border border-[#1a1a1a]/5">
                  <div className="w-6 h-6 bg-[#f8f7f4] flex items-center justify-center text-[#B48E23] shrink-0 font-mono-label text-[0.625rem]">
                    2
                  </div>
                  <p>
                    Przewiń w dół i wybierz opcję <strong>Do ekranu początkowego</strong> (<PlusSquare className="w-3.5 h-3.5 inline text-[#B48E23]" />).
                  </p>
                </div>
              </div>

              <button
                onClick={() => setShowIOSGuide(false)}
                className="mt-8 w-full bg-[#1a1a1a] hover:bg-[#B48E23] py-3 text-[0.625rem] font-mono-label tracking-widest uppercase text-white transition"
              >
                Rozumiem
              </button>
            </div>
          </div>
        )}
      </>
    );
  }

  // Fallback for Desktop/Android when native prompt is blocked (e.g., in iframe)
  return (
    <>
      <button
        id="pwa-manual-install-btn"
        onClick={() => setShowDesktopGuide(true)}
        className={className || "min-h-[2.75rem] flex items-center gap-2 rounded-none border border-[#1a1a1a]/15 bg-[#1a1a1a] hover:bg-[#B48E23] hover:border-[#B48E23] px-4 py-2 text-[0.625rem] font-mono-label uppercase tracking-widest text-white transition"}
      >
        <Download className="w-3.5 h-3.5" />
        <span className="hidden sm:inline">Zainstaluj aplikację</span>
        <span className="sm:hidden">Zainstaluj</span>
      </button>

      {showDesktopGuide && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#1a1a1a]/40 backdrop-blur-sm p-4 animate-in fade-in">
          <div className="w-full max-w-sm bg-[#f8f7f4] border border-[#1a1a1a]/15 p-8 shadow-2xl text-[#1a1a1a] relative">
            <button 
              onClick={() => setShowDesktopGuide(false)}
              className="absolute top-4 right-4 w-8 h-8 flex items-center justify-center text-[#1a1a1a]/50 hover:text-[#1a1a1a] transition"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="w-12 h-12 bg-white border border-[#1a1a1a]/10 flex items-center justify-center text-[#B48E23] mb-5 shadow-sm">
              <Monitor className="w-5 h-5" />
            </div>

            <h3 className="text-xl font-medium font-serif-luxury tracking-wide">
              Instalacja Aplikacji
            </h3>
            
            <div className="mt-6 space-y-4 text-xs font-sans-modern leading-relaxed text-[#1a1a1a]/80">
              <p>
                Aby zainstalować aplikację na tym urządzeniu i korzystać z niej niezależnie od przeglądarki:
              </p>

              <div className="flex items-start gap-4 p-4 bg-white border border-[#1a1a1a]/5">
                <div className="w-6 h-6 bg-[#f8f7f4] flex items-center justify-center text-[#B48E23] shrink-0 font-mono-label text-[0.625rem]">
                  1
                </div>
                <p>
                  Otwórz tę stronę w nowej karcie (nie w podglądzie).
                </p>
              </div>

              <div className="flex items-start gap-4 p-4 bg-white border border-[#1a1a1a]/5">
                <div className="w-6 h-6 bg-[#f8f7f4] flex items-center justify-center text-[#B48E23] shrink-0 font-mono-label text-[0.625rem]">
                  2
                </div>
                <p>
                  Kliknij ikonę <strong>Instalacji</strong> (<Download className="w-3.5 h-3.5 inline text-[#B48E23]" />) na pasku adresu przeglądarki, lub wybierz "Zainstaluj aplikację" z menu (<MoreVertical className="w-3 h-3 inline text-[#1a1a1a]" />).
                </p>
              </div>
            </div>

            <button
              onClick={() => setShowDesktopGuide(false)}
              className="mt-8 w-full bg-[#1a1a1a] hover:bg-[#B48E23] py-3 text-[0.625rem] font-mono-label tracking-widest uppercase text-white transition"
            >
              Rozumiem
            </button>
          </div>
        </div>
      )}
    </>
  );
};
