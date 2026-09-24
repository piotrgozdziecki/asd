import React, { useState, useMemo } from 'react';
import { 
  UploadCloud, 
  FileVideo, 
  Trash2, 
  Loader2, 
  Star, 
  Plus, 
  Cloud, 
  AlertTriangle,
  RotateCw,
  Search,
  Filter,
  CheckCircle2,
  Film,
  Clock,
  Sparkles,
  ArrowUpDown,
  Calendar,
  CheckSquare,
  Square,
  Copy,
  Volume2,
  VolumeX,
  Layers,
  ShieldAlert,
  Image as ImageIcon,
  Music,
  Play,
  X
} from 'lucide-react';
import type { MediaClip, ClipCategory } from '../../types/project';
import { GoogleDriveModal, GoogleDriveIcon } from '../GoogleDriveModal';
import { probeVideoMetadata, probeImageMetadata } from '../../core/media/metadataProber';
import { urlRegistry } from '../../core/media/urlRegistry';
import { localIndexedDB } from '../../core/storage/indexedDBProvider';
import { ConfirmModal } from '../common/ConfirmModal';
import { useStudioToast } from '../common/ToastContext';

interface MediaManagerProps {
  clips: MediaClip[];
  onAddClips: (clips: MediaClip[]) => void;
  onUpdateClip: (id: string, updates: Partial<MediaClip>) => void;
  onRemoveClip: (id: string) => void;
  onAddToTimeline: (clip: MediaClip, customRange?: { start: number; end: number }) => void;
  onRelinkSource?: (clipId: string, file: File) => void;
  onVerifyDurations?: () => Promise<{ checked: number; updated: number; details: { name: string; oldDuration: number; newDuration: number }[] }>;
  onClearFavorites?: () => void;
  onClearAllMedia?: () => void;
  onResetProject?: () => void;
  onEditClip?: (clip: MediaClip) => void;
  onMoveClipOrder?: (fromIndex: number, toIndex: number) => void;
  externalFilterTab?: string;
  onFilterTabChange?: (tab: any) => void;
}

export function MediaManager({ 
  clips, 
  onAddClips, 
  onUpdateClip, 
  onRemoveClip, 
  onAddToTimeline,
  onRelinkSource,
  onVerifyDurations,
  onClearFavorites,
  onClearAllMedia,
  onResetProject,
  onEditClip,
  onMoveClipOrder,
  externalFilterTab,
  onFilterTabChange
}: MediaManagerProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingStatus, setProcessingStatus] = useState<string>('');
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isDriveModalOpen, setIsDriveModalOpen] = useState(false);
  const [isVerifyingDurations, setIsVerifyingDurations] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [verifyMessage, setVerifyMessage] = useState<string | null>(null);

  // Filters & Search
  const [searchQuery, setSearchQuery] = useState('');
  const [filterTab, setFilterTab] = useState<string>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [sortOrder, setSortOrder] = useState<'newest' | 'oldest' | 'captured_newest' | 'captured_oldest' | 'quality' | 'duration_desc' | 'duration_asc' | 'name' | 'size'>('newest');
  const [missingClipIds, setMissingClipIds] = useState<string[]>([]);
  
  // Multi-select & Grouping
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isGroupedBySimilarity, setIsGroupedBySimilarity] = useState<boolean>(false);
  const [isConfirmClearAllOpen, setIsConfirmClearAllOpen] = useState(false);
  const [isConfirmBatchDeleteOpen, setIsConfirmBatchDeleteOpen] = useState(false);
  const [previewingClip, setPreviewingClip] = useState<MediaClip | null>(null);
  const toast = useStudioToast();

  // Sync with externalFilterTab if provided
  React.useEffect(() => {
    if (externalFilterTab) {
      setFilterTab(externalFilterTab.toLowerCase());
    }
  }, [externalFilterTab]);

  const handleFilterTabChange = (newTab: string) => {
    setFilterTab(newTab);
    if (onFilterTabChange) {
      onFilterTabChange(newTab);
    }
  };

  const videoClips = useMemo(() => clips.filter(c => c.type === 'video'), [clips]);
  const hasSuspicious10sClips = useMemo(() => videoClips.some(c => c.duration === 10), [videoClips]);

  const handleAutoCategorizeChronologically = () => {
    if (clips.length === 0) return;
    
    // Sort clips chronologically by recording or creation timestamp
    const sorted = [...clips].sort((a, b) => {
      const timeA = new Date(a.capturedAt || a.createdAt).getTime();
      const timeB = new Date(b.capturedAt || b.createdAt).getTime();
      return timeA - timeB;
    });

    const stages: ClipCategory[] = [
      'preparations',
      'ceremony',
      'congratulations',
      'first_dance',
      'toast',
      'party',
      'guests',
      'climax',
      'ending'
    ];

    let updatedCount = 0;
    sorted.forEach((clip, index) => {
      const stageIdx = Math.min(
        stages.length - 1,
        Math.floor((index / sorted.length) * stages.length)
      );
      const targetCat = stages[stageIdx];
      onUpdateClip(clip.id, { category: targetCat });
      updatedCount++;
    });

    setVerifyMessage(`⚡ Sukces! Przypisano ${updatedCount} ujęć do etapów wesela wg chronologii dnia ślubu.`);
    setTimeout(() => setVerifyMessage(null), 7000);
  };

  const handleVerifyDurations = async () => {
    if (!onVerifyDurations || isVerifyingDurations) return;
    setIsVerifyingDurations(true);
    setVerifyMessage('Trwa precyzyjna analiza długości wszystkich ujęć wideo...');
    try {
      const res = await onVerifyDurations();
      if (res.updated > 0) {
        setVerifyMessage(`Zaktualizowano prawdziwy czas trwania dla ${res.updated} filmów (na ${res.checked} sprawdzonych).`);
      } else {
        setVerifyMessage(`Wszystkie filmy (${res.checked}) mają już potwierdzoną, dokładną długość.`);
      }
      setTimeout(() => setVerifyMessage(null), 8000);
    } catch (err: any) {
      setVerifyMessage(`Błąd weryfikacji: ${err.message || 'Nieznany błąd'}`);
      setTimeout(() => setVerifyMessage(null), 8000);
    } finally {
      setIsVerifyingDurations(false);
    }
  };

  const handleRefreshLibrary = async () => {
    if (isRefreshing) return;
    setIsRefreshing(true);
    setVerifyMessage('Odświeżanie biblioteki i synchronizacja plików...');
    
    try {
      let recoveredCount = 0;
      const detectedMissingIds: string[] = [];

      for (const clip of clips) {
        let isReachable = true;
        
        // Check blob URLs
        if (clip.objectUrl?.startsWith('blob:')) {
          try {
            const res = await fetch(clip.objectUrl, { method: 'HEAD' });
            if (!res.ok) isReachable = false;
          } catch {
            isReachable = false;
          }

          if (!isReachable) {
            // Try to recover from IndexedDB
            const blob = await localIndexedDB.getMediaBlob(clip.id);
            if (blob) {
              const newUrl = urlRegistry.create(blob);
              onUpdateClip(clip.id, { objectUrl: newUrl, status: 'unused' });
              recoveredCount++;
            } else {
              detectedMissingIds.push(clip.id);
              onUpdateClip(clip.id, { status: 'missing' });
            }
          }
        }
      }

      setMissingClipIds(detectedMissingIds);

      if (onVerifyDurations) {
        await onVerifyDurations();
      }

      if (detectedMissingIds.length > 0) {
        setVerifyMessage(`Odświeżono! Odzyskano ${recoveredCount} plików. Wykryto ${detectedMissingIds.length} nieaktualnych/brakujących plików.`);
      } else {
        setVerifyMessage(`Biblioteka jest w 100% aktualna. Odświeżono wszystkie połączenia mediów.`);
      }
      
      setTimeout(() => {
        if (detectedMissingIds.length === 0) {
          setVerifyMessage(null);
        }
      }, 6000);
    } catch (err) {
      console.error('Refresh failed:', err);
      setVerifyMessage('Wystąpił błąd podczas odświeżania.');
      setTimeout(() => setVerifyMessage(null), 5000);
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleRemoveMissingClips = () => {
    if (missingClipIds.length === 0) return;
    missingClipIds.forEach(id => onRemoveClip(id));
    setVerifyMessage(`Pomyślnie usunięto ${missingClipIds.length} nieaktualnych plików z biblioteki.`);
    setMissingClipIds([]);
    setTimeout(() => setVerifyMessage(null), 5000);
  };

  const handleClearFavorites = () => {
    if (!onClearFavorites) {
      // Fallback if prop not provided
      clips.forEach(c => {
        if (c.isFavorite) onUpdateClip(c.id, { isFavorite: false });
      });
      return;
    }
    onClearFavorites();
  };

  const handleClearAllMedia = () => {
    setIsConfirmClearAllOpen(true);
  };

  const executeClearAllMedia = () => {
    setIsConfirmClearAllOpen(false);
    if (onResetProject) {
      onResetProject();
    } else if (onClearAllMedia) {
      onClearAllMedia();
    } else {
      clips.forEach(c => onRemoveClip(c.id));
    }
    toast.showSuccess('Pomyślnie wyczyszczono wszystkie materiały z projektu.');
  };

  // Multi-selection Handlers
  const toggleSelectClip = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSelectAllFiltered = () => {
    setSelectedIds(new Set(filteredClips.map(c => c.id)));
  };

  const handleClearSelection = () => {
    setSelectedIds(new Set());
  };

  const handleInvertSelection = () => {
    setSelectedIds(prev => {
      const next = new Set<string>();
      filteredClips.forEach(c => {
        if (!prev.has(c.id)) next.add(c.id);
      });
      return next;
    });
  };

  const handleBatchAddToTimeline = () => {
    const selected = filteredClips.filter(c => selectedIds.has(c.id));
    if (selected.length === 0) return;
    selected.forEach(clip => {
      onAddToTimeline(clip);
    });
    setVerifyMessage(`Dodano ${selected.length} zaznaczonych materiałów do osi czasu.`);
    setSelectedIds(new Set());
    setTimeout(() => setVerifyMessage(null), 5000);
  };

  const handleBatchSetCategory = (category: ClipCategory) => {
    selectedIds.forEach(id => {
      onUpdateClip(id, { category });
    });
    setVerifyMessage(`Zaktualizowano kategorię na "${category}" dla ${selectedIds.size} materiałów.`);
    setTimeout(() => setVerifyMessage(null), 5000);
  };

  const handleBatchToggleFavorite = () => {
    const selected = clips.filter(c => selectedIds.has(c.id));
    const allFav = selected.every(c => c.isFavorite);
    selected.forEach(c => {
      onUpdateClip(c.id, { isFavorite: !allFav });
    });
    setVerifyMessage(allFav ? `Usunięto z ulubionych dla ${selected.length} ujęć.` : `Oznaczono jako ulubione ${selected.length} ujęć.`);
    setTimeout(() => setVerifyMessage(null), 5000);
  };

  const handleBatchRemove = () => {
    if (selectedIds.size === 0) return;
    setIsConfirmBatchDeleteOpen(true);
  };

  const executeBatchRemove = () => {
    setIsConfirmBatchDeleteOpen(false);
    const count = selectedIds.size;
    selectedIds.forEach(id => onRemoveClip(id));
    setSelectedIds(new Set());
    toast.showSuccess(`Usunięto ${count} materiałów z biblioteki.`);
  };

  const handleAddBestMomentsToTimeline = () => {
    const bestClips = clips.filter(c => 
      c.type === 'video' && 
      (c.analysis?.ratingCategory === 'BEST' || (c.analysis?.qualityScore ?? 0) >= 75)
    );
    if (bestClips.length === 0) {
      toast.showWarning('Nie znaleziono jeszcze ujęć z oceną Złotych Momentów. Uruchom analizę AI Wedding Director.');
      return;
    }

    // Sort chronologically and avoid duplicate takes
    const sorted = [...bestClips].sort((a, b) => {
      const timeA = new Date(a.capturedAt || a.createdAt).getTime();
      const timeB = new Date(b.capturedAt || b.createdAt).getTime();
      return timeA - timeB;
    });

    let added = 0;
    sorted.forEach(clip => {
      // Exclude secondary duplicates
      if (clip.duplicateStatus && clip.duplicateStatus !== 'NONE' && !clip.bestInGroup) {
        return;
      }

      if (clip.analysis && clip.analysis.recommendedEnd > clip.analysis.recommendedStart) {
        onAddToTimeline(clip, {
          start: clip.analysis.recommendedStart,
          end: clip.analysis.recommendedEnd
        });
      } else {
        onAddToTimeline(clip);
      }
      added++;
    });

    setVerifyMessage(`★ Sukces! Dodano ${added} Złotych Momentów do osi czasu z przycięciem Smart Cut.`);
    setTimeout(() => setVerifyMessage(null), 6000);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };
  
  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };
  
  const processFiles = async (files: File[]) => {
    setIsProcessing(true);
    setUploadProgress(0);
    const validFiles = files.filter(f => f.type.startsWith('video/') || f.type.startsWith('image/'));
    if (validFiles.length === 0) {
      setIsProcessing(false);
      return;
    }

    const newClips: MediaClip[] = [];

    for (let i = 0; i < validFiles.length; i++) {
      const file = validFiles[i];
      setProcessingStatus(`Analiza ${i + 1}/${validFiles.length}: ${file.name}`);
      setUploadProgress(Math.round(((i + 1) / validFiles.length) * 100));

      try {
        const isVideo = file.type.startsWith('video/');
        const objectUrl = urlRegistry.create(file);

        if (isVideo) {
          const meta = await probeVideoMetadata(file);
          const clipId = `clip_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
          
          // Persist file in IndexedDB
          try {
            await localIndexedDB.saveMediaBlob(clipId, file);
          } catch (e) {
            console.warn('Could not store blob in IDB:', e);
          }

          const clip: MediaClip = {
            id: clipId,
            file,
            objectUrl,
            type: 'video',
            name: file.name,
            duration: meta.duration,
            width: meta.width,
            height: meta.height,
            aspectRatio: meta.aspectRatio,
            orientation: meta.orientation,
            fps: meta.fps,
            hasAudio: meta.hasAudio,
            size: file.size,
            thumbnailUrl: meta.thumbnailUrl || objectUrl,
            category: 'unassigned',
            status: 'unused',
            isFavorite: false,
            tags: [],
            createdAt: new Date().toISOString(),
            capturedAt: new Date(file.lastModified).toISOString()
          };
          newClips.push(clip);
        } else {
          const meta = await probeImageMetadata(file);
          const clipId = `clip_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
          
          // Persist file in IndexedDB
          try {
            await localIndexedDB.saveMediaBlob(clipId, file);
          } catch (e) {
            console.warn('Could not store blob in IDB:', e);
          }

          const clip: MediaClip = {
            id: clipId,
            file,
            objectUrl,
            type: 'image',
            name: file.name,
            duration: 5,
            width: meta.width,
            height: meta.height,
            aspectRatio: meta.aspectRatio,
            orientation: meta.orientation,
            fps: 30,
            hasAudio: false,
            size: file.size,
            thumbnailUrl: meta.thumbnailUrl || objectUrl,
            category: 'unassigned',
            status: 'unused',
            isFavorite: false,
            tags: [],
            createdAt: new Date().toISOString(),
            capturedAt: new Date(file.lastModified).toISOString()
          };
          newClips.push(clip);
        }
      } catch (err: any) {
        console.error('Failed to probe file:', file.name, err);
      }
    }

    if (newClips.length > 0) {
      onAddClips(newClips);
    }
    
    setIsProcessing(false);
    setProcessingStatus('');
    setUploadProgress(0);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const files = Array.from(e.dataTransfer.files) as File[];
    await processFiles(files);
  };
  
  const handleFileInput = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const files = Array.from(e.target.files) as File[];
      await processFiles(files);
    }
  };

  const handleRelinkInput = (clipId: string, e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0] && onRelinkSource) {
      onRelinkSource(clipId, e.target.files[0]);
    }
  };

  const formatDuration = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const formatSize = (bytes: number) => {
    const mb = bytes / (1024 * 1024);
    return `${mb.toFixed(1)} MB`;
  };

  const formatDateTimeDisplay = (isoString?: string) => {
    if (!isoString) return null;
    try {
      const d = new Date(isoString);
      if (isNaN(d.getTime())) return null;
      return d.toLocaleDateString('pl-PL', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch {
      return null;
    }
  };

  // Filtered & Sorted Clips
  const filteredClips = useMemo(() => {
    let result = clips.filter(clip => {
      // Search
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        if (!clip.name.toLowerCase().includes(q) && !clip.category.toLowerCase().includes(q)) {
          return false;
        }
      }

      // Tab filter
      if (filterTab === 'video' && clip.type !== 'video') return false;
      if (filterTab === 'image' && clip.type !== 'image') return false;
      if (filterTab === 'audio' && clip.type !== 'audio') return false;
      if (filterTab === 'unused' && clip.status !== 'unused') return false;
      if (filterTab === 'used' && clip.status !== 'used') return false;
      if (filterTab === 'missing' && clip.status !== 'missing' && clip.objectUrl) return false;
      if (filterTab === 'favorites' && !clip.isFavorite) return false;

      // Smart & Technical Filters
      if (filterTab === 'best') {
        const isBest = clip.analysis?.ratingCategory === 'BEST' || (clip.analysis?.qualityScore ?? 0) >= 75;
        if (!isBest) return false;
      }
      if (filterTab === 'good' && clip.analysis?.ratingCategory !== 'GOOD') return false;
      if (filterTab === 'neutral' && clip.analysis?.ratingCategory !== 'NEUTRAL') return false;
      if (filterTab === 'problem') {
        const isProblem = clip.analysis?.ratingCategory === 'PROBLEM' || (clip.analysis?.issues && clip.analysis.issues.length > 0);
        if (!isProblem) return false;
      }
      if (filterTab === 'duplicates') {
        const isDuplicate = Boolean(
          (clip.analysis?.duplicateStatus && clip.analysis.duplicateStatus !== 'NONE') ||
          (clip.duplicateStatus && clip.duplicateStatus !== 'NONE') ||
          clip.similarGroupId
        );
        if (!isDuplicate) return false;
      }

      // Category filter
      if (categoryFilter !== 'all' && clip.category !== categoryFilter) return false;

      return true;
    });

    // Sorting
    return result.sort((a, b) => {
      switch (sortOrder) {
        case 'newest':
          return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
        case 'oldest':
          return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
        case 'captured_newest':
          return new Date(b.capturedAt || b.createdAt).getTime() - new Date(a.capturedAt || a.createdAt).getTime();
        case 'captured_oldest':
          return new Date(a.capturedAt || a.createdAt).getTime() - new Date(b.capturedAt || b.createdAt).getTime();
        case 'quality':
          return (b.analysis?.qualityScore ?? 50) - (a.analysis?.qualityScore ?? 50);
        case 'duration_desc':
          return b.duration - a.duration;
        case 'duration_asc':
          return a.duration - b.duration;
        case 'name':
          return a.name.localeCompare(b.name);
        case 'size':
          return b.size - a.size;
        default:
          return 0;
      }
    });
  }, [clips, searchQuery, filterTab, categoryFilter, sortOrder]);

  const totalDuration = clips.reduce((acc, c) => acc + c.duration, 0);

  // Grouping by similarity helper
  const groupedClips = useMemo(() => {
    if (!isGroupedBySimilarity) {
      return [{ groupId: 'all', title: '', clips: filteredClips, isCluster: false }];
    }
    const map = new Map<string, MediaClip[]>();
    filteredClips.forEach(c => {
      const gId = c.similarGroupId || `solo_${c.id}`;
      if (!map.has(gId)) map.set(gId, []);
      map.get(gId)!.push(c);
    });

    const groups: { groupId: string; title: string; clips: MediaClip[]; isCluster: boolean }[] = [];
    map.forEach((grpClips, gId) => {
      const isCluster = grpClips.length > 1;
      groups.push({
        groupId: gId,
        title: isCluster ? `Seria ujęć / Duble (${grpClips.length} ujęć)` : '',
        clips: grpClips,
        isCluster
      });
    });

    return groups.sort((a, b) => (b.isCluster ? 1 : 0) - (a.isCluster ? 1 : 0));
  }, [filteredClips, isGroupedBySimilarity]);

  return (
    <div className="flex flex-col space-y-4 pb-6 w-full max-w-full">
      
      {/* Cinematic Import Stage (Haute Couture Film Vault) */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 shrink-0 w-full">
        
        {/* Local Disk Upload Card */}
        <div 
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          className={`md:col-span-2 relative atelier-card rounded-2xl p-6 flex flex-col items-center justify-center transition-all group overflow-hidden ${
            isDragging 
              ? 'border-[#FDE047] bg-[#D4AF37]/15 shadow-[0_0_35px_rgba(212,175,55,0.3)]' 
              : 'hover:border-[#D4AF37]/60'
          }`}
        >
          {/* Subtle Corner Light Glow */}
          <div className="absolute top-0 right-0 w-48 h-48 bg-[#D4AF37]/10 rounded-full blur-3xl pointer-events-none group-hover:bg-[#D4AF37]/20 transition-all" />
          
          <div className="text-center space-y-3 relative z-10">
            <div className="relative inline-block mx-auto">
              <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-[#2F2714] to-[#14120D] border border-[#D4AF37]/50 flex items-center justify-center shadow-[0_0_20px_rgba(212,175,55,0.25)] group-hover:scale-105 transition-transform">
                {isProcessing ? (
                  <Loader2 className="w-7 h-7 text-[#FDE047] animate-spin" />
                ) : (
                  <UploadCloud className="w-7 h-7 text-[#FDE047]" />
                )}
              </div>
              <span className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-[#1A1812] border border-[#D4AF37]/60 flex items-center justify-center text-[10px] text-[#FDE047]">
                ✦
              </span>
            </div>

            <div>
              <h3 className="font-cinematic font-bold text-base text-transparent bg-clip-text bg-gradient-to-r from-[#FFF5C0] via-[#E8D288] to-[#D4AF37] tracking-wider">
                {isProcessing ? processingStatus : 'ATELIER FILMOWE: IMPORT UJĘĆ'}
              </h3>
              <p className="text-xs text-[#C5BCA8] mt-1 max-w-md mx-auto">
                Przeciągnij i upuść lub kliknij, aby wczytać nagrania wideo i zdjęcia ślubne
              </p>
              <div className="flex flex-wrap items-center justify-center gap-2 mt-2.5">
                <span className="px-2 py-0.5 rounded-md bg-[#1B1812] border border-[#3A3222] text-[10px] font-mono text-[#D4AF37]">4K UHD / 1080p</span>
                <span className="px-2 py-0.5 rounded-md bg-[#1B1812] border border-[#3A3222] text-[10px] font-mono text-[#AAA08B]">MP4 • MOV • WEBM</span>
                <span className="px-2 py-0.5 rounded-md bg-[#1B1812] border border-[#3A3222] text-[10px] font-mono text-[#AAA08B]">JPG • PNG • HEVC</span>
              </div>
            </div>

            {isProcessing && (
              <div className="w-64 h-2 bg-[#1A1813] rounded-full mx-auto overflow-hidden mt-3 border border-[#3E3422] shadow-inner">
                <div 
                  className="h-full bg-gradient-to-r from-[#D4AF37] via-[#FDE047] to-[#C59B48] transition-all duration-200 shadow-[0_0_10px_rgba(253,224,71,0.5)]"
                  style={{ width: `${uploadProgress}%` }}
                />
              </div>
            )}

            <input 
              type="file" 
              multiple 
              accept="video/*,image/*"
              onChange={handleFileInput}
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
              disabled={isProcessing}
              title="Wybierz pliki z dysku komputera lub pamięci telefonu"
            />
          </div>
        </div>

        {/* Google Drive Import Card (Cloud Vault) */}
        <div className="atelier-card rounded-2xl p-6 flex flex-col items-center justify-between text-center relative group overflow-hidden">
          <div className="absolute -bottom-10 -left-10 w-36 h-36 bg-blue-500/10 rounded-full blur-2xl pointer-events-none" />
          
          <div className="space-y-3 relative z-10 w-full flex flex-col items-center">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-[#1C202B] to-[#12141A] border border-[#3A4560] flex items-center justify-center shadow-[0_0_20px_rgba(66,133,244,0.2)] group-hover:scale-105 transition-transform">
              <GoogleDriveIcon className="w-7 h-7" />
            </div>
            <div>
              <h3 className="font-cinematic font-bold text-sm text-[#F5F2EA] tracking-wider">SKARBIEC DYSKU GOOGLE</h3>
              <p className="text-[11px] text-[#A69E8D] mt-1 max-w-xs mx-auto">
                Bezpośredni transfer i streaming ujęć ślubnych z chmury Google Drive
              </p>
            </div>
          </div>

          <button
            onClick={() => setIsDriveModalOpen(true)}
            className="w-full mt-4 bg-gradient-to-r from-[#242016] to-[#171510] hover:from-[#D4AF37] hover:to-[#FDE047] text-[#FDE047] hover:text-black border border-[#D4AF37]/40 hover:border-[#D4AF37] px-4 py-2.5 rounded-xl font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-2 transition-all cursor-pointer shadow-[0_4px_15px_rgba(0,0,0,0.5)] hover:shadow-[0_0_20px_rgba(212,175,55,0.35)]"
          >
            <Cloud className="w-4 h-4" />
            <span>Otwórz Dysk Google</span>
          </button>
        </div>
      </div>

      {/* Modal for Google Drive */}
      <GoogleDriveModal
        isOpen={isDriveModalOpen}
        onClose={() => setIsDriveModalOpen(false)}
        onImportClips={onAddClips}
        existingClips={clips}
      />

      {/* Filter and Search Bar (Haute Couture Director's Console) */}
      <div className="flex flex-col gap-3.5 bg-gradient-to-r from-[#14120D] via-[#100F0C] to-[#14120D] p-3.5 sm:p-4 rounded-2xl border border-[#2D261A] shrink-0 shadow-[0_8px_30px_rgba(0,0,0,0.5)] backdrop-blur-xl">
        
        {/* Row 1: Search + Filter Tabs */}
        <div className="flex flex-wrap items-center justify-between gap-3 w-full">
          {/* Search */}
          <div className="relative flex-1 min-w-0 w-full sm:w-auto sm:max-w-md">
            <Search className="w-3.5 h-3.5 text-[#D4AF37]/70 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Szukaj ujęcia lub kategorii weselnej..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-[#18150F] border border-[#2D261A] focus:border-[#D4AF37] rounded-xl pl-8 pr-3 py-1.5 text-xs text-[#F5F2EA] focus:outline-none focus:ring-1 focus:ring-[#D4AF37]/50 shadow-inner"
            />
          </div>

          {/* Filter Tabs */}
          <div className="flex items-center gap-1 bg-[#16130D] p-1 rounded-xl border border-[#2D261A] text-[11px] overflow-x-auto touch-pan-x custom-scrollbar max-w-full">
            <button
              onClick={() => handleFilterTabChange('all')}
              className={`px-3 py-1.5 rounded-lg whitespace-nowrap transition-all font-medium cursor-pointer ${filterTab === 'all' ? 'bg-gradient-to-r from-[#D4AF37] to-[#FDE047] text-black font-bold shadow-[0_0_12px_rgba(212,175,55,0.3)]' : 'text-[#A69C87] hover:text-white hover:bg-white/[0.04]'}`}
            >
              Wszystkie ({clips.length})
            </button>
            <button
              onClick={() => handleFilterTabChange('video')}
              className={`px-3 py-1.5 rounded-lg whitespace-nowrap transition-all font-medium flex items-center gap-1 cursor-pointer ${filterTab === 'video' ? 'bg-gradient-to-r from-[#D4AF37] to-[#FDE047] text-black font-bold shadow-[0_0_12px_rgba(212,175,55,0.3)]' : 'text-[#A69C87] hover:text-white hover:bg-white/[0.04]'}`}
            >
              <Film className="w-3 h-3" />
              <span>Wideo ({clips.filter(c => c.type === 'video').length})</span>
            </button>
            <button
              onClick={() => handleFilterTabChange('image')}
              className={`px-3 py-1.5 rounded-lg whitespace-nowrap transition-all font-medium flex items-center gap-1 cursor-pointer ${filterTab === 'image' ? 'bg-gradient-to-r from-[#D4AF37] to-[#FDE047] text-black font-bold shadow-[0_0_12px_rgba(212,175,55,0.3)]' : 'text-[#A69C87] hover:text-white hover:bg-white/[0.04]'}`}
            >
              <ImageIcon className="w-3 h-3" />
              <span>Zdjęcia ({clips.filter(c => c.type === 'image').length})</span>
            </button>
            <button
              onClick={() => handleFilterTabChange('audio')}
              className={`px-3 py-1.5 rounded-lg whitespace-nowrap transition-all font-medium flex items-center gap-1 cursor-pointer ${filterTab === 'audio' ? 'bg-gradient-to-r from-[#D4AF37] to-[#FDE047] text-black font-bold shadow-[0_0_12px_rgba(212,175,55,0.3)]' : 'text-[#A69C87] hover:text-white hover:bg-white/[0.04]'}`}
            >
              <Music className="w-3 h-3" />
              <span>Audio ({clips.filter(c => c.type === 'audio').length})</span>
            </button>
            <div className="w-px h-4 bg-[#332A1C] mx-1" />
            <button
              onClick={() => handleFilterTabChange('best')}
              className={`px-3 py-1.5 rounded-lg whitespace-nowrap transition-all font-bold flex items-center gap-1 cursor-pointer ${filterTab === 'best' ? 'bg-emerald-500 text-black shadow-[0_0_12px_rgba(16,185,129,0.4)]' : 'text-emerald-400 hover:text-emerald-300 hover:bg-emerald-950/30'}`}
              title="Pokaż ujęcia ocenione jako Złote Momenty (BEST / Jakość >= 75%)"
            >
              ★ Złote momenty
            </button>
            <button
              onClick={() => handleFilterTabChange('duplicates')}
              className={`px-3 py-1.5 rounded-lg whitespace-nowrap transition-all font-semibold flex items-center gap-1 cursor-pointer ${filterTab === 'duplicates' ? 'bg-amber-500 text-black shadow-[0_0_12px_rgba(245,158,11,0.4)]' : 'text-amber-400 hover:text-amber-300 hover:bg-amber-950/30'}`}
              title="Pokaż serie ujęć i wykryte duble"
            >
              <Copy className="w-3 h-3" />
              <span>Duplikaty & serie</span>
            </button>
            <button
              onClick={() => handleFilterTabChange('problem')}
              className={`px-3 py-1.5 rounded-lg whitespace-nowrap transition-all font-semibold flex items-center gap-1 cursor-pointer ${filterTab === 'problem' ? 'bg-rose-500 text-white shadow-[0_0_12px_rgba(244,63,94,0.4)]' : 'text-rose-400 hover:text-rose-300 hover:bg-rose-950/30'}`}
              title="Pokaż ujęcia z problemami technicznymi"
            >
              <ShieldAlert className="w-3 h-3" />
              <span>Do poprawy</span>
            </button>
            <div className="w-px h-4 bg-[#332A1C] mx-1" />
            <button
              onClick={() => handleFilterTabChange('unused')}
              className={`px-2.5 py-1.5 rounded-lg whitespace-nowrap transition-all font-medium cursor-pointer ${filterTab === 'unused' ? 'bg-[#D4AF37] text-black font-bold' : 'text-[#A69C87] hover:text-white'}`}
            >
              Nieużyte
            </button>
            <button
              onClick={() => handleFilterTabChange('used')}
              className={`px-2.5 py-1.5 rounded-lg whitespace-nowrap transition-all font-medium cursor-pointer ${filterTab === 'used' ? 'bg-[#D4AF37] text-black font-bold' : 'text-[#A69C87] hover:text-white'}`}
            >
              Na osi
            </button>
            <button
              onClick={() => handleFilterTabChange('favorites')}
              className={`px-2.5 py-1.5 rounded-lg whitespace-nowrap transition-all font-medium cursor-pointer ${filterTab === 'favorites' ? 'bg-[#D4AF37] text-black font-bold' : 'text-[#A69C87] hover:text-white'}`}
            >
              ★ Ulubione
            </button>
          </div>
        </div>

        {/* Row 2: Category, Sort, and Action buttons (Scrollable horizontally on mobile/tablets) */}
        <div className="flex items-center justify-between gap-3 pt-2 border-t border-[#1F1D1A]/80 overflow-x-auto touch-pan-x custom-scrollbar pb-1">
          <div className="flex items-center gap-2 shrink-0">
            {/* Category Filter */}
            <div className="flex items-center gap-1.5 shrink-0">
              <Filter className="w-3.5 h-3.5 text-[#AAA69D] shrink-0" />
              <select
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
                className="bg-[#181818] border border-[#2A2824] text-xs text-[#AAA69D] rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-[#D4AF37] cursor-pointer"
              >
                <option value="all">Wszystkie etapy wesela</option>
                <option value="opening">I. Wstęp / Teaser</option>
                <option value="preparations">I. Przygotowania</option>
                <option value="ceremony">II. Ceremonia Ślubna</option>
                <option value="congratulations">III. Życzenia i Gratulacje</option>
                <option value="first_dance">IV. Pierwszy Taniec</option>
                <option value="toast">V. Toasty i Przemowy</option>
                <option value="party">VI. Zabawa Weselna</option>
                <option value="guests">VII. Nasi Goście</option>
                <option value="family">VIII. Rodzina i Portrety</option>
                <option value="cake">IX. Tort Weselny</option>
                <option value="climax">IX. Oczepiny & Kulminacja</option>
                <option value="ending">X. Zakończenie i Finał</option>
                <option value="outdoor">Plener Ślubny</option>
                <option value="unassigned">Nieprzypisane</option>
              </select>
            </div>

            {/* Sort Options */}
            <div className="flex items-center gap-1.5 shrink-0">
              <ArrowUpDown className="w-3.5 h-3.5 text-[#AAA69D] shrink-0" />
              <select
                value={sortOrder}
                onChange={(e) => setSortOrder(e.target.value as any)}
                className="bg-[#181818] border border-[#2A2824] text-xs text-[#AAA69D] rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-[#D4AF37] cursor-pointer"
              >
                <option value="newest">Od najnowszych (dodanie)</option>
                <option value="oldest">Od najstarszych (dodanie)</option>
                <option value="captured_newest">Od najnowszych (nagranie)</option>
                <option value="captured_oldest">Od najstarszych (nagranie)</option>
                <option value="quality">Najwyższa jakość (ocena techniczna)</option>
                <option value="duration_desc">Długość (od najdłuższych)</option>
                <option value="duration_asc">Długość (od najkrótszych)</option>
                <option value="name">Nazwa (A-Z)</option>
                <option value="size">Rozmiar pliku</option>
              </select>
            </div>

            {/* Grouping Toggle */}
            <button
              onClick={() => setIsGroupedBySimilarity(!isGroupedBySimilarity)}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-semibold transition-all cursor-pointer whitespace-nowrap shrink-0 ${
                isGroupedBySimilarity
                  ? 'bg-[#D4AF37] text-black border-[#D4AF37]'
                  : 'bg-[#181818] border-[#2A2824] text-[#AAA69D] hover:text-white'
              }`}
              title="Grupuj ujęcia w serie i klastry podobieństwa (widok serii i dubli)"
            >
              <Layers className="w-3.5 h-3.5" />
              <span>Grupuj serie</span>
            </button>
          </div>

          {/* Action buttons (Scrollable horizontally on mobile/small screens!) */}
          <div className="flex items-center gap-2 shrink-0">
            {clips.some(c => (c.analysis?.ratingCategory === 'BEST' || (c.analysis?.qualityScore ?? 0) >= 75)) && (
              <button
                onClick={handleAddBestMomentsToTimeline}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-emerald-500/50 bg-emerald-950/60 text-emerald-300 hover:bg-emerald-900/80 transition-all cursor-pointer text-xs font-semibold shadow-sm whitespace-nowrap shrink-0"
                title="Dodaje wszystkie najlepsze ujęcia (Złote Momenty) z automatycznym Smart Cut bezpośrednio na oś czasu"
              >
                <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
                <span>★ Dodaj Złote Momenty do Osi</span>
              </button>
            )}

            {clips.length > 0 && (
              <button
                onClick={handleAutoCategorizeChronologically}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[#D4AF37]/50 bg-[#1D1B16] text-[#D4AF37] hover:bg-[#D4AF37]/20 transition-all cursor-pointer text-xs font-semibold shadow-sm whitespace-nowrap shrink-0"
                title="Automatycznie analizuje daty i godziny nagrań, przypisując ujęcia do kolejnych etapów wesela (od przygotowań po oczepiny)"
              >
                <Sparkles className="w-3.5 h-3.5 text-[#D4AF37]" />
                <span>⚡ Auto-etapy</span>
              </button>
            )}

            <button
              onClick={handleRefreshLibrary}
              disabled={isRefreshing}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[#2A2824] bg-[#181818] text-[#AAA69D] hover:text-[#D4AF37] hover:border-[#D4AF37]/40 transition-all cursor-pointer text-xs font-semibold whitespace-nowrap shrink-0"
              title="Sprawdza dostępność plików, odświeża połączenia i usuwa nieaktualne wpisy"
            >
              {isRefreshing ? <Loader2 className="w-3.5 h-3.5 animate-spin text-[#D4AF37]" /> : <RotateCw className="w-3.5 h-3.5 text-[#D4AF37]" />}
              <span>Odśwież</span>
            </button>

            {clips.length > 0 && (
              <button
                onClick={handleClearFavorites}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-[#2A2824] bg-[#181818] text-[#AAA69D] hover:text-amber-400 hover:border-amber-400/40 transition-all cursor-pointer text-xs font-semibold whitespace-nowrap shrink-0"
                title="Usuwa oznaczenie gwiazdką ze wszystkich materiałów"
              >
                <Star className="w-3.5 h-3.5" />
                <span>Wyczyść gwiazdki</span>
              </button>
            )}

            {clips.length > 0 && (
              <button
                onClick={handleClearAllMedia}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-red-900/40 bg-[#1A1212] text-red-400 hover:bg-red-950/60 hover:border-red-500/60 transition-all cursor-pointer text-xs font-semibold whitespace-nowrap shrink-0"
                title="Usuwa WSZYSTKIE materiały i czyści bazę danych ze starych filmów"
              >
                <Trash2 className="w-3.5 h-3.5 text-red-400" />
                <span>Wyczyść stare filmy</span>
              </button>
            )}

            {onVerifyDurations && videoClips.length > 0 && (
              <button
                onClick={handleVerifyDurations}
                disabled={isVerifyingDurations}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-semibold transition-all cursor-pointer whitespace-nowrap shrink-0 ${
                  hasSuspicious10sClips
                    ? 'bg-[#D4AF37] text-black border-[#D4AF37] hover:bg-[#FDE047] shadow-md'
                    : 'bg-[#181818] border-[#2A2824] text-[#AAA69D] hover:text-white hover:border-[#D4AF37]/40'
                }`}
                title="Bada pliki źródłowe i przywraca rzeczywisty czas trwania dla wszystkich filmów"
              >
                {isVerifyingDurations ? (
                  <Loader2 className={`w-3.5 h-3.5 animate-spin ${hasSuspicious10sClips ? 'text-black' : 'text-[#D4AF37]'}`} />
                ) : (
                  <Clock className={`w-3.5 h-3.5 ${hasSuspicious10sClips ? 'text-black' : 'text-[#D4AF37]'}`} />
                )}
                <span>
                  {isVerifyingDurations ? 'Badanie filmów...' : (hasSuspicious10sClips ? '⚡ Zbadaj czasy filmów' : 'Weryfikuj długości')}
                </span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Batch Actions Bar for Multi-selection */}
      {selectedIds.size > 0 && (
        <div className="bg-[#1C1A17] border-2 border-[#D4AF37] rounded-xl p-3 sm:p-4 flex flex-wrap items-center justify-between gap-3 shadow-xl shrink-0">
          <div className="flex items-center gap-2 text-xs text-white">
            <span className="font-bold text-[#D4AF37] bg-black/60 px-2 py-0.5 rounded border border-[#D4AF37]/50">
              {selectedIds.size} zaznaczonych
            </span>
            <button 
              onClick={handleSelectAllFiltered}
              className="text-[11px] text-[#AAA69D] hover:text-white underline ml-2 cursor-pointer font-medium"
            >
              Zaznacz widoczne ({filteredClips.length})
            </button>
            <button 
              onClick={handleInvertSelection}
              className="text-[11px] text-[#AAA69D] hover:text-white underline cursor-pointer font-medium"
            >
              Odwróć
            </button>
            <button 
              onClick={handleClearSelection}
              className="text-[11px] text-[#AAA69D] hover:text-white underline cursor-pointer font-medium"
            >
              Odznacz wszystko
            </button>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={handleBatchAddToTimeline}
              className="bg-[#D4AF37] hover:bg-[#FDE047] text-black font-bold text-xs px-3 py-1.5 rounded-lg flex items-center gap-1.5 shadow cursor-pointer transition-transform hover:scale-105"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Dodaj do Osi Czasu</span>
            </button>

            <select
              onChange={(e) => {
                if (e.target.value !== 'none') {
                  handleBatchSetCategory(e.target.value as any);
                  e.target.value = 'none';
                }
              }}
              defaultValue="none"
              className="bg-[#111] border border-[#333] text-xs text-stone-200 rounded-lg px-2.5 py-1.5 cursor-pointer hover:border-[#D4AF37]"
            >
              <option value="none" disabled>Zmień etap wesela...</option>
              <option value="opening">I. Wstęp / Teaser</option>
              <option value="preparations">I. Przygotowania</option>
              <option value="ceremony">II. Ceremonia Ślubna</option>
              <option value="congratulations">III. Życzenia i Gratulacje</option>
              <option value="first_dance">IV. Pierwszy Taniec</option>
              <option value="toast">V. Toasty i Przemowy</option>
              <option value="party">VI. Zabawa Weselna</option>
              <option value="guests">VII. Nasi Goście</option>
              <option value="family">VIII. Rodzina i Portrety</option>
              <option value="cake">IX. Tort Weselny</option>
              <option value="climax">IX. Oczepiny & Kulminacja</option>
              <option value="ending">X. Zakończenie i Finał</option>
              <option value="outdoor">Plener Ślubny</option>
            </select>

            <button
              onClick={handleBatchToggleFavorite}
              className="bg-[#222] hover:bg-[#333] text-amber-300 border border-amber-500/40 text-xs font-semibold px-2.5 py-1.5 rounded-lg flex items-center gap-1.5 cursor-pointer"
            >
              <Star className="w-3.5 h-3.5 fill-amber-400" />
              <span>Ulubione</span>
            </button>

            <button
              onClick={handleBatchRemove}
              className="bg-red-950/80 hover:bg-red-900 text-red-200 border border-red-700/80 text-xs font-semibold px-2.5 py-1.5 rounded-lg flex items-center gap-1.5 cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Usuń z biblioteki</span>
            </button>
          </div>
        </div>
      )}

      {/* Verification Status Banner */}
      {verifyMessage && (
        <div className="bg-[#1C1A17] border border-[#D4AF37]/40 text-[#F2EFE8] px-4 py-2.5 rounded-xl text-xs flex items-center justify-between shadow-lg shrink-0 gap-3">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-[#D4AF37] shrink-0" />
            <span>{verifyMessage}</span>
          </div>
          <div className="flex items-center gap-2">
            {missingClipIds.length > 0 && (
              <button
                onClick={handleRemoveMissingClips}
                className="bg-red-950/80 hover:bg-red-900 border border-red-700/80 text-red-200 text-xs font-semibold px-2.5 py-1 rounded-lg flex items-center gap-1.5 cursor-pointer transition-colors shadow"
                title="Usuwa z biblioteki wszystkie pliki, których pliki źródłowe zostały utracone lub usunięte"
              >
                <Trash2 className="w-3 h-3" />
                Usuń nieaktualne ({missingClipIds.length})
              </button>
            )}
            <button 
              onClick={() => { setVerifyMessage(null); setMissingClipIds([]); }}
              className="text-xs text-[#AAA69D] hover:text-white ml-2 cursor-pointer"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {/* Suspicious 10s Alert Banner */}
      {hasSuspicious10sClips && !verifyMessage && !isVerifyingDurations && (
        <div className="bg-[#1C180A] border border-[#D4AF37]/50 text-[#F2EFE8] px-4 py-3 rounded-xl text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-2 shadow-lg shrink-0">
          <div className="flex items-center gap-2.5">
            <AlertTriangle className="w-5 h-5 text-[#D4AF37] shrink-0" />
            <span>
              Wykryto filmy o domyślnym czasie <strong>10 sekund</strong> (z Dysku Google lub przed pełną analizą). Kliknij poniżej, aby odczytać ich rzeczywistą, pełną długość.
            </span>
          </div>
          {onVerifyDurations && (
            <button 
              onClick={handleVerifyDurations}
              className="bg-[#D4AF37] hover:bg-[#FDE047] text-black font-bold text-xs px-3.5 py-1.5 rounded-lg shrink-0 cursor-pointer transition-transform hover:scale-105 shadow-md flex items-center gap-1.5"
            >
              <Clock className="w-3.5 h-3.5" />
              <span>Napraw czasy filmów</span>
            </button>
          )}
        </div>
      )}

      {/* Media Grid */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden custom-scrollbar">
        {filteredClips.length === 0 ? (
          <div className="h-48 border border-dashed border-[#2A2824] rounded-2xl flex flex-col items-center justify-center text-center p-6 text-[#777]">
            <Film className="w-8 h-8 opacity-30 mb-2" />
            <p className="text-xs max-w-sm">
              {clips.length === 0 
                ? "Biblioteka jest pusta i czysta. Dodaj własne filmy z dysku komputera lub z Dysku Google powyżej, aby rozpocząć montaż."
                : "Brak ujęć spełniających wybrane kryteria lub filtry."}
            </p>
          </div>
        ) : (
          <div className="space-y-6 pb-12">
            {groupedClips.map((group) => (
              <div 
                key={group.groupId} 
                className={group.isCluster && isGroupedBySimilarity ? "p-3.5 bg-[#14120F] border border-amber-500/30 rounded-2xl space-y-3" : ""}
              >
                {group.isCluster && isGroupedBySimilarity && (
                  <div className="flex items-center justify-between px-1">
                    <div className="flex items-center gap-2">
                      <Layers className="w-4 h-4 text-[#D4AF37]" />
                      <span className="text-xs font-bold text-amber-300">{group.title}</span>
                      <span className="text-[10px] text-[#AAA69D]">• Wybierz najlepsze ujęcie do montażu</span>
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-1 min-[480px]:grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 gap-3 sm:gap-4">
                  {group.clips.map((clip, clipIndex) => {
                    const isMissing = clip.status === 'missing' || (!clip.objectUrl && !clip.file && !clip.driveFileId);
                    const isVertical = clip.orientation === 'portrait';
                    const isSelected = selectedIds.has(clip.id);
                    const mimeLabel = clip.mimeType || (clip.type === 'video' ? 'video/mp4' : 'image/jpeg');
                    const usageNum = clip.usageCount || (clip.status === 'used' ? 1 : 0);

                    return (
                      <div 
                        key={clip.id} 
                        draggable={Boolean(onMoveClipOrder)}
                        onDragStart={(e) => {
                          e.dataTransfer.setData('text/plain', String(clipIndex));
                          e.dataTransfer.effectAllowed = 'move';
                        }}
                        onDragOver={(e) => {
                          e.preventDefault();
                          e.dataTransfer.dropEffect = 'move';
                        }}
                        onDrop={(e) => {
                          e.preventDefault();
                          const fromIdx = Number(e.dataTransfer.getData('text/plain'));
                          if (!isNaN(fromIdx) && fromIdx !== clipIndex && onMoveClipOrder) {
                            onMoveClipOrder(fromIdx, clipIndex);
                          }
                        }}
                        className={`atelier-card rounded-2xl overflow-hidden group relative flex flex-col transition-all hover:scale-[1.01] duration-200 cursor-grab active:cursor-grabbing ${
                          isSelected
                            ? 'border-[#FDE047] ring-2 ring-[#D4AF37]/60 shadow-[0_0_20px_rgba(212,175,55,0.35)]'
                            : isMissing 
                            ? 'border-rose-500/60 bg-rose-950/20' 
                            : clip.status === 'used'
                            ? 'border-emerald-500/40 shadow-[0_4px_15px_rgba(16,185,129,0.1)]'
                            : 'hover:border-[#D4AF37]/70 hover:shadow-[0_10px_30px_rgba(0,0,0,0.8),0_0_20px_rgba(212,175,55,0.2)]'
                        }`}
                      >
                        {/* Thumbnail Container with Click to Preview */}
                        <div 
                          onClick={() => setPreviewingClip(clip)}
                          className="relative aspect-video bg-black overflow-hidden flex items-center justify-center cursor-pointer group/thumb"
                          title="Kliknij, aby otworzyć podgląd wideo"
                        >
                          {clip.thumbnailUrl ? (
                            <img 
                              src={clip.thumbnailUrl} 
                              alt={clip.name} 
                              className="w-full h-full object-cover transition-transform group-hover/thumb:scale-105" 
                              loading="lazy"
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center">
                              {clip.type === 'image' ? (
                                <ImageIcon className="w-6 h-6 text-white/20" />
                              ) : clip.type === 'audio' ? (
                                <Music className="w-6 h-6 text-white/20" />
                              ) : (
                                <FileVideo className="w-6 h-6 text-white/20" />
                              )}
                            </div>
                          )}
                          
                          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-black/40 opacity-80" />
                          
                          {/* Play overlay on hover */}
                          <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover/thumb:opacity-100 transition-opacity bg-black/40">
                            <div className="w-10 h-10 rounded-full bg-[#D4AF37] text-black flex items-center justify-center shadow-lg transform scale-90 group-hover/thumb:scale-100 transition-transform">
                              <Play className="w-5 h-5 fill-black ml-0.5" />
                            </div>
                          </div>
                          
                          {/* Selection Checkbox & Clip Number */}
                          <div className="absolute top-2 left-2 z-20 flex items-center gap-1.5">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                toggleSelectClip(clip.id);
                              }}
                              className={`p-1 rounded backdrop-blur-md transition-colors cursor-pointer ${
                                isSelected 
                                  ? 'bg-[#D4AF37] text-black shadow-md' 
                                  : 'bg-black/60 text-white hover:bg-black/90'
                              }`}
                              title={isSelected ? "Odznacz ujęcie" : "Zaznacz ujęcie do akcji masowej"}
                            >
                              {isSelected ? <CheckSquare className="w-3.5 h-3.5" /> : <Square className="w-3.5 h-3.5 opacity-70" />}
                            </button>
                            <span className="px-1.5 py-0.5 rounded bg-black/80 border border-white/10 text-[10px] font-mono font-bold text-white">
                              #{clipIndex + 1}
                            </span>
                          </div>

                          {/* Action buttons on hover */}
                          <div className="absolute top-2 right-2 flex flex-col gap-1 z-10">
                            <button 
                              onClick={() => onAddToTimeline(clip)}
                              className="p-1.5 rounded-lg bg-[#D4AF37] hover:bg-[#FDE047] text-black shadow-md cursor-pointer transition-transform hover:scale-105"
                              title="Dodaj pełne ujęcie do osi czasu"
                            >
                              <Plus className="w-4 h-4" />
                            </button>
                            {clip.analysis && clip.analysis.recommendedEnd > clip.analysis.recommendedStart && (
                              <button
                                onClick={() => onAddToTimeline(clip, { 
                                  start: clip.analysis!.recommendedStart, 
                                  end: clip.analysis!.recommendedEnd 
                                })}
                                className="p-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-black shadow-md cursor-pointer transition-transform hover:scale-105 text-[10px] font-bold flex items-center justify-center"
                                title={`Smart Cut: Dodaj tylko najlepszy fragment (${clip.analysis.recommendedStart.toFixed(1)}s - ${clip.analysis.recommendedEnd.toFixed(1)}s)`}
                              >
                                ✂️
                              </button>
                            )}
                            <button 
                              onClick={() => onUpdateClip(clip.id, { isFavorite: !clip.isFavorite })}
                              className="p-1.5 rounded-lg bg-black/60 hover:bg-black/90 text-white backdrop-blur-sm cursor-pointer transition-colors"
                              title="Oznacz jako ulubione"
                            >
                              <Star className={`w-4 h-4 ${clip.isFavorite ? 'fill-[#D4AF37] text-[#D4AF37]' : ''}`} />
                            </button>
                          </div>

                          {/* Orientation & Quality Badges */}
                          <div className="absolute top-9 left-2 flex flex-col gap-1 items-start z-10">
                            <div className="text-[9px] font-mono font-bold px-1.5 py-0.5 rounded backdrop-blur-sm bg-black/70 text-white border border-white/10">
                              {isVertical ? 'PION (9:16)' : 'POZIOM (16:9)'}
                            </div>

                            {clip.bestInGroup && (
                              <div className="text-[8px] font-bold px-1.5 py-0.5 rounded bg-amber-500 text-black flex items-center gap-0.5 shadow">
                                <Star className="w-2.5 h-2.5 fill-black" />
                                <span>NAJLEPSZE</span>
                              </div>
                            )}

                            {!clip.bestInGroup && clip.duplicateStatus && clip.duplicateStatus !== 'NONE' && (
                              <div className="text-[8px] font-semibold px-1.5 py-0.5 rounded bg-amber-950/90 text-amber-300 border border-amber-500/40 flex items-center gap-0.5">
                                <Copy className="w-2.5 h-2.5" />
                                <span>DUBEL</span>
                              </div>
                            )}

                            {clip.analysis && (
                              <div className={`text-[9px] font-bold px-1.5 py-0.5 rounded backdrop-blur-md shadow border ${
                                clip.analysis.ratingCategory === 'BEST' ? 'bg-emerald-950/90 text-emerald-300 border-emerald-500/50' :
                                clip.analysis.ratingCategory === 'GOOD' ? 'bg-blue-950/90 text-blue-300 border-blue-500/50' :
                                clip.analysis.ratingCategory === 'PROBLEM' ? 'bg-red-950/90 text-red-300 border-red-500/50' :
                                'bg-stone-900/90 text-stone-300 border-stone-600/50'
                              }`} title={`Jakość: ${clip.analysis.qualityScore}%, Stabilność: ${clip.analysis.stabilityScore}%`}>
                                {clip.analysis.ratingCategory} {clip.analysis.qualityScore}%
                              </div>
                            )}

                            {clip.isProxyReady && (
                              <div className="text-[8px] font-mono font-semibold px-1 py-0.5 rounded bg-cyan-950/90 text-cyan-300 border border-cyan-500/40">
                                ⚡ PROXY
                              </div>
                            )}
                          </div>

                          {/* Duration Badge */}
                          <div className={`absolute bottom-2 right-2 text-[10px] font-mono font-bold px-2 py-0.5 rounded-lg backdrop-blur-md shadow-md ${
                            clip.type === 'video' && clip.duration === 10
                              ? 'bg-amber-950/90 text-amber-300 border border-amber-500/50'
                              : 'bg-black/85 text-[#FDE047] border border-[#D4AF37]/30'
                          }`} title={clip.type === 'video' && clip.duration === 10 ? 'Domyślna długość 10s (niezweryfikowana) - kliknij Zbadaj czasy wideo' : undefined}>
                            {formatDuration(clip.duration)}
                            {clip.type === 'video' && clip.duration === 10 && ' ⚠️'}
                          </div>

                          {/* Status Badge */}
                          <div className="absolute bottom-2 left-2 text-[9.5px] font-mono font-bold bg-black/85 border border-white/10 px-2 py-0.5 rounded-lg backdrop-blur-md shadow-md">
                            {isMissing ? (
                              <span className="text-rose-400 flex items-center gap-1">
                                <AlertTriangle className="w-3 h-3" /> BRAK PLIKU
                              </span>
                            ) : clip.status === 'used' ? (
                              <span className="text-emerald-400 flex items-center gap-1">
                                <CheckCircle2 className="w-3 h-3" /> NA OSI ({usageNum}x)
                              </span>
                            ) : (
                              <span className="text-[#C5BCA8] flex items-center gap-1">
                                {clip.type === 'video' ? <Film className="w-2.5 h-2.5 text-[#D4AF37]" /> : <ImageIcon className="w-2.5 h-2.5 text-[#D4AF37]" />}
                                {clip.type === 'video' ? 'WIDEO' : 'FOTO'}
                              </span>
                            )}
                          </div>
                        </div>
                        
                        {/* Info & Metadata Area */}
                        <div className="p-3.5 flex-1 flex flex-col justify-between gap-2 bg-[#12100C]/80">
                          <div>
                            <p className="text-xs font-semibold text-[#F5F2EA] truncate group-hover:text-[#FDE047] transition-colors" title={clip.name}>
                              {clip.name}
                            </p>

                            {/* Technical Metadata Strip */}
                            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mt-1.5 text-[10px] text-[#A69C87] font-mono">
                              <span className="text-[#D4AF37]">{clip.width}x{clip.height}</span>
                              <span>•</span>
                              <span>{formatSize(clip.size)}</span>
                              <span>•</span>
                              <span className="truncate max-w-[70px]" title={mimeLabel}>{mimeLabel.split('/')[1] || mimeLabel}</span>
                            </div>

                            <div className="flex items-center gap-2 mt-1 text-[10px] text-[#777] font-mono">
                              <span>{clip.fps || 30} FPS</span>
                              <span>•</span>
                              <span className={clip.hasAudio ? "text-emerald-400/90" : "text-stone-500"}>
                                {clip.hasAudio ? "Audio: Tak" : "Audio: Brak"}
                              </span>
                              <span>•</span>
                              <span title="Liczba użyć na osi czasu">{usageNum}x na osi</span>
                            </div>

                            {formatDateTimeDisplay(clip.capturedAt || clip.createdAt) && (
                              <div className="flex items-center gap-1.5 mt-1 text-[10px] text-[#8E8A80] font-mono">
                                <Calendar className="w-3 h-3 text-[#D4AF37]/70 shrink-0" />
                                <span title={clip.capturedAt ? `Data nagrania: ${formatDateTimeDisplay(clip.capturedAt)}` : `Data dodania: ${formatDateTimeDisplay(clip.createdAt)}`}>
                                  {formatDateTimeDisplay(clip.capturedAt || clip.createdAt)}
                                </span>
                              </div>
                            )}

                            {/* Issue Tags */}
                            {clip.analysis && clip.analysis.issues.length > 0 && (
                              <div className="flex flex-wrap items-center gap-1 mt-1.5">
                                {clip.analysis.issues.map((iss, i) => (
                                  <span key={i} className="text-[9px] font-medium px-1.5 py-0.2 rounded bg-amber-950/60 text-amber-300 border border-amber-500/30 truncate max-w-full">
                                    {iss}
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>

                          {/* Missing Relink Trigger */}
                          {isMissing && (
                            <div className="relative mt-1">
                              <label className="w-full bg-red-950/60 hover:bg-red-900 border border-red-700/80 text-red-200 text-[10px] font-mono font-bold px-2 py-1.5 rounded flex items-center justify-center gap-1.5 cursor-pointer transition-colors">
                                <RotateCw className="w-3 h-3" />
                                Połącz z plikiem z dysku
                                <input 
                                  type="file" 
                                  className="hidden" 
                                  accept="video/*,image/*"
                                  onChange={(e) => handleRelinkInput(clip.id, e)}
                                />
                              </label>
                            </div>
                          )}
                          
                          {/* Actions Bar (Req 19: EDYTUJ, PRZESUŃ, USUŃ) */}
                          <div className="flex items-center justify-between pt-2 border-t border-[#2A2824] gap-1.5">
                            <button
                              onClick={() => {
                                onAddToTimeline(clip);
                                if (onEditClip) onEditClip(clip);
                              }}
                              className="px-2.5 py-1 bg-[#222] hover:bg-[#D4AF37] text-white hover:text-black font-semibold text-[10px] rounded-md transition-all uppercase flex items-center gap-1 cursor-pointer font-mono"
                              title="Edytuj i przytnij ujęcie na osi montażu"
                            >
                              EDYTUJ
                            </button>

                            <div className="flex items-center gap-1">
                              {onMoveClipOrder && (
                                <>
                                  <button
                                    onClick={() => onMoveClipOrder(clipIndex, Math.max(0, clipIndex - 1))}
                                    disabled={clipIndex === 0}
                                    className="px-1.5 py-1 bg-[#181818] hover:bg-[#252525] disabled:opacity-30 text-white rounded text-[10px] font-mono cursor-pointer"
                                    title="Przesuń ujęcie wcześniej"
                                  >
                                    ▲
                                  </button>
                                  <button
                                    onClick={() => onMoveClipOrder(clipIndex, Math.min(clips.length - 1, clipIndex + 1))}
                                    disabled={clipIndex >= clips.length - 1}
                                    className="px-1.5 py-1 bg-[#181818] hover:bg-[#252525] disabled:opacity-30 text-white rounded text-[10px] font-mono cursor-pointer"
                                    title="Przesuń ujęcie później"
                                  >
                                    ▼
                                  </button>
                                </>
                              )}

                              <button 
                                onClick={() => onRemoveClip(clip.id)}
                                className="text-[#666] hover:text-red-400 transition-colors p-1 cursor-pointer ml-1"
                                title="Usuń materiał z biblioteki"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Clear All Media Confirmation */}
      <ConfirmModal
        isOpen={isConfirmClearAllOpen}
        title="Wyczyścić całą bibliotekę mediów?"
        message="Czy na pewno chcesz usunąć WSZYSTKIE stare materiały i wyczyścić bibliotekę projektu? Pliki zostaną usunięte z lokalnej pamięci podręcznej i chmury, przygotowując czysty stół montażowy."
        confirmText="Usuń wszystkie pliki"
        cancelText="Anuluj"
        type="danger"
        onConfirm={executeClearAllMedia}
        onCancel={() => setIsConfirmClearAllOpen(false)}
      />

      {/* Batch Remove Selected Clips Confirmation */}
      <ConfirmModal
        isOpen={isConfirmBatchDeleteOpen}
        title={`Usunąć ${selectedIds.size} zaznaczonych materiałów?`}
        message="Wybrane materiały zostaną bezpowrotnie usunięte z biblioteki bieżącego projektu."
        confirmText={`Usuń (${selectedIds.size})`}
        cancelText="Anuluj"
        type="danger"
        onConfirm={executeBatchRemove}
        onCancel={() => setIsConfirmBatchDeleteOpen(false)}
      />

      {/* Media Quick Preview Modal */}
      {previewingClip && (
        <div 
          onClick={() => setPreviewingClip(null)}
          className="fixed inset-0 z-50 bg-black/90 backdrop-blur-md flex items-center justify-center p-4"
        >
          <div 
            onClick={(e) => e.stopPropagation()}
            className="bg-[#121212] border border-[#333] rounded-2xl overflow-hidden shadow-2xl max-w-3xl w-full flex flex-col"
          >
            <div className="flex items-center justify-between p-4 border-b border-[#222]">
              <div className="truncate mr-4">
                <h3 className="text-sm font-bold text-white truncate">{previewingClip.name}</h3>
                <p className="text-xs text-[#888] font-mono">
                  {previewingClip.width}×{previewingClip.height} • {previewingClip.duration.toFixed(1)}s • {previewingClip.fps || 30} FPS
                </p>
              </div>
              <button
                onClick={() => setPreviewingClip(null)}
                className="p-1.5 rounded-lg bg-[#222] hover:bg-[#333] text-[#AAA] hover:text-white transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="relative aspect-video bg-black flex items-center justify-center">
              <video
                src={previewingClip.objectUrl || (previewingClip.file ? URL.createObjectURL(previewingClip.file) : '')}
                controls
                autoPlay
                playsInline
                className="w-full h-full object-contain"
              />
            </div>

            <div className="p-4 bg-[#181818] flex items-center justify-between">
              <span className="text-xs font-mono text-[#888]">
                {previewingClip.hasAudio ? 'Dźwięk: Dostępny (Stereo)' : 'Dźwięk: Brak'}
              </span>
              <button
                onClick={() => {
                  onAddToTimeline(previewingClip);
                  setPreviewingClip(null);
                  if (onEditClip) onEditClip(previewingClip);
                }}
                className="px-4 py-2 bg-[#D4AF37] hover:bg-[#E5C158] text-black font-bold text-xs rounded-xl cursor-pointer"
              >
                EDYTUJ NA OSI MONTAŻU
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
