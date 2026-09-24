import React, { useState, useEffect, useRef } from 'react';
import { PreviewPlayer } from '../player/PreviewPlayer';
import { TimelineView } from '../timeline/TimelineView';
import { ClipInspector } from '../inspector/ClipInspector';
import { TextInspector } from '../inspector/TextInspector';
import { AudioInspector } from '../inspector/AudioInspector';
import { Type, Music, Mic, MessageSquare, Clock, User, Trash2, Send, CheckSquare, Sparkles } from 'lucide-react';
import type { 
  ProjectState, 
  TimelineItem, 
  TextLayer, 
  AudioTrackItem, 
  TimelineMarker 
} from '../../types/project';
import { urlRegistry } from '../../core/media/urlRegistry';

interface EditorViewProps {
  project: ProjectState;
  onUpdateTimelineItem: (id: string, updates: Partial<TimelineItem>) => void;
  onSplitTimelineItem?: (id: string, splitAtSourceTime: number) => void;
  onDuplicateTimelineItem?: (id: string) => void;
  onDeleteTimelineItem?: (id: string) => void;
  onMoveTimelineItem?: (id: string, newStart: number) => void;
  onAddMarker?: (marker: TimelineMarker) => void;
  onDeleteMarker?: (id: string) => void;
  onAddTextLayer: (layer: TextLayer) => void;
  onUpdateTextLayer: (id: string, updates: Partial<TextLayer>) => void;
  onDeleteTextLayer?: (id: string) => void;
  onAddAudioTrack: (track: AudioTrackItem) => void;
  onUpdateAudioTrack: (id: string, updates: Partial<AudioTrackItem>) => void;
  onDeleteAudioTrack?: (id: string) => void;
}

export function EditorView({ 
  project, 
  onUpdateTimelineItem, 
  onSplitTimelineItem,
  onDuplicateTimelineItem,
  onDeleteTimelineItem,
  onMoveTimelineItem,
  onAddMarker,
  onDeleteMarker,
  onAddTextLayer, 
  onUpdateTextLayer,
  onDeleteTextLayer, 
  onAddAudioTrack, 
  onUpdateAudioTrack,
  onDeleteAudioTrack
}: EditorViewProps) {
  const [currentTime, setCurrentTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  
  // Client Review State
  const [author, setAuthor] = useState('Panna Młoda');
  const [commentText, setCommentText] = useState('');
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  const timelineDuration = Math.max(
    project.timelineItems.reduce((max, item) => Math.max(max, item.timelineStart + item.duration), 0),
    project.audioTracks.reduce((max, track) => Math.max(max, track.timelineStart + track.duration), 0),
    project.textLayers.reduce((max, layer) => Math.max(max, layer.timelineStart + layer.duration), 0),
    currentTime + 10
  );

  useEffect(() => {
    let animationFrame: number;
    let lastTime = performance.now();

    const loop = (time: number) => {
      if (playing) {
        const delta = (time - lastTime) / 1000;
        setCurrentTime(prev => {
          const next = prev + delta;
          if (next >= timelineDuration && timelineDuration > 0) {
            setPlaying(false);
            return timelineDuration;
          }
          return next;
        });
      }
      lastTime = time;
      animationFrame = requestAnimationFrame(loop);
    };

    if (playing) {
      animationFrame = requestAnimationFrame(loop);
    }

    return () => cancelAnimationFrame(animationFrame);
  }, [playing, timelineDuration]);

  // Determine what is selected
  const selectedTimelineItem = project.timelineItems.find(i => i.id === selectedItemId);
  const selectedTextLayer = project.textLayers.find(i => i.id === selectedItemId);
  const selectedAudioTrack = project.audioTracks.find(i => i.id === selectedItemId);
  
  const selectedMediaClip = selectedTimelineItem 
    ? project.mediaLibrary.find(m => m.id === selectedTimelineItem.clipId)
    : null;

  const handleAddText = () => {
    const newText: TextLayer = {
      id: `text_${Date.now()}`,
      text: 'Niezapomniane Chwile',
      type: 'title',
      timelineStart: currentTime,
      duration: 4,
      position: { x: 0.5, y: 0.8 },
      fontSize: 2.2,
      color: '#ffffff',
      style: 'elegant'
    };
    onAddTextLayer(newText);
    setSelectedItemId(newText.id);
  };

  const handleAudioSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    
    const file = files[0];
    const url = urlRegistry.create(file);
    
    const newAudio: AudioTrackItem = {
      id: `audio_${Date.now()}`,
      name: file.name,
      objectUrl: url,
      sourceStart: 0,
      sourceEnd: 60,
      timelineStart: currentTime,
      duration: 60,
      volume: 1,
      fadeIn: 1.5,
      fadeOut: 2
    };
    
    onAddAudioTrack(newAudio);
    setSelectedItemId(newAudio.id);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleItemMove = (id: string, newStart: number) => {
    if (onMoveTimelineItem && project.timelineItems.some(i => i.id === id)) {
      onMoveTimelineItem(id, newStart);
    } else if (project.textLayers.some(t => t.id === id)) {
      onUpdateTextLayer(id, { timelineStart: newStart });
    } else if (project.audioTracks.some(a => a.id === id)) {
      onUpdateAudioTrack(id, { timelineStart: newStart });
    }
  };

  const handleDeleteItem = (id: string) => {
    if (project.timelineItems.some(i => i.id === id)) {
      onDeleteTimelineItem?.(id);
    } else if (project.textLayers.some(t => t.id === id)) {
      onDeleteTextLayer?.(id);
    } else if (project.audioTracks.some(a => a.id === id)) {
      onDeleteAudioTrack?.(id);
    }
    setSelectedItemId(null);
  };

  return (
    <div className="flex flex-col md:flex-row w-full h-full bg-[#090909]">
      
      {/* Left/Center: Player & Timeline */}
      <div className="flex-1 flex flex-col min-w-0 h-full">
        
        {/* Player Area */}
        <div className="flex-1 p-3 md:p-5 pb-2 min-h-0 flex flex-col">
          <PreviewPlayer 
            currentTime={currentTime}
            duration={timelineDuration}
            playing={playing}
            timelineItems={project.timelineItems}
            mediaLibrary={project.mediaLibrary}
            textLayers={project.textLayers}
            audioTracks={project.audioTracks}
            onPlayPause={() => setPlaying(!playing)}
            onSeek={(t) => {
              setCurrentTime(t);
              setPlaying(false); 
            }}
          />
        </div>

        {/* Timeline Area */}
        <div className="h-72 shrink-0 w-full flex flex-col">
          {/* Quick Track Tools Header */}
          <div className="h-9 bg-[#101010] border-t border-[#2A2824] flex items-center px-4 shrink-0 gap-2">
            <button 
              onClick={handleAddText}
              className="flex items-center gap-1.5 text-[10px] uppercase font-bold text-[#AAA69D] hover:text-[#D4AF37] px-3 py-1 rounded bg-[#181818] hover:bg-[#202020] transition-colors border border-[#2A2824] cursor-pointer"
            >
              <Type className="w-3 h-3 text-[#D4AF37]" /> + Dodaj Napis
            </button>
            <button 
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center gap-1.5 text-[10px] uppercase font-bold text-[#AAA69D] hover:text-[#D4AF37] px-3 py-1 rounded bg-[#181818] hover:bg-[#202020] transition-colors border border-[#2A2824] cursor-pointer"
            >
              <Music className="w-3 h-3 text-[#D4AF37]" /> + Ścieżka Audio
            </button>
            <input 
              type="file" 
              ref={fileInputRef} 
              className="hidden" 
              accept="audio/*" 
              onChange={handleAudioSelect} 
            />
          </div>
          
          <TimelineView 
            items={project.timelineItems}
            mediaLibrary={project.mediaLibrary}
            textLayers={project.textLayers}
            audioTracks={project.audioTracks}
            markers={project.markers}
            chapters={project.chapters}
            currentTime={currentTime}
            duration={timelineDuration}
            onTimeUpdate={setCurrentTime}
            onItemSelect={setSelectedItemId}
            selectedItemId={selectedItemId}
            onItemMove={handleItemMove}
            onSplitItem={onSplitTimelineItem}
            onDuplicateItem={onDuplicateTimelineItem}
            onDeleteItem={handleDeleteItem}
            onAddMarker={onAddMarker}
            onDeleteMarker={onDeleteMarker}
          />
        </div>
      </div>

      {/* Right: Inspector */}
      <div className={`md:block ${selectedItemId ? 'block fixed md:relative inset-0 md:inset-auto z-50 bg-[#090909]/95 md:bg-transparent backdrop-blur-md md:backdrop-blur-none max-w-full overflow-y-auto' : 'hidden'}`}>
        
        {/* Mobile close button */}
        {selectedItemId && (
          <button 
            className="md:hidden absolute top-3 right-4 z-50 text-white bg-black/50 p-2 rounded-full cursor-pointer"
            onClick={() => setSelectedItemId(null)}
          >
            ✕
          </button>
        )}

        {selectedTimelineItem && selectedMediaClip ? (
          <div className="h-full relative">
            <ClipInspector 
              item={selectedTimelineItem}
              media={selectedMediaClip}
              onUpdate={onUpdateTimelineItem}
              onSplit={onSplitTimelineItem}
            />
          </div>
        ) : selectedTextLayer ? (
          <TextInspector 
            layer={selectedTextLayer} 
            onUpdate={onUpdateTextLayer} 
          />
        ) : selectedAudioTrack ? (
          <AudioInspector 
            track={selectedAudioTrack} 
            onUpdate={onUpdateAudioTrack} 
          />
        ) : (
          /* Live Client Review Panel / Interactive Comments Board */
          <div className="h-full w-80 border-l border-[#26221A] bg-[#0E0D0C] flex flex-col z-10 shrink-0">
            {/* Header */}
            <div className="p-4 border-b border-[#26221A] bg-[#12110E] shrink-0">
              <div className="flex items-center gap-2 text-[#D4AF37] text-[11px] font-mono tracking-wider uppercase font-bold">
                <MessageSquare className="w-4 h-4 text-[#D4AF37]" />
                <span>Panel Recenzencki</span>
              </div>
              <h3 className="text-sm font-bold text-white mt-1">Uwagi Pary Młodej</h3>
              <p className="text-[10px] text-[#8C7D5B] mt-0.5">Wspólne recenzowanie i montaż w chmurze</p>
            </div>

            {/* Author Selector */}
            <div className="p-4 border-b border-[#26221A] shrink-0 space-y-1.5">
              <label className="text-[9px] font-mono font-bold text-[#AAA69D] uppercase tracking-wider block">KTO DODAJE UWAGĘ?</label>
              <div className="grid grid-cols-2 gap-1.5 text-[11px]">
                {[
                  { name: 'Panna Młoda', emoji: '👰', activeClass: 'bg-rose-950/40 border-rose-500/50 text-rose-300' },
                  { name: 'Pan Młody', emoji: '🤵', activeClass: 'bg-sky-950/40 border-sky-500/50 text-sky-300' },
                  { name: 'Montażysta', emoji: '🎬', activeClass: 'bg-[#2A2411] border-[#D4AF37]/50 text-[#FDE047]' },
                  { name: 'Rodzina/Goście', emoji: '👨‍👩‍👧‍👦', activeClass: 'bg-emerald-950/40 border-emerald-500/50 text-emerald-300' }
                ].map(item => (
                  <button
                    key={item.name}
                    onClick={() => setAuthor(item.name)}
                    className={`px-2 py-1.5 rounded-lg border text-left transition-all font-medium cursor-pointer ${
                      author === item.name 
                        ? item.activeClass
                        : 'bg-[#14120F] border-[#26221A] text-[#A09886] hover:text-white hover:border-[#3E2C1A]'
                    }`}
                  >
                    <span className="mr-1">{item.emoji}</span>
                    {item.name}
                  </button>
                ))}
              </div>
            </div>

            {/* Live Comment Form */}
            <div className="p-4 border-b border-[#26221A] shrink-0 bg-[#12110E] space-y-3">
              <div className="flex items-center justify-between text-[10px] font-mono text-[#AAA69D]">
                <span className="flex items-center gap-1">
                  <Clock className="w-3.5 h-3.5 text-[#D4AF37]" /> UWAGA W MOMENCIE:
                </span>
                <span className="font-bold text-[#D4AF37] text-xs">
                  {Math.floor(currentTime / 60)}:{(Math.floor(currentTime % 60)).toString().padStart(2, '0')}
                </span>
              </div>

              <textarea
                value={commentText}
                onChange={(e) => setCommentText(e.target.value)}
                placeholder="Wpisz np. 'Skrócić to ujęcie o 1s', 'Mogłoby być jaśniej?', 'Super piosenka!'"
                className="w-full h-20 bg-[#16130F] border border-[#26221A] rounded-xl p-2.5 text-xs text-white placeholder-[#605A4E] focus:outline-none focus:border-[#D4AF37] focus:ring-1 focus:ring-[#D4AF37]/20 resize-none transition-all"
              />

              <button
                onClick={() => {
                  if (!commentText.trim() || !onAddMarker) return;
                  const colors: Record<string, string> = {
                    'Panna Młoda': '#F43F5E',
                    'Pan Młody': '#38BDF8',
                    'Montażysta': '#D4AF37',
                    'Rodzina/Goście': '#10B981'
                  };
                  onAddMarker({
                    id: `comment_${Date.now()}`,
                    time: currentTime,
                    type: 'comment',
                    label: `${author}: ${commentText.trim()}`,
                    color: colors[author] || '#D4AF37'
                  });
                  setCommentText('');
                }}
                disabled={!commentText.trim() || !onAddMarker}
                className="w-full py-2 bg-gradient-to-r from-[#D4AF37] to-[#FDE047] hover:from-[#B5922C] hover:to-[#D4AF37] text-black font-extrabold text-[11px] uppercase tracking-wider rounded-xl transition-all shadow-md flex items-center justify-center gap-1.5 disabled:opacity-30 disabled:pointer-events-none cursor-pointer"
              >
                <Send className="w-3 h-3" />
                <span>Wyślij uwagę do filmu</span>
              </button>
            </div>

            {/* Comments List (Scrollable Feed) */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar">
              <span className="text-[9px] font-mono font-bold text-[#AAA69D] uppercase tracking-wider block">Wszystkie uwagi ({project.markers?.filter(m => m.type === 'comment').length || 0})</span>
              
              {(!project.markers || project.markers.filter(m => m.type === 'comment').length === 0) ? (
                <div className="p-6 border border-dashed border-[#26221A] rounded-2xl text-center space-y-2">
                  <div className="w-8 h-8 rounded-full bg-[#1A1815] border border-[#2A2317] flex items-center justify-center mx-auto">
                    <MessageSquare className="w-4 h-4 text-[#8C7D5B]" />
                  </div>
                  <p className="text-[11px] text-[#A09886] leading-relaxed">
                    Brak uwag w tym projekcie.<br />Przesuń film do odpowiedniego momentu i dodaj komentarz!
                  </p>
                </div>
              ) : (
                <div className="space-y-2.5">
                  {[...project.markers]
                    .filter(m => m.type === 'comment')
                    .sort((a, b) => a.time - b.time)
                    .map(m => {
                      const splitIdx = m.label.indexOf(':');
                      const commentAuthor = splitIdx !== -1 ? m.label.substring(0, splitIdx) : 'Autor';
                      const commentBody = splitIdx !== -1 ? m.label.substring(splitIdx + 1) : m.label;
                      
                      const authorBadgeColor = commentAuthor.includes('Panna') 
                        ? 'text-rose-400 bg-rose-950/20 border-rose-800/30'
                        : commentAuthor.includes('Pan M')
                          ? 'text-sky-400 bg-sky-950/20 border-sky-800/30'
                          : commentAuthor.includes('Mont')
                            ? 'text-[#FDE047] bg-[#2A2411]/40 border-[#D4AF37]/20'
                            : 'text-emerald-400 bg-emerald-950/20 border-emerald-800/30';

                      return (
                        <div
                          key={m.id}
                          onClick={() => {
                            setCurrentTime(m.time);
                            setPlaying(false);
                          }}
                          className="group p-3 rounded-xl bg-[#14120F] border border-[#26221A] hover:border-[#D4AF37]/40 transition-all cursor-pointer space-y-2 relative"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full border uppercase ${authorBadgeColor}`}>
                              {commentAuthor}
                            </span>
                            
                            <div className="flex items-center gap-1.5 shrink-0">
                              <span className="text-[10px] font-mono font-bold text-[#D4AF37] flex items-center gap-0.5">
                                <Clock className="w-3 h-3" />
                                {Math.floor(m.time / 60)}:{(Math.floor(m.time % 60)).toString().padStart(2, '0')}
                              </span>
                              
                              {onDeleteMarker && (
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    onDeleteMarker(m.id);
                                  }}
                                  className="p-1 rounded bg-[#1C1814] hover:bg-rose-950/50 text-[#8C7D5B] hover:text-rose-400 transition-colors border border-[#26221A] hover:border-rose-900/30 shrink-0 cursor-pointer"
                                  title="Rozwiąż / Usuń uwagę"
                                >
                                  <Trash2 className="w-3 h-3" />
                                </button>
                              )}
                            </div>
                          </div>

                          <p className="text-[11px] text-[#EADFC9] leading-relaxed break-words pr-2">
                            {commentBody}
                          </p>
                        </div>
                      );
                    })}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

    </div>
  );
}
