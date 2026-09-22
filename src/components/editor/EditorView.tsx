import React, { useState, useEffect, useRef } from 'react';
import { PreviewPlayer } from '../player/PreviewPlayer';
import { TimelineView } from '../timeline/TimelineView';
import { ClipInspector } from '../inspector/ClipInspector';
import { TextInspector } from '../inspector/TextInspector';
import { AudioInspector } from '../inspector/AudioInspector';
import { Type, Music, Mic } from 'lucide-react';
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
      <div className={`md:block ${selectedItemId ? 'block absolute md:relative inset-0 md:inset-auto z-50 bg-[#090909]/90 md:bg-transparent backdrop-blur-md md:backdrop-blur-none' : 'hidden'}`}>
        
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
          <div className="h-full w-80 border-l border-[#2A2824] bg-[#121212] hidden md:flex flex-col items-center justify-center text-center p-6 text-[#AAA69D]">
            <p className="text-xs">Zaznacz klip, napis lub ścieżkę dźwiękową na osi czasu, aby edytować parametry montażu.</p>
          </div>
        )}
      </div>

    </div>
  );
}
