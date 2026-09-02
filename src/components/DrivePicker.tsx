import { useEffect, useState } from 'react';
import { getAccessToken } from '../lib/auth';
import { Cloud, Loader2 } from 'lucide-react';

declare global {
  interface Window {
    gapi: any;
    google: any;
  }
}

interface DrivePickerProps {
  onFilesPicked: (files: { id: string; name: string; mimeType: string; type: 'drive' }[]) => void;
  className?: string;
}

export function DrivePicker({ onFilesPicked, className }: DrivePickerProps) {
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    // Load gapi.client and google.picker
    const loadGapi = () => {
      if (window.gapi?.load) {
        window.gapi.load('picker', { callback: () => setIsLoaded(true) });
        return;
      }
      const script = document.createElement('script');
      script.src = 'https://apis.google.com/js/api.js';
      script.onload = () => {
        window.gapi.load('picker', { callback: () => setIsLoaded(true) });
      };
      document.body.appendChild(script);
    };
    loadGapi();
  }, []);

  const openPicker = async () => {
    const token = await getAccessToken();
    if (!token) {
      alert("Proszę się zalogować, aby uzyskać dostęp do Google Drive.");
      return;
    }
    
    if (!window.google || !window.google.picker) {
      alert("Picker API jeszcze się nie załadowało.");
      return;
    }

    const pickerOrigin =
      window.location.ancestorOrigins && window.location.ancestorOrigins.length > 0
        ? window.location.ancestorOrigins[window.location.ancestorOrigins.length - 1]
        : window.location.origin;

    const view = new window.google.picker.DocsView()
      .setIncludeFolders(true)
      .setSelectFolderEnabled(false);

    const picker = new window.google.picker.PickerBuilder()
      .addView(view)
      .setOAuthToken(token)
      .setDeveloperKey('') // Not needed when using OAuth Token
      .setCallback((data: any) => {
        if (data.action === window.google.picker.Action.PICKED) {
          const files = data.docs.map((doc: any) => ({
            id: doc.id,
            name: doc.name,
            mimeType: doc.mimeType,
            type: 'drive' as const
          }));
          onFilesPicked(files);
        }
      })
      .setOrigin(pickerOrigin)
      .build();
      
    picker.setVisible(true);
  };

  return (
    <button 
      disabled={!isLoaded}
      onClick={openPicker}
      className={className || "min-h-[44px] flex items-center justify-center gap-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 active:scale-95 text-white font-medium py-2.5 px-4 rounded-xl shadow-md disabled:opacity-50 transition-all text-sm"}
    >
      {!isLoaded ? <Loader2 className="w-4 h-4 animate-spin" /> : <Cloud className="w-4 h-4 text-blue-200" />}
      <span>{isLoaded ? "Dysk Google" : "Ładowanie..."}</span>
    </button>
  );
}

