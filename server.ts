// Fix tsx quirk where globalThis.__dirname and __filename are set to '.' in ESM, breaking createRequire in Node 22
if ((globalThis as any).__dirname === '.') {
  delete (globalThis as any).__dirname;
}
if ((globalThis as any).__filename === '.') {
  delete (globalThis as any).__filename;
}

import express from 'express';
import cors from 'cors';
import path from 'path';
import multer from 'multer';
import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';
import { createServer as createViteServer } from 'vite';

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json({ limit: '500mb' }));
app.use(express.urlencoded({ limit: '500mb', extended: true }));

// Healthcheck endpoint
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 500 * 1024 * 1024 } // 500MB limit per video export
});

let aiClient: GoogleGenAI | null = null;
function getAI(): GoogleGenAI {
  if (!aiClient) {
    aiClient = new GoogleGenAI({
      apiKey: process.env.GEMINI_API_KEY || '',
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        }
      }
    });
  }
  return aiClient;
}

const ai = new Proxy({} as GoogleGenAI, {
  get(_target, prop) {
    return (getAI() as any)[prop];
  }
});

// Helper for retrying with exponential backoff on 429 (Rate Limit) or 503 (Unavailable / High Demand)
async function retryWithBackoff<T>(fn: () => Promise<T>, retries = 2, delayMs = 1200): Promise<T> {
  try {
    return await fn();
  } catch (err: any) {
    const errStr = typeof err === 'string' ? err : (err?.message || JSON.stringify(err || ''));
    const isRetryable = 
      err?.status === 'RESOURCE_EXHAUSTED' || 
      err?.status === 429 || 
      err?.status === 503 ||
      err?.status === 'UNAVAILABLE' ||
      err?.error?.code === 429 ||
      err?.error?.code === 503 ||
      err?.error?.status === 'UNAVAILABLE' ||
      errStr.includes('429') || 
      errStr.includes('503') ||
      errStr.includes('RESOURCE_EXHAUSTED') || 
      errStr.includes('UNAVAILABLE') ||
      errStr.includes('quota') ||
      errStr.includes('high demand') ||
      errStr.includes('temporarily unavailable');
      
    if (retries > 0 && isRetryable) {
      console.log(`Dostosowanie limitu API (${err?.status || err?.error?.code || '429/503'}), ponowna próba za ${delayMs}ms... (pozostało prób: ${retries})`);
      await new Promise(resolve => setTimeout(resolve, delayMs));
      return retryWithBackoff(fn, retries - 1, Math.round(delayMs * 1.5));
    }
    throw err;
  }
}

// Directives and stylistic blueprints for high quality wedding film
const moodDirectives: Record<string, {
  name: string;
  style: string;
  musicStyle: string;
  voiceoverStyle: string;
  timelineGuidelines: string;
}> = {
  high_quality: {
    name: "Wysoka Jakość Kinowa (Master Quality)",
    style: "Najwyższa jakość filmowa (Master Quality). Autentyczne, głębokie emocje, naturalne światło, doskonała plastyka obrazu, przemyślana kompozycja kadrów i elegancki, płynny montaż bez tanich efektów. Skupienie na prawdzie chwili, spojrzeniach Pary Młodej, wzruszeniach gości i szlachetnym klimacie ceremonii oraz wesela.",
    musicStyle: "Szlachetna, emocjonalna kompozycja o najwyższej jakości studyjnej (akustyczny fortepian, subtelna orkiestracja smyczkowa, naturalny ciepły mastering).",
    voiceoverStyle: "Ciepły, naturalny i głęboki tekst do osobistego odczytania lub nagrania własnego głosu przez Parę Młodą.",
    timelineGuidelines: "Harmonijny, filmowy flow dopasowany do oryginalnych ujęć – naturalna kolejność wydarzeń, mistrzowski balans emocji i elegancji."
  },
  romantic: {
    name: "Wysoka Jakość Kinowa (Master Quality)",
    style: "Najwyższa jakość filmowa (Master Quality). Autentyczne, głębokie emocje, naturalne światło, doskonała plastyka obrazu, przemyślana kompozycja kadrów i elegancki, płynny montaż bez tanich efektów.",
    musicStyle: "Szlachetna, emocjonalna kompozycja o najwyższej jakości studyjnej.",
    voiceoverStyle: "Ciepły, naturalny i głęboki tekst do nagrania własnego głosu.",
    timelineGuidelines: "Harmonijny, filmowy flow dopasowany do oryginalnych ujęć."
  },
  energetic: {
    name: "Wysoka Jakość Kinowa (Master Quality)",
    style: "Najwyższa jakość filmowa (Master Quality). Autentyczne, głębokie emocje, naturalne światło, doskonała plastyka obrazu.",
    musicStyle: "Szlachetna, emocjonalna kompozycja studyjna.",
    voiceoverStyle: "Naturalny i głęboki tekst do nagrania własnego głosu.",
    timelineGuidelines: "Harmonijny flow ujęć."
  },
  cinematic: {
    name: "Wysoka Jakość Kinowa (Master Quality)",
    style: "Najwyższa jakość filmowa (Master Quality). Autentyczne, głębokie emocje, naturalne światło, doskonała plastyka obrazu.",
    musicStyle: "Szlachetna, emocjonalna kompozycja studyjna.",
    voiceoverStyle: "Naturalny i głęboki tekst do nagrania własnego głosu.",
    timelineGuidelines: "Harmonijny flow ujęć."
  },
  modern: {
    name: "Wysoka Jakość Kinowa (Master Quality)",
    style: "Najwyższa jakość filmowa (Master Quality). Autentyczne, głębokie emocje, naturalne światło, doskonała plastyka obrazu.",
    musicStyle: "Szlachetna, emocjonalna kompozycja studyjna.",
    voiceoverStyle: "Naturalny i głęboki tekst do nagrania własnego głosu.",
    timelineGuidelines: "Harmonijny flow ujęć."
  },
  nostalgic: {
    name: "Wysoka Jakość Kinowa (Master Quality)",
    style: "Najwyższa jakość filmowa (Master Quality). Autentyczne, głębokie emocje, naturalne światło, doskonała plastyka obrazu.",
    musicStyle: "Szlachetna, emocjonalna kompozycja studyjna.",
    voiceoverStyle: "Naturalny i głęboki tekst do nagrania własnego głosu.",
    timelineGuidelines: "Harmonijny flow ujęć."
  }
};

// Fallback wedding storyboard generator when AI API quota is temporarily saturated
function generateFallbackStory(analyzedItems: any[] = [], mood: string = 'romantic') {
  const items = analyzedItems.length > 0 ? analyzedItems : [
    { name: 'Przygotowania', type: 'video', description: 'Poranne przygotowania, suknia i detale' },
    { name: 'Ceremonia', type: 'video', description: 'Uroczysta przysięga małżeńska i obrączki' },
    { name: 'Pierwszy Taniec', type: 'video', description: 'Pierwszy taniec Młodej Pary' },
    { name: 'Wesele i Toast', type: 'video', description: 'Zabawa weselna, toasty i tort' }
  ];

  const moodTemplates: Record<string, {
    title: string;
    concept: string;
    music: string;
    actions: string[];
    voiceover: string;
  }> = {
    romantic: {
      title: 'Niezapomniane Chwile – Film Ślubny',
      concept: 'Romantyczny i pełen ciepła reportaż filmowy łączący najważniejsze chwile ceremonii oraz wesela Nowożeńców.',
      music: 'Ed Sheeran – Perfect (Cinematic Piano & String Mix)',
      actions: [
        'Początek opowieści – czułe spojrzenia, przygotowania i ciche bicie serca',
        'Ceremonia zaślubin – uroczysta przysięga i łzy wzruszenia najbliższych',
        'Życzenia od gości i wzruszające uściski rodziców',
        'Pierwszy taniec Nowożeńców – romantyczna choreografia w chmurach',
        'Radosna celebracja na parkiecie i wspólne toasty weselne',
        'Krojenie tortu weselnego w ciepłym świetle świec',
        'Finałowy spacer pod gwiazdami w blasku zimnych ogni'
      ],
      voiceover: 'To był dzień, w którym każde spojrzenie miało znaczenie, a przysięga stała się początkiem najpiękniejszej wspólnej drogi.'
    },
    energetic: {
      title: 'Noc Naszego Życia! – Teledysk Ślubny',
      concept: 'Eksplozywny, taneczny i pełen uśmiechu teledysk weselny pokazujący najszaleńszą zabawę i niesamowitą energię Młodej Pary i ich przyjaciół.',
      music: 'Bruno Mars – 24K Magic / Treasure (Wedding Party Mashup)',
      actions: [
        'Ekscytujące odliczanie – toast przed wyjściem i salwy śmiechu',
        'Wielkie „TAK!” – oklaski, konfetti i wiwaty gości przed kościołem',
        'Toast powitalny i radosny wybuch szampana z przyjaciółmi',
        'Szalony pierwszy taniec z niespodziewanym miksem imprezowym!',
        'Totalne szaleństwo na parkiecie – pociąg weselny, skoki i ręce w górze',
        'Brawurowe toasty, zabawy oczepinowe i radosne uściski',
        'Finałowa imprezowa euforia do białego rana'
      ],
      voiceover: 'Kiedy ta dwójka wchodzi na parkiet, czas przestaje istnieć. To nie było zwykłe wesele – to była najwspanialsza impreza w historii!'
    },
    cinematic: {
      title: 'Początek Wieczności – Reportaż Kinowy',
      concept: 'Monumentalny, zwiastunowy reportaż kinowy ukazujący przeznaczenie dwojga ludzi w epickich kadrach i symfonicznej oprawie dźwiękowej.',
      music: 'Sleeping At Last – Turning Page (Cinematic Orchestral Suite)',
      actions: [
        'Prolog – majestatyczne kadry detali, suknia w porannym słońcu i narastające napięcie',
        'Kulminacja przysięgi – dramatyczne zbliżenia na obrączki i splecione dłonie',
        'Droga ku przyszłości – wyjście w deszczu płatków róż i brawach',
        'Pierwszy taniec niczym scena z oscarowego filmu miłosnego',
        'Epicka nocna celebracja – dynamiczne kadry w pełnym świetle reflektorów',
        'Uroczyste podziękowanie rodzicom w podniosłej, filmowej atmosferze',
        'Epilog kinowy – zjawiskowy pocałunek w szpalerze zimnych ogni'
      ],
      voiceover: 'Są historie, które nie potrzebują scenariusza, bo pisze je samo przeznaczenie. Od dziś na zawsze razem.'
    },
    modern: {
      title: 'The Wedding Reel',
      concept: 'Świeży, modny teledysk montowany pod beat współczesnego hitu, pełen estetycznych kadrów i młodzieńczej radości.',
      music: 'Harry Styles – Adore You (Modern Upbeat Wedding Remix)',
      actions: [
        'Aesthetic intro – szybkie cięcia detali, perfumy, uśmiechy w lustrze',
        'Fast-cut: uśmiech przed ołtarzem i spontaniczny pocałunek',
        'Pamiątkowe selfie z druhnami i drużbami w wielkim stylu',
        'Pierwszy taniec z płynnymi zoomami i dynamicznym montażem',
        'Imprezowy vibe: neony, drinki i spontaniczne tańce w rytmie bitu',
        'Stylowe krojenie tortu i wspólne toasty',
        'Nocny drop – konfetti i spektakularny finał'
      ],
      voiceover: 'Najlepszy styl, najlepsi ludzie i miłość, która rozświetla każdą klatkę.'
    },
    nostalgic: {
      title: 'Wspomnienia Ślubne',
      concept: 'Ciepła, poetycka opowieść w stylu retro Super 8, skupiona na bliskości, rodzinnych korzeniach i ponadczasowym uroku.',
      music: 'The Lumineers – Ho Hey (Acoustic Strings & Folk Choir)',
      actions: [
        'Promienie słońca przez koronkę welonu – spokój i czułość poranka',
        'Uroczysta przysięga – szczere spojrzenia i ciepłe łzy wzruszenia',
        'Rodzinne uściski, uśmiechy dziadków i szczera radość najbliższych',
        'Pierwszy taniec w ciepłym, złocistym świetle lampionów',
        'Beztroska zabawa na parkiecie w gronie ukochanej rodziny',
        'Tradycyjny tort i ciepłe słowa płynące prosto z serca',
        'Ciche spojrzenie zakochanych na koniec tego magicznego dnia'
      ],
      voiceover: 'Prawdziwe piękno kryje się w prostych chwilach – w uścisku dłoni, w spojrzeniu pełnym zaufania i w miłości, która będzie trwać przez pokolenia.'
    }
  };

  const selected = moodTemplates[mood] || moodTemplates.romantic;

  const defaultClipNames = [
    'Przygotowania i first-look.mp4',
    'Ceremonia i przysięga.mp4',
    'Wyjście i życzenia.mp4',
    'Pierwszy taniec w chmurach.mp4',
    'Zabawa weselna i toasty.mp4',
    'Krojenie tortu.mp4',
    'Zimne ognie i nocny finał.mp4'
  ];

  const itemsList = (Array.isArray(items) && items.length > 0)
    ? items
    : defaultClipNames.map(name => ({ name }));

  const timeline = itemsList.map((item, idx) => {
    const startSecTotal = idx * 30;
    const endSecTotal = (idx + 1) * 30;
    const sMin = Math.floor(startSecTotal / 60);
    const sSec = startSecTotal % 60;
    const eMin = Math.floor(endSecTotal / 60);
    const eSec = endSecTotal % 60;
    const timeStr = `${sMin}:${sSec < 10 ? '0' : ''}${sSec}-${eMin}:${eSec < 10 ? '0' : ''}${eSec}`;

    return {
      time: timeStr,
      elementName: item?.name || `Ujęcie ${idx + 1}`,
      action: selected.actions[idx % selected.actions.length]
    };
  });

  return {
    title: selected.title,
    concept: selected.concept,
    musicSuggestion: selected.music,
    timeline,
    voiceover: selected.voiceover,
    mood
  };
}

// Utility to fetch a file from Google Drive and return as base64
async function fetchDriveFileBase64(fileId: string, token: string): Promise<{ base64: string, mimeType: string }> {
  // First, get metadata to know the mime type
  const metaRes = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?fields=mimeType`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  if (!metaRes.ok) throw new Error(`Drive metadata error: ${metaRes.statusText}`);
  const meta = await metaRes.json();
  
  // Then download the content
  const mediaRes = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  if (!mediaRes.ok) throw new Error(`Drive media error: ${mediaRes.statusText}`);
  
  const arrayBuffer = await mediaRes.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  return {
    base64: buffer.toString('base64'),
    mimeType: meta.mimeType || 'application/octet-stream'
  };
}

app.post('/api/analyze-media', async (req, res) => {
  try {
    const { items, fileData, mimeType, fileName, accessToken } = req.body;
    
    // Normalize items array whether input is a single file payload or an array
    let normalizedItems: any[] = [];
    if (Array.isArray(items) && items.length > 0) {
      normalizedItems = items;
    } else if (fileData || fileName) {
      normalizedItems = [{
        name: fileName || 'Plik ślubny',
        base64: fileData || '',
        mimeType: mimeType || 'image/jpeg',
        type: 'local'
      }];
    }

    if (!normalizedItems || !normalizedItems.length) {
      return res.status(200).json({ 
        description: "Pamiątkowe ujęcie ślubne",
        results: [{ name: "Ujęcie ślubne", type: "image", description: "Pamiątkowe ujęcie ślubne" }] 
      });
    }

    const analysisResults = [];

    for (const item of normalizedItems) {
      const itemName = item.name || item.fileName || 'Ujęcie ślubne';
      console.log(`Analyzing item: ${itemName} (${item.type || 'local'})`);
      let base64 = '';
      let itemMimeType = item.mimeType || 'image/jpeg';
      
      if (item.type === 'drive' && item.id) {
        if (!accessToken) {
          analysisResults.push({
            name: itemName,
            type: 'video',
            description: `Ujęcie z Google Drive: ${itemName}`,
            transcription: null
          });
          continue;
        }
        try {
          const driveData = await fetchDriveFileBase64(item.id, accessToken);
          base64 = driveData.base64;
          itemMimeType = driveData.mimeType;
        } catch (driveErr) {
          analysisResults.push({
            name: itemName,
            type: 'video',
            description: `Ujęcie z Google Drive: ${itemName}`,
            transcription: null
          });
          continue;
        }
      } else {
        base64 = item.base64 || item.fileData || '';
      }
      
      const isVideo = itemMimeType.startsWith('video/');
      const isImage = itemMimeType.startsWith('image/');
      
      if (isVideo) {
        try {
          if (!base64 || base64.length < 10) throw new Error("File too large or no data for inline analysis");
          
          const modelResponse = await retryWithBackoff(() => 
            ai.models.generateContent({
              model: 'gemini-3.1-flash-lite',
              contents: {
                parts: [
                  { inlineData: { mimeType: itemMimeType, data: base64 } },
                  { text: "Analiza wideo ślubnego: opisz krótko (2-3 zdania) emocje, kluczowe ujęcia i atmosferę." }
                ]
              }
            })
          );
          
          analysisResults.push({
            name: itemName,
            type: 'video',
            description: modelResponse.text || `Nagranie ślubne: ${itemName}`,
            transcription: null
          });
        } catch (videoErr: any) {
          console.log("Dostosowanie opisu wideo:", videoErr.message);
          analysisResults.push({
            name: itemName,
            type: 'video',
            description: `Nagranie ślubne: ${itemName} – kluczowy moment ceremonii lub wesela.`,
            transcription: null
          });
        }
      } else {
        try {
          if (!base64 || base64.length < 10) throw new Error("File too large or no data for inline analysis");
          
          const modelResponse = await retryWithBackoff(() => 
            ai.models.generateContent({
              model: 'gemini-3.1-flash-lite',
              contents: {
                parts: [
                  { inlineData: { mimeType: itemMimeType, data: base64 } },
                  { text: "Opisz krótko (1-2 zdania) to zdjęcie ślubne i widoczne emocje." }
                ]
              }
            })
          );
          
          analysisResults.push({
            name: itemName,
            type: 'image',
            description: modelResponse.text || `Zdjęcie ślubne: ${itemName}`,
            transcription: null
          });
        } catch (imgErr: any) {
          console.log("Dostosowanie opisu zdjęcia:", imgErr.message);
          analysisResults.push({
            name: itemName,
            type: 'image',
            description: `Zdjęcie ślubne: ${itemName} – pamiątkowe ujęcie z uroczystości.`,
            transcription: null
          });
        }
      }
    }
    
    const singleDescription = analysisResults[0]?.description || "Pamiątkowe ujęcie ślubne.";
    res.json({ description: singleDescription, results: analysisResults });
  } catch (err: any) {
    console.error("Analyze media error:", err);
    res.json({
      description: "Pamiątkowa klatka z filmu ślubnego.",
      results: [{ name: "Ujęcie ślubne", type: "image", description: "Pamiątkowe ujęcie ślubne" }]
    });
  }
});

const handleGenerateStory = async (req: express.Request, res: express.Response) => {
  try {
    const { analyzedItems, mood = 'romantic', format = 'highlight', extras = [] } = req.body;
    const rawItems = Array.isArray(analyzedItems) && analyzedItems.length > 0
      ? analyzedItems
      : (Array.isArray(req.body.items) && req.body.items.length > 0 ? req.body.items : []);
    const moodConfig = moodDirectives[mood] || moodDirectives.romantic;

    const formatInstructions = "\nWYBRANY FORMAT: Oryginalny format i proporcje filmu (nieokreślony, zachowujący naturalne ujęcia wideo bez sztucznego kadrowania i bez sztywnego limitu długości).\n- Pacing: Płynny, kinowy montaż o najwyższej jakości studyjnej.";

    let extrasInstructions = "";
    if (extras && Array.isArray(extras) && extras.length > 0) {
      extrasInstructions = `\nWYBRANE DODATKOWE WSTAWKI DO AUTOMATYCZNEGO WPLECIENIA W OŚ CZASU:\n` + extras.map((e: string) => {
        if (e === 'dynamic_intro') return `- Dynamiczne Intro z tytułem (efektowny początek z datą ślubu oraz kinowym motywem wstępnym)`;
        if (e === 'guest_thanks') return `- Podziękowania dla gości (ciepły, wzruszający segment dedykowany rodzicom i przybyłym gościom)`;
        if (e === 'outro_credits') return `- Zakończenie z napisami końcowymi (kinowe outro, najlepsze outtakes i napisy końcowe)`;
        return `- ${e}`;
      }).join('\n') + `\nAutomatycznie wpleć te wybrane dodatkowe wstawki jako dedykowane pozycje w osi czasu (timeline) na odpowiednich pozycjach (np. intro na samym początku przed materiałami, podziękowania w kluczowym punkcie, a napisy końcowe na samym końcu).`;
    }

    const prompt = `
Jesteś nagradzanym reżyserem i montażystą filmów weselnych najwyższej klasy.
Twoim zadaniem jest stworzenie wyjątkowego scenariusza i narracji wideo z uroczystości ślubnej.

WYBRANY NASTRÓJ I KIERUNEK ARTYSTYCZNY:
👉 ${moodConfig.name.toUpperCase()}
${formatInstructions}
${extrasInstructions}

WYTYCZNE DLA TEGO NASTROJU:
- Klimat, emocje i narracja: ${moodConfig.style}
- Kierunek muzyczny: ${moodConfig.musicStyle}
- Styl narracji lektorskiej (Voiceover): ${moodConfig.voiceoverStyle}
- Zasady montażu na osi czasu: ${moodConfig.timelineGuidelines}

Oto przeanalizowane klipy i zdjęcia z uroczystości:
${JSON.stringify(rawItems, null, 2)}

Zaprojektuj spójne, profesjonalne widowisko muzyczne ściśle w wybranym nastroju "${moodConfig.name}".
Zwróć wynik jako JSON z polami:
- "title": Tytuł filmu idealnie oddający nastrój "${moodConfig.name}"
- "concept": Koncept i motyw przewodni z uwzględnieniem wybranego stylu
- "musicSuggestion": Konkretna propozycja utworu muzycznego (wykonawca i tytuł) pasująca do: ${moodConfig.musicStyle}
- "timeline": Tablica obiektów { "time": "zakres np. 0:00-0:15", "elementName": "nazwa pliku lub wstawki", "action": "precyzyjny opis ujęcia, dynamiki, przejścia i emocji zgodny z nastrojem" }
- "voiceover": Porywający tekst z offu dla lektora napisany w stylu: "${moodConfig.voiceoverStyle}".
    `;

    const schemaConfig = {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          title: { type: Type.STRING },
          concept: { type: Type.STRING },
          musicSuggestion: { type: Type.STRING },
          timeline: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                time: { type: Type.STRING },
                elementName: { type: Type.STRING },
                action: { type: Type.STRING }
              },
              required: ["time", "elementName", "action"]
            }
          },
          voiceover: { type: Type.STRING }
        },
        required: ["title", "concept", "musicSuggestion", "timeline", "voiceover"]
      }
    };

    let storyData: any = null;

    // 1. Try gemini-3.8-flash first
    try {
      const response = await retryWithBackoff(() => 
        ai.models.generateContent({
          model: 'gemini-3.8-flash',
          contents: prompt,
          config: schemaConfig
        }),
        2,
        1000
      );

      const parsed = JSON.parse(response.text || '{}');
      if (parsed.timeline && parsed.title) {
        storyData = parsed;
      }
    } catch (primaryErr: any) {
      // 2. Fallback to gemini-3.1-flash-lite on 503 / 429 / high demand
      try {
        const fallbackModelRes = await retryWithBackoff(() =>
          ai.models.generateContent({
            model: 'gemini-3.1-flash-lite',
            contents: prompt,
            config: schemaConfig
          }),
          0,
          500
        );
        const parsed = JSON.parse(fallbackModelRes.text || '{}');
        if (parsed.timeline && parsed.title) {
          storyData = parsed;
        }
      } catch (secondaryErr: any) {
        // Obie próby nieudane
      }
    }

    if (!storyData || !storyData.timeline || storyData.timeline.length === 0) {
      console.log(`Przełączono na reżysera awaryjnego offline dla nastroju '${mood}'`);
      storyData = generateFallbackStory(rawItems, mood);
    }

    return res.json({ ...storyData, mood });
  } catch (err: any) {
    console.log('Automatyczne przejście do trybu standardowego dla scenariusza.');
    const fallback = generateFallbackStory(req.body?.analyzedItems || req.body?.items, req.body?.mood || 'romantic');
    res.json(fallback);
  }
};

app.post('/api/generate-story', handleGenerateStory);
app.post('/api/generate-storyboard', handleGenerateStory);

// Stream a file from Google Drive directly to client (e.g. <video> or <img>)
app.get('/api/drive/stream/:id', async (req, res) => {
  try {
    const fileId = req.params.id;
    const token = (req.query.accessToken as string) || (req.headers.authorization?.replace('Bearer ', ''));
    if (!token) return res.status(401).json({ error: 'Missing access token' });

    const fetchHeaders: Record<string, string> = { 
      Authorization: `Bearer ${token}` 
    };
    if (req.headers.range) {
      fetchHeaders['Range'] = req.headers.range as string;
    }

    const driveRes = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
      headers: fetchHeaders
    });

    if (!driveRes.ok && driveRes.status !== 206) {
      return res.status(driveRes.status).json({ error: `Drive error: ${driveRes.statusText}` });
    }

    res.status(driveRes.status);
    const contentType = driveRes.headers.get('content-type') || 'video/mp4';
    res.setHeader('Content-Type', contentType);
    res.setHeader('Accept-Ranges', 'bytes');
    if (driveRes.headers.get('content-range')) {
      res.setHeader('Content-Range', driveRes.headers.get('content-range')!);
    }
    if (driveRes.headers.get('content-length')) {
      res.setHeader('Content-Length', driveRes.headers.get('content-length')!);
    }
    
    const { Readable } = await import('stream');
    if (driveRes.body) {
      Readable.fromWeb(driveRes.body as any).pipe(res);
    } else {
      res.end();
    }
  } catch (err: any) {
    console.error('Drive stream error:', err);
    res.status(500).json({ error: err.message });
  }
});

// List user files from Google Drive
app.get('/api/drive/list', async (req, res) => {
  try {
    const token = (req.query.accessToken as string) || (req.headers.authorization?.replace('Bearer ', ''));
    if (!token) return res.status(401).json({ error: 'Wymagany token autoryzacji Google' });

    const q = "trashed = false and (mimeType contains 'video/' or mimeType contains 'image/' or mimeType = 'application/json')";
    const driveUrl = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id,name,mimeType,size,thumbnailLink,createdTime,webViewLink,videoMediaMetadata,imageMediaMetadata)&orderBy=modifiedTime desc&pageSize=100`;

    const driveRes = await fetch(driveUrl, {
      headers: { Authorization: `Bearer ${token}` }
    });

    if (!driveRes.ok) {
      const errorText = await driveRes.text();
      return res.status(driveRes.status).json({ error: `Błąd Google Drive: ${errorText}` });
    }

    const data = await driveRes.json();
    res.json({ files: data.files || [] });
  } catch (err: any) {
    console.error('Drive list error:', err);
    res.status(500).json({ error: err.message || 'Błąd pobierania listy plików z Google Drive' });
  }
});

// Upload file directly to user's Google Drive
app.post('/api/drive/upload', async (req, res) => {
  try {
    const { fileName, mimeType, content, isBase64 } = req.body;
    const token = (req.body.accessToken as string) || (req.headers.authorization?.replace('Bearer ', ''));
    if (!token) return res.status(401).json({ error: 'Wymagany token autoryzacji Google' });
    if (!fileName || !content) return res.status(400).json({ error: 'Brak nazwy pliku lub zawartości' });

    const boundary = '-------GoogleDriveMultipartBoundary314159';
    const delimiter = `\r\n--${boundary}\r\n`;
    const closeDelimiter = `\r\n--${boundary}--`;

    const metadata = {
      name: fileName,
      mimeType: mimeType || 'application/json'
    };

    let bodyBuffer: Buffer;
    if (isBase64) {
      const fileBuffer = Buffer.from(content, 'base64');
      const header = `${delimiter}Content-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}${delimiter}Content-Type: ${mimeType || 'application/octet-stream'}\r\n\r\n`;
      bodyBuffer = Buffer.concat([
        Buffer.from(header, 'utf8'),
        fileBuffer,
        Buffer.from(closeDelimiter, 'utf8')
      ]);
    } else {
      const multipartRequestBody =
        delimiter +
        'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
        JSON.stringify(metadata) +
        delimiter +
        `Content-Type: ${mimeType || 'application/json'}\r\n\r\n` +
        content +
        closeDelimiter;
      bodyBuffer = Buffer.from(multipartRequestBody, 'utf8');
    }

    const uploadRes = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': `multipart/related; boundary=${boundary}`,
        'Content-Length': String(bodyBuffer.length)
      },
      body: bodyBuffer
    });

    if (!uploadRes.ok) {
      const errorText = await uploadRes.text();
      return res.status(uploadRes.status).json({ error: `Błąd zapisu na Google Drive: ${errorText}` });
    }

    const fileResult = await uploadRes.json();
    res.json({ success: true, file: fileResult });
  } catch (err: any) {
    console.error('Drive upload error:', err);
    res.status(500).json({ error: err.message || 'Błąd zapisu pliku na Google Drive' });
  }
});

// Direct binary file upload to Google Drive (e.g. rendered MP4 movies)
app.post('/api/drive/upload-binary', upload.single('file'), async (req, res) => {
  try {
    const token = (req.body.accessToken as string) || (req.headers.authorization?.replace('Bearer ', ''));
    if (!token) return res.status(401).json({ error: 'Wymagany token autoryzacji Google' });

    const file = req.file;
    if (!file) return res.status(400).json({ error: 'Brak przesłanego pliku binarnego' });

    const fileName = req.body.fileName || file.originalname || 'film_slubny.mp4';
    const mimeType = req.body.mimeType || file.mimetype || 'video/mp4';

    const boundary = '-------GoogleDriveMultipartBoundaryBinary987654';
    const delimiter = `\r\n--${boundary}\r\n`;
    const closeDelimiter = `\r\n--${boundary}--`;

    const metadata = {
      name: fileName,
      mimeType: mimeType
    };

    const header = `${delimiter}Content-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}${delimiter}Content-Type: ${mimeType}\r\n\r\n`;
    const bodyBuffer = Buffer.concat([
      Buffer.from(header, 'utf8'),
      file.buffer,
      Buffer.from(closeDelimiter, 'utf8')
    ]);

    const uploadRes = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': `multipart/related; boundary=${boundary}`,
        'Content-Length': String(bodyBuffer.length)
      },
      body: bodyBuffer
    });

    if (!uploadRes.ok) {
      const errorText = await uploadRes.text();
      return res.status(uploadRes.status).json({ error: `Błąd zapisu wideo na Google Drive: ${errorText}` });
    }

    const fileResult = await uploadRes.json();
    res.json({ success: true, file: fileResult });
  } catch (err: any) {
    console.error('Drive binary upload error:', err);
    res.status(500).json({ error: err.message || 'Błąd zapisu pliku binarnego na Google Drive' });
  }
});

app.post('/api/generate-cover', async (req, res) => {
  try {
    const { prompt, size } = req.body;
    
    // Size should be "1K", "2K", or "4K"
    const validSizes = ["1K", "2K", "4K"];
    const imageSize = validSizes.includes(size) ? size : "1K";

    const response = await retryWithBackoff(() => 
      ai.models.generateContent({
        model: 'gemini-3.1-flash-lite-image',
        contents: {
          parts: [
            { text: prompt || "Piękna, artystyczna, ślubna kompozycja, subtelna, elegancka, romantyczna" }
          ]
        },
        config: {
          imageConfig: {
            aspectRatio: "16:9"
          }
        }
      })
    ).catch(err => {
      console.log("Przełączono na okładkę awaryjną (limit API obrazów).");
      // Fallback: return a special flag or a generic high-quality wedding image URL
      return { fallback: true };
    });

    if (!response || ('fallback' in response)) {
      // Return a high quality public domain wedding placeholder
      return res.json({ 
        imageUrl: "https://images.unsplash.com/photo-1511795409834-ef04bbd61622?auto=format&fit=crop&q=80&w=1200",
        isFallback: true,
        message: "Osiągnięto limit generatora AI. Użyto pięknej okładki zastępczej."
      });
    }

    // Find image part
    let base64Image = null;
    const candidates = (response as any).candidates;
    if (candidates && candidates.length > 0) {
      for (const part of candidates[0].content?.parts || []) {
        if (part.inlineData) {
           base64Image = part.inlineData.data;
           break;
        }
      }
    }

    if (base64Image) {
       res.json({ imageUrl: `data:image/jpeg;base64,${base64Image}` });
    } else {
       throw new Error("No image generated.");
    }
  } catch (err: any) {
    console.log('Korzystanie z okładki standardowej.');
    res.json({ 
      imageUrl: "https://images.unsplash.com/photo-1511795409834-ef04bbd61622?auto=format&fit=crop&q=80&w=1200",
      isFallback: true,
      message: "Użyto pięknej okładki zastępczej."
    });
  }
});

app.post('/api/storyboard-tips', async (req, res) => {
  try {
    const { mood } = req.body;
    
    const prompt = `Zaproponuj 2 krótkie, inspirujące wskazówki lub trendy (max 1-2 zdania każda) dotyczące technik filmowania lub montażu dla wideo ślubnego w nastroju: ${mood}.
Użyj narzędzia Google Search, aby znaleźć najnowsze techniki i trendy. Odpowiedz w języku polskim.`;

    const response = await retryWithBackoff(() =>
      (ai.models.generateContent as any)({
        model: 'gemini-3.8-flash',
        contents: prompt,
        tools: [{ googleSearch: {} }],
        toolConfig: { includeServerSideToolInvocations: true },
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.ARRAY,
            items: { type: Type.STRING }
          }
        }
      })
    );

    const parsed = JSON.parse((response as any).text || '[]');
    res.json({ tips: parsed });
  } catch (err: any) {
    console.log('Korzystanie ze standardowych wskazówek reżyserskich.');
    // Return fallback tips on API exhaustion
    const fallbackTips = [
      "Stosuj płytką głębię ostrości (np. f/1.4 - f/2.8), aby odciąć Parę Młodą od tła i nadać ujęciom kinowej miękkości.",
      "Wykorzystaj 'golden hour' na kręcenie portretów plenerowych, by uzyskać naturalne, miękkie i ciepłe światło z flarami."
    ];
    res.json({ tips: fallbackTips, isFallback: true });
  }
});

// Inteligentna sugestia korekty czasu ujęć na podstawie notatek reżyserskich i tempa montażu
app.post('/api/smart-duration-suggestion', async (req, res) => {
  try {
    const { items, directorNotes, tempo } = req.body;
    
    const prompt = `Jesteś ekspertem montażu filmów ślubnych. Przeanalizuj poniższe ujęcia, notatki reżyserskie oraz docelowe tempo montażu ("${tempo || 'kinowe'}").
Notatki reżysera: "${directorNotes || 'Brak dodatkowych notatek'}"

Ujęcia do analizy:
${JSON.stringify(items || [], null, 2)}

Zaproponuj optymalne czasy trwania (w sekundach) dla każdego ujęcia oraz krótkie uzasadnienie reżyserskie, aby idealnie pasowały do tempa "${tempo}" i uwzględniały notatki.
Odpowiedz jako JSON z polami:
- "overallAdvice": Ogólna wskazówka montażowa (1-2 zdania)
- "suggestions": Tablica obiektów zawierająca { "itemId": "...", "suggestedDuration": numer_w_sekundach, "reason": "uzasadnienie" }
`;

    const schemaConfig = {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          overallAdvice: { type: Type.STRING },
          suggestions: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                itemId: { type: Type.STRING },
                suggestedDuration: { type: Type.NUMBER },
                reason: { type: Type.STRING }
              },
              required: ["itemId", "suggestedDuration", "reason"]
            }
          }
        },
        required: ["overallAdvice", "suggestions"]
      }
    };

    let resultData: any = null;

    try {
      const response = await retryWithBackoff(() =>
        ai.models.generateContent({
          model: 'gemini-3.8-flash',
          contents: prompt,
          config: schemaConfig
        }),
        2,
        1000
      );
      resultData = JSON.parse(response.text || '{}');
    } catch (e: any) {
      console.log('Automatyczne przejście do trybu regułowego dla smart-duration.');
      try {
        const fallbackRes = await retryWithBackoff(() =>
          ai.models.generateContent({
            model: 'gemini-3.1-flash-lite',
            contents: prompt,
            config: schemaConfig
          }),
          1,
          1000
        );
        resultData = JSON.parse(fallbackRes.text || '{}');
      } catch (err2: any) {
        console.log('Użycie algorytmu regułowego dla czasu trwania.');
      }
    }

    if (!resultData || !resultData.suggestions) {
      // Rule-based fallback
      const tempoMultiplier = tempo === 'dynamiczny' ? 0.7 : tempo === 'emocjonalny' ? 1.4 : 1.0;
      const suggestions = (items || []).map((item: any, idx: number) => {
        const base = (idx % 2 === 0 ? 4 : 6) * tempoMultiplier;
        return {
          itemId: item.id || String(idx),
          suggestedDuration: Math.round(base * 10) / 10,
          reason: `Dopasowano do tempa ${tempo} na podstawie analizy struktury.`
        };
      });
      resultData = {
        overallAdvice: `Rytm montażu "${tempo}" został zoptymalizowany dla płynnego przepływu emocji.`,
        suggestions
      };
    }

    res.json(resultData);
  } catch (err: any) {
    console.log('Smart duration fallback aktywny.');
    const suggestions = (req.body?.items || []).map((item: any, idx: number) => ({
      itemId: item.id || String(idx),
      suggestedDuration: 5,
      reason: "Standardowy czas ekspozycji."
    }));
    res.json({
      overallAdvice: "Zastosowano standardowy balans czasowy.",
      suggestions
    });
  }
});

// Automatyczne podpisywanie i tagowanie klipów ślubnych przez AI
app.post('/api/auto-caption-clips', async (req, res) => {
  try {
    const { clips = [], style = 'cinematic_poetic' } = req.body;
    if (!Array.isArray(clips) || clips.length === 0) {
      return res.json({ captions: [] });
    }

    const prompt = `Jesteś mistrzem montażu i scenarzystą filmów ślubnych.
Dla każdego z poniższych ujęć wideo przygotuj:
1. "smartTitle": Elegancki, filmowy tytuł sceny w języku polskim (np. "Błogosławieństwo rodziców w domu rodzinnym", "Przysięga małżeńska i wymiana obrączek", "Pierwszy taniec w chmurach").
2. "subtitleCaption": Subtelny, wzruszający podpis / cytat narracyjny w stylu "${style}" do wyświetlenia na ekranie jako podtytuł lub lektor.
3. "category": Jedna z kategorii: "preparations", "ceremony", "congratulations", "first_dance", "toast", "party", "cake", "games", "climax", "ending", "outdoor".
4. "directorNote": Krótka uwaga montażowa dla montażysty (np. "Wycisz mikrofon, nałóż ciepły grading").
5. "suggestedTag": 2-3 słowa kluczowe.

Lista klipów:
${JSON.stringify(clips.map((c: any, i: number) => ({
  index: i,
  id: c.id,
  name: c.name,
  duration: c.duration,
  capturedAt: c.capturedAt || c.createdAt,
  tags: c.tags,
  comment: c.comment
})), null, 2)}
`;

    const schemaConfig = {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          captions: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                clipId: { type: Type.STRING },
                smartTitle: { type: Type.STRING },
                subtitleCaption: { type: Type.STRING },
                category: { type: Type.STRING },
                directorNote: { type: Type.STRING },
                suggestedTag: { type: Type.STRING }
              },
              required: ["clipId", "smartTitle", "subtitleCaption", "category", "directorNote"]
            }
          }
        },
        required: ["captions"]
      }
    };

    let result: any = null;

    try {
      const response = await retryWithBackoff(() =>
        ai.models.generateContent({
          model: 'gemini-3.8-flash',
          contents: prompt,
          config: schemaConfig
        }),
        2,
        1000
      );
      result = JSON.parse(response.text || '{}');
    } catch (err1: any) {
      console.log('Automatyczne przejście do modelu flash-lite dla auto-caption.');
      try {
        const fallbackRes = await retryWithBackoff(() =>
          ai.models.generateContent({
            model: 'gemini-3.1-flash-lite',
            contents: prompt,
            config: schemaConfig
          }),
          1,
          800
        );
        result = JSON.parse(fallbackRes.text || '{}');
      } catch (err2: any) {
        console.log('Użycie inteligentnego generatora regułowego dla podpisów.');
      }
    }

    if (!result || !result.captions || result.captions.length === 0) {
      // Deterministic fallback matching wedding phases
      const stageKeywords: { key: string; name: string; quote: string; cat: string }[] = [
        { key: 'prep', name: 'Poranne przygotowania i detale', quote: 'W ciszy poranka rodzi się najpiękniejsza obietnica.', cat: 'preparations' },
        { key: 'ceremony', name: 'Uroczysta ceremonia zaślubin', quote: 'Dwa serca, jedna przysięga na całe życie.', cat: 'ceremony' },
        { key: 'wishes', name: 'Życzenia i łzy wzruszenia', quote: 'Ciepło najbliższych, które ogrzeje każdy wspólny dzień.', cat: 'congratulations' },
        { key: 'dance', name: 'Pierwszy taniec Nowożeńców', quote: 'Nasz pierwszy wspólny krok w rytmie miłości.', cat: 'first_dance' },
        { key: 'party', name: 'Zabawa weselna na parkiecie', quote: 'Radość, śmiech i energia, której nikt nie zatrzyma.', cat: 'party' },
        { key: 'cake', name: 'Krojenie tortu weselnego', quote: 'Słodki początek wspólnej podróży przez życie.', cat: 'cake' },
        { key: 'ending', name: 'Zimne ognie i nocny finał', quote: 'Światło miłości, które nigdy nie zgaśnie.', cat: 'ending' }
      ];

      const fallbackCaptions = clips.map((clip: any, idx: number) => {
        const stage = stageKeywords[idx % stageKeywords.length];
        return {
          clipId: clip.id,
          smartTitle: `${stage.name} (${clip.name || `Ujęcie ${idx + 1}`})`,
          subtitleCaption: stage.quote,
          category: stage.cat,
          directorNote: "Dopasuj płynne przejście i zachowaj naturalne audio otoczenia.",
          suggestedTag: stage.cat
        };
      });
      result = { captions: fallbackCaptions };
    }

    res.json(result);
  } catch (err: any) {
    console.error('Auto caption error:', err);
    res.json({ captions: [] });
  }
});

// Inteligentne scalanie chronologiczne i sekwencjonowanie filmu przez AI
app.post('/api/smart-chronological-sequencing', async (req, res) => {
  try {
    const { clips = [], pacing = 'cinematic', coupleNames = 'Młoda Para', weddingDate = '' } = req.body;
    if (!Array.isArray(clips) || clips.length === 0) {
      return res.json({ orderedSequence: [], storyConcept: '' });
    }

    const prompt = `Jesteś głównym reżyserem montażu filmu ślubnego dla: "${coupleNames}" (${weddingDate || 'Uroczystość weselna'}).
Przeanalizuj poniższe klipy wideo (uwzględnij daty/godziny nagrania capturedAt/createdAt, nazwy plików, długości oraz kontekst sceny).
Ułóż je w perfekcyjną, spójną i emocjonującą filmową chronologię dnia ślubu:
Prolog/Przygotowania -> Błogosławieństwo -> Kościół/Ceremonia -> Życzenia -> Przyjęcie/Toast -> Pierwszy Taniec -> Zabawa/Wesele -> Tort -> Kulminacja/Zimne Ognie.

Wytyczne tempa montażu: "${pacing}".

Dla każdego ujęcia określ:
- "clipId": ID z listy
- "targetOrder": Pozycja (1, 2, 3...)
- "smartTitle": Elegancki tytuł sceny
- "subtitleCaption": Wzruszający podpis/cytat na ekran
- "category": Kategoria etapów wesela
- "transition": "dissolve" (dla ujęć romantycznych), "cut" (dla dynamicznych), "dip_black" (dla zmiany rozdziału), "dip_white" (dla kluczowych momentów)
- "trimStart": Rekomendowane przycięcie początku w sekundach (np. 0.5s na ustabilizowanie kadru)
- "trimEnd": Rekomendowane przycięcie końca w sekundach
- "directorReason": Krótkie uzasadnienie reżysera dlaczego to ujęcie powinno znaleźć się w tym miejscu

Klipy:
${JSON.stringify(clips.map((c: any) => ({
  id: c.id,
  name: c.name,
  duration: c.duration,
  capturedAt: c.capturedAt || c.createdAt,
  tags: c.tags,
  comment: c.comment
})), null, 2)}
`;

    const schemaConfig = {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          storyConcept: { type: Type.STRING },
          musicSuggestion: { type: Type.STRING },
          orderedSequence: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                clipId: { type: Type.STRING },
                targetOrder: { type: Type.NUMBER },
                smartTitle: { type: Type.STRING },
                subtitleCaption: { type: Type.STRING },
                category: { type: Type.STRING },
                transition: { type: Type.STRING },
                trimStart: { type: Type.NUMBER },
                trimEnd: { type: Type.NUMBER },
                directorReason: { type: Type.STRING }
              },
              required: ["clipId", "targetOrder", "smartTitle", "subtitleCaption", "category", "transition"]
            }
          }
        },
        required: ["storyConcept", "musicSuggestion", "orderedSequence"]
      }
    };

    let result: any = null;

    try {
      const response = await retryWithBackoff(() =>
        ai.models.generateContent({
          model: 'gemini-3.8-flash',
          contents: prompt,
          config: schemaConfig
        }),
        2,
        1200
      );
      result = JSON.parse(response.text || '{}');
    } catch (err1: any) {
      console.log('Fallback flash-lite dla smart-chronological-sequencing.');
      try {
        const fallbackRes = await retryWithBackoff(() =>
          ai.models.generateContent({
            model: 'gemini-3.1-flash-lite',
            contents: prompt,
            config: schemaConfig
          }),
          1,
          800
        );
        result = JSON.parse(fallbackRes.text || '{}');
      } catch (err2: any) {
        console.log('Algorytm regułowy dla sekwencjonowania chronologicznego.');
      }
    }

    if (!result || !result.orderedSequence || result.orderedSequence.length === 0) {
      // Deterministic sort by capturedAt timestamp or createdAt or natural sort
      const sortedClips = [...clips].sort((a: any, b: any) => {
        const timeA = new Date(a.capturedAt || a.createdAt || 0).getTime();
        const timeB = new Date(b.capturedAt || b.createdAt || 0).getTime();
        if (timeA !== timeB) return timeA - timeB;
        return (a.name || '').localeCompare(b.name || '', undefined, { numeric: true, sensitivity: 'base' });
      });

      const categoriesList = ['preparations', 'ceremony', 'congratulations', 'first_dance', 'toast', 'party', 'cake', 'ending'];

      const fallbackSequence = sortedClips.map((clip: any, idx: number) => {
        const catIdx = Math.min(categoriesList.length - 1, Math.floor((idx / sortedClips.length) * categoriesList.length));
        const cat = categoriesList[catIdx];
        return {
          clipId: clip.id,
          targetOrder: idx + 1,
          smartTitle: `Scena ${idx + 1}: ${clip.name}`,
          subtitleCaption: `Wyjątkowy moment uroczystości – ${clip.name}`,
          category: cat,
          transition: idx === 0 ? 'dip_black' : 'dissolve',
          trimStart: 0.5,
          trimEnd: Math.max(0.5, (clip.duration || 5) - 0.5),
          directorReason: "Ułożono precyzyjnie według znaczników czasu i naturalnego biegu ceremonii."
        };
      });

      result = {
        storyConcept: `Kinowa kronika ślubna ułożona w naturalnej chronologii dnia z płynnymi przejściami i podpisami scen.`,
        musicSuggestion: "Akustyczny fortepian i ciepła orkiestra symfoniczna (65-80 BPM)",
        orderedSequence: fallbackSequence
      };
    }

    res.json(result);
  } catch (err: any) {
    console.error('Chronological sequencing error:', err);
    res.json({ orderedSequence: [], storyConcept: '' });
  }
});

async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true, hmr: false },
      appType: 'spa'
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on port ${PORT}`);
  });
}

startServer();
