import React, { useRef, useState, useMemo } from 'react';
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
  Maximize2
} from 'lucide-react';

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
  onTimeUpdate: (time: number) => void;
  onItemSelect: (id: string | null) => void;
  selectedItemId: string | null;
  onItemMove?: (id: string, newStart: number) => void;
  onSplitItem?: (id: string, splitTime: number) => void;
  onDuplicateItem?: (id: string) => void;
  onDeleteItem?: (id: string) => void;
  onAddMarker?: (marker: TimelineMarker) => void;
  onDeleteMarker?: (id: string) => void;
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
  onTimeUpdate,
  onItemSelect,
  selectedItemId,
  onItemMove,
  onSplitItem,
  onDuplicateItem,
  onDeleteItem,
  onAddMarker,
  onDeleteMarker
}: TimelineViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  // Zoom level: pixels per second (20 to 120)
  const [pixelsPerSecond, setPixelsPerSecond] = useState<number>(40);
  const [isSnappingEnabled, setIsSnappingEnabled] = useState<boolean>(true);

  // Drag state
  const [draggedItem, setDraggedItem] = useState<{
    id: string;
    type: 'video' | 'audio' | 'text';
    startOffset: number;
    initialTime: number;
  } | null>(null);

  // Quick lookup maps
  const clipMap = useMemo(() => new Map(mediaLibrary.map(c => [c.id, c])), [mediaLibrary]);

  const maxTime = Math.max(
    duration,
    ...items.map(i => i.timelineStart + i.duration),
    ...textLayers.map(t => t.timelineStart + t.duration),
    ...audioTracks.map(a => a.timelineStart + a.duration),
    60
  );
  
  const totalSeconds = maxTime + 60; // Extra buffer
  const rulerInterval = pixelsPerSecond >= 80 ? 1 : pixelsPerSecond >= 40 ? 5 : 10;

  const rulerMarks: number[] = [];
  for (let i = 0; i <= totalSeconds; i += rulerInterval) {
    rulerMarks.push(i);
  }

  // Selected item object
  const selectedItem = items.find(i => i.id === selectedItemId);

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

  // Keyboard Shortcuts for Timeline Editing
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const activeTag = document.activeElement?.tagName.toLowerCase();
      if (activeTag === 'input' || activeTag === 'textarea' || activeTag === 'select') return;

      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selectedItemId && onDeleteItem) {
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
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedItemId, selectedItem, currentTime, onDeleteItem, onSplitItem, onDuplicateItem]);

  const handleDragStart = (e: React.DragEvent<HTMLDivElement>, id: string, type: 'video' | 'audio' | 'text', startTime: number) => {
    e.dataTransfer.setData('text/plain', id);
    e.dataTransfer.effectAllowed = 'move';
    const dragImg = new Image();
    dragImg.src = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
    e.dataTransfer.setDragImage(dragImg, 0, 0);
    setDraggedItem({ id, type, startOffset: 0, initialTime: startTime });
  };

  // Visual constants for professional look
  const trackHeight = 80;
  const itemHeight = 60;
  const playheadColor = '#FDE047';

  // Memoized styles for performance (Req 26)
  const timelineStyle = useMemo(() => ({
    width: `${totalSeconds * pixelsPerSecond}px`
  }), [totalSeconds, pixelsPerSecond]);
  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (!draggedItem || !onItemMove) {
      setDraggedItem(null);
      return;
    }
    
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    
    const trackHeaderWidth = window.innerWidth >= 768 ? 64 : 48;
    const scrollLeft = containerRef.current?.scrollLeft || 0;
    
    const x = e.clientX - rect.left - trackHeaderWidth + scrollLeft - draggedItem.startOffset;
    let newTime = Math.max(0, x / pixelsPerSecond);
    
    // Magnetic Snapping to other items or markers
    if (isSnappingEnabled) {
      const SNAP_THRESHOLD = 0.4;
      const snapPoints = [
        ...items.filter(i => i.id !== draggedItem.id).map(i => i.timelineStart),
        ...items.filter(i => i.id !== draggedItem.id).map(i => i.timelineStart + i.duration),
        ...markers.map(m => m.time),
        currentTime
      ];
      
      for (const point of snapPoints) {
        if (Math.abs(newTime - point) < SNAP_THRESHOLD) {
          newTime = point;
          break;
        }
      }
    }

    onItemMove(draggedItem.id, newTime);
    setDraggedItem(null);
  };

  const handleTimelineClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest('.timeline-clip')) return;
    if ((e.target as HTMLElement).closest('.marker-pin')) return;
    
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    
    const trackHeaderWidth = window.innerWidth >= 768 ? 64 : 48;
    const scrollLeft = containerRef.current?.scrollLeft || 0;
    
    if (e.clientX - rect.left < trackHeaderWidth) return;
    
    const x = e.clientX - rect.left - trackHeaderWidth + scrollLeft;
    let newTime = Math.max(0, x / pixelsPerSecond);
    
    // Snapping
    if (isSnappingEnabled) {
      const SNAP_THRESHOLD = 0.3;
      const snapPoints = [
        ...items.map(i => i.timelineStart),
        ...items.map(i => i.timelineStart + i.duration),
        ...markers.map(m => m.time)
      ];
      
      for (const point of snapPoints) {
        if (Math.abs(newTime - point) < SNAP_THRESHOLD) {
          newTime = point;
          break;
        }
      }
    }

    onTimeUpdate(newTime);
    onItemSelect(null);
  };

  const formatTimecode = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    const f = Math.floor((sec % 1) * 30);
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}:${f.toString().padStart(2, '0')}`;
  };

  const getSelectionStyle = (isSelected: boolean) => 
    isSelected ? 'border-[#D4AF37] ring-2 ring-[#D4AF37] z-20' : 'border-[#333] hover:border-[#555] z-10';

  return (
    <div className="flex flex-col h-full bg-[#0D0D0D] border-t border-[#2A2824] overflow-hidden select-none">
      
      {/* Timeline Toolbar */}
      <div className="h-11 border-b border-[#2A2824] flex items-center px-2 sm:px-4 justify-between shrink-0 bg-[#0A0A0A] text-xs overflow-x-auto no-scrollbar touch-pan-x w-full max-w-full gap-2">
        
        {/* Left: Timecode and Quick Tools */}
        <div className="flex items-center gap-1.5 sm:gap-3 shrink-0">
          <div className="flex items-center gap-1.5 sm:gap-2 bg-[#161514] px-2 sm:px-2.5 py-1 rounded-lg border border-[#2A2824]">
            <span className="text-[10px] font-mono text-[#777] hidden xs:inline">POZ:</span>
            <span className="font-mono font-bold text-[#D4AF37] text-[11px] sm:text-xs">{formatTimecode(currentTime)}</span>
          </div>

          <div className="h-4 w-px bg-[#2A2824]" />

          {/* Razor / Split Tool */}
          <button
            onClick={handleSplitAtPlayhead}
            disabled={!selectedItem || currentTime <= selectedItem.timelineStart || currentTime >= (selectedItem.timelineStart + selectedItem.duration)}
            className="p-1.5 sm:px-2 sm:py-1 rounded bg-[#181818] hover:bg-[#252525] text-white disabled:opacity-30 disabled:hover:bg-[#181818] flex items-center gap-1.5 transition-colors cursor-pointer border border-[#2A2824]"
            title="Rozetnij zaznaczony klip w miejscu kursora (S)"
          >
            <Scissors className="w-3.5 h-3.5 text-[#D4AF37]" />
            <span className="text-[11px] hidden sm:inline">Rozetnij</span>
          </button>

          {/* Duplicate Tool */}
          <button
            onClick={() => selectedItem && onDuplicateItem && onDuplicateItem(selectedItem.id)}
            disabled={!selectedItem || !onDuplicateItem}
            className="p-1.5 sm:px-2 sm:py-1 rounded bg-[#181818] hover:bg-[#252525] text-white disabled:opacity-30 disabled:hover:bg-[#181818] flex items-center gap-1.5 transition-colors cursor-pointer border border-[#2A2824]"
            title="Zduplikuj zaznaczony klip"
          >
            <Copy className="w-3.5 h-3.5 text-blue-400" />
            <span className="text-[11px] hidden sm:inline">Duplikuj</span>
          </button>

          {/* Delete Tool */}
          <button
            onClick={() => selectedItemId && onDeleteItem && onDeleteItem(selectedItemId)}
            disabled={!selectedItemId || !onDeleteItem}
            className="p-1.5 sm:px-2 sm:py-1 rounded bg-[#181818] hover:bg-red-950/40 text-stone-300 hover:text-red-400 disabled:opacity-30 disabled:hover:bg-[#181818] flex items-center gap-1.5 transition-colors cursor-pointer border border-[#2A2824]"
            title="Usuń zaznaczony element z osi czasu (Delete)"
          >
            <Trash2 className="w-3.5 h-3.5 text-red-400" />
            <span className="text-[11px] hidden sm:inline">Usuń</span>
          </button>

          {/* Marker Tool */}
          <button
            onClick={handleAddMarkerAtPlayhead}
            className="p-1.5 sm:px-2 sm:py-1 rounded bg-[#181818] hover:bg-[#252525] text-white flex items-center gap-1.5 transition-colors cursor-pointer border border-[#2A2824]"
            title="Wstaw znacznik w miejscu kursora"
          >
            <Bookmark className="w-3.5 h-3.5 text-amber-400" />
            <span className="text-[11px] hidden sm:inline">Znacznik</span>
          </button>
        </div>

        {/* Right: Snapping & Zoom Controls */}
        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          
          {/* Snapping toggle */}
          <button
            onClick={() => setIsSnappingEnabled(!isSnappingEnabled)}
            className={`p-1.5 sm:px-2 sm:py-1 rounded flex items-center gap-1 text-[11px] font-mono border transition-colors cursor-pointer ${
              isSnappingEnabled 
                ? 'bg-[#D4AF37]/20 border-[#D4AF37]/50 text-[#D4AF37]' 
                : 'bg-[#181818] border-[#2A2824] text-[#777]'
            }`}
            title="Włącz/wyłącz przyciąganie magnetyczne do krawędzi klipów i znaczników"
          >
            <Magnet className="w-3 h-3" />
            <span className="hidden sm:inline">Magnes</span>
          </button>

          <div className="h-4 w-px bg-[#2A2824]" />

          {/* Zoom controls */}
          <button
            onClick={() => setPixelsPerSecond(prev => Math.max(15, prev - 10))}
            className="p-1 rounded bg-[#181818] hover:bg-[#252525] text-[#AAA69D] hover:text-white border border-[#2A2824] cursor-pointer"
            title="Oddal oś czasu"
          >
            <ZoomOut className="w-3.5 h-3.5" />
          </button>

          <span className="text-[10px] font-mono text-[#777] min-w-[28px] sm:min-w-[32px] text-center">
            {pixelsPerSecond}p
          </span>

          <button
            onClick={() => setPixelsPerSecond(prev => Math.min(120, prev + 10))}
            className="p-1 rounded bg-[#181818] hover:bg-[#252525] text-[#AAA69D] hover:text-white border border-[#2A2824] cursor-pointer"
            title="Przybliż oś czasu"
          >
            <ZoomIn className="w-3.5 h-3.5" />
          </button>

          {/* Fit entire project to timeline width */}
          <button
            onClick={() => {
              if (!containerRef.current) return;
              const availableWidth = containerRef.current.clientWidth - 100;
              const projectTotalTime = Math.max(
                ...items.map(i => i.timelineStart + i.duration),
                ...textLayers.map(t => t.timelineStart + t.duration),
                ...audioTracks.map(a => a.timelineStart + a.duration),
                10
              );
              if (projectTotalTime > 0 && availableWidth > 150) {
                const calculatedPps = Math.max(10, Math.min(120, availableWidth / projectTotalTime));
                setPixelsPerSecond(Math.round(calculatedPps));
              }
            }}
            className="px-1.5 sm:px-2 py-1 rounded bg-[#1C1A14] hover:bg-[#D4AF37]/20 text-[#D4AF37] border border-[#D4AF37]/40 flex items-center gap-1 text-[10px] font-mono font-bold cursor-pointer transition-colors"
            title="Autodopasowanie: zmieść cały film na ekranie"
          >
            <Maximize2 className="w-3 h-3" />
            <span>Auto</span>
          </button>
        </div>

      </div>

      {/* Timeline Scrolling Area */}
      <div 
        ref={containerRef}
        className="flex-1 overflow-x-auto overflow-y-auto relative custom-scrollbar bg-[#0D0D0D]"
        onClick={handleTimelineClick}
      >
        <div 
          className="relative h-full" 
          style={{ width: `${totalSeconds * pixelsPerSecond}px`, minWidth: '100%', minHeight: '220px' }}
        >
          {/* Chapter Blocks Track */}
          <div className="h-6 border-b border-[#2A2824] sticky top-0 bg-[#0A0A0A] z-40 flex">
            {chapters.map((ch, idx) => {
              const chWidth = Math.max(10, (ch.endTime - ch.startTime) * pixelsPerSecond);
              const chLeft = ch.startTime * pixelsPerSecond;
              return (
                <div 
                  key={ch.id || idx}
                  className="absolute top-0 bottom-0 border-r border-[#2A2824] bg-[#161514] text-[9px] font-mono font-bold text-[#AAA69D] px-2 flex items-center overflow-hidden whitespace-nowrap"
                  style={{ left: `${chLeft}px`, width: `${chWidth}px` }}
                  title={`${ch.name} (${ch.startTime}s - ${ch.endTime}s)`}
                >
                  <span className="text-[#D4AF37] mr-1">#{idx + 1}</span> {ch.name}
                </div>
              );
            })}
          </div>

          {/* Ruler & Markers */}
          <div className="h-6 border-b border-[#2A2824] sticky top-6 bg-[#121212]/95 backdrop-blur-sm z-30 flex ml-12 md:ml-16">
            {rulerMarks.map(time => (
              <div 
                key={time} 
                className="absolute top-0 flex flex-col items-center"
                style={{ left: `${time * pixelsPerSecond}px` }}
              >
                <div className="w-px h-2 bg-[#333]" />
                <span className="text-[9px] text-[#666] font-mono transform -translate-x-1/2 mt-0.5">
                  {Math.floor(time / 60)}:{(time % 60).toString().padStart(2, '0')}
                </span>
              </div>
            ))}

            {/* Visual Markers on Ruler */}
            {markers.map(m => (
              <div
                key={m.id}
                onClick={(e) => {
                  e.stopPropagation();
                  onTimeUpdate(m.time);
                }}
                className="marker-pin absolute top-0 transform -translate-x-1/2 cursor-pointer z-30 group"
                style={{ left: `${m.time * pixelsPerSecond}px` }}
                title={`${m.label} (${formatTimecode(m.time)})`}
              >
                <div 
                  className="w-2.5 h-3 rounded-t-sm flex items-center justify-center shadow-md transition-transform group-hover:scale-125"
                  style={{ backgroundColor: m.color || '#D4AF37' }}
                />
                <div 
                  className="w-0.5 h-3 mx-auto"
                  style={{ backgroundColor: m.color || '#D4AF37' }}
                />
              </div>
            ))}
          </div>

          {/* Tracks Area */}
          <div 
            className="mt-2 space-y-1.5 relative z-10 pl-[1px] pb-10 ml-12 md:ml-16"
            onDragOver={handleDragOver}
            onDrop={handleDrop}
          >
            
            {/* Text Track (T1) */}
            <div className="h-10 bg-[#161514] border-y border-[#2A2824]/50 relative group">
              <div className="fixed left-0 w-12 md:w-16 h-10 bg-[#0F0F0F] border-r border-[#2A2824] z-30 flex flex-col items-center justify-center shadow-lg">
                <Type className="w-3.5 h-3.5 text-[#AAA69D]" />
                <span className="text-[9px] font-bold text-[#AAA69D] tracking-widest font-mono">T1</span>
              </div>
              
              {textLayers.map(layer => {
                const isSelected = selectedItemId === layer.id;
                return (
                  <div
                    key={layer.id}
                    draggable
                    onDragStart={(e) => handleDragStart(e, layer.id, 'text', layer.timelineStart)}
                    onClick={(e) => { e.stopPropagation(); onItemSelect(layer.id); }}
                    className={`timeline-clip absolute h-full rounded-md border overflow-hidden cursor-pointer transition-colors flex items-center px-2 bg-[#2D2342] ${getSelectionStyle(isSelected)} ${draggedItem?.id === layer.id ? 'opacity-50' : ''}`}
                    style={{
                      left: `${layer.timelineStart * pixelsPerSecond}px`,
                      width: `${layer.duration * pixelsPerSecond}px`,
                    }}
                  >
                    <span className="text-[10px] font-mono text-white truncate max-w-full drop-shadow-md">
                      "{layer.text}"
                    </span>
                  </div>
                );
              })}
            </div>

            {/* Video Track (V1) */}
            <div className="h-20 bg-[#161514] border-y border-[#2A2824]/50 relative group">
              <div className="fixed left-0 w-12 md:w-16 h-20 bg-[#0F0F0F] border-r border-[#2A2824] z-30 flex flex-col items-center justify-center shadow-lg">
                <Video className="w-3.5 h-3.5 text-[#D4AF37]" />
                <span className="text-[9px] font-bold text-[#D4AF37] tracking-widest font-mono">V1</span>
              </div>
              
              {items.map((item, idx) => {
                const media = clipMap.get(item.clipId);
                const isSelected = selectedItemId === item.id;
                const isMissing = !media || (!media.objectUrl && !media.file && !media.driveFileId);
                const isVertical = media?.orientation === 'portrait';
                
                return (
                  <div
                    key={item.id}
                    draggable
                    onDragStart={(e) => handleDragStart(e, item.id, 'video', item.timelineStart)}
                    onClick={(e) => {
                      e.stopPropagation();
                      onItemSelect(item.id);
                    }}
                    className={`timeline-clip absolute h-full rounded-md border overflow-hidden cursor-pointer transition-all ${getSelectionStyle(isSelected)} ${draggedItem?.id === item.id ? 'opacity-50' : ''} ${isMissing ? 'bg-red-950/60 border-red-500' : 'bg-[#1C1A17]'}`}
                    style={{
                      left: `${item.timelineStart * pixelsPerSecond}px`,
                      width: `${item.duration * pixelsPerSecond}px`,
                    }}
                  >
                    {media?.thumbnailUrl && (
                      <div 
                        className="absolute inset-0 opacity-40 bg-repeat-x bg-contain"
                        style={{ backgroundImage: `url(${media.thumbnailUrl})` }}
                      />
                    )}
                    <div className="absolute inset-0 bg-gradient-to-b from-black/70 via-black/30 to-black/80" />
                    
                    {/* Item Labels & Badges */}
                    <div className="relative p-2 flex flex-col justify-between z-0 h-full">
                      <div className="flex items-center justify-between gap-1">
                        <span className="text-[10px] font-mono text-white truncate max-w-full font-bold drop-shadow">
                          {idx + 1}. {media?.name || 'Ujęcie'}
                        </span>
                        
                        <div className="flex items-center gap-1 shrink-0">
                          {item.titleCard?.enabled && (
                            <span className="text-[8px] bg-[#D4AF37] text-black font-extrabold px-1 py-0.5 rounded flex items-center gap-0.5" title={`Plansza: ${item.titleCard.text}`}>
                              <Type className="w-2.5 h-2.5" /> PLANSZA
                            </span>
                          )}
                          {isMissing && (
                            <span className="text-[9px] bg-red-600 text-white font-bold px-1 rounded flex items-center gap-0.5 shrink-0">
                              <AlertTriangle className="w-2.5 h-2.5" /> BRAK
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center justify-between text-[9px] font-mono text-[#AAA69D]">
                        <span>{item.duration.toFixed(1)}s</span>
                        {isVertical && (
                          <span className="text-[8px] bg-black/60 px-1 rounded text-[#D4AF37]">9:16</span>
                        )}
                        {item.speed && item.speed !== 1 && (
                          <span className="text-[8px] bg-black/60 px-1 rounded text-blue-300">{item.speed}x</span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
            
            {/* Audio Track (A1) */}
            <div className="h-16 bg-[#161514] border-y border-[#2A2824]/50 relative group">
              <div className="fixed left-0 w-12 md:w-16 h-16 bg-[#0F0F0F] border-r border-[#2A2824] z-30 flex flex-col items-center justify-center shadow-lg">
                <Music className="w-3.5 h-3.5 text-[#AAA69D]" />
                <span className="text-[9px] font-bold text-[#AAA69D] tracking-widest font-mono">A1</span>
              </div>

              {audioTracks.map(track => {
                const isSelected = selectedItemId === track.id;
                return (
                  <div
                    key={track.id}
                    draggable
                    onDragStart={(e) => handleDragStart(e, track.id, 'audio', track.timelineStart)}
                    onClick={(e) => { e.stopPropagation(); onItemSelect(track.id); }}
                    className={`timeline-clip absolute h-full rounded-md border overflow-hidden cursor-pointer transition-colors flex items-center px-2 bg-[#1B3A36] ${getSelectionStyle(isSelected)} ${draggedItem?.id === track.id ? 'opacity-50' : ''}`}
                    style={{
                      left: `${track.timelineStart * pixelsPerSecond}px`,
                      width: `${track.duration * pixelsPerSecond}px`,
                    }}
                  >
                    <span className="relative z-0 text-[10px] font-mono text-white truncate max-w-full drop-shadow-md ml-1">
                      🎵 {track.name}
                    </span>
                  </div>
                );
              })}
            </div>

          </div>

          {/* Playhead */}
          <div 
            className="absolute top-0 bottom-0 w-px bg-[#D4AF37] z-40 pointer-events-none transition-all duration-75"
            style={{ 
              left: `${currentTime * pixelsPerSecond + (window.innerWidth >= 768 ? 64 : 48)}px`,
              boxShadow: '0 0 10px rgba(212, 175, 55, 0.6)'
            }}
          >
            <div className="absolute -top-1 -left-1.5 w-3 h-3 bg-[#D4AF37] rotate-45 transform origin-center rounded-sm shadow-md" />
          </div>

        </div>
      </div>
    </div>
  );
}