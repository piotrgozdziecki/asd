import React, { useState, useEffect, useRef } from 'react';
import { 
  X, 
  Play, 
  Square, 
  Sparkles, 
  Music, 
  Plus, 
  Volume2, 
  Clock, 
  Radio, 
  Sliders, 
  Check, 
  Loader2 
} from 'lucide-react';
import { SOUNDSCAPE_PRESETS, SoundscapePreset, soundscapeGenerator } from '../../core/audio/soundscapeGenerator';
import { urlRegistry } from '../../core/media/urlRegistry';
import { localIndexedDB } from '../../core/storage/indexedDBProvider';
import type { AudioTrackItem } from '../../types/project';
import { useStudioToast } from '../common/ToastContext';

interface SoundscapeStudioModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAddAudioTrack: (track: AudioTrackItem) => void;
  audioDuckingEnabled?: boolean;
  onToggleAudioDucking?: (enabled: boolean) => void;
}

export const SoundscapeStudioModal: React.FC<SoundscapeStudioModalProps> = ({
  isOpen,
  onClose,
  onAddAudioTrack,
  audioDuckingEnabled = true,
  onToggleAudioDucking
}) => {
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [activeCategory, setActiveCategory] = useState<'all' | 'romantic' | 'ceremony' | 'waltz' | 'celebration'>('all');
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number | null>(null);
  const toast = useStudioToast();

  useEffect(() => {
    return () => {
      soundscapeGenerator.stopPreview();
      if (animRef.current) cancelAnimationFrame(animRef.current);
    };
  }, []);

  // Visualizer loop for active audio
  useEffect(() => {
    if (!playingId) {
      if (animRef.current) cancelAnimationFrame(animRef.current);
      return;
    }

    const draw = () => {
      const canvas = canvasRef.current;
      const analyser = soundscapeGenerator.getAnalyser();
      if (canvas && analyser) {
        const ctx = canvas.getContext('2d');
        if (ctx) {
          const bufferLength = analyser.frequencyBinCount;
          const dataArray = new Uint8Array(bufferLength);
          analyser.getByteFrequencyData(dataArray);

          const width = canvas.width;
          const height = canvas.height;
          ctx.clearRect(0, 0, width, height);

          // Draw luxury gold equalizer bars
          const barWidth = (width / bufferLength) * 2.2;
          let x = 0;

          for (let i = 0; i < bufferLength; i++) {
            const barHeight = (dataArray[i] / 255) * height * 0.9;
            const gradient = ctx.createLinearGradient(0, height, 0, height - barHeight);
            gradient.addColorStop(0, '#D4AF37');
            gradient.addColorStop(0.6, '#F5DC88');
            gradient.addColorStop(1, '#FFF5D6');

            ctx.fillStyle = gradient;
            ctx.fillRect(x, height - barHeight, Math.max(2, barWidth - 1), barHeight);
            x += barWidth;
          }
        }
      }
      animRef.current = requestAnimationFrame(draw);
    };

    animRef.current = requestAnimationFrame(draw);
    return () => {
      if (animRef.current) cancelAnimationFrame(animRef.current);
    };
  }, [playingId]);

  if (!isOpen) return null;

  const handleTogglePreview = async (presetId: string) => {
    if (playingId === presetId) {
      soundscapeGenerator.stopPreview();
      setPlayingId(null);
    } else {
      setPlayingId(presetId);
      await soundscapeGenerator.playPreview(presetId, () => {
        setPlayingId(null);
      });
    }
  };

  const handleApplyToProject = async (preset: SoundscapePreset) => {
    setIsGenerating(true);
    soundscapeGenerator.stopPreview();
    setPlayingId(null);

    try {
      const { file, duration } = await soundscapeGenerator.generateTrackFile(preset.id);
      const trackId = `track_soundscape_${Date.now()}`;
      try {
        await localIndexedDB.saveMediaBlob(trackId, file);
      } catch {}
      const objectUrl = urlRegistry.create(file);

      const trackItem: AudioTrackItem = {
        id: trackId,
        name: `♫ ${preset.title} (${preset.key})`,
        file,
        objectUrl,
        duration,
        sourceStart: 0,
        sourceEnd: duration,
        timelineStart: 0,
        volume: 0.85,
        fadeIn: 2.0,
        fadeOut: 2.5
      };

      onAddAudioTrack(trackItem);
      toast.showSuccess(`Dodano ścieżkę dźwiękową "${preset.title}" do osi czasu!`);
      onClose();
    } catch (e: any) {
      toast.showError(`Błąd generowania ścieżki: ${e.message || 'Nieznany błąd'}`);
    } finally {
      setIsGenerating(false);
    }
  };

  const filteredPresets = activeCategory === 'all'
    ? SOUNDSCAPE_PRESETS
    : SOUNDSCAPE_PRESETS.filter(p => p.category === activeCategory);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
      <div className="relative w-full max-w-3xl bg-[#0C0B0A] border border-[#2A261D] rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#221F17] bg-[#12110D]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#1A1813] border border-[#D4AF37]/30 flex items-center justify-center text-[#D4AF37] shadow-inner">
              <Music className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-serif font-bold text-white tracking-wide">
                  Oprawa Muzyczna & Soundscape Studio
                </h2>
                <span className="text-[10px] uppercase font-mono tracking-wider px-2 py-0.5 rounded bg-[#2A2312] text-[#D4AF37] border border-[#D4AF37]/30">
                  Audio Pro
                </span>
              </div>
              <p className="text-xs text-[#8C8370] font-sans mt-0.5">
                Autorskie, kinowe podkłady instrumentalne bez tantiem i opłat licencyjnych
              </p>
            </div>
          </div>

          <button
            onClick={() => {
              soundscapeGenerator.stopPreview();
              onClose();
            }}
            className="p-2 rounded-xl text-[#7A7260] hover:text-white hover:bg-[#1A1813] transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Audio Ducking & Controls Banner */}
        <div className="px-6 py-3 bg-[#16140F] border-b border-[#221F17] flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2.5">
            <Radio className="w-4 h-4 text-[#D4AF37] animate-pulse" />
            <span className="text-[#C5BBA6] font-medium">
              Inteligentny mikser audio z automatycznym wyciszaniem (Audio Ducking)
            </span>
          </div>

          <div className="flex items-center gap-3">
            {onToggleAudioDucking && (
              <button
                onClick={() => onToggleAudioDucking(!audioDuckingEnabled)}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-[11px] font-medium transition-all cursor-pointer ${
                  audioDuckingEnabled
                    ? 'bg-[#2A2312] border-[#D4AF37]/50 text-[#F5DC88]'
                    : 'bg-[#141310] border-[#2A261D] text-[#7A7260]'
                }`}
              >
                <Sliders className="w-3.5 h-3.5" />
                <span>Ducking: {audioDuckingEnabled ? 'Włączony (-65% pod mowę)' : 'Wyłączony'}</span>
              </button>
            )}
          </div>
        </div>

        {/* Live Audio Oscilloscope / Visualizer Banner when playing */}
        {playingId && (
          <div className="px-6 py-2.5 bg-[#0A0907] border-b border-[#D4AF37]/30 flex items-center justify-between gap-4 animate-in fade-in">
            <div className="flex items-center gap-2 text-xs">
              <span className="w-2 h-2 rounded-full bg-[#D4AF37] animate-ping" />
              <span className="font-mono text-[#D4AF37] font-bold">ODSŁUCH NA ŻYWO:</span>
              <span className="text-white font-medium">
                {SOUNDSCAPE_PRESETS.find(p => p.id === playingId)?.title}
              </span>
            </div>
            <div className="h-6 w-36 sm:w-56 bg-black/60 rounded px-1.5 py-0.5 border border-[#D4AF37]/20 flex items-center justify-center">
              <canvas ref={canvasRef} width={220} height={20} className="w-full h-full" />
            </div>
          </div>
        )}

        {/* Category Filter Tabs */}
        <div className="px-6 py-3 bg-[#0E0D0A] border-b border-[#1E1B15] flex items-center gap-2 overflow-x-auto no-scrollbar">
          {[
            { id: 'all', label: 'Wszystkie podkłady' },
            { id: 'romantic', label: 'Romantyczne & Przysięga' },
            { id: 'ceremony', label: 'Kościół & Ceremonia' },
            { id: 'waltz', label: 'Pierwszy Taniec' },
            { id: 'celebration', label: 'Przyjęcie & Toast' }
          ].map(cat => (
            <button
              key={cat.id}
              onClick={() => setActiveCategory(cat.id as any)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors cursor-pointer ${
                activeCategory === cat.id
                  ? 'bg-[#2E2716] text-[#EADFC9] border border-[#D4AF37]/40 shadow-sm'
                  : 'text-[#7A7260] hover:text-[#C5BBA6] hover:bg-[#16140F]'
              }`}
            >
              {cat.label}
            </button>
          ))}
        </div>

        {/* Presets Grid */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4 custom-scrollbar">
          {filteredPresets.map(preset => {
            const isPlaying = playingId === preset.id;
            return (
              <div
                key={preset.id}
                className={`p-5 rounded-2xl border transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-4 ${
                  isPlaying
                    ? 'bg-[#1A1710] border-[#D4AF37]/60 shadow-lg shadow-[#D4AF37]/5'
                    : 'bg-[#12110D] border-[#221F17] hover:border-[#383222]'
                }`}
              >
                {/* Left Info */}
                <div className="flex items-start gap-4">
                  <button
                    onClick={() => handleTogglePreview(preset.id)}
                    className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 transition-transform cursor-pointer shadow-md ${
                      isPlaying
                        ? 'bg-[#D4AF37] text-black hover:scale-105'
                        : 'bg-[#1F1C15] text-[#D4AF37] hover:bg-[#2A261D]'
                    }`}
                    title={isPlaying ? 'Zatrzymaj odsłuch' : 'Odsłuchaj na żywo'}
                  >
                    {isPlaying ? (
                      <Square className="w-5 h-5 fill-black" />
                    ) : (
                      <Play className="w-5 h-5 ml-0.5 fill-[#D4AF37]" />
                    )}
                  </button>

                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="text-base">{preset.icon}</span>
                      <h3 className="text-sm sm:text-base font-serif font-bold text-white tracking-wide">
                        {preset.title}
                      </h3>
                      <span className="text-[10px] font-mono text-[#D4AF37] bg-[#221C11] px-1.5 py-0.5 rounded border border-[#D4AF37]/20">
                        {preset.key} • {preset.bpm} BPM
                      </span>
                    </div>

                    <p className="text-xs text-[#EADFC9]/80 font-medium">
                      {preset.subtitle}
                    </p>

                    <p className="text-[11px] text-[#7A7260] leading-relaxed max-w-lg">
                      {preset.description}
                    </p>
                  </div>
                </div>

                {/* Right Actions */}
                <div className="flex items-center gap-3 shrink-0 self-end sm:self-center">
                  <div className="text-right hidden sm:block">
                    <span className="text-[10px] font-mono text-[#7A7260] block uppercase tracking-wider">
                      Długość
                    </span>
                    <span className="text-xs font-mono font-bold text-[#C5BBA6]">
                      {preset.durationSeconds}s
                    </span>
                  </div>

                  <button
                    onClick={() => handleApplyToProject(preset)}
                    disabled={isGenerating}
                    className="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-[#D4AF37] to-[#E5C158] hover:from-[#E5C158] hover:to-[#F3D675] text-black font-extrabold text-xs rounded-xl transition-all shadow-md hover:scale-[1.02] cursor-pointer disabled:opacity-50 min-h-[40px]"
                  >
                    {isGenerating ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Plus className="w-4 h-4" />
                    )}
                    <span>WSTAW DO PROJEKTU</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer info */}
        <div className="px-6 py-3 border-t border-[#221F17] bg-[#0E0D0A] flex items-center justify-between text-[11px] text-[#7A7260]">
          <span>Wygenerowana ścieżka natychmiast trafia na oś czasu (ścieżka A1).</span>
          <span className="font-mono text-[#D4AF37]">WAV 44.1kHz • 16-bit Stereo</span>
        </div>
      </div>
    </div>
  );
};
