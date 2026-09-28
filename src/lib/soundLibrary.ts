export type StoryMood = 'high_quality' | 'romantic' | 'energetic' | 'cinematic' | 'modern' | 'nostalgic';

export interface SoundGenre {
  id: string;
  name: string;
  description: string;
  moodId: StoryMood;
  bpm: number;
  instrumentation: string;
  badge: string;
  audioProfile: {
    oscType: OscillatorType;
    chordProgressions: number[][]; // Array of frequency arrays
    chordLength: number; // Duration of each chord in seconds
    arpeggioSpeed?: number; // Speed of note arpeggiation
    bassEnhance?: boolean; // Add sub-bass or rhythm bass
  };
}

export const SOUND_LIBRARY: Record<StoryMood, SoundGenre[]> = {
  high_quality: [
    {
      id: 'high_quality_native',
      name: 'Oryginalny Dźwięk & Własny Głos',
      description: 'Czysty dźwięk z nagrania wideo bez sztucznego podkładu',
      moodId: 'high_quality',
      bpm: 80,
      instrumentation: 'Oryginał',
      badge: 'Naturalny',
      audioProfile: {
        oscType: 'sine',
        chordProgressions: [],
        chordLength: 2.0
      }
    }
  ],
  romantic: [
    {
      id: 'piano_ballad',
      name: 'Piano & Strings Ballad',
      description: 'Czułe akordy fortepianu z tłem smyczkowym',
      moodId: 'romantic',
      bpm: 72,
      instrumentation: 'Fortepian + Wiolonczela',
      badge: 'Klasyka Miłości',
      audioProfile: {
        oscType: 'sine',
        chordProgressions: [
          [164.81, 196.00, 246.94, 329.63], // Em7
          [130.81, 164.81, 196.00, 261.63], // Cmaj7
          [196.00, 246.94, 293.66, 392.00], // Gmaj
          [146.83, 220.00, 293.66, 369.99]  // Dmaj
        ],
        chordLength: 3.8,
        arpeggioSpeed: 0.12
      }
    },
    {
      id: 'romantic_jazz',
      name: 'Romantic Jazz Lounge',
      description: 'Ciepły jazz klubowy z akordami maj7 i 9th',
      moodId: 'romantic',
      bpm: 80,
      instrumentation: 'Fortepian Jazzowy + Kontrabas',
      badge: 'Jazz Club',
      audioProfile: {
        oscType: 'triangle',
        chordProgressions: [
          [130.81, 164.81, 196.00, 246.94, 293.66], // Cmaj9
          [110.00, 138.59, 164.81, 196.00, 246.94], // A7alt / Am9
          [146.83, 174.61, 220.00, 261.63, 329.63], // Dm9
          [98.00, 123.47, 146.83, 174.61, 220.00]   // G13
        ],
        chordLength: 3.2,
        arpeggioSpeed: 0.08,
        bassEnhance: true
      }
    },
    {
      id: 'soft_acoustic',
      name: 'Soft Acoustic Duo',
      description: 'Kameralna gitara akustyczna i wiolonczela',
      moodId: 'romantic',
      bpm: 76,
      instrumentation: 'Gitara Akustyczna + Wiolonczela',
      badge: 'Kameralny',
      audioProfile: {
        oscType: 'sine',
        chordProgressions: [
          [146.83, 220.00, 293.66, 369.99], // D
          [110.00, 164.81, 220.00, 277.18], // A
          [123.47, 146.83, 220.00, 293.66], // Bm
          [130.81, 164.81, 196.00, 261.63]  // G
        ],
        chordLength: 3.5,
        arpeggioSpeed: 0.15
      }
    },
    {
      id: 'classical_waltz',
      name: 'Classical Viennese Waltz',
      description: 'Dostojny walc wiedeński na pierwszy taniec',
      moodId: 'romantic',
      bpm: 88,
      instrumentation: 'Orkiestra Smyczkowa + Harfa',
      badge: 'Walc',
      audioProfile: {
        oscType: 'sine',
        chordProgressions: [
          [130.81, 164.81, 196.00, 261.63], // C
          [146.83, 174.61, 220.00, 293.66], // Dm
          [98.00, 123.47, 146.83, 196.00],  // G
          [130.81, 164.81, 196.00, 261.63]  // C
        ],
        chordLength: 2.8,
        arpeggioSpeed: 0.10
      }
    }
  ],
  energetic: [
    {
      id: 'pop_dance',
      name: 'Pop Dance Party',
      description: 'Chwytliwy, nowoczesny bit klubowo-weselny',
      moodId: 'energetic',
      bpm: 124,
      instrumentation: 'Synth Bass + Brass + Beat',
      badge: 'Hit Parkietu',
      audioProfile: {
        oscType: 'sawtooth',
        chordProgressions: [
          [174.61, 220.00, 261.63, 349.23], // F
          [196.00, 246.94, 293.66, 392.00], // G
          [110.00, 164.81, 220.00, 261.63], // Am
          [130.81, 164.81, 196.00, 261.63]  // C
        ],
        chordLength: 2.0,
        arpeggioSpeed: 0.05,
        bassEnhance: true
      }
    },
    {
      id: 'jazz_swing',
      name: 'Jazz Swing & Big Band',
      description: 'Energiczny swing z pełną sekcją dętą',
      moodId: 'energetic',
      bpm: 135,
      instrumentation: 'Big Band Brass + Kontrabas + Swing Drums',
      badge: 'Big Band',
      audioProfile: {
        oscType: 'triangle',
        chordProgressions: [
          [174.61, 220.00, 261.63, 311.13], // F7
          [146.83, 185.00, 220.00, 261.63], // D7
          [196.00, 233.08, 293.66, 349.23], // Gm7
          [130.81, 164.81, 196.00, 233.08]  // C7
        ],
        chordLength: 1.8,
        arpeggioSpeed: 0.04,
        bassEnhance: true
      }
    },
    {
      id: 'funk_groove',
      name: 'Funk & Disco Groove',
      description: 'Pulsujący bas i szalony rytm lata 70/80',
      moodId: 'energetic',
      bpm: 118,
      instrumentation: 'Slap Bass + Rhythm Guitar + Brass',
      badge: 'Disco Funk',
      audioProfile: {
        oscType: 'square',
        chordProgressions: [
          [164.81, 196.00, 246.94, 293.66], // Em7
          [110.00, 138.59, 164.81, 220.00], // A7
          [174.61, 220.00, 261.63, 329.63], // Fmaj7
          [123.47, 155.56, 185.00, 220.00]  // B7
        ],
        chordLength: 2.1,
        arpeggioSpeed: 0.06,
        bassEnhance: true
      }
    },
    {
      id: 'party_rock',
      name: 'Party Rock Anthem',
      description: 'Mocna sekcja rytmiczna z rockowym wykopem',
      moodId: 'energetic',
      bpm: 128,
      instrumentation: 'Gitary Elektryczne + Drums Drive',
      badge: 'Rock Party',
      audioProfile: {
        oscType: 'sawtooth',
        chordProgressions: [
          [110.00, 164.81, 220.00, 261.63], // Am
          [174.61, 220.00, 261.63, 349.23], // F
          [130.81, 164.81, 196.00, 261.63], // C
          [196.00, 246.94, 293.66, 392.00]  // G
        ],
        chordLength: 1.9,
        arpeggioSpeed: 0.05,
        bassEnhance: true
      }
    }
  ],
  cinematic: [
    {
      id: 'cinematic_epic',
      name: 'Cinematic Epic Orchestral',
      description: 'Hollywoodzki zwiastun symfoniczny z potężnymi smyczkami',
      moodId: 'cinematic',
      bpm: 90,
      instrumentation: 'Orkiestra Symfoniczna + Bębny Marszowe',
      badge: 'Hollywood',
      audioProfile: {
        oscType: 'sine',
        chordProgressions: [
          [73.42, 146.83, 174.61, 220.00, 293.66],  // Dm
          [58.27, 116.54, 174.61, 233.08, 293.66],  // Bb
          [49.00, 98.00, 146.83, 196.00, 293.66],   // Gm
          [55.00, 110.00, 164.81, 220.00, 277.18]   // A
        ],
        chordLength: 4.8,
        arpeggioSpeed: 0.18,
        bassEnhance: true
      }
    },
    {
      id: 'piano_cinematic',
      name: 'Cinematic Emotional Piano',
      description: 'Wzruszające, solowe pianino z tłem orkiestrowym',
      moodId: 'cinematic',
      bpm: 78,
      instrumentation: 'Grand Piano + Subtelne Smyczki',
      badge: 'Emocjonalny',
      audioProfile: {
        oscType: 'sine',
        chordProgressions: [
          [130.81, 164.81, 196.00, 246.94], // Cmaj7
          [110.00, 164.81, 220.00, 261.63], // Am
          [174.61, 220.00, 261.63, 329.63], // Fmaj7
          [196.00, 246.94, 293.66, 392.00]  // G
        ],
        chordLength: 4.2,
        arpeggioSpeed: 0.14
      }
    },
    {
      id: 'ambient_atmospheric',
      name: 'Atmospheric Film Soundscape',
      description: 'Przestrzenne, głębokie i tajemnicze brzmienie kinowe',
      moodId: 'cinematic',
      bpm: 65,
      instrumentation: 'Pad Syntezatorowy + Przestrzenny Reverb',
      badge: 'Soundscape',
      audioProfile: {
        oscType: 'sine',
        chordProgressions: [
          [65.41, 130.81, 164.81, 196.00, 246.94], // Cmaj7 low
          [55.00, 110.00, 164.81, 220.00, 261.63], // Am low
          [43.65, 87.31, 130.81, 174.61, 220.00],  // F low
          [49.00, 98.00, 146.83, 196.00, 246.94]   // G low
        ],
        chordLength: 5.5,
        arpeggioSpeed: 0.25,
        bassEnhance: true
      }
    },
    {
      id: 'trailer_brass',
      name: 'Trailer Brass & Drums',
      description: 'Bębny orkiestrowe i mocna sekcja dęta',
      moodId: 'cinematic',
      bpm: 100,
      instrumentation: 'Sekcja Dęta Blaszana + Taiko Drums',
      badge: 'Zwiastun',
      audioProfile: {
        oscType: 'triangle',
        chordProgressions: [
          [82.41, 164.81, 196.00, 246.94], // Em
          [65.41, 130.81, 164.81, 196.00], // C
          [73.42, 146.83, 220.00, 293.66], // D
          [55.00, 110.00, 164.81, 220.00]  // Am
        ],
        chordLength: 3.2,
        arpeggioSpeed: 0.08,
        bassEnhance: true
      }
    }
  ],
  modern: [
    {
      id: 'indie_pop',
      name: 'Indie Pop Beat',
      description: 'Lekki teledyskowy rytm do kreacji na Instagram & TikTok',
      moodId: 'modern',
      bpm: 112,
      instrumentation: 'Elektroniczny Beat + Bright Keys',
      badge: 'TikTok / Reel',
      audioProfile: {
        oscType: 'sawtooth',
        chordProgressions: [
          [174.61, 220.00, 261.63, 349.23], // F
          [196.00, 246.94, 293.66, 392.00], // G
          [110.00, 164.81, 220.00, 261.63], // Am
          [130.81, 164.81, 196.00, 261.63]  // C
        ],
        chordLength: 2.6,
        arpeggioSpeed: 0.08
      }
    },
    {
      id: 'deep_house',
      name: 'Deep House & Chill',
      description: 'Elegancja nowoczesnego klubu i głęboki bas',
      moodId: 'modern',
      bpm: 120,
      instrumentation: 'Sub-Bass + Pluck Synth + House Beat',
      badge: 'Deep House',
      audioProfile: {
        oscType: 'sine',
        chordProgressions: [
          [110.00, 164.81, 196.00, 261.63], // Am7
          [174.61, 220.00, 261.63, 329.63], // Fmaj7
          [130.81, 164.81, 196.00, 246.94], // Cmaj7
          [196.00, 246.94, 293.66, 349.23]  // G7
        ],
        chordLength: 2.2,
        arpeggioSpeed: 0.06,
        bassEnhance: true
      }
    },
    {
      id: 'synthwave',
      name: 'Synthwave / Retro Pop',
      description: 'Neony, syntezatory analogowe i lata 80.',
      moodId: 'modern',
      bpm: 110,
      instrumentation: 'Analog Synthesizer + Arpeggiator',
      badge: 'Lata 80.',
      audioProfile: {
        oscType: 'sawtooth',
        chordProgressions: [
          [130.81, 164.81, 196.00, 261.63], // C
          [110.00, 164.81, 220.00, 261.63], // Am
          [174.61, 220.00, 261.63, 349.23], // F
          [196.00, 246.94, 293.66, 392.00]  // G
        ],
        chordLength: 2.4,
        arpeggioSpeed: 0.05,
        bassEnhance: true
      }
    },
    {
      id: 'lofi_chill',
      name: 'Lo-Fi Chill Hop',
      description: 'Relaksujący, ciepły bit ze spróbkowanym fortepianem',
      moodId: 'modern',
      bpm: 85,
      instrumentation: 'Lo-Fi Drums + Rhodes Piano',
      badge: 'Lo-Fi',
      audioProfile: {
        oscType: 'triangle',
        chordProgressions: [
          [130.81, 164.81, 196.00, 246.94, 293.66], // Cmaj9
          [110.00, 164.81, 196.00, 246.94],        // Am7
          [174.61, 220.00, 261.63, 329.63],        // Fmaj7
          [146.83, 185.00, 220.00, 261.63]         // D7
        ],
        chordLength: 3.5,
        arpeggioSpeed: 0.12
      }
    }
  ],
  nostalgic: [
    {
      id: 'acoustic_folk',
      name: 'Acoustic Folk & Country',
      description: 'Ciepła gitara, ukulele i skrzypce w słońcu',
      moodId: 'nostalgic',
      bpm: 95,
      instrumentation: 'Gitara Akustyczna + Ukulele + Skrzypce',
      badge: 'Folk & Country',
      audioProfile: {
        oscType: 'triangle',
        chordProgressions: [
          [130.81, 164.81, 196.00, 261.63], // C
          [174.61, 220.00, 261.63, 349.23], // F
          [110.00, 164.81, 220.00, 261.63], // Am
          [196.00, 246.94, 293.66, 392.00]  // G
        ],
        chordLength: 3.2,
        arpeggioSpeed: 0.10
      }
    },
    {
      id: 'vintage_jazz',
      name: 'Vintage Vinyl Jazz Trio',
      description: 'Kameralne trio jazzowe grające retro standardy',
      moodId: 'nostalgic',
      bpm: 82,
      instrumentation: 'Piano Jazzowe + Kontrabas + Szczoteczki',
      badge: 'Retro Jazz',
      audioProfile: {
        oscType: 'sine',
        chordProgressions: [
          [130.81, 164.81, 196.00, 246.94], // Cmaj7
          [110.00, 138.59, 164.81, 220.00], // A7
          [146.83, 174.61, 220.00, 261.63], // Dm7
          [98.00, 123.47, 146.83, 196.00]   // G7
        ],
        chordLength: 3.4,
        arpeggioSpeed: 0.09,
        bassEnhance: true
      }
    },
    {
      id: 'boho_ambient',
      name: 'Boho Chillout & Ethno',
      description: 'Etniczne instrumenty strunowe i organiczne perkusjonalia',
      moodId: 'nostalgic',
      bpm: 88,
      instrumentation: 'Sitar/Kora + Djembe + Flauta',
      badge: 'Boho Ethno',
      audioProfile: {
        oscType: 'sine',
        chordProgressions: [
          [146.83, 220.00, 293.66, 369.99], // D
          [130.81, 164.81, 196.00, 261.63], // C
          [196.00, 246.94, 293.66, 392.00], // G
          [110.00, 164.81, 220.00, 261.63]  // Am
        ],
        chordLength: 3.6,
        arpeggioSpeed: 0.14
      }
    },
    {
      id: 'retro_ballad',
      name: '70s/80s Retro Love Ballad',
      description: 'Ciepłe popowe brzmienie złotej ery muzyki miłosnej',
      moodId: 'nostalgic',
      bpm: 78,
      instrumentation: 'Warm Electric Piano + Vintage Strings',
      badge: 'Retro 70s/80s',
      audioProfile: {
        oscType: 'sine',
        chordProgressions: [
          [146.83, 185.00, 220.00, 293.66], // D
          [123.47, 146.83, 220.00, 293.66], // Bm
          [174.61, 220.00, 261.63, 349.23], // F
          [196.00, 246.94, 293.66, 392.00]  // G
        ],
        chordLength: 3.8,
        arpeggioSpeed: 0.11
      }
    }
  ]
};

export function getGenresForMood(mood: StoryMood): SoundGenre[] {
  return SOUND_LIBRARY[mood] || SOUND_LIBRARY.romantic;
}

export function getDefaultGenreForMood(mood: StoryMood): SoundGenre {
  const genres = getGenresForMood(mood);
  return genres[0];
}

export function getGenreById(genreId: string): SoundGenre | undefined {
  for (const moodKey in SOUND_LIBRARY) {
    const genre = SOUND_LIBRARY[moodKey as StoryMood].find(g => g.id === genreId);
    if (genre) return genre;
  }
  return undefined;
}

// Synthesis function to play or render ambient music according to genre audio profile
export function playSynthesizedGenreMusic(
  audioCtx: AudioContext,
  masterGain: GainNode,
  genreId: string,
  totalDurationSec: number
) {
  const genre = getGenreById(genreId);
  const profile = genre?.audioProfile || SOUND_LIBRARY.romantic[0].audioProfile;

  const chordProgressions = profile.chordProgressions;
  const chordLength = profile.chordLength;
  const oscType = profile.oscType;
  const arpeggioSpeed = profile.arpeggioSpeed || 0.1;

  const numChords = Math.ceil(totalDurationSec / chordLength) + 1;

  for (let c = 0; c < numChords; c++) {
    const chordTime = audioCtx.currentTime + c * chordLength;
    const notes = chordProgressions[c % chordProgressions.length];

    // Main chord notes
    notes.forEach((freq, noteIdx) => {
      const osc = audioCtx.createOscillator();
      const noteGain = audioCtx.createGain();

      osc.type = noteIdx === 0 ? 'sine' : oscType;
      osc.frequency.setValueAtTime(freq, chordTime);

      const noteStart = chordTime + noteIdx * arpeggioSpeed;
      noteGain.gain.setValueAtTime(0.0001, noteStart);
      const peakGain = 0.22 / notes.length;
      noteGain.gain.exponentialRampToValueAtTime(peakGain, noteStart + arpeggioSpeed * 2);
      noteGain.gain.exponentialRampToValueAtTime(0.0001, noteStart + chordLength * 0.95);

      osc.connect(noteGain);
      noteGain.connect(masterGain);

      osc.start(noteStart);
      osc.stop(noteStart + chordLength);
    });

    // Optional rhythmic bass line for energetic or modern genres
    if (profile.bassEnhance) {
      const rootFreq = notes[0] / 2; // Octave lower
      const bassOsc = audioCtx.createOscillator();
      const bassGain = audioCtx.createGain();

      bassOsc.type = 'triangle';
      bassOsc.frequency.setValueAtTime(rootFreq, chordTime);

      bassGain.gain.setValueAtTime(0.0001, chordTime);
      bassGain.gain.exponentialRampToValueAtTime(0.18, chordTime + 0.05);
      bassGain.gain.exponentialRampToValueAtTime(0.0001, chordTime + chordLength * 0.8);

      bassOsc.connect(bassGain);
      bassGain.connect(masterGain);

      bassOsc.start(chordTime);
      bassOsc.stop(chordTime + chordLength);
    }
  }
}
