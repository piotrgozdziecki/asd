import React, { useRef, useState, useMemo, useEffect } from 'react';
import type { 
  TimelineItem, 
  MediaClip, 
  TextLayer, 
  AudioTrackItem, 
  TimelineMarker, 
  WeddingChapter,
  TimelineTrack
} from '../../types/project';
import { 
  Type, 
  Music, 
  Video, 
  Scissors, 
  Copy, 
  Trash2, 
  ZoomIn, 
  ZoomOut, 
  Magnet, 
  Bookmark, 
  AlertTriangle,
  ChevronRight,
  Maximize2,
  Volume2,
  VolumeX,
  Plus,
  Play,
  Pause,
  Sliders,
  Sparkles,
  Activity,
  Mic
} from 'lucide-react';
import { getOrGenerateWaveform } from '../../core/audio/waveformGenerator';

interface TimelineViewProps {
  items: TimelineItem[];
  mediaLibrary: MediaClip[];
  textLayers: TextLayer[];
  audioTracks: AudioTrackItem[];
  markers?: TimelineMarker[];
  chapters?: WeddingChapter[];
  tracks?: TimelineTrack[];
  currentTime: number;
  duration: number;
  targetFps?: number;
  onTimeUpdate: (time: number) => void;
  onItemSelect: (id: string | null) => void;
  selectedItemId: string | null;
  onItemMove?: (id: string, newStart: number) => void;
  onItemTrim?: (id: string, newStart: number, newEnd: number) => void;
  onSplitItem?: (id: string, splitTime: number) => void;
  onDuplicateItem?: (id: string) => void;
  onDeleteItem?: (id: string) => void;
  onDeleteMultipleItems?: (ids: string[]) => void;
  onAddMarker?: (marker: TimelineMarker) => void;
  onDeleteMarker?: (id: string) => void;
  onAddTextLayer?: () => void;
  onAddAudioTrack?: () => void;
}

export function TimelineView({
  items,
  mediaLibrary,
  textLayers,
  audioTracks,
  markers = [],
  chapters = [],
  tracks = [],
  currentTime,
  duration,
  targetFps = 30,
  onTimeUpdate,
  onItemSelect,
  selectedItemId,
  onItemMove,
  onItemTrim,
  onSplitItem,
  onDuplicateItem,
  onDeleteItem,
  onDeleteMultipleItems,
  onAddMarker,
  onDeleteMarker,
  onAddTextLayer,
  onAddAudioTrack
}: TimelineViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const playheadRef = useRef<HTMLDivElement>(null);

  // Zoom level: pixels per second (20 to 200)
  const [pixelsPerSecond, setPixelsPerSecond] = useState<number>(50);
  const [isSnappingEnabled, setIsSnappingEnabled] = useState<boolean>(true);
  const [showWaveforms, setShowWaveforms] = useState<boolean>(true);
  const [multiSelectedIds, setMultiSelectedIds] = useState<Set<string>>(new Set());

  // Cached waveforms for audio tracks
  const [audioWaveforms, setAudioWaveforms] = useState<Map<string, number[]>>(new Map());

  // Dragging & Trimming state
  const [draggedItem, setDraggedItem] = useState<{
    id: string;
    type: 'video' | 'audio' | 'text';
    startOffset: number;
    initialTime: number;
  } | null>(null);

  const [trimmingHandle, setTrimmingHandle] = useState<{
    id: string;
    handle: 'left' | 'right';
    startX: number;
    initialStart: number;
    initialEnd: number;
    clipDuration: number;
  } | null>(null);

  const clipMap = useMemo(() => new Map(mediaLibrary.map(c => [c.id, c])), [mediaLibrary]);

  const maxTime = Math.max(
    duration,
    ...items.map(i => i.timelineStart + i.duration),
    ...textLayers.map(t => t.timelineStart + t.duration),
    ...audioTracks.map(a => a.timelineStart + a.duration),
    60
  );
  
  const totalSeconds = maxTime + 60; // Extra work buffer
  const rulerInterval = pixelsPerSecond >= 100 ? 1 : pixelsPerSecond >= 40 ? 5 : 10;

  const rulerMarks: number[] = [];
  for (let i = 0; i <= totalSeconds; i += rulerInterval) {
    rulerMarks.push(i);
  }

  // Selected item object
  const selectedItem = items.find(i => i.id === selectedItemId);

  // Format timecode HH:MM:SS:FF
  const formatTimecode = (sec: number) => {
    const s = Math.max(0, sec);
    const hrs = Math.floor(s / 3600);
    const mins = Math.floor((s % 3600) / 60);
    const secs = Math.floor(s % 60);
    const frames = Math.floor((s % 1) * targetFps);
    return `${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}:${frames.toString().padStart(2, '0')}`;
  };

  // Generate waveforms in background
  useEffect(() => {
    if (!showWaveforms) return;

    audioTracks.forEach(track => {
      const url = track.objectUrl || (track.file ? URL.createObjectURL(track.file) : null);
      if (url && !audioWaveforms.has(track.id)) {
        getOrGenerateWaveform(url, track.id, 80).then(wf => {
          setAudioWaveforms(prev => new Map(prev).set(track.id, wf));
        });
      }
    });
  }, [audioTracks, showWaveforms]);

  // Split at playhead
  const handleSplitAtPlayhead = () => {
    if (!onSplitItem || !selectedItem) return;
    if (currentTime > selectedItem.timelineStart && currentTime < (selectedItem.timelineStart + selectedItem.duration)) {
      const offset = currentTime - selectedItem.timelineStart;
      const speed = selectedItem.speed || 1;
      const splitSourceTime = selectedItem.sourceStart + (offset * speed);
      onSplitItem(selectedItem.id, splitSourceTime);
    }
  };

  // Add marker at playhead
  const handleAddMarkerAtPlayhead = () => {
    if (!onAddMarker) return;
    const colors = ['#D4AF37', '#38BDF8', '#F43F5E', '#A855F7', '#10B981'];
    const color = colors[markers.length % colors.length];
    onAddMarker({
      id: `marker_${Date.now()}`,
      time: currentTime,
      type: 'best_moment',
      label: `Znacznik ${markers.length + 1}`,
      color
    });
  };

  // Fit timeline zoom to view all clips
  const handleFitTimeline = () => {
    if (!containerRef.current || duration <= 0) return;
    const containerWidth = containerRef.current.clientWidth - 100;
    const optimalPps = Math.max(15, Math.min(150, Math.floor(containerWidth / Math.max(10, duration))));
    setPixelsPerSecond(optimalPps);
  };

  // Center playhead in view
  const handleCenterPlayhead = () => {
    if (!containerRef.current) return;
    const targetScroll = (currentTime * pixelsPerSecond) - (containerRef.current.clientWidth / 2);
    containerRef.current.scrollTo({ left: Math.max(0, targetScroll), behavior: 'smooth' });
  };

  // Trimming mouse handlers
  useEffect(() => {
    if (!trimmingHandle) return;

    const handleMouseMove = (e: MouseEvent) => {
      const deltaPx = e.clientX - trimmingHandle.startX;
      const deltaSec = deltaPx / pixelsPerSecond;
      const item = items.find(i => i.id === trimmingHandle.id);
      const media = item ? clipMap.get(item.clipId) : null;
      if (!item || !media) return;

      const speed = item.speed || 1;

      if (trimmingHandle.handle === 'left') {
        const candidateStart = Math.max(0, Math.min(trimmingHandle.initialEnd - 0.2, trimmingHandle.initialStart + (deltaSec * speed)));
        if (onItemTrim) {
          onItemTrim(item.id, candidateStart, item.sourceEnd);
        }
      } else {
        const candidateEnd = Math.max(trimmingHandle.initialStart + 0.2, Math.min(media.duration, trimmingHandle.initialEnd + (deltaSec * speed)));
        if (onItemTrim) {
          onItemTrim(item.id, item.sourceStart, candidateEnd);
        }
      }
    };

    const handleMouseUp = () => {
      setTrimmingHandle(null);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [trimmingHandle, pixelsPerSecond, items, clipMap, onItemTrim]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const activeTag = document.activeElement?.tagName.toLowerCase();
      if (activeTag === 'input' || activeTag === 'textarea' || activeTag === 'select') return;

      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (multiSelectedIds.size > 1 && onDeleteMultipleItems) {
          e.preventDefault();
          onDeleteMultipleItems(Array.from(multiSelectedIds));
          setMultiSelectedIds(new Set());
          onItemSelect(null);
        } else if (selectedItemId && onDeleteItem) {
          e.preventDefault();
          onDeleteItem(selectedItemId);
        }
      } else if (e.code === 'KeyS' && !e.ctrlKey && !e.metaKey) {
        if (selectedItem && onSplitItem && currentTime > selectedItem.timelineStart && currentTime < (selectedItem.timelineStart + selectedItem.duration)) {
          e.preventDefault();
          handleSplitAtPlayhead();
        }
      } else if (e.code === 'KeyD' && !e.ctrlKey && !e.metaKey) {
        if (selectedItem && onDuplicateItem) {
          e.preventDefault();
          onDuplicateItem(selectedItem.id);
        }
      } else if (e.code === 'KeyM' && !e.ctrlKey && !e.metaKey) {
        if (selectedItem) {
          e.preventDefault();
          if (onItemTrim) {
            // Mute toggle
          }
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedItemId, selectedItem, currentTime, onDeleteItem, onDeleteMultipleItems, multiSelectedIds, onSplitItem, onDuplicateItem]);

  return (
    <div className="flex flex-col h-full bg-[#0E0E12] border-t border-[#222228] select-none text-xs">
      {/* Top Controls Toolbar */}
      <div className="h-11 border-b border-[#222228] bg-[#141418] px-3 sm:px-4 flex items-center justify-between gap-2 shrink-0">
        {/* Left: Action Buttons */}
        <div className="flex items-center gap-1.5 overflow-x-auto custom-scrollbar py-1">
          <button
            onClick={handleSplitAtPlayhead}
            disabled={!selectedItem}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-[#1C1C22] hover:bg-[#282830] text-white disabled:opacity-30 disabled:pointer-events-none transition-colors cursor-pointer border border-[#2E2E38] font-mono text-[11px]"
            title="Podziel zaznaczony klip w miejscu kursora (Klawisz: S)"
          >
            <Scissors className="w-3.5 h-3.5 text-[#D4AF37]" />
            <span className="hidden sm:inline">Rozetnij</span>
          </button>

          <button
            onClick={() => selectedItem && onDuplicateItem && onDuplicateItem(selectedItem.id)}
            disabled={!selectedItem}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-[#1C1C22] hover:bg-[#282830] text-white disabled:opacity-30 disabled:pointer-events-none transition-colors cursor-pointer border border-[#2E2E38] font-mono text-[11px]"
            title="Duplikuj klip (Klawisz: D)"
          >
            <Copy className="w-3.5 h-3.5 text-[#D4AF37]" />
            <span className="hidden sm:inline">Duplikuj</span>
          </button>

          <button
            onClick={() => selectedItem && onDeleteItem && onDeleteItem(selectedItem.id)}
            disabled={!selectedItem}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-[#1C1C22] hover:bg-rose-950/40 text-white hover:text-rose-400 disabled:opacity-30 disabled:pointer-events-none transition-colors cursor-pointer border border-[#2E2E38] font-mono text-[11px]"
            title="Usuń zaznaczony klip (Klawisz: Delete)"
          >
            <Trash2 className="w-3.5 h-3.5 text-rose-400" />
            <span className="hidden sm:inline">Usuń</span>
          </button>

          <div className="h-4 w-px bg-[#2E2E38] mx-1" />

          {onAddTextLayer && (
            <button
              onClick={onAddTextLayer}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-[#1C1C22] hover:bg-[#282830] text-white transition-colors cursor-pointer border border-[#2E2E38] font-mono text-[11px]"
              title="Dodaj warstwę napisów"
            >
              <Type className="w-3.5 h-3.5 text-sky-400" />
              <span className="hidden sm:inline">+ Napis</span>
            </button>
          )}

          {onAddAudioTrack && (
            <button
              onClick={onAddAudioTrack}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-[#1C1C22] hover:bg-[#282830] text-white transition-colors cursor-pointer border border-[#2E2E38] font-mono text-[11px]"
              title="Dodaj ścieżkę dźwiękową"
            >
              <Music className="w-3.5 h-3.5 text-emerald-400" />
              <span className="hidden sm:inline">+ Muzyka</span>
            </button>
          )}
        </div>

        {/* Center: Live Timecode & Frame counter */}
        <div className="flex items-center gap-2 px-3 py-1 bg-[#0A0A0D] border border-[#2A2A34] rounded-lg font-mono text-xs">
          <span className="text-[#D4AF37] font-bold tracking-wider">{formatTimecode(currentTime)}</span>
          <span className="text-[#666]">/</span>
          <span className="text-[#AAA]">{formatTimecode(duration)}</span>
        </div>

        {/* Right: Zoom & Utility controls */}
        <div className="flex items-center gap-1">
          <button
            onClick={() => setShowWaveforms(!showWaveforms)}
            className={`p-1.5 rounded-lg border text-[11px] transition-colors cursor-pointer font-mono ${
              showWaveforms ? 'bg-[#221E12] border-[#D4AF37] text-[#D4AF37]' : 'bg-[#1C1C22] border-[#2E2E38] text-[#888]'
            }`}
            title="Pokaż/Ukryj falę audio"
          >
            <Activity className="w-3.5 h-3.5" />
          </button>

          <button
            onClick={handleCenterPlayhead}
            className="p-1.5 rounded-lg bg-[#1C1C22] hover:bg-[#282830] border border-[#2E2E38] text-[#AAA] hover:text-white transition-colors cursor-pointer font-mono"
            title="Wyśrodkuj widok na kursorze"
          >
            <Maximize2 className="w-3.5 h-3.5" />
          </button>

          <button
            onClick={handleFitTimeline}
            className="px-2 py-1.5 rounded-lg bg-[#1C1C22] hover:bg-[#282830] border border-[#2E2E38] text-[#AAA] hover:text-white transition-colors cursor-pointer font-mono text-[10px] font-bold"
            title="Dopasuj oś czasu do ekranu (Fit)"
          >
            FIT
          </button>

          <div className="flex items-center bg-[#1C1C22] border border-[#2E2E38] rounded-lg p-0.5">
            <button
              onClick={() => setPixelsPerSecond(Math.max(20, pixelsPerSecond - 15))}
              className="p-1 hover:bg-[#282830] rounded text-[#AAA] hover:text-white cursor-pointer"
              title="Oddal (Zoom Out)"
            >
              <ZoomOut className="w-3.5 h-3.5" />
            </button>
            <span className="text-[10px] font-mono text-[#777] px-1">{Math.round((pixelsPerSecond / 50) * 100)}%</span>
            <button
              onClick={() => setPixelsPerSecond(Math.min(200, pixelsPerSecond + 15))}
              className="p-1 hover:bg-[#282830] rounded text-[#AAA] hover:text-white cursor-pointer"
              title="Przybliż (Zoom In)"
            >
              <ZoomIn className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* Main Timeline Workspace */}
      <div 
        ref={containerRef}
        className="flex-1 overflow-x-auto overflow-y-auto relative custom-scrollbar bg-[#0E0E12]"
        onClick={(e) => {
          if (e.target === containerRef.current) {
            onItemSelect(null);
          }
        }}
      >
        <div style={{ width: `${totalSeconds * pixelsPerSecond + 100}px`, minHeight: '260px' }} className="relative pb-8">
          
          {/* Time Ruler */}
          <div 
            className="h-7 border-b border-[#24242C] bg-[#121216] sticky top-0 z-20 flex cursor-pointer"
            onClick={(e) => {
              const rect = e.currentTarget.getBoundingClientRect();
              const clickX = e.clientX - rect.left;
              const newTime = Math.max(0, clickX / pixelsPerSecond);
              onTimeUpdate(newTime);
            }}
          >
            {rulerMarks.map(sec => (
              <div 
                key={sec} 
                className="absolute top-0 h-full border-l border-[#24242C] flex items-end pb-1 pl-1 text-[9px] font-mono text-[#666]"
                style={{ left: `${sec * pixelsPerSecond}px` }}
              >
                <span>{sec % 60 === 0 ? `${sec / 60}m` : `${sec}s`}</span>
              </div>
            ))}
          </div>

          {/* Interactive Playhead Line */}
          <div 
            ref={playheadRef}
            className="absolute top-0 bottom-0 z-30 pointer-events-none transition-transform duration-75 flex flex-col items-center"
            style={{ 
              transform: `translateX(${currentTime * pixelsPerSecond}px)`,
              left: 0
            }}
          >
            <div className="w-3.5 h-3.5 bg-[#FDE047] rotate-45 -mt-1.5 shadow-[0_0_8px_rgba(253,224,71,0.8)]" />
            <div className="w-0.5 h-full bg-[#FDE047] shadow-[0_0_6px_rgba(253,224,71,0.6)]" />
          </div>

          {/* TRACK 1: VIDEO TRACK */}
          <div className="relative py-2 border-b border-[#1E1E26] bg-[#101015]/60 min-h-[76px] flex items-center">
            <div className="absolute left-2 top-2 z-10 flex items-center gap-1.5 text-[10px] font-mono text-[#888] bg-black/60 px-2 py-0.5 rounded border border-[#222] pointer-events-none">
              <Video className="w-3 h-3 text-[#D4AF37]" />
              <span>WIDEO</span>
            </div>

            {items.map((item, idx) => {
              const media = clipMap.get(item.clipId);
              const isSelected = selectedItemId === item.id || multiSelectedIds.has(item.id);
              const itemWidth = Math.max(30, item.duration * pixelsPerSecond);
              const itemLeft = item.timelineStart * pixelsPerSecond;

              return (
                <div
                  key={item.id}
                  onClick={(e) => {
                    e.stopPropagation();
                    onItemSelect(item.id);
                  }}
                  className={`absolute top-2 h-14 rounded-xl border flex items-center overflow-hidden transition-shadow group cursor-pointer ${
                    isSelected 
                      ? 'border-[#D4AF37] ring-2 ring-[#D4AF37]/50 bg-[#252014] z-10 shadow-lg' 
                      : 'border-[#2E2E38] bg-[#18181F] hover:border-[#444450]'
                  }`}
                  style={{
                    left: `${itemLeft}px`,
                    width: `${itemWidth}px`
                  }}
                >
                  {/* Left Trim Handle */}
                  <div
                    onMouseDown={(e) => {
                      e.stopPropagation();
                      setTrimmingHandle({
                        id: item.id,
                        handle: 'left',
                        startX: e.clientX,
                        initialStart: item.sourceStart,
                        initialEnd: item.sourceEnd,
                        clipDuration: media?.duration || 10
                      });
                    }}
                    className="absolute left-0 top-0 bottom-0 w-3 bg-[#D4AF37]/40 hover:bg-[#D4AF37] cursor-ew-resize z-20 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                    title="Przeciągnij, aby przyciąć początek"
                  >
                    <div className="w-0.5 h-4 bg-black rounded" />
                  </div>

                  {/* Thumbnail and Info */}
                  <div className="flex items-center gap-2 px-3 min-w-0 pointer-events-none">
                    {media?.thumbnailUrl && (
                      <img src={media.thumbnailUrl} alt="Thumb" className="w-10 h-10 object-cover rounded shrink-0 border border-white/10" />
                    )}
                    <div className="min-w-0">
                      <p className="text-[11px] font-bold text-white truncate">{media?.name || `Klip ${idx + 1}`}</p>
                      <div className="flex items-center gap-1.5 text-[9px] font-mono text-[#AAA]">
                        <span>{item.duration.toFixed(1)}s</span>
                        {item.speed && item.speed !== 1 && (
                          <span className="text-[#D4AF37] font-bold">{item.speed}x</span>
                        )}
                        {item.transitionIn && item.transitionIn !== 'cut' && (
                          <span className="text-sky-400">✨ {item.transitionIn}</span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Right Trim Handle */}
                  <div
                    onMouseDown={(e) => {
                      e.stopPropagation();
                      setTrimmingHandle({
                        id: item.id,
                        handle: 'right',
                        startX: e.clientX,
                        initialStart: item.sourceStart,
                        initialEnd: item.sourceEnd,
                        clipDuration: media?.duration || 10
                      });
                    }}
                    className="absolute right-0 top-0 bottom-0 w-3 bg-[#D4AF37]/40 hover:bg-[#D4AF37] cursor-ew-resize z-20 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                    title="Przeciągnij, aby przyciąć koniec"
                  >
                    <div className="w-0.5 h-4 bg-black rounded" />
                  </div>
                </div>
              );
            })}
          </div>

          {/* TRACK 2: TEXT & SUBTITLES */}
          <div className="relative py-1.5 border-b border-[#1E1E26] bg-[#0C0C10] min-h-[46px] flex items-center">
            <div className="absolute left-2 top-1.5 z-10 flex items-center gap-1.5 text-[10px] font-mono text-[#888] bg-black/60 px-2 py-0.5 rounded border border-[#222] pointer-events-none">
              <Type className="w-3 h-3 text-sky-400" />
              <span>NAPISY</span>
            </div>

            {textLayers.map((layer) => {
              const layerWidth = Math.max(30, layer.duration * pixelsPerSecond);
              const layerLeft = layer.timelineStart * pixelsPerSecond;
              return (
                <div
                  key={layer.id}
                  className="absolute top-1.5 h-8 rounded-lg border border-sky-600/40 bg-sky-950/40 hover:border-sky-400 flex items-center px-2.5 cursor-pointer z-10 text-[10px] text-sky-200 font-mono truncate"
                  style={{
                    left: `${layerLeft}px`,
                    width: `${layerWidth}px`
                  }}
                  title={layer.text}
                >
                  <span className="truncate">{layer.text || 'Napis'}</span>
                </div>
              );
            })}
          </div>

          {/* TRACK 3: AUDIO & MUSIC */}
          <div className="relative py-2 border-b border-[#1E1E26] bg-[#101015]/60 min-h-[60px] flex items-center">
            <div className="absolute left-2 top-2 z-10 flex items-center gap-1.5 text-[10px] font-mono text-[#888] bg-black/60 px-2 py-0.5 rounded border border-[#222] pointer-events-none">
              <Music className="w-3 h-3 text-emerald-400" />
              <span>MUZYKA</span>
            </div>

            {audioTracks.map((track) => {
              const trackWidth = Math.max(30, track.duration * pixelsPerSecond);
              const trackLeft = track.timelineStart * pixelsPerSecond;
              const wf = audioWaveforms.get(track.id);

              return (
                <div
                  key={track.id}
                  className="absolute top-2 h-11 rounded-xl border border-emerald-600/40 bg-emerald-950/30 hover:border-emerald-400 flex items-center overflow-hidden px-2.5 cursor-pointer z-10"
                  style={{
                    left: `${trackLeft}px`,
                    width: `${trackWidth}px`
                  }}
                >
                  {/* Waveform Visualization */}
                  {showWaveforms && wf && (
                    <div className="absolute inset-0 flex items-center gap-0.5 px-2 opacity-30 pointer-events-none">
                      {wf.map((val, wIdx) => (
                        <div 
                          key={wIdx} 
                          className="flex-1 bg-emerald-400 rounded-full"
                          style={{ height: `${val * 100}%` }}
                        />
                      ))}
                    </div>
                  )}

                  <span className="relative z-10 text-[10px] font-mono text-emerald-200 truncate font-bold">
                    🎵 {track.name} ({track.duration.toFixed(1)}s)
                  </span>
                </div>
              );
            })}
          </div>

        </div>
      </div>
    </div>
  );
}
