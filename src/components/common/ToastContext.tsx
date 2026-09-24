import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import { CheckCircle2, AlertTriangle, AlertCircle, Info, X } from 'lucide-react';

export type ToastType = 'success' | 'warning' | 'error' | 'info';

export interface ToastItem {
  id: string;
  message: string;
  type: ToastType;
}

interface ToastContextValue {
  showToast: (message: string, type?: ToastType) => void;
  showSuccess: (message: string) => void;
  showWarning: (message: string) => void;
  showError: (message: string) => void;
  showInfo: (message: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const removeToast = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  const showToast = useCallback((message: string, type: ToastType = 'info') => {
    const id = `toast_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    setToasts(prev => [...prev.slice(-3), { id, message, type }]); // Keep max 4 visible

    setTimeout(() => {
      removeToast(id);
    }, 5000);
  }, [removeToast]);

  const showSuccess = useCallback((msg: string) => showToast(msg, 'success'), [showToast]);
  const showWarning = useCallback((msg: string) => showToast(msg, 'warning'), [showToast]);
  const showError = useCallback((msg: string) => showToast(msg, 'error'), [showToast]);
  const showInfo = useCallback((msg: string) => showToast(msg, 'info'), [showToast]);

  // Expose to window for seamless integration across all studio modules
  React.useEffect(() => {
    (window as any).showStudioToast = showToast;
  }, [showToast]);

  return (
    <ToastContext.Provider value={{ showToast, showSuccess, showWarning, showError, showInfo }}>
      {children}
      {/* Toast Container */}
      <div className="fixed bottom-6 right-4 sm:right-6 z-[9999] flex flex-col gap-2.5 max-w-sm sm:max-w-md w-full pointer-events-none">
        {toasts.map(toast => {
          const isSuccess = toast.type === 'success';
          const isWarning = toast.type === 'warning';
          const isError = toast.type === 'error';

          return (
            <div
              key={toast.id}
              className={`pointer-events-auto p-3.5 sm:p-4 rounded-xl border shadow-[0_10px_30px_rgba(0,0,0,0.8)] backdrop-blur-xl flex items-start justify-between gap-3 text-xs sm:text-sm animate-in slide-in-from-bottom-3 duration-200 transition-all ${
                isSuccess
                  ? 'bg-[#0E1A12]/95 border-emerald-500/40 text-emerald-100 shadow-[0_0_20px_rgba(16,185,129,0.2)]'
                  : isWarning
                  ? 'bg-[#1C160B]/95 border-[#D4AF37]/50 text-amber-100 shadow-[0_0_20px_rgba(212,175,55,0.25)]'
                  : isError
                  ? 'bg-[#1A0D0D]/95 border-red-500/40 text-red-100 shadow-[0_0_20px_rgba(239,68,68,0.25)]'
                  : 'bg-[#141311]/95 border-[#2E281F] text-[#E8E4DA]'
              }`}
            >
              <div className="flex items-start gap-2.5">
                <div className="shrink-0 mt-0.5">
                  {isSuccess && <CheckCircle2 className="w-4 h-4 text-emerald-400" />}
                  {isWarning && <AlertTriangle className="w-4 h-4 text-[#D4AF37]" />}
                  {isError && <AlertCircle className="w-4 h-4 text-red-400" />}
                  {!isSuccess && !isWarning && !isError && <Info className="w-4 h-4 text-[#D4AF37]" />}
                </div>
                <p className="leading-snug font-medium text-left">{toast.message}</p>
              </div>

              <button
                type="button"
                onClick={() => removeToast(toast.id)}
                className="shrink-0 text-white/50 hover:text-white p-0.5 rounded transition-colors cursor-pointer"
                title="Zamknij"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useStudioToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    // Graceful fallback if invoked outside provider
    return {
      showToast: (msg: string) => {
        if ((window as any).showStudioToast) (window as any).showStudioToast(msg);
        else console.log(msg);
      },
      showSuccess: (msg: string) => {
        if ((window as any).showStudioToast) (window as any).showStudioToast(msg, 'success');
        else console.log(msg);
      },
      showWarning: (msg: string) => {
        if ((window as any).showStudioToast) (window as any).showStudioToast(msg, 'warning');
        else console.warn(msg);
      },
      showError: (msg: string) => {
        if ((window as any).showStudioToast) (window as any).showStudioToast(msg, 'error');
        else console.error(msg);
      },
      showInfo: (msg: string) => {
        if ((window as any).showStudioToast) (window as any).showStudioToast(msg, 'info');
        else console.info(msg);
      }
    };
  }
  return ctx;
}
