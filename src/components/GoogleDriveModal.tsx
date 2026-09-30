import React, { useState, useEffect } from 'react';
import { X, Cloud, Loader2, Check, RefreshCw, Search, Video, Image, ExternalLink, AlertCircle, CheckCircle2 } from 'lucide-react';
import { useAuth } from '../lib/firebase/AuthContext';
import type { MediaClip } from '../types/project';

interface GoogleDriveModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImportClips: (clips: MediaClip[]) => void;
  existingClips: MediaClip[];
}

interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  size?: string;
  thumbnailLink?: string;
  createdTime?: string;
  webViewLink?: string;
  videoMediaMetadata?: {
    width?: number;
    height?: number;
    durationMillis?: string;
  };
  imageMediaMetadata?: {
    width?: number;
    height?: number;
  };
}

export function GoogleDriveIcon({ className = "w-5 h-5" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 87.3 78" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M6.6 66.85l3.85 6.65c.8 1.4 1.95 2.5 3.3 3.3l13.75-23.8H0c0 1.55.4 3.1 1.2 4.5l5.4 9.35z" fill="#0066DA" />
      <path d="M43.65 25L29.9 1.2C28.55 2 27.4 3.1 26.6 4.5L1.2 48.5c-.8 1.4-1.2 2.95-1.2 4.5h27.5L43.65 25z" fill="#00AC47" />
      <path d="M73.55 76.8c1.35-.8 2.5-1.9 3.3-3.3l1.6-2.75 7.65-13.25c.8-1.4 1.2-2.95 1.2-4.5H59.8l5.9 10.2 7.85 13.6z" fill="#EA4335" />
      <path d="M43.65 25L57.4 1.2C56.05.4 54.5 0 52.85 0H34.45c-1.65 0-3.2.4-4.55 1.2L43.65 25z" fill="#00832D" />
      <path d="M59.8 53H27.5L13.75 76.8c1.35.8 2.9 1.2 4.55 1.2h50.7c1.65 0 3.2-.4 4.55-1.2L59.8 53z" fill="#2684FC" />
      <path d="M73.4 26.5l-12.7-22C59.35 3.1 57.8 2 56.05 1.2L42.3 25l17.5 30.3h27.5c0-1.55-.4-3.1-1.2-4.5l-12.7-24.3z" fill="#FFBA00" />
    </svg>
  );
}

export function GoogleDriveModal({ isOpen, onClose, onImportClips, existingClips }: GoogleDriveModalProps) {
  const { user, accessToken, login, clearDriveAccess } = useAuth();
  const [files, setFiles] = useState<DriveFile[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedFileIds, setSelectedFileIds] = useState<Set<string>>(new Set());
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  const existingFileIds = new Set(existingClips.filter(c => c.driveFileId).map(c => c.driveFileId));

  const fetchDriveFiles = async (tokenToUse?: string) => {
    const token = tokenToUse || accessToken;
    if (!token) return;

    setLoading(true);
    setError(null);
    try {
      const q = "trashed = false and (mimeType contains 'video/' or mimeType contains 'image/' or mimeType = 'application/json')";
      
      // Try direct Google Drive client API first for fastest response without backend latency
      try {
        const driveUrl = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id,name,mimeType,size,thumbnailLink,createdTime,webViewLink,videoMediaMetadata,imageMediaMetadata)&orderBy=modifiedTime desc&pageSize=100`;
        const directRes = await fetch(driveUrl, {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (directRes.ok) {
          const data = await directRes.json();
          setFiles(data.files || []);
          return;
        }
      } catch (directErr) {
        console.warn('[GoogleDriveModal] Direct API fetch failed, trying proxy endpoint...', directErr);
      }

      // Proxy fallback
      const res = await fetch(`/api/drive/list?accessToken=${encodeURIComponent(token)}`);
      if (!res.ok) {
        if (res.status === 401) {
          clearDriveAccess();
        }
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Błąd serwera (${res.status})`);
      }
      const data = await res.json();
      setFiles(data.files || []);
    } catch (err: any) {
      console.error('Fetch Google Drive files error:', err);
      setError(err?.message || 'Nie udało się pobrać plików z Dysku Google.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen && accessToken) {
      fetchDriveFiles();
    }
  }, [isOpen, accessToken]);

  if (!isOpen) return null;

  const handleLogin = async () => {
    setIsLoggingIn(true);
    setError(null);
    try {
      const token = await login();
      if (token) {
        await fetchDriveFiles(token);
      }
    } catch (err: any) {
      setError(err?.message || 'Nie udało się zalogować przez Google.');
    } finally {
      setIsLoggingIn(false);
    }
  };

  const toggleSelect = (id: string) => {
    const next = new Set(selectedFileIds);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    setSelectedFileIds(next);
  };

  const selectAll = () => {
    if (selectedFileIds.size === filteredFiles.length) {
      setSelectedFileIds(new Set());
    } else {
      setSelectedFileIds(new Set(filteredFiles.map(f => f.id)));
    }
  };

  const handleConfirmImport = () => {
    const selected = files.filter(f => selectedFileIds.has(f.id));
    if (selected.length === 0) return;

    const token = accessToken || '';
    if (token && typeof window !== 'undefined') {
      sessionStorage.setItem('gdrive_access_token', token);
    }
    const newClips: MediaClip[] = selected.map(file => {
      const isVideo = file.mimeType.startsWith('video/');
      const streamUrl = `/api/drive/stream/${file.id}?accessToken=${encodeURIComponent(token)}`;
      
      let duration = isVideo ? 10 : 5;
      let width = 1920;
      let height = 1080;

      if (isVideo && file.videoMediaMetadata) {
        if (file.videoMediaMetadata.durationMillis) {
          const ms = parseInt(file.videoMediaMetadata.durationMillis, 10);
          if (!isNaN(ms) && ms > 0) {
            duration = Math.max(0.1, Math.round((ms / 1000) * 10) / 10);
          }
        }
        if (file.videoMediaMetadata.width) width = file.videoMediaMetadata.width;
        if (file.videoMediaMetadata.height) height = file.videoMediaMetadata.height;
      } else if (!isVideo && file.imageMediaMetadata) {
        if (file.imageMediaMetadata.width) width = file.imageMediaMetadata.width;
        if (file.imageMediaMetadata.height) height = file.imageMediaMetadata.height;
      }

      const orientation = height > width ? 'portrait' : (width === height ? 'square' : 'landscape');
      const ratio = width && height ? (width / height) : (16 / 9);
      const aspectRatio = Math.abs(ratio - 16 / 9) < 0.08 ? '16:9' : (Math.abs(ratio - 9 / 16) < 0.08 ? '9:16' : (Math.abs(ratio - 4 / 3) < 0.08 ? '4:3' : (ratio > 1 ? '16:9' : '9:16')));

      return {
        id: `drive_${file.id}`,
        driveFileId: file.id,
        name: file.name,
        type: isVideo ? 'video' : 'image',
        objectUrl: streamUrl,
        thumbnailUrl: file.thumbnailLink || streamUrl,
        duration,
        width,
        height,
        aspectRatio,
        orientation,
        size: file.size ? parseInt(file.size, 10) : 0,
        category: 'unassigned',
        status: 'unused',
        isFavorite: false,
        tags: ['Google Drive'],
        createdAt: new Date().toISOString(),
        capturedAt: file.createdTime || new Date().toISOString()
      };
    });

    onImportClips(newClips);
    setSelectedFileIds(new Set());
    onClose();
  };

  const filteredFiles = files.filter(f => 
    f.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-[#121212] border border-[#2A2824] rounded-2xl w-full max-w-3xl max-h-[85vh] flex flex-col shadow-2xl overflow-hidden">
        
        {/* Header */}
        <div className="p-5 border-b border-[#2A2824] flex items-center justify-between bg-[#161616]">
          <div className="flex items-center gap-3">
            <GoogleDriveIcon className="w-7 h-7" />
            <div>
              <h2 className="text-lg font-serif-luxury text-white font-bold tracking-wide">
                Dysk Google
              </h2>
              <p className="text-xs text-[#AAA69D]">
                Zgraj swoje nagrania wideo i zdjęcia bezpośrednio do montażu
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-white/5 text-[#AAA69D] hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-5">
          {!user || !accessToken ? (
            <div className="py-12 flex flex-col items-center justify-center text-center space-y-4 max-w-md mx-auto">
              <div className="w-16 h-16 rounded-2xl bg-[#1A1A1A] border border-[#2A2824] flex items-center justify-center">
                <GoogleDriveIcon className="w-10 h-10" />
              </div>
              <div>
                <h3 className="text-lg font-medium text-white">Połącz swoje konto Google</h3>
                <p className="text-xs text-[#AAA69D] mt-1.5 leading-relaxed">
                  Zaloguj się kontem Google, aby uzyskać bezpieczny dostęp do nagrań i zdjęć zapisanych na Twoim Dysku Google.
                </p>
              </div>

              {error && (
                <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-xl text-xs text-red-400 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              <button
                onClick={handleLogin}
                disabled={isLoggingIn}
                className="luxury-btn-primary px-6 py-3 rounded-xl font-bold flex items-center gap-3 cursor-pointer shadow-lg disabled:opacity-50"
              >
                {isLoggingIn ? (
                  <Loader2 className="w-5 h-5 animate-spin text-black" />
                ) : (
                  <GoogleDriveIcon className="w-5 h-5" />
                )}
                <span className="text-black font-semibold">Zaloguj przez Google</span>
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Filter bar */}
              <div className="flex flex-col sm:flex-row gap-3 items-center justify-between">
                <div className="relative w-full sm:w-72">
                  <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-stone-500" />
                  <input
                    type="text"
                    placeholder="Szukaj pliku w Dysku..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full bg-[#1A1A1A] border border-[#2A2824] rounded-lg pl-9 pr-3 py-2 text-xs text-white placeholder-stone-500 focus:outline-none focus:border-[#D4AF37]"
                  />
                </div>

                <div className="flex items-center gap-2 w-full sm:w-auto justify-between sm:justify-end">
                  <button
                    onClick={() => fetchDriveFiles()}
                    disabled={loading}
                    className="flex items-center gap-1.5 px-3 py-2 bg-[#1A1A1A] border border-[#2A2824] rounded-lg text-xs text-[#AAA69D] hover:text-white transition-colors"
                    title="Odśwież listę plików"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-[#D4AF37]' : ''}`} />
                    <span>Odśwież</span>
                  </button>

                  {filteredFiles.length > 0 && (
                    <button
                      onClick={selectAll}
                      className="px-3 py-2 bg-[#1A1A1A] border border-[#2A2824] rounded-lg text-xs text-[#AAA69D] hover:text-[#D4AF37] transition-colors"
                    >
                      {selectedFileIds.size === filteredFiles.length ? 'Odznacz wszystkie' : 'Zaznacz wszystkie'}
                    </button>
                  )}
                </div>
              </div>

              {/* Status/Error */}
              {error && (
                <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-xl text-xs text-red-400 flex items-center justify-between">
                  <span>{error}</span>
                  <button onClick={() => fetchDriveFiles()} className="underline text-red-300">
                    Spróbuj ponownie
                  </button>
                </div>
              )}

              {/* Loading */}
              {loading ? (
                <div className="py-20 flex flex-col items-center justify-center space-y-3">
                  <Loader2 className="w-8 h-8 text-[#D4AF37] animate-spin" />
                  <p className="text-xs text-[#AAA69D]">Wyszukiwanie plików wideo i zdjęć na Twoim Dysku...</p>
                </div>
              ) : filteredFiles.length === 0 ? (
                <div className="py-16 text-center space-y-2">
                  <Cloud className="w-12 h-12 text-[#AAA69D]/40 mx-auto" />
                  <p className="text-sm font-medium text-white">Brak plików wideo lub zdjęć</p>
                  <p className="text-xs text-[#AAA69D] max-w-sm mx-auto">
                    Nie znaleźliśmy nagrań wideo ani zdjęć na Twoim Dysku Google. Upewnij się, że pliki znajdują się na Twoim dysku i mają format wideo/foto.
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 max-h-[45vh] overflow-y-auto pr-1">
                  {filteredFiles.map((file) => {
                    const isSelected = selectedFileIds.has(file.id);
                    const isVideo = file.mimeType.startsWith('video/');

                    return (
                      <div
                        key={file.id}
                        onClick={() => !existingFileIds.has(file.id) && toggleSelect(file.id)}
                        className={`group relative rounded-xl border p-2 transition-all flex flex-col justify-between ${
                          existingFileIds.has(file.id)
                            ? 'opacity-60 grayscale-[0.5] bg-[#0A0A0A] border-[#222] cursor-default'
                            : isSelected
                            ? 'bg-[#D4AF37]/15 border-[#D4AF37] cursor-pointer'
                            : 'bg-[#181818] border-[#2A2824] hover:border-[#D4AF37]/40 hover:bg-[#1E1E1E] cursor-pointer'
                        }`}
                      >
                        {/* Checkbox indicator */}
                        <div className={`absolute top-2 right-2 z-10 w-5 h-5 rounded-full flex items-center justify-center transition-all ${
                          existingFileIds.has(file.id)
                            ? 'bg-emerald-500/20 text-emerald-500 border border-emerald-500/30'
                            : isSelected 
                            ? 'bg-[#D4AF37] text-black shadow-md' 
                            : 'bg-black/60 border border-white/20 text-transparent'
                        }`}>
                          {existingFileIds.has(file.id) ? (
                            <CheckCircle2 className="w-3.5 h-3.5" />
                          ) : (
                            <Check className="w-3 h-3 stroke-[3]" />
                          )}
                        </div>

                        {/* Thumbnail / Icon */}
                        <div className="aspect-video bg-black/40 rounded-lg overflow-hidden flex items-center justify-center relative mb-2">
                          {file.thumbnailLink ? (
                            <img
                              src={file.thumbnailLink}
                              alt={file.name}
                              className="w-full h-full object-cover"
                              referrerPolicy="no-referrer"
                            />
                          ) : isVideo ? (
                            <Video className="w-8 h-8 text-[#D4AF37]/60" />
                          ) : (
                            <Image className="w-8 h-8 text-[#D4AF37]/60" />
                          )}

                          <span className="absolute bottom-1 left-1 text-[9px] font-mono uppercase bg-black/70 px-1 py-0.5 rounded text-white font-bold">
                            {isVideo ? 'WIDEO' : 'FOTO'}
                          </span>
                          {isVideo && file.videoMediaMetadata?.durationMillis && (
                            <span className="absolute bottom-1 right-1 text-[9px] font-mono bg-black/80 text-[#D4AF37] px-1 py-0.5 rounded font-bold border border-[#D4AF37]/30">
                              {Math.floor(parseInt(file.videoMediaMetadata.durationMillis, 10) / 60000)}:{(Math.floor((parseInt(file.videoMediaMetadata.durationMillis, 10) % 60000) / 1000)).toString().padStart(2, '0')}
                            </span>
                          )}
                        </div>

                        {/* Info */}
                        <div className="overflow-hidden">
                          <p className="text-xs text-white truncate font-medium" title={file.name}>
                            {file.name}
                          </p>
                          <p className="text-[10px] text-[#888] font-mono mt-0.5">
                            {file.size ? `${(parseInt(file.size, 10) / (1024 * 1024)).toFixed(1)} MB` : 'Dysk Google'}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        {user && accessToken && (
          <div className="p-4 border-t border-[#2A2824] bg-[#161616] flex items-center justify-between">
            <div className="text-xs font-mono text-[#AAA69D]">
              Wybrano: <span className="text-[#D4AF37] font-bold">{selectedFileIds.size}</span> z {filteredFiles.length}
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={onClose}
                className="px-4 py-2 rounded-xl text-xs font-medium text-[#AAA69D] hover:text-white transition-colors"
              >
                Anuluj
              </button>
              <button
                onClick={handleConfirmImport}
                disabled={selectedFileIds.size === 0}
                className="luxury-btn-primary px-5 py-2.5 rounded-xl text-xs font-bold uppercase disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2 shadow-lg"
              >
                <Cloud className="w-4 h-4" />
                <span>Zaimportuj wybrane ({selectedFileIds.size})</span>
              </button>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
