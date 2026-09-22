import React, { useEffect, useState } from 'react';
import { useOnlineStatus } from '../hooks/useOnlineStatus';
import { WifiOff, RefreshCw } from 'lucide-react';
import { getPendingDirectorNotes } from '../lib/offlineSync';

export const OfflineIndicator: React.FC = () => {
  const isOnline = useOnlineStatus();
  const [pendingCount, setPendingCount] = useState(0);

  useEffect(() => {
    getPendingDirectorNotes().then(notes => setPendingCount(notes.length));
    const interval = setInterval(() => {
      getPendingDirectorNotes().then(notes => setPendingCount(notes.length));
    }, 3000);
    return () => clearInterval(interval);
  }, []);

  if (isOnline && pendingCount === 0) return null;

  return (
    <div 
      id="offline-status-banner"
      className="fixed bottom-4 left-4 right-4 sm:right-auto sm:max-w-md z-50 flex items-center justify-between gap-3 rounded-2xl glass-panel-gold px-4 py-3 text-xs shadow-2xl animate-in fade-in slide-in-from-bottom-2 duration-300"
    >
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-xl bg-amber-500/25 flex items-center justify-center shrink-0 border border-amber-500/40">
          <WifiOff className="w-4 h-4 text-amber-300" />
        </div>
        <div>
          <p className="font-bold font-serif-luxury text-sm flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-amber-400 animate-ping" />
            {!isOnline ? 'Tryb Offline Aktywny' : 'Oczekiwanie na Sync'}
          </p>
          <p className="text-[0.6875rem] font-sans-modern opacity-80 leading-tight mt-0.5">
            {pendingCount > 0 
              ? `${pendingCount} notatek w kolejce Background Sync (automatyczna wysyłka do Firestore).`
              : 'Dostępny ostatni scenariusz i pliki lokalne.'}
          </p>
        </div>
      </div>
      {pendingCount > 0 && (
        <div className="flex items-center gap-1.5 bg-amber-500/30 px-3 py-1.5 rounded-xl border border-amber-400/40 text-[0.6875rem] font-mono-label font-bold text-amber-200 shrink-0 shadow">
          <RefreshCw className="w-3.5 h-3.5 animate-spin text-amber-300" />
          <span>{pendingCount} w tle</span>
        </div>
      )}
    </div>
  );
};
