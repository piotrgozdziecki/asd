import React, { useState } from 'react';
import { Settings, X, Trash2, AlertTriangle, ShieldAlert, CheckCircle, RefreshCw, Smartphone, Database, Cloud, UploadCloud } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onClearCache: () => void;
  isDarkMode: boolean;
  cloudMediaCount?: number;
  totalMediaCount?: number;
}

export function SettingsModal({
  isOpen,
  onClose,
  onClearCache,
  isDarkMode,
  cloudMediaCount = 0,
  totalMediaCount = 0
}: SettingsModalProps) {
  const [showConfirm, setShowConfirm] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);

  if (!isOpen) return null;

  const handleClear = () => {
    onClearCache();
    setIsSuccess(true);
    setShowConfirm(false);
    setTimeout(() => {
      setIsSuccess(false);
      onClose();
      // Reload the page to ensure complete cleanup and reset of states
      window.location.reload();
    }, 1500);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="absolute inset-0 bg-[#090807]/80 backdrop-blur-md"
      />

      {/* Modal Card */}
      <motion.div
        initial={{ scale: 0.95, opacity: 0, y: 15 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.95, opacity: 0, y: 15 }}
        className={`relative w-full max-w-lg overflow-hidden rounded-3xl border shadow-2xl p-6 z-10 transition-colors duration-300 ${
          isDarkMode 
            ? 'bg-[#0f0e0c] border-[#D4AF37]/20 text-[#E7E5E4]' 
            : 'bg-[#faf9f6] border-stone-200 text-[#1c1b19]'
        }`}
      >
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-stone-200/10 dark:border-white/10 mb-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-[#A1821C] via-[#D4AF37] to-[#FDE047] p-[1.5px] flex items-center justify-center shadow-lg shadow-[#D4AF37]/10">
              <div className={`w-full h-full rounded-xl flex items-center justify-center ${isDarkMode ? 'bg-[#0c0b0a]' : 'bg-[#ffffff]'}`}>
                <Settings className="w-5 h-5 text-[#D4AF37]" />
              </div>
            </div>
            <div>
              <h3 className="font-serif-luxury text-lg font-bold tracking-tight">Ustawienia Atelier</h3>
              <p className="text-[0.6875rem] font-mono-label opacity-75 uppercase tracking-wider">Konfiguracja & Magazyn Chmurowy</p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className={`p-1.5 rounded-full hover:opacity-80 transition-all ${
              isDarkMode ? 'bg-white/5 hover:bg-white/10 text-white/70' : 'bg-stone-100 hover:bg-stone-200 text-stone-700'
            }`}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="space-y-5">
          
          {/* Firebase Cloud Storage Card */}
          <div className={`p-4 rounded-2xl border ${
            isDarkMode 
              ? 'bg-[#151310] border-[#D4AF37]/20' 
              : 'bg-[#f4f2ee] border-stone-200'
          }`}>
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 rounded-xl bg-[#D4AF37]/20 flex items-center justify-center text-[#D4AF37] shrink-0 border border-[#D4AF37]/30">
                <UploadCloud className="w-5 h-5" />
              </div>
              <div className="space-y-1 flex-1">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-bold tracking-tight text-white">Firebase Cloud Storage</h4>
                  <span className="text-[0.625rem] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 font-mono-label font-bold border border-emerald-500/30">
                    AKTYWNY
                  </span>
                </div>
                <p className="text-xs opacity-80 leading-relaxed">
                  Przechowywanie dużych plików wideo i zdjęć w bezpiecznej chmurze Google Cloud Storage zamiast ograniczonego <code className="text-[#D4AF37]">localStorage</code>.
                </p>
                <div className="mt-2.5 pt-2 border-t border-white/10 flex items-center justify-between text-[0.6875rem] font-mono-label">
                  <span className="opacity-70">Pliki w chmurze w bieżącym projekcie:</span>
                  <span className="font-bold text-[#D4AF37]">{cloudMediaCount} / {totalMediaCount}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Main Action Section: Cache Management */}
          <div className={`p-4 rounded-2xl border ${
            isDarkMode 
              ? 'bg-[#151310] border-[#D4AF37]/10' 
              : 'bg-[#f4f2ee] border-stone-200'
          }`}>
            <div className="flex items-start gap-3">
              <Database className="w-5 h-5 text-[#D4AF37] mt-0.5 shrink-0" />
              <div className="space-y-1">
                <h4 className="text-sm font-bold tracking-tight">Pamięć Lokalna (localStorage)</h4>
                <p className="text-xs opacity-80 leading-relaxed">
                  Aplikacja zapisuje wersje robocze scenariuszy, okładek i ustawień lokalnie w Twojej przeglądarce, aby nie stracić efektów pracy przy braku internetu.
                </p>
              </div>
            </div>

            <div className="mt-4 pt-4 border-t border-stone-200/20 dark:border-white/5 flex flex-col gap-3">
              <AnimatePresence mode="wait">
                {isSuccess ? (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0 }}
                    className="flex items-center gap-2 text-emerald-500 py-2 justify-center"
                  >
                    <CheckCircle className="w-5 h-5" />
                    <span className="text-xs font-bold">Wyczyszczono pomyślnie! Odświeżanie...</span>
                  </motion.div>
                ) : showConfirm ? (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    className="space-y-3"
                  >
                    <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/30 flex items-start gap-2.5">
                      <ShieldAlert className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
                      <p className="text-[0.75rem] text-red-400 leading-normal font-medium">
                        Czy na pewno chcesz usunąć wszystkie lokalne scenariusze i okładki? Ta akcja jest nieodwracalna. Dane zsynchronizowane z chmurą Firestore i Cloud Storage pozostaną bezpieczne.
                      </p>
                    </div>
                    <div className="flex items-center gap-2 justify-end">
                      <button
                        onClick={() => setShowConfirm(false)}
                        className={`px-3 py-1.5 rounded-xl text-xs font-semibold ${
                          isDarkMode ? 'hover:bg-white/5 text-white/80' : 'hover:bg-stone-200 text-stone-700'
                        }`}
                      >
                        Anuluj
                      </button>
                      <button
                        onClick={handleClear}
                        className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-red-600 hover:bg-red-500 text-white flex items-center gap-1.5 transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        Tak, wyczyść wszystko
                      </button>
                    </div>
                  </motion.div>
                ) : (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="flex justify-between items-center"
                  >
                    <span className="text-[0.6875rem] opacity-75 font-mono-label uppercase">Usuwanie wersji roboczych:</span>
                    <button
                      onClick={() => setShowConfirm(true)}
                      className="px-4 py-2 rounded-xl text-xs font-bold bg-amber-500/10 hover:bg-amber-500/20 text-[#D4AF37] border border-[#D4AF37]/30 flex items-center gap-2 transition-all cursor-pointer"
                    >
                      <Trash2 className="w-4 h-4" />
                      Wyczyść pamięć podręczną
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>

          {/* Quick Diagnostics Info */}
          <div className="space-y-3 text-xs">
            <h4 className="font-mono-label uppercase text-[0.6875rem] tracking-wider opacity-75 font-semibold">Status i Diagnostyka</h4>
            <div className={`p-3.5 rounded-2xl space-y-2 border ${
              isDarkMode ? 'bg-[#12110f] border-[#D4AF37]/5' : 'bg-[#f7f6f3] border-stone-200'
            }`}>
              <div className="flex justify-between items-center">
                <span className="opacity-70">Aplikacja offline:</span>
                <span className={`px-2 py-0.5 rounded-full text-[0.625rem] font-bold font-mono-label ${
                  !navigator.onLine 
                    ? 'bg-amber-500/20 text-amber-300' 
                    : 'bg-emerald-500/20 text-emerald-400'
                }`}>
                  {!navigator.onLine ? 'OFFLINE' : 'ONLINE'}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="opacity-70">Baza danych:</span>
                <span className="text-emerald-400 font-bold flex items-center gap-1 font-mono-label text-[0.625rem]">
                  <Database className="w-3 h-3" /> TAK (Firestore)
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="opacity-70">Magazyn wideo:</span>
                <span className="text-[#D4AF37] font-bold flex items-center gap-1 font-mono-label text-[0.625rem]">
                  <Cloud className="w-3 h-3" /> Firebase Cloud Storage
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="opacity-70">Silnik montażu:</span>
                <span className="font-semibold text-[#D4AF37] font-mono-label text-[0.625rem]">ATELIER 4K v2.1</span>
              </div>
            </div>
          </div>

        </div>

        {/* Footer */}
        <div className="mt-6 pt-4 border-t border-stone-200/10 dark:border-white/10 flex justify-between items-center text-[0.6875rem] opacity-65 font-mono-label">
          <span>Pracownia Kinowa AI © 2026</span>
          <span>Wsparcie techniczne</span>
        </div>
      </motion.div>
    </div>
  );
}
