import { useEffect, useState } from 'react';
import { getAccessToken, googleSignIn } from '../lib/auth';
import firebaseConfig from '../../firebase-applet-config.json';
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
  const [isOpening, setIsOpening] = useState(false);

  const ensureGapiLoaded = (): Promise<boolean> => {
    return new Promise((resolve) => {
      try {
        if (window.gapi?.load) {
          window.gapi.load('picker', {
            callback: () => resolve(true),
            onerror: () => {
              console.warn('Nie udało się załadować modułu Google Picker');
              resolve(false);
            }
          });
          return;
        }

        const existingScript = document.querySelector('script[src*="apis.google.com/js/api.js"]') as HTMLScriptElement | null;
        if (existingScript) {
          if (window.gapi?.load) {
            window.gapi.load('picker', {
              callback: () => resolve(true),
              onerror: () => resolve(false)
            });
          } else {
            existingScript.addEventListener('load', () => {
              try {
                window.gapi?.load('picker', {
                  callback: () => resolve(true),
                  onerror: () => resolve(false)
                });
              } catch (_) {
                resolve(false);
              }
            });
            existingScript.addEventListener('error', () => resolve(false));
          }
          return;
        }

        const script = document.createElement('script');
        script.src = 'https://apis.google.com/js/api.js';
        script.async = true;
        script.defer = true;
        script.crossOrigin = 'anonymous';
        script.onload = () => {
          try {
            if (window.gapi?.load) {
              window.gapi.load('picker', {
                callback: () => resolve(true),
                onerror: () => resolve(false)
              });
            } else {
              resolve(false);
            }
          } catch (e) {
            console.warn('Wyjątek inicjalizacji Google Picker:', e);
            resolve(false);
          }
        };
        script.onerror = () => {
          console.warn('Nie można załadować apis.google.com w bieżącym środowisku iframe.');
          resolve(false);
        };
        document.body.appendChild(script);

        // Timeout after 6 seconds to never hang UI
        setTimeout(() => resolve(!!window.google?.picker), 6000);
      } catch (err) {
        console.warn('Błąd podczas ładowania skryptu Google API:', err);
        resolve(false);
      }
    });
  };

  const openPicker = async () => {
    setIsOpening(true);
    try {
      const gapiReady = await ensureGapiLoaded();
      if (!gapiReady && (!window.google || !window.google.picker)) {
        alert("W tym środowisku przeglądarki (iframe z ograniczeniami CORS) selektor Dysku Google nie mógł zostać uruchomiony. Możesz bezpiecznie wybrać zdjęcia i filmy bezpośrednio ze swojego komputera.");
        return;
      }

      let token = await getAccessToken();
      if (!token) {
        // Prompt Google Sign-In with Drive scopes if not already authenticated
        const authResult = await googleSignIn();
        token = authResult?.accessToken || null;
      }

      if (!token) {
        alert("Wymagane jest logowanie Google z uprawnieniami do Dysku Google.");
        return;
      }
      
      if (!window.google || !window.google.picker) {
        alert("Biblioteka Google Picker nie jest jeszcze dostępna. Skorzystaj z wyboru plików z dysku lokalnego.");
        return;
      }

      const view = new window.google.picker.DocsView()
        .setIncludeFolders(true)
        .setSelectFolderEnabled(false);
        
      let builder = new window.google.picker.PickerBuilder()
        .addView(view)
        .setOAuthToken(token);

      if (firebaseConfig.messagingSenderId) {
        builder = builder.setAppId(firebaseConfig.messagingSenderId);
      }

      // Origin must match the current host and iframe ancestors
      const pickerOrigin =
        window.location.ancestorOrigins &&
        window.location.ancestorOrigins.length > 0
          ? window.location.ancestorOrigins[
              window.location.ancestorOrigins.length - 1
            ]
          : window.location.origin;

      builder = builder.setOrigin(pickerOrigin);

      builder = builder.setCallback((data: any) => {
        if (data.action === window.google.picker.Action.PICKED) {
          const files = (data.docs || []).map((doc: any) => ({
            id: doc.id,
            name: doc.name,
            mimeType: doc.mimeType,
            type: 'drive' as const
          }));
          onFilesPicked(files);
        }
      });

      const picker = builder.build();
      picker.setVisible(true);
    } catch (err: any) {
      console.error("Błąd selektora Google Drive:", err);
      alert("Nie udało się otworzyć Dysku Google (" + (err?.message || "Ograniczenia środowiska") + "). Możesz wybrać pliki bezpośrednio z komputera.");
    } finally {
      setIsOpening(false);
    }
  };

  return (
    <button 
      disabled={isOpening}
      onClick={openPicker}
      className={className || "min-h-[2.75rem] flex items-center justify-center gap-2 glass-card hover:border-[#D4AF37]/60 hover:text-[#FDE047] active:scale-95 text-white font-mono-label font-medium py-2.5 px-4 rounded-2xl shadow-md disabled:opacity-50 transition-all text-xs cursor-pointer"}
    >
      {isOpening ? <Loader2 className="w-4 h-4 animate-spin text-[#D4AF37]" /> : <Cloud className="w-4 h-4 text-[#D4AF37]" />}
      <span>{isOpening ? "Otwieranie..." : "Dysk Google"}</span>
    </button>
  );
}

