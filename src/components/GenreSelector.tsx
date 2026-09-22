import React, { useState, useRef, useEffect } from 'react';
import { Music, Play, Pause, Disc, CheckCircle2 } from 'lucide-react';
import { StoryMood } from '../types/legacy';
import { getGenresForMood, getGenreById, SoundGenre } from '../lib/soundLibrary';

interface GenreSelectorProps {
  selectedMood: StoryMood;
  selectedGenreId: string;
  onSelectGenre: (genreId: string) => void;
  compact?: boolean;
}

export function GenreSelector({
  selectedMood,
  selectedGenreId,
  onSelectGenre,
  compact = false
}: GenreSelectorProps) {
  const genres = getGenresForMood(selectedMood);
  const [previewingGenreId, setPreviewingGenreId] = useState<string | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const previewTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Stop audio preview on unmount or mood change
  useEffect(() => {
    return () => {
      stopPreview();
    };
  }, [selectedMood]);

  const stopPreview = () => {
    if (previewTimerRef.current) {
      clearTimeout(previewTimerRef.current);
      previewTimerRef.current = null;
    }
    if (audioCtxRef.current) {
      try {
        audioCtxRef.current.close();
      } catch (e) {}
      audioCtxRef.current = null;
    }
    setPreviewingGenreId(null);
  };

  const toggleGenrePreview = (genre: SoundGenre, e: React.MouseEvent) => {
    e.stopPropagation();

    if (previewingGenreId === genre.id) {
      stopPreview();
      return;
    }

    stopPreview();
    setPreviewingGenreId(genre.id);

    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      const ctx = new AudioCtx();
      audioCtxRef.current = ctx;

      const masterGain = ctx.createGain();
      masterGain.gain.setValueAtTime(0.2, ctx.currentTime);
      masterGain.connect(ctx.destination);

      const profile = genre.audioProfile;
      const chord = profile.chordProgressions[0];
      const chordTime = ctx.currentTime;
      const arpeggio = profile.arpeggioSpeed || 0.1;

      chord.forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        const noteGain = ctx.createGain();

        osc.type = idx === 0 ? 'sine' : profile.oscType;
        osc.frequency.setValueAtTime(freq, chordTime);

        const start = chordTime + idx * arpeggio;
        noteGain.gain.setValueAtTime(0.001, start);
        noteGain.gain.exponentialRampToValueAtTime(0.18 / chord.length, start + arpeggio * 1.5);
        noteGain.gain.exponentialRampToValueAtTime(0.001, start + 3.5);

        osc.connect(noteGain);
        noteGain.connect(masterGain);

        osc.start(start);
        osc.stop(start + 3.6);
      });

      if (profile.bassEnhance) {
        const bassOsc = ctx.createOscillator();
        const bassGain = ctx.createGain();
        bassOsc.type = 'triangle';
        bassOsc.frequency.setValueAtTime(chord[0] / 2, chordTime);

        bassGain.gain.setValueAtTime(0.001, chordTime);
        bassGain.gain.exponentialRampToValueAtTime(0.15, chordTime + 0.1);
        bassGain.gain.exponentialRampToValueAtTime(0.001, chordTime + 3.2);

        bassOsc.connect(bassGain);
        bassGain.connect(masterGain);

        bassOsc.start(chordTime);
        bassOsc.stop(chordTime + 3.5);
      }

      previewTimerRef.current = setTimeout(() => {
        stopPreview();
      }, 3800);
    } catch (err) {
      console.warn('Audio preview error', err);
      stopPreview();
    }
  };

  const selectedGenre = getGenreById(selectedGenreId) || genres[0];

  if (compact) {
    return (
      <div className="space-y-2">
        <div className="flex items-center justify-between text-xs font-mono-label">
          <span className="font-bold flex items-center gap-1.5 opacity-90">
            <Disc className="w-3.5 h-3.5 text-[#D4AF37]" />
            Gatunek muzyczny:
          </span>
          <span className="text-[0.6875rem] text-[#D4AF37] font-bold font-mono">{selectedGenre.name} ({selectedGenre.bpm} BPM)</span>
        </div>
        <div className="grid grid-cols-2 gap-2">
          {genres.map((g) => {
            const isSelected = selectedGenreId === g.id;
            const isPreviewing = previewingGenreId === g.id;
            return (
              <div
                key={g.id}
                onClick={() => onSelectGenre(g.id)}
                className={`cursor-pointer p-2.5 rounded-xl border text-left transition flex items-center justify-between gap-1.5 ${
                  isSelected
                    ? 'glass-panel-gold border-[#D4AF37] text-white shadow-md'
                    : 'glass-card border-white/10 hover:border-[#D4AF37]/50'
                }`}
              >
                <div className="min-w-0 flex-1">
                  <div className="text-[0.6875rem] font-bold font-sans-modern truncate">{g.name}</div>
                  <div className="text-[0.5625rem] font-mono-label opacity-70 truncate">{g.instrumentation}</div>
                </div>
                <button
                  type="button"
                  onClick={(e) => toggleGenrePreview(g, e)}
                  className={`w-6 h-6 rounded-lg flex items-center justify-center shrink-0 transition ${
                    isPreviewing
                      ? 'bg-[#D4AF37] text-black shadow-md animate-pulse'
                      : 'bg-white/10 text-white/80 hover:bg-white/20'
                  }`}
                  title="Próbka brzmienia"
                >
                  {isPreviewing ? <Pause className="w-3 h-3" /> : <Play className="w-3 h-3 ml-0.5 fill-current" />}
                </button>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3 pt-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Disc className="w-4 h-4 text-[#D4AF37]" />
          <span className="text-xs font-bold uppercase tracking-wider font-mono-label">
            Gatunek Muzyczny i Brzmienie
          </span>
        </div>
        <span className="text-[0.6875rem] font-mono-label opacity-70">
          Biblioteka: {genres.length} gatunki
        </span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
        {genres.map((genre) => {
          const isSelected = selectedGenreId === genre.id;
          const isPreviewing = previewingGenreId === genre.id;

          return (
            <div
              key={genre.id}
              onClick={() => onSelectGenre(genre.id)}
              className={`cursor-pointer p-4 rounded-xl border text-left transition relative flex flex-col justify-between gap-3 ${
                isSelected
                  ? 'glass-panel-gold border-[#D4AF37] shadow-lg'
                  : 'glass-card border-white/10 hover:border-[#D4AF37]/50'
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold font-serif-luxury">{genre.name}</span>
                    <span className="text-[0.5625rem] px-2 py-0.5 rounded-full badge-luxury font-mono-label font-bold uppercase">
                      {genre.badge}
                    </span>
                  </div>
                  <p className="text-[0.6875rem] font-sans-modern opacity-80 mt-1 leading-relaxed">
                    {genre.description}
                  </p>
                </div>

                {isSelected ? (
                  <CheckCircle2 className="w-4 h-4 text-[#D4AF37] shrink-0 mt-0.5" />
                ) : (
                  <div className="w-4 h-4 rounded-full border border-white/20 shrink-0 mt-0.5" />
                )}
              </div>

              <div className="pt-2 border-t border-white/10 flex items-center justify-between text-[0.6875rem]">
                <div className="flex items-center gap-1.5 font-mono-label truncate max-w-[12rem] opacity-75">
                  <Music className="w-3 h-3 text-[#D4AF37] shrink-0" />
                  <span className="truncate">{genre.instrumentation}</span>
                </div>

                <div className="flex items-center gap-2">
                  <span className="font-mono-label opacity-70">{genre.bpm} BPM</span>
                  <button
                    type="button"
                    onClick={(e) => toggleGenrePreview(genre, e)}
                    className={`px-3 py-1 rounded-lg font-mono-label text-[0.625rem] uppercase font-bold flex items-center gap-1 transition ${
                      isPreviewing
                        ? 'bg-[#D4AF37] text-black shadow-md'
                        : 'luxury-btn-ghost'
                    }`}
                  >
                    {isPreviewing ? (
                      <>
                        <Pause className="w-3 h-3" />
                        <span>Stop</span>
                      </>
                    ) : (
                      <>
                        <Play className="w-3 h-3 fill-current" />
                        <span>Próbka</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
