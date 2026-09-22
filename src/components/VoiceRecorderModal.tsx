import React, { useState, useRef, useEffect } from 'react';
import { Mic, Square, Play, Pause, RotateCcw, Check, X, Volume2, AlertCircle, Sparkles } from 'lucide-react';

interface VoiceRecorderModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaveVoiceover: (audioBlob: Blob, audioUrl: string, durationSeconds: number) => void;
  defaultText?: string;
}

export function VoiceRecorderModal({
  isOpen,
  onClose,
  onSaveVoiceover,
  defaultText,
}: VoiceRecorderModalProps) {
  const [isRecording, setIsRecording] = useState(false);
  const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null);
  const [recordedUrl, setRecordedUrl] = useState<string | null>(null);
  const [isPlayingPreview, setIsPlayingPreview] = useState(false);
  const [recordDuration, setRecordDuration] = useState(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [audioLevel, setAudioLevel] = useState(0);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animFrameRef = useRef<number | null>(null);
  const previewAudioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    return () => {
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
      if (audioContextRef.current) audioContextRef.current.close().catch(() => {});
      if (recordedUrl) URL.revokeObjectURL(recordedUrl);
    };
  }, [recordedUrl]);

  if (!isOpen) return null;

  const startRecording = async () => {
    setErrorMessage(null);
    setRecordedBlob(null);
    setRecordedUrl(null);
    audioChunksRef.current = [];
    setRecordDuration(0);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });

      // Audio meter analyzer
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const audioCtx = new AudioCtx();
      audioContextRef.current = audioCtx;
      const source = audioCtx.createMediaStreamSource(stream);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      analyserRef.current = analyser;

      const dataArray = new Uint8Array(analyser.frequencyBinCount);
      const updateMeter = () => {
        if (!analyserRef.current) return;
        analyserRef.current.getByteFrequencyData(dataArray);
        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) {
          sum += dataArray[i];
        }
        const avg = sum / dataArray.length;
        setAudioLevel(Math.min(100, Math.round((avg / 128) * 100)));
        animFrameRef.current = requestAnimationFrame(updateMeter);
      };
      updateMeter();

      // Media recorder
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : MediaRecorder.isTypeSupported('audio/ogg;codecs=opus')
        ? 'audio/ogg;codecs=opus'
        : 'audio/mp4';

      const mediaRecorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = () => {
        const fullBlob = new Blob(audioChunksRef.current, { type: mimeType });
        const url = URL.createObjectURL(fullBlob);
        setRecordedBlob(fullBlob);
        setRecordedUrl(url);
        stream.getTracks().forEach((track) => track.stop());
        if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
        setAudioLevel(0);
      };

      mediaRecorder.start(250);
      setIsRecording(true);

      const startTime = Date.now();
      timerIntervalRef.current = setInterval(() => {
        setRecordDuration(Math.floor((Date.now() - startTime) / 1000));
      }, 250);
    } catch (err: unknown) {
      console.log('Brak dostępu do mikrofonu (odmowa lub brak urządzenia).');
      setErrorMessage(
        'Brak dostępu do mikrofonu. Upewnij się, że zezwoliłeś przeglądarce na nagrywanie dźwięku.'
      );
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      if (timerIntervalRef.current) {
        clearInterval(timerIntervalRef.current);
        timerIntervalRef.current = null;
      }
    }
  };

  const togglePreview = () => {
    if (!previewAudioRef.current && recordedUrl) {
      const audio = new Audio(recordedUrl);
      previewAudioRef.current = audio;
      audio.onended = () => setIsPlayingPreview(false);
    }

    if (isPlayingPreview) {
      previewAudioRef.current?.pause();
      setIsPlayingPreview(false);
    } else {
      previewAudioRef.current?.play().then(() => setIsPlayingPreview(true)).catch(() => {});
    }
  };

  const handleSave = () => {
    if (recordedBlob && recordedUrl) {
      onSaveVoiceover(recordedBlob, recordedUrl, recordDuration);
      onClose();
    }
  };

  const formatSec = (s: number) => {
    const mins = Math.floor(s / 60);
    const secs = s % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-xl p-4 animate-in fade-in">
      <div className="w-full max-w-md rounded-3xl glass-panel p-6 text-white shadow-2xl relative border border-white/15">
        <button
          onClick={onClose}
          className="absolute top-5 right-5 w-8 h-8 rounded-full bg-white/10 flex items-center justify-center text-white/80 hover:text-white hover:bg-white/20 transition"
        >
          <X className="w-4 h-4" />
        </button>

        <div className="flex items-center gap-3.5 mb-5">
          <div className="w-11 h-11 rounded-2xl bg-[#D4AF37]/20 border border-[#D4AF37]/40 flex items-center justify-center text-[#D4AF37]">
            <Mic className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-base font-bold text-white font-serif-luxury tracking-wide">
              Nagranie Własnego Głosu / Przysięgi
            </h3>
            <p className="text-xs font-sans-modern opacity-75 mt-0.5">
              Nagraj osobiste słowa, które wpleciemy w film ślubny
            </p>
          </div>
        </div>

        {defaultText && (
          <div className="mb-4 p-4 rounded-2xl glass-card text-xs text-white/90 italic border border-[#D4AF37]/30">
            <div className="text-[0.6875rem] font-bold text-[#FDE047] font-mono-label uppercase tracking-wider mb-1.5 not-italic flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5" /> Proponowany tekst lektora:
            </div>
            „{defaultText}”
          </div>
        )}

        {errorMessage && (
          <div className="mb-4 p-3.5 rounded-2xl bg-rose-950/60 border border-rose-500/40 text-xs text-rose-200 flex items-start gap-2.5">
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
            <p className="font-sans-modern">{errorMessage}</p>
          </div>
        )}

        {/* Live Visualizer or Waveform */}
        <div className="h-32 rounded-2xl glass-card border border-white/10 flex flex-col items-center justify-center relative overflow-hidden mb-5 p-4">
          {isRecording ? (
            <div className="w-full flex flex-col items-center gap-2.5">
              <div className="flex items-center gap-2 text-[#FDE047] font-mono-label text-2xl font-bold tracking-wider">
                <span className="w-3 h-3 rounded-full bg-rose-500 animate-ping" />
                <span>{formatSec(recordDuration)}</span>
              </div>
              {/* Dynamic Equalizer Bars */}
              <div className="flex items-center gap-1.5 h-9">
                {[...Array(18)].map((_, i) => {
                  const barHeight = Math.max(4, Math.min(36, (audioLevel * (0.4 + (i % 5) * 0.2))));
                  return (
                    <div
                      key={i}
                      style={{ height: `${barHeight}px` }}
                      className="w-1.5 rounded-full bg-gradient-to-t from-[#997b3e] via-[#D4AF37] to-[#FDE047] transition-all duration-75"
                    />
                  );
                })}
              </div>
              <p className="text-xs font-mono-label opacity-75">Mów wyraźnie do mikrofonu...</p>
            </div>
          ) : recordedUrl ? (
            <div className="w-full flex flex-col items-center gap-3">
              <div className="text-xs font-bold text-emerald-400 font-mono-label flex items-center gap-1.5">
                <Check className="w-4 h-4" /> Nagranie gotowe ({formatSec(recordDuration)})
              </div>
              <button
                onClick={togglePreview}
                className="flex items-center gap-2 px-4 py-2 rounded-xl glass-card hover:border-[#D4AF37]/50 text-xs font-bold text-white transition active:scale-95"
              >
                {isPlayingPreview ? <Pause className="w-4 h-4 text-[#D4AF37]" /> : <Play className="w-4 h-4 text-emerald-400" />}
                <span>{isPlayingPreview ? 'Zatrzymaj odsłuch' : 'Odsłuchaj nagranie'}</span>
              </button>
            </div>
          ) : (
            <div className="text-center text-white/50">
              <Mic className="w-9 h-9 mx-auto mb-1.5 opacity-40 text-[#D4AF37]" />
              <p className="text-xs font-sans-modern">Kliknij poniższy przycisk, aby rozpocząć nagranie</p>
            </div>
          )}
        </div>

        {/* Action Controls */}
        <div className="flex gap-2.5">
          {!isRecording && !recordedBlob && (
            <button
              onClick={startRecording}
              className="min-h-[3rem] flex-1 rounded-2xl luxury-btn-primary font-bold text-xs py-3 flex items-center justify-center gap-2 uppercase tracking-wider font-mono-label active:scale-98 transition"
            >
              <Mic className="w-4 h-4 text-black" />
              <span>Rozpocznij nagrywanie</span>
            </button>
          )}

          {isRecording && (
            <button
              onClick={stopRecording}
              className="min-h-[3rem] flex-1 rounded-2xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs py-3 flex items-center justify-center gap-2 shadow-lg shadow-rose-950/60 active:scale-98 transition uppercase font-mono-label"
            >
              <Square className="w-4 h-4 fill-current" />
              <span>Zakończ nagrywanie</span>
            </button>
          )}

          {recordedBlob && (
            <>
              <button
                onClick={startRecording}
                className="min-h-[3rem] px-4 rounded-2xl glass-card hover:border-white/30 text-white font-semibold text-xs flex items-center gap-1.5 transition font-mono-label"
                title="Nagraj od nowa"
              >
                <RotateCcw className="w-4 h-4" />
                <span className="hidden sm:inline">Nagraj ponownie</span>
              </button>

              <button
                onClick={handleSave}
                className="min-h-[3rem] flex-1 rounded-2xl luxury-btn-primary text-black font-bold text-xs py-3 flex items-center justify-center gap-2 active:scale-98 transition uppercase font-mono-label"
              >
                <Check className="w-4 h-4 stroke-[2.5]" />
                <span>Użyj tego głosu w filmie</span>
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
