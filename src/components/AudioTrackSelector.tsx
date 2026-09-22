import React, { useState, useRef } from 'react';
import { Music, Upload, Activity, Mic, CheckCircle2, Play, Pause, Trash2, Volume2, Sparkles, VolumeX } from 'lucide-react';
import { analyzeAudioBeats, BeatAnalysisResult } from '../lib/beatDetector';

export interface CustomAudioState {
  file: File | null;
  url: string | null;
  name: string;
  duration: number;
  beatData: BeatAnalysisResult | null;
  syncWithBeats: boolean;
}

interface AudioTrackSelectorProps {
  customAudio: CustomAudioState;
  onCustomAudioChange: (state: CustomAudioState) => void;
  voiceoverBlob: Blob | null;
  voiceoverUrl: string | null;
  onOpenVoiceRecorder: () => void;
  onRemoveVoiceover: () => void;
  selectedMood?: string;
  selectedGenreId?: string;
  onSelectGenre?: (genreId: string) => void;
  isCustomMusicSelected: boolean;
  onToggleCustomMusic: (useCustom: boolean) => void;
}

export function AudioTrackSelector({
  customAudio,
  onCustomAudioChange,
  voiceoverBlob,
  voiceoverUrl,
  onOpenVoiceRecorder,
  onRemoveVoiceover,
  isCustomMusicSelected,
  onToggleCustomMusic,
}: AudioTrackSelectorProps) {
  const [isAnalyzingBeats, setIsAnalyzingBeats] = useState(false);
  const [isPlayingAudio, setIsPlayingAudio] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const url = URL.createObjectURL(file);
    setIsAnalyzingBeats(true);

    try {
      const beatData = await analyzeAudioBeats(file);
      onCustomAudioChange({
        file,
        url,
        name: file.name,
        duration: beatData.duration,
        beatData,
        syncWithBeats: true,
      });
      onToggleCustomMusic(true);
    } catch (err) {
      console.error('Error analyzing audio', err);
      onCustomAudioChange({
        file,
        url,
        name: file.name,
        duration: 60,
        beatData: null,
        syncWithBeats: false,
      });
      onToggleCustomMusic(true);
    } finally {
      setIsAnalyzingBeats(false);
      if (e.target) e.target.value = '';
    }
  };

  const toggleAudioPlay = () => {
    if (!audioRef.current && customAudio.url) {
      const audio = new Audio(customAudio.url);
      audioRef.current = audio;
      audio.onended = () => setIsPlayingAudio(false);
    }

    if (isPlayingAudio) {
      audioRef.current?.pause();
      setIsPlayingAudio(false);
    } else {
      audioRef.current?.play().then(() => setIsPlayingAudio(true)).catch(() => {});
    }
  };

  const removeCustomAudio = () => {
    if (isPlayingAudio && audioRef.current) {
      audioRef.current.pause();
    }
    if (customAudio.url) {
      URL.revokeObjectURL(customAudio.url);
    }
    onCustomAudioChange({
      file: null,
      url: null,
      name: '',
      duration: 0,
      beatData: null,
      syncWithBeats: false,
    });
    onToggleCustomMusic(false);
    setIsPlayingAudio(false);
  };

  return (
    <div className="glass-panel rounded-3xl p-5 sm:p-6 space-y-5">
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileUpload}
        accept="audio/mp3,audio/wav,audio/m4a,audio/aac,audio/ogg,.mp3,.wav,.m4a"
        className="hidden"
      />

      {/* Header */}
      <div className="flex items-center justify-between pb-2 border-b border-white/10">
        <div>
          <h4 className="text-xs font-bold text-white font-mono-label uppercase tracking-wider flex items-center gap-2">
            <Music className="w-4 h-4 text-[#D4AF37]" />
            Ścieżka Dźwiękowa i Głos
          </h4>
          <p className="text-xs font-sans-modern opacity-75 mt-0.5">
            Wgraj własną piosenkę (np. pierwszy taniec) lub pozostaw naturalny dźwięk z filmu.
          </p>
        </div>
      </div>

      {/* Audio Options: Custom Song vs Pure Original Video Audio */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {/* Option A: Custom Couple Song */}
        <div
          onClick={() => {
            if (!customAudio.url) {
              fileInputRef.current?.click();
            } else {
              onToggleCustomMusic(true);
            }
          }}
          className={`cursor-pointer p-4 rounded-2xl border transition relative ${
            isCustomMusicSelected && customAudio.url
              ? 'glass-panel-gold border-[#D4AF37] text-[#FDE047] font-bold shadow-md'
              : 'glass-card text-white/80 hover:border-[#D4AF37]/40'
          }`}
        >
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-[#D4AF37]/20 flex items-center justify-center text-[#D4AF37] shrink-0">
                <Music className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <div className="text-xs font-serif-luxury font-bold truncate">
                  {customAudio.name || 'Wgraj utwór MP3 / Pierwszy Taniec'}
                </div>
                <div className="text-[0.6875rem] font-mono-label opacity-75 mt-0.5">
                  {customAudio.beatData ? `Wykryto ${customAudio.beatData.bpm} BPM` : 'Obsługuje pliki MP3, WAV, M4A'}
                </div>
              </div>
            </div>

            {isCustomMusicSelected && customAudio.url ? (
              <CheckCircle2 className="w-5 h-5 text-[#FDE047] shrink-0" />
            ) : null}
          </div>

          {/* If audio file loaded */}
          {customAudio.url && (
            <div className="mt-3.5 pt-3 border-t border-white/10 flex items-center justify-between gap-2" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center gap-2">
                <button
                  onClick={toggleAudioPlay}
                  className="w-8 h-8 rounded-xl bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition cursor-pointer"
                  title="Odsłuchaj utwór"
                >
                  {isPlayingAudio ? <Pause className="w-4 h-4 text-[#D4AF37]" /> : <Play className="w-4 h-4 text-emerald-400" />}
                </button>
                <button
                  onClick={removeCustomAudio}
                  className="w-8 h-8 rounded-xl bg-rose-950/40 hover:bg-rose-900/60 text-rose-300 flex items-center justify-center transition border border-rose-500/30 cursor-pointer"
                  title="Usuń plik"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* Beat sync toggle */}
              {customAudio.beatData && (
                <button
                  onClick={() =>
                    onCustomAudioChange({
                      ...customAudio,
                      syncWithBeats: !customAudio.syncWithBeats,
                    })
                  }
                  className={`text-[0.6875rem] px-3 py-1.5 rounded-xl font-mono-label font-bold flex items-center gap-1.5 transition cursor-pointer ${
                    customAudio.syncWithBeats
                      ? 'luxury-btn-primary'
                      : 'glass-card text-white/60'
                  }`}
                  title="Montaż tnie ujęcia w punkt uderzenia bitu"
                >
                  <Activity className="w-3.5 h-3.5" />
                  <span>Cięcie w bit ({customAudio.beatData.bpm} BPM)</span>
                </button>
              )}
            </div>
          )}

          {isAnalyzingBeats && (
            <div className="mt-2.5 text-xs text-[#FDE047] font-mono-label font-semibold flex items-center gap-1.5 animate-pulse">
              <Activity className="w-3.5 h-3.5" />
              <span>Analizowanie rytmu piosenki (Beat Detection)...</span>
            </div>
          )}
        </div>

        {/* Option B: Pure Original Video Sound (No Music) */}
        <div
          onClick={() => {
            onToggleCustomMusic(false);
          }}
          className={`cursor-pointer p-4 rounded-2xl border transition flex items-center justify-between ${
            !isCustomMusicSelected
              ? 'glass-panel-gold border-[#D4AF37] text-[#FDE047] font-bold shadow-md'
              : 'glass-card text-white/80 hover:border-[#D4AF37]/40'
          }`}
        >
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-white/10 flex items-center justify-center text-stone-300 shrink-0">
              <Volume2 className="w-4 h-4" />
            </div>
            <div>
              <div className="text-xs font-serif-luxury font-bold">Oryginalny dźwięk z filmu</div>
              <div className="text-[0.6875rem] font-sans-modern opacity-75 mt-0.5">Autentyczna ścieżka dźwiękowa z Twoich nagrań (bez muzyki w tle)</div>
            </div>
          </div>
          {!isCustomMusicSelected && <CheckCircle2 className="w-5 h-5 text-[#FDE047] shrink-0" />}
        </div>
      </div>

      {/* Voiceover / Custom Voice Track */}
      <div className="pt-3 border-t border-white/10 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-[#D4AF37]/20 flex items-center justify-center text-[#D4AF37] shrink-0">
            <Mic className="w-4 h-4" />
          </div>
          <div>
            <span className="text-xs font-bold text-white font-serif-luxury block">
              {voiceoverBlob ? 'Nagranie własnego głosu aktywne' : 'Nagranie Własnego Głosu / Przysięgi'}
            </span>
            <span className="text-xs font-sans-modern opacity-75 block">
              {voiceoverBlob ? 'Własny głos zostanie wmontowany do filmu' : 'Nagraj mikrofonem własne słowa lub przysięgę'}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {voiceoverBlob ? (
            <button
              onClick={onRemoveVoiceover}
              className="text-xs text-rose-300 hover:text-white p-2 rounded-xl bg-rose-950/40 border border-rose-500/40 transition cursor-pointer"
              title="Usuń nagranie własnego głosu"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          ) : (
            <button
              onClick={onOpenVoiceRecorder}
              className="luxury-btn-primary text-xs px-3.5 py-2 rounded-xl flex items-center gap-1.5 font-mono-label uppercase font-bold cursor-pointer"
            >
              <Mic className="w-3.5 h-3.5 text-black" />
              <span>Nagraj własny głos</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
