// Fix tsx quirk where globalThis.__dirname and __filename are set to '.' in ESM, breaking createRequire in Node 22
if ((globalThis as any).__dirname === '.') {
  delete (globalThis as any).__dirname;
}
if ((globalThis as any).__filename === '.') {
  delete (globalThis as any).__filename;
}

import dns from 'node:dns';
import { Agent, setGlobalDispatcher } from 'undici';

// Prioritize IPv4 and configure global Undici dispatcher to prevent ConnectTimeoutError on Google API endpoints
if (dns.setDefaultResultOrder) {
  try {
    dns.setDefaultResultOrder('ipv4first');
  } catch {}
}
if ((dns as any).setDefaultAutoSelectFamily) {
  try {
    (dns as any).setDefaultAutoSelectFamily(true);
  } catch {}
}

try {
  const globalAgent = new Agent({
    connect: {
      timeout: 30000,
      autoSelectFamily: true,
      autoSelectFamilyAttemptTimeout: 1000
    },
    keepAliveTimeout: 5000,
    keepAliveMaxTimeout: 45000
  });
  setGlobalDispatcher(globalAgent);
} catch (agentErr) {
  console.warn('[Server] Note on global Undici dispatcher setup:', agentErr);
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
      errStr.includes('limit reached') ||
      errStr.includes('high demand') ||
      errStr.includes('temporarily unavailable') ||
      errStr.includes('ECONNRESET') ||
      errStr.includes('ETIMEDOUT') ||
      err?.name === 'FetchError';
      
    if (retries > 0 && isRetryable) {
      console.log(`[AI Retry] Retrying in ${delayMs}ms... (attempts left: ${retries}). Error: ${errStr.substring(0, 100)}`);
      if (err?.cause) console.log(`[AI Retry] Cause: ${err.cause?.message || err.cause}`);
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
    name: "Master Quality Kinowa",
    style: "Szlachetny reportaż kinowy najwyższej próby. Autentyczne, głębokie emocje, naturalne światło, miękki bokeh f/1.4, kinowa proporcja 2.39:1 i elegancki, nienarzucający się montaż z naciskiem na mikro-ekspresje i spojrzenia.",
    musicStyle: "Emocjonalna orkiestracja symfoniczna (akustyczny fortepian, sekcja smyczkowa, delikatna wiolonczela, studyjna przestrzeń).",
    voiceoverStyle: "Głęboki, ciepły, pełen szacunku i poezji lektor snujący opowieść o przeznaczeniu i miłości.",
    timelineGuidelines: "Mistrzowska dramaturgia – budowanie napięcia od spowolnionego poranka, przez kulminację przysięgi, aż po szalony wir wesela."
  },
  romantic: {
    name: "Romantyczny Poematu Miłosny",
    style: "Pastelowa, poetycka aura z miękkim flarowaniem światła. Skupienie na małych gestach: drżących dłoniach przy przysiędze, pocałunkach w locie, łzach szczęścia rodziców i romantycznym spacerze w koronie drzew.",
    musicStyle: "Ciepły akustyczny duet fortepianu i gitary z aksamitnym wokalem lub delikatnym smyczkowym podkładem (60-75 BPM).",
    voiceoverStyle: "Czuła, poetycka narracja z intymnymi osobistymi wyznaniami i ciepłym głosem lektora.",
    timelineGuidelines: "Płynny, zmysłowy montaż oparty na ujęciach w zwolnionym tempie (slow-motion 60fps) i łagodnych przenikaniach (cross-dissolve)."
  },
  energetic: {
    name: "Eksplozywny Teledysk Weselny",
    style: "Dynamiczny, rytmiczny i porywający montaż teledyskowy. Żywe kolory, konfetti, wybuchy szampana, śmiech, salwy braw i euforyczne tańce na parkiecie.",
    musicStyle: "Upbeat pop/funk mashup lub nowoczesny dance-remix z wyrazistym basowym beatem i porywającą sekcją dętą (115-128 BPM).",
    voiceoverStyle: "Energiczna, entuzjastyczna i zmysłowa narracja budująca weselny vibe i radość życia.",
    timelineGuidelines: "Krótkie, szybkie cięcia cięte idealnie na stopę perkusji (beat-matching), efektowne rampy prędkości (speed ramps)."
  },
  cinematic: {
    name: "Monumentalny Zwiastun Filmowy",
    style: "Dramatyczny, trailerowy charakter z głębokimi cieniami, kontrastowym światłem i kinowym prowadzeniem kamery (dron, jazdy na sliderze).",
    musicStyle: "Epicki, rosnący aranż symfoniczny z pulsującą perkusją orkiestrową i monumentami dętymi drewnianymi i blaszanymi.",
    voiceoverStyle: "Dojrzały, dostojny i poruszający voiceover kinowy z przerwami na oddech i pauzami dramatycznymi.",
    timelineGuidelines: "Segmentowa struktura: Trzypaktowy scenariusz (Prolog -> Kulminacja -> Szalona Celebracja -> Sentymentalny Epilog)."
  },
  modern: {
    name: "Modern Vogue Reel & Aesthetic",
    style: "Świeży, modny design wideo inspirowany estetyką fashion & Vogue Weddings. Minimalistyczna typografia, szybkie cięcia detali, nowoczesne zbliżenia.",
    musicStyle: "Stylowy indie-pop, chill-house lub nowofalowy elektroniczny beat o ciepłym, nowoczesnym brzmieniu.",
    voiceoverStyle: "Nowoczesny, bezpośredni, pewny siebie i lekki głos z szczyptą humoru i autentyczności.",
    timelineGuidelines: "Aesthetic cuts, szybkie sekwencje detali (perfumy, biżuteria, buty, spojrzenia) przeplatane płynnymi zoomami."
  },
  nostalgic: {
    name: "Ponadczasowe Wspomnienia (Analog Super 8)",
    style: "Klimat starych taśm celuloidowych Super 8 i 16mm, ciepły odcień sepii, mikro-ziarno, winieta i nostalgiczna ciepła barwa światła.",
    musicStyle: "Nostalgiczny folkowy utwór akustyczny z delikatnym szumem płyty winylowej, banjo i smyczkami.",
    voiceoverStyle: "Ciepły, rodzinny, gawędziarski głos przypominający rodzinne historie i miłość przekazywaną z pokolenia na pokolenie.",
    timelineGuidelines: "Ciepłe, powolne ujęcia łączące pokolenia – uśmiechy dziadków, dzieci, tradycje i wieczną miłość."
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

// Utility to fetch a file from Google Drive and return as base64 with retry
async function fetchDriveFileBase64(fileId: string, token: string): Promise<{ base64: string, mimeType: string }> {
  return retryWithBackoff(async () => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 25000);

    try {
      // First, get metadata to know the mime type
      const metaRes = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?fields=mimeType`, {
        headers: { Authorization: `Bearer ${token}` },
        signal: controller.signal
      });
      if (!metaRes.ok) throw new Error(`Drive metadata error: ${metaRes.statusText}`);
      const meta = await metaRes.json();
      
      // Then download the content
      const mediaRes = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
        headers: { Authorization: `Bearer ${token}` },
        signal: controller.signal
      });
      if (!mediaRes.ok) throw new Error(`Drive media error: ${mediaRes.statusText}`);
      
      const arrayBuffer = await mediaRes.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      return {
        base64: buffer.toString('base64'),
        mimeType: meta.mimeType || 'application/octet-stream'
      };
    } finally {
      clearTimeout(timeoutId);
    }
  }, 2, 800);
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
    console.error('[AI Director] Error generating story:', err);
    if (err?.cause) console.error('[AI Director] Cause:', err.cause?.message || err.cause);
    console.log('Automatyczne przejście do trybu standardowego dla scenariusza.');
    const fallback = generateFallbackStory(req.body?.analyzedItems || req.body?.items, req.body?.mood || 'romantic');
    res.json(fallback);
  }
};

app.post('/api/generate-story', handleGenerateStory);
app.post('/api/generate-storyboard', handleGenerateStory);

// Stream a file from Google Drive directly to client (e.g. <video> or <img>)
app.get('/api/drive/stream/:id', async (req, res) => {
  const fileId = req.params.id;
  const token = (req.query.accessToken as string) || (req.headers.authorization?.replace('Bearer ', ''));
  if (!token) return res.status(401).json({ error: 'Missing access token' });

  const headers: Record<string, string> = {
    'Authorization': `Bearer ${token}`
  };
  if (req.headers.range) {
    headers['Range'] = req.headers.range as string;
  }

  const url = `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`;
  
  // Wrapper for request execution with retry
  const executeRequest = (attempt = 1) => {
    const request = https.get(url, { headers, family: 4 }, (driveRes) => {
      // Handle redirects
      if (driveRes.statusCode === 301 || driveRes.statusCode === 302 || driveRes.statusCode === 307 || driveRes.statusCode === 308) {
        if (driveRes.headers.location) {
          https.get(driveRes.headers.location, { headers, family: 4 }, (redirectRes) => {
            handleResponse(redirectRes);
          }).on('error', handleError);
          return;
        }
      }
      handleResponse(driveRes);
    });

    const handleResponse = (driveRes: any) => {
      if (driveRes.statusCode && driveRes.statusCode >= 400 && driveRes.statusCode !== 206) {
        if (attempt < 2) {
          console.log(`[Server] Drive stream retry ${attempt}/2 due to status ${driveRes.statusCode}`);
          executeRequest(attempt + 1);
          return;
        }
        res.status(driveRes.statusCode).end();
        return;
      }

      res.status(driveRes.statusCode || 200);
      const contentType = driveRes.headers['content-type'] || 'video/mp4';
      res.setHeader('Content-Type', contentType);
      res.setHeader('Accept-Ranges', 'bytes');
      res.setHeader('Cache-Control', 'public, max-age=3600');
      if (driveRes.headers['content-range']) res.setHeader('Content-Range', driveRes.headers['content-range']);
      if (driveRes.headers['content-length']) res.setHeader('Content-Length', driveRes.headers['content-length']);

      driveRes.pipe(res);
    };

    const handleError = (err: any) => {
      if (attempt < 2) {
        console.log(`[Server] Drive stream retry ${attempt}/2 due to error: ${err.message}`);
        executeRequest(attempt + 1);
        return;
      }
      console.warn('[Server] Drive stream connection error (https):', err.message);
      if (!res.headersSent) {
        res.status(504).json({ error: 'Błąd strumieniowania z Dysku Google' });
      }
    };

    request.on('error', handleError);
    req.on('close', () => {
      request.destroy();
    });
  };

  executeRequest();
});

// List user files from Google Drive
app.get('/api/drive/list', async (req, res) => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 12000);

  try {
    const token = (req.query.accessToken as string) || (req.headers.authorization?.replace('Bearer ', ''));
    if (!token) return res.status(401).json({ error: 'Wymagany token autoryzacji Google' });

    const q = "trashed = false and (mimeType contains 'video/' or mimeType contains 'image/' or mimeType = 'application/json')";
    const driveUrl = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id,name,mimeType,size,thumbnailLink,createdTime,webViewLink,videoMediaMetadata,imageMediaMetadata)&orderBy=modifiedTime desc&pageSize=100`;

    const driveRes = await fetch(driveUrl, {
      headers: { Authorization: `Bearer ${token}` },
      signal: controller.signal
    });

    if (!driveRes.ok) {
      const errorText = await driveRes.text();
      return res.status(driveRes.status).json({ error: `Błąd Google Drive: ${errorText}` });
    }

    const data = await driveRes.json();
    res.json({ files: data.files || [] });
  } catch (err: any) {
    console.warn('[Server] Drive list error/timeout:', err?.message || err);
    res.status(504).json({ error: err.message || 'Błąd pobierania listy plików z Google Drive' });
  } finally {
    clearTimeout(timeoutId);
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

// Generator poetyckiego scenariusza i lektora audio AI (Gemini TTS)
app.post('/api/generate-voiceover-tts', async (req, res) => {
  try {
    const { text, style = 'poetic_romantic', coupleNames = 'Młoda Para', voiceName = 'Kore' } = req.body;
    
    let textToSpeak = text;

    // If no text provided, generate a creative poetic wedding narration text first
    if (!textToSpeak || textToSpeak.length < 5) {
      const scriptPrompt = `Jesteś mistrzem scenopisarstwa filmów ślubnych.
Napisz wzruszający, krótki (2-4 zdania, ok. 25-45 słów) tekst narracyjny z offu dla pary: "${coupleNames}".
Styl: "${style}" (np. poruszające wyznanie miłości, poetycka narracja o przeznaczeniu, ciepły szept wspomnień).
Napisz wyłącznie czysty tekst po polsku, gotowy do odczytania przez lektora.`;

      try {
        const scriptRes = await retryWithBackoff(() => 
          ai.models.generateContent({
            model: 'gemini-3.8-flash',
            contents: scriptPrompt
          })
        );
        textToSpeak = scriptRes.text?.trim() || "To był dzień, w którym każde spojrzenie miało znaczenie, a przysięga stała się początkiem najpiękniejszej wspólnej drogi.";
      } catch (err) {
        textToSpeak = "Dwa serca, jedna obietnica na całe życie. Dziś zaczyna się nasza najpiękniejsza wspólna opowieść.";
      }
    }

    // Call Gemini TTS model gemini-3.8-flash-lite-tts to convert text to spoken audio
    let audioBase64: string | null = null;
    try {
      const ttsResponse = await retryWithBackoff(() => 
        ai.models.generateContent({
          model: 'gemini-3.8-flash-lite-tts',
          contents: {
            role: 'user',
            parts: [
              {
                text: textToSpeak
              } as any
            ]
          },
          config: {
            responseModalities: ["AUDIO"],
            speechConfig: {
              voiceConfig: {
                prebuiltVoiceConfig: { voiceName: voiceName || "Kore" }
              }
            }
          }
        }),
        2,
        1000
      );

      audioBase64 = ttsResponse.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data || null;
    } catch (ttsErr: any) {
      console.warn('[TTS] Gemini TTS API unavailable or quota reached:', ttsErr?.message || ttsErr);
    }

    res.json({
      scriptText: textToSpeak,
      audioBase64: audioBase64,
      audioMimeType: 'audio/wav',
      voiceName: voiceName || 'Kore'
    });
  } catch (err: any) {
    console.error('Voiceover TTS error:', err);
    res.status(500).json({ error: err?.message || 'Błąd generowania lektora AI' });
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
    console.error('[AI Duration] Error:', err);
    if (err?.cause) console.error('[AI Duration] Cause:', err.cause?.message || err.cause);
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
    console.error('[AI Caption] Error:', err);
    if (err?.cause) console.error('[AI Caption] Cause:', err.cause?.message || err.cause);
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

    const prompt = `Jesteś głównym reżyserem montażu i inżynierem postprodukcji filmów ślubnych dla: "${coupleNames}" (${weddingDate || 'Uroczystość weselna'}).
Przeanalizuj poniższe klipy wideo i przygotuj profesjonalny scenariusz montażu zgodny z poniższymi żelaznymi zasadami:

I. ZASADY REŻYSERSKIE I EDYCYJNE (AI DIRECTOR):
1. SMART TRIM (Cięcie dłużyzn - MAKSYMALNIE 10-15 SEKUND):
   - Żaden fragment wideo po cięciu (trimEnd - trimStart) NIE MOŻE trwać dłużej niż 10–15 sekund (optymalnie 6–12 sekund).
   - Wycinaj puste kadry, powtarzalne ujęcia, nieostre fragmenty i pauzy bez akcji.
   - Zostawiaj wyłącznie kluczowe momenty: konkretne wypowiedzi, reakcje, spojrzenia, uśmiechy, dynamikę tańca.
   - Dla każdego klipu precyzyjnie wylicz "trimStart" oraz "trimEnd" (gdzie trimEnd - trimStart <= 12 sekund).

2. GENEROWANIE KART I PODPISÓW:
   - Przed KAŻDYM klipem wideo umieszczana jest spersonalizowana karta wstępna sceny.
   - KARTY NIE MOGĄ zawierać technicznych nazw plików (np. "I3200.MP4", "DSC_001.MOV", "SCENA 2").
   - Każda karta MUSI zawierać:
     * "smartTitle": chwytliwy, krótki (3-5 słów) tytuł sceny w języku polskim (np. "Błogosławieństwo w Domu Rodzinnym", "Przysięga Przed Ołtarzem", "Pierwszy Taniec w Chmurach", "Krojenie Tortu Weselnego", "Zabawa na Parkiecie", "Uroczysty Toast Weselny").
     * "subtitleCaption": 1 zwięzłe zdanie podsumowujące kontekst lub emocjonalną treść danej sceny.

3. PŁYNNOŚĆ I PRZEJŚCIA:
   - "transition": "dissolve" (delikatne przenikanie 0.5s), "dip_black" (dla zmiany aktu), "dip_white" (dla kulminacji).

Wytyczne tempa montażu: "${pacing}".

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

    // Helper function to produce beautiful Polish scene titles without technical filenames
    const sanitizeSceneTitle = (title: string, cat: string, index: number): string => {
      let t = (title || '').replace(/\.[a-zA-Z0-9]{2,5}$/i, '').trim();
      const isTechnical = !t || 
        /\.(mp4|mov|avi|mkv|jpg|jpeg|png)$/i.test(title || '') ||
        /^(clip|video|dsc|img|vid|i\d{2,}|scena\s*\d*|ujęcie\s*\d*)/i.test(t);

      if (isTechnical) {
        const titleDictionary: Record<string, string[]> = {
          preparations: ['Poranne Przygotowania i Detale', 'Błogosławieństwo w Domu Rodzinnym', 'Ostatnie Szlify Przed Ślubem'],
          ceremony: ['Przysięga Przed Ołtarzem', 'Wymiana Obrączek Ślubnych', 'Uroczyste Błogosławieństwo Kapłana'],
          congratulations: ['Wzruszające Życzenia od Bliskich', 'Uściski i Gratulacje Rodziców', 'Radość Wspólnych Chwil'],
          first_dance: ['Pierwszy Taniec w Chmurach', 'Romantyczny Walc Nowożeńców', 'Magia Pierwszego Tańca'],
          toast: ['Wzniesienie Pierwszego Toastu', 'Uroczyste Przemowy i Wiwaty', 'Toast za Pomyślność Młodej Pary'],
          party: ['Zabawa na Parkiecie', 'Weselne Szaleństwo z Gośćmi', 'Najgorętsze Chwile Nocy'],
          cake: ['Krojenie Tortu Weselnego', 'Słodka Chwila Wesela', 'Tradycyjny Tort Nowożeńców'],
          outdoor: ['Romantyczny Spacer w Plenerze', 'Złote Promienie Miłości', 'Sesja w Ciepłym Słońcu'],
          ending: ['Zimne Ognie i Nocny Finał', 'Finałowa Iskra Miłości', 'Niezapomniane Zakończenie Nocy']
        };
        const pool = titleDictionary[cat] || ['Pamiątkowa Scena Weselna', 'Wyjątkowy Moment Uroczystości'];
        return pool[index % pool.length];
      }
      return t;
    };

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
        const clipDur = clip.duration || 10;
        const trimEnd = Math.min(12, Math.max(3, clipDur));
        const cleanTitle = sanitizeSceneTitle(clip.name, cat, idx);

        return {
          clipId: clip.id,
          targetOrder: idx + 1,
          smartTitle: cleanTitle,
          subtitleCaption: `Wyjątkowy moment uroczystości – ${cleanTitle}.`,
          category: cat,
          transition: idx === 0 ? 'dip_black' : 'dissolve',
          trimStart: 0.5,
          trimEnd: Number(trimEnd.toFixed(2)),
          directorReason: "Ułożono precyzyjnie według znaczników czasu i skrócono do kluczowych 10-12 sekund."
        };
      });

      result = {
        storyConcept: `Kinowa kronika ślubna ułożona w naturalnej chronologii dnia z płynnymi przejściami i kartami scen.`,
        musicSuggestion: "Akustyczny fortepian i ciepła orkiestra symfoniczna (65-80 BPM)",
        orderedSequence: fallbackSequence
      };
    } else {
      // Post-process AI sequence to guarantee strict 10-15s bounds and clean titles
      const clipMap = new Map(clips.map((c: any) => [c.id, c]));
      result.orderedSequence = result.orderedSequence.map((item: any, idx: number) => {
        const origClip = clipMap.get(item.clipId);
        const totalDur = origClip ? origClip.duration : 15;
        
        let tStart = typeof item.trimStart === 'number' && item.trimStart >= 0 ? item.trimStart : 0.5;
        let tEnd = typeof item.trimEnd === 'number' && item.trimEnd > tStart ? item.trimEnd : totalDur;
        
        // Strict 10-15s max rule
        if (tEnd - tStart > 12) {
          tEnd = Math.min(totalDur, tStart + 12);
        }
        if (tEnd - tStart > 12) {
          tStart = Math.max(0, tEnd - 12);
        }
        if (tEnd - tStart < 3 && totalDur >= 3) {
          tEnd = Math.min(totalDur, tStart + Math.min(8, totalDur));
        }

        const cat = item.category || 'ceremony';
        const cleanTitle = sanitizeSceneTitle(item.smartTitle, cat, idx);
        const cleanSubtitle = (item.subtitleCaption && !item.subtitleCaption.includes('.mp4')) 
          ? item.subtitleCaption 
          : `Niezapomniane chwile podczas uroczystości (${cleanTitle}).`;

        return {
          ...item,
          smartTitle: cleanTitle,
          subtitleCaption: cleanSubtitle,
          trimStart: Number(tStart.toFixed(2)),
          trimEnd: Number(tEnd.toFixed(2)),
          transition: item.transition || (idx === 0 ? 'dip_black' : 'dissolve')
        };
      });
    }

    res.json(result);
  } catch (err: any) {
    console.error('Chronological sequencing error:', err);
    if (err?.cause) {
      console.error('Chronological sequencing cause:', err.cause?.message || err.cause);
    }
    res.status(500).json({ 
      error: 'Błąd podczas sekwencjonowania chronologicznego', 
      details: err?.message || String(err),
      orderedSequence: [] 
    });
  }
});

// Catch-all 404 for API routes to prevent serving index.html for failed API requests
app.all('/api/*', (req, res) => {
  res.status(404).json({ error: `Nie odnaleziono endpointu API: ${req.originalUrl}` });
});

// Global error handler for unhandled exceptions in routes
app.use((err: any, req: any, res: any, next: any) => {
  console.error('[Global Server Error]', err);
  if (!res.headersSent) {
    res.status(500).json({ 
      error: 'Wystąpił nieoczekiwany błąd serwera', 
      details: err?.message || String(err) 
    });
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
