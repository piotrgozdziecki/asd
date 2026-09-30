/**
 * High-fidelity Wedding Soundscape & Ambient Music Generator
 * Generates rich, emotional cinematic soundscapes using Web Audio API synthesis.
 * Provides live audio preview and exports true stereo 16-bit WAV Blobs for the timeline.
 */

export interface SoundscapePreset {
  id: string;
  title: string;
  subtitle: string;
  category: 'romantic' | 'ceremony' | 'waltz' | 'celebration';
  durationSeconds: number;
  bpm: number;
  key: string;
  icon: string;
  description: string;
}

export const SOUNDSCAPE_PRESETS: SoundscapePreset[] = [
  {
    id: 'golden_hour_piano',
    title: 'Złoty Zmierzch',
    subtitle: 'Ciepły Fortepian & Smyczki Kinowe',
    category: 'romantic',
    durationSeconds: 45,
    bpm: 72,
    key: 'F-Dur',
    icon: '✨',
    description: 'Subtelne akordy fortepianu z ciepłym tłem wiolonczeli i skrzypiec. Idealne do przysięgi i przygotowań.'
  },
  {
    id: 'altar_procession',
    title: 'Droga do Ołtarza',
    subtitle: 'Dostojne Dzwony & Eteryczne Chóry',
    category: 'ceremony',
    durationSeconds: 40,
    bpm: 60,
    key: 'C-Dur',
    icon: '⛪',
    description: 'Majestatyczny motyw z harmonicznymi dzwonami katedry i eterycznymi akordami organowymi.'
  },
  {
    id: 'first_dance_waltz',
    title: 'Pierwszy Taniec',
    subtitle: 'Romantyczny Walc Akustyczny',
    category: 'waltz',
    durationSeconds: 50,
    bpm: 84,
    key: 'G-Dur',
    icon: '💃',
    description: 'Tradycyjny metrum 3/4 z delikatną harfą, ciepłym basem i unoszącymi się skrzypcami.'
  },
  {
    id: 'boho_celebration',
    title: 'Szampański Toast',
    subtitle: 'Radosny Akustyczny Beat & Gitara',
    category: 'celebration',
    durationSeconds: 40,
    bpm: 105,
    key: 'D-Dur',
    icon: '🥂',
    description: 'Współczesny, ciepły rytm z gitarą akustyczną w stylu boho. Dodaje energii i uśmiechu.'
  },
  {
    id: 'venice_strings',
    title: 'Wenecja Nocą',
    subtitle: 'Haute Couture Smyczki & Harfa',
    category: 'romantic',
    durationSeconds: 45,
    bpm: 68,
    key: 'A-Moll',
    icon: '🎻',
    description: 'Zmysłowa, luksusowa kompozycja w stylu włoskiego kina. Ciepłe smyczki i unosząca się harfa.'
  },
  {
    id: 'tuscany_garden',
    title: 'Toskański Ogród',
    subtitle: 'Ciepła Gitara & Akustyczna Wiolonczela',
    category: 'celebration',
    durationSeconds: 42,
    bpm: 92,
    key: 'G-Dur',
    icon: '🌿',
    description: 'Słoneczny, naturalny klimat ślubu plenerowego. Organiczny dźwięk strun i delikatny puls.'
  }
];

class SoundscapeGenerator {
  private activeAudioCtx: AudioContext | null = null;
  private activeSourceNode: AudioNode | null = null;
  private activeAnalyser: AnalyserNode | null = null;
  private isPreviewPlaying = false;
  private currentPlayingId: string | null = null;

  public getPlayingPresetId(): string | null {
    return this.isPreviewPlaying ? this.currentPlayingId : null;
  }

  public getAnalyser(): AnalyserNode | null {
    return this.activeAnalyser;
  }

  /**
   * Convert an AudioBuffer to standard 16-bit PCM WAV Blob
   */
  public bufferToWaveBlob(buffer: AudioBuffer): Blob {
    const numOfChan = buffer.numberOfChannels;
    const length = buffer.length * numOfChan * 2 + 44;
    const out = new DataView(new ArrayBuffer(length));
    const channels: Float32Array[] = [];
    let sampleRate = buffer.sampleRate;
    let offset = 0;
    let pos = 0;

    function setUint16(data: number) {
      out.setUint16(pos, data, true);
      pos += 2;
    }

    function setUint32(data: number) {
      out.setUint32(pos, data, true);
      pos += 4;
    }

    // RIFF chunk descriptor
    setUint32(0x46464952); // "RIFF"
    setUint32(length - 8); // file length - 8
    setUint32(0x45564157); // "WAVE"

    // FMT sub-chunk
    setUint32(0x20746d66); // "fmt "
    setUint32(16); // subchunk1size (16 for PCM)
    setUint16(1); // audio format (1 = PCM)
    setUint16(numOfChan);
    setUint32(sampleRate);
    setUint32(sampleRate * 2 * numOfChan); // byte rate
    setUint16(numOfChan * 2); // block align
    setUint16(16); // bits per sample

    // Data sub-chunk
    setUint32(0x61746164); // "data"
    setUint32(length - pos - 4); // chunk length

    for (let i = 0; i < buffer.numberOfChannels; i++) {
      channels.push(buffer.getChannelData(i));
    }

    while (offset < buffer.length) {
      for (let i = 0; i < numOfChan; i++) {
        let sample = Math.max(-1, Math.min(1, channels[i][offset]));
        sample = (0.5 + sample < 0 ? sample * 32768 : sample * 32767) | 0;
        out.setInt16(pos, sample, true);
        pos += 2;
      }
      offset++;
    }

    return new Blob([out.buffer], { type: 'audio/wav' });
  }

  /**
   * Synthesize a soundscape into an AudioBuffer using OfflineAudioContext
   */
  public async renderPresetToBuffer(presetId: string, durationSec?: number): Promise<AudioBuffer> {
    const preset = SOUNDSCAPE_PRESETS.find(p => p.id === presetId) || SOUNDSCAPE_PRESETS[0];
    const duration = durationSec || preset.durationSeconds;
    const sampleRate = 44100;
    const offlineCtx = new OfflineAudioContext(2, sampleRate * duration, sampleRate);

    const masterGain = offlineCtx.createGain();
    masterGain.gain.setValueAtTime(0.75, 0);
    // Smooth master fade in and fade out
    masterGain.gain.setValueAtTime(0.001, 0);
    masterGain.gain.exponentialRampToValueAtTime(0.75, 2.5);
    masterGain.gain.setValueAtTime(0.75, duration - 3.5);
    masterGain.gain.exponentialRampToValueAtTime(0.001, duration);
    masterGain.connect(offlineCtx.destination);

    // Reverb simulation using delay + filter network
    const delay = offlineCtx.createDelay();
    delay.delayTime.value = 0.38;
    const delayFeedback = offlineCtx.createGain();
    delayFeedback.gain.value = 0.45;
    const delayFilter = offlineCtx.createBiquadFilter();
    delayFilter.type = 'lowpass';
    delayFilter.frequency.value = 2400;

    delay.connect(delayFeedback);
    delayFeedback.connect(delayFilter);
    delayFilter.connect(delay);
    delayFilter.connect(masterGain);

    if (preset.id === 'golden_hour_piano') {
      // F-Major romantic chord progression: F -> Am -> Dm -> Bb
      const chords = [
        [174.61, 220.00, 261.63, 349.23], // F, A, C, F
        [220.00, 261.63, 329.63, 440.00], // A, C, E, A
        [146.83, 220.00, 261.63, 293.66], // D, A, C, D
        [116.54, 233.08, 293.66, 349.23]  // Bb, D, F, Bb
      ];

      const barLen = (60 / preset.bpm) * 4; // ~3.33s per chord
      let t = 0;
      let chordIdx = 0;

      while (t < duration - 2) {
        const chord = chords[chordIdx % chords.length];
        chordIdx++;

        // Warm Pad Drone
        chord.forEach((freq, noteIdx) => {
          const osc = offlineCtx.createOscillator();
          osc.type = noteIdx === 0 ? 'triangle' : 'sine';
          osc.frequency.setValueAtTime(freq, t);

          const gain = offlineCtx.createGain();
          gain.gain.setValueAtTime(0.001, t);
          gain.gain.exponentialRampToValueAtTime(0.08 / (noteIdx + 1), t + 1.2);
          gain.gain.setValueAtTime(0.07 / (noteIdx + 1), t + barLen - 0.8);
          gain.gain.exponentialRampToValueAtTime(0.001, t + barLen);

          osc.connect(gain);
          gain.connect(masterGain);
          gain.connect(delay);

          osc.start(t);
          osc.stop(t + barLen);
        });

        // Delicate Piano Arpeggio Notes
        chord.forEach((freq, noteIdx) => {
          const noteTime = t + 0.4 + noteIdx * 0.7;
          if (noteTime < duration - 1) {
            const pianoOsc = offlineCtx.createOscillator();
            pianoOsc.type = 'triangle';
            pianoOsc.frequency.setValueAtTime(freq * 2, noteTime);

            const pianoGain = offlineCtx.createGain();
            pianoGain.gain.setValueAtTime(0.001, noteTime);
            pianoGain.gain.exponentialRampToValueAtTime(0.12, noteTime + 0.04);
            pianoGain.gain.exponentialRampToValueAtTime(0.001, noteTime + 1.8);

            pianoOsc.connect(pianoGain);
            pianoGain.connect(masterGain);
            pianoGain.connect(delay);

            pianoOsc.start(noteTime);
            pianoOsc.stop(noteTime + 1.9);
          }
        });

        t += barLen;
      }
    } else if (preset.id === 'altar_procession') {
      // Ceremony bells and ethereal harmonic church pads
      const chords = [
        [130.81, 196.00, 261.63, 329.63, 523.25], // C Major
        [174.61, 261.63, 349.23, 440.00, 698.46], // F Major
        [196.00, 246.94, 293.66, 392.00, 783.99], // G Major
        [146.83, 220.00, 261.63, 329.63, 523.25]  // A Minor
      ];

      let t = 0;
      let chordIdx = 0;
      const barLen = 5.0;

      while (t < duration - 2) {
        const chord = chords[chordIdx % chords.length];
        chordIdx++;

        // Church Chimes (Tubular Bells)
        const chimeFreq = chord[chord.length - 1];
        const chimeOsc = offlineCtx.createOscillator();
        chimeOsc.type = 'sine';
        chimeOsc.frequency.setValueAtTime(chimeFreq, t);

        const chimeGain = offlineCtx.createGain();
        chimeGain.gain.setValueAtTime(0.001, t);
        chimeGain.gain.exponentialRampToValueAtTime(0.2, t + 0.02);
        chimeGain.gain.exponentialRampToValueAtTime(0.001, t + 4.5);

        chimeOsc.connect(chimeGain);
        chimeGain.connect(masterGain);
        chimeGain.connect(delay);
        chimeOsc.start(t);
        chimeOsc.stop(t + 4.6);

        // Warm ethereal choir/string pad
        chord.slice(0, 4).forEach((freq, idx) => {
          const osc = offlineCtx.createOscillator();
          osc.type = 'sine';
          osc.frequency.setValueAtTime(freq, t);

          const gain = offlineCtx.createGain();
          gain.gain.setValueAtTime(0.001, t);
          gain.gain.exponentialRampToValueAtTime(0.06, t + 1.8);
          gain.gain.setValueAtTime(0.05, t + barLen - 0.8);
          gain.gain.exponentialRampToValueAtTime(0.001, t + barLen);

          osc.connect(gain);
          gain.connect(masterGain);
          osc.start(t);
          osc.stop(t + barLen);
        });

        t += barLen;
      }
    } else {
      // First dance waltz / celebration rhythm
      const baseFreqs = [196.0, 246.94, 293.66, 392.0, 440.0];
      let t = 0;
      const beatLen = 60 / preset.bpm;

      while (t < duration - 2) {
        const freq = baseFreqs[Math.floor((t / (beatLen * 4)) % baseFreqs.length)];
        const osc = offlineCtx.createOscillator();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, t);

        const gain = offlineCtx.createGain();
        gain.gain.setValueAtTime(0.001, t);
        gain.gain.exponentialRampToValueAtTime(0.12, t + 0.05);
        gain.gain.exponentialRampToValueAtTime(0.001, t + beatLen * 1.5);

        osc.connect(gain);
        gain.connect(masterGain);
        gain.connect(delay);

        osc.start(t);
        osc.stop(t + beatLen * 1.6);

        t += beatLen;
      }
    }

    return await offlineCtx.startRendering();
  }

  /**
   * Play live preview directly through Web Audio
   */
  public async playPreview(presetId: string, onEnded?: () => void): Promise<void> {
    this.stopPreview();

    try {
      const buffer = await this.renderPresetToBuffer(presetId, 25);
      const AudioCtxClass = window.AudioContext || (window as any).webkitAudioContext;
      this.activeAudioCtx = new AudioCtxClass();
      
      const source = this.activeAudioCtx.createBufferSource();
      source.buffer = buffer;

      const analyser = this.activeAudioCtx.createAnalyser();
      analyser.fftSize = 128;
      this.activeAnalyser = analyser;

      source.connect(analyser);
      analyser.connect(this.activeAudioCtx.destination);

      source.onended = () => {
        this.isPreviewPlaying = false;
        this.currentPlayingId = null;
        this.activeAnalyser = null;
        if (onEnded) onEnded();
      };

      source.start(0);
      this.activeSourceNode = source;
      this.isPreviewPlaying = true;
      this.currentPlayingId = presetId;
    } catch (e) {
      console.error('Failed to preview soundscape:', e);
      this.stopPreview();
    }
  }

  public stopPreview(): void {
    if (this.activeSourceNode) {
      try {
        (this.activeSourceNode as AudioBufferSourceNode).stop();
        this.activeSourceNode.disconnect();
      } catch (e) {}
      this.activeSourceNode = null;
    }
    this.activeAnalyser = null;
    if (this.activeAudioCtx) {
      try {
        this.activeAudioCtx.close();
      } catch (e) {}
      this.activeAudioCtx = null;
    }
    this.isPreviewPlaying = false;
    this.currentPlayingId = null;
  }

  /**
   * Generates a WAV Blob from a preset or presetId
   */
  public async generateSoundscapeWav(presetOrId: SoundscapePreset | string, durationSeconds: number): Promise<Blob> {
    const id = typeof presetOrId === 'string' ? presetOrId : presetOrId.id;
    const buffer = await this.renderPresetToBuffer(id, durationSeconds);
    return this.bufferToWaveBlob(buffer);
  }

  /**
   * Generates a ready-to-use WAV File and Blob for timeline integration
   */
  public async generateTrackFile(presetId: string, durationSeconds?: number): Promise<{ file: File; blob: Blob; duration: number }> {
    const preset = SOUNDSCAPE_PRESETS.find(p => p.id === presetId) || SOUNDSCAPE_PRESETS[0];
    const duration = durationSeconds || preset.durationSeconds;
    const buffer = await this.renderPresetToBuffer(preset.id, duration);
    const blob = this.bufferToWaveBlob(buffer);
    const fileName = `${preset.title.replace(/\s+/g, '_')}_${preset.key}.wav`;
    const file = new File([blob], fileName, { type: 'audio/wav', lastModified: Date.now() });

    return { file, blob, duration };
  }
}

export const soundscapeGenerator = new SoundscapeGenerator();
