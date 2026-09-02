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

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 100 * 1024 * 1024 } // 100MB limit per file
});

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
  httpOptions: {
    headers: {
      'User-Agent': 'aistudio-build',
    }
  }
});

// Helper for retrying with exponential backoff on 429 (Rate Limit) or 503 (Unavailable)
async function retryWithBackoff<T>(fn: () => Promise<T>, retries = 2, delayMs = 1500): Promise<T> {
  try {
    return await fn();
  } catch (err: any) {
    const isRetryable = 
      err?.status === 'RESOURCE_EXHAUSTED' || 
      err?.status === 429 || 
      err?.status === 503 ||
      err?.status === 'UNAVAILABLE' ||
      err?.message?.includes('429') || 
      err?.message?.includes('503') ||
      err?.message?.includes('RESOURCE_EXHAUSTED') || 
      err?.message?.includes('UNAVAILABLE') ||
      err?.message?.includes('quota') ||
      err?.message?.includes('high demand');
      
    if (retries > 0 && isRetryable) {
      console.log(`Dostosowanie limitu API (${err?.status || '429'}), ponowna próba za ${delayMs}ms... (pozostało prób: ${retries})`);
      await new Promise(resolve => setTimeout(resolve, delayMs));
      return retryWithBackoff(fn, retries - 1, Math.round(delayMs * 1.5));
    }
    throw err;
  }
}

// Fallback wedding storyboard generator when AI API quota is temporarily saturated
function generateFallbackStory(analyzedItems: any[] = []) {
  const items = analyzedItems.length > 0 ? analyzedItems : [
    { name: 'Przygotowania', type: 'video', description: 'Poranne przygotowania, suknia i detale' },
    { name: 'Ceremonia', type: 'video', description: 'Uroczysta przysięga małżeńska i obrączki' },
    { name: 'Pierwszy Taniec', type: 'video', description: 'Romantyczny pierwszy taniec Młodej Pary' },
    { name: 'Wesele i Toast', type: 'video', description: 'Zabawa weselna, toasty i tort' }
  ];

  const actions = [
    'Początek opowieści – czułe spojrzenia, przygotowania i ekscytacja',
    'Ceremonia zaślubin – uroczysta przysięga i wymiana obrączek',
    'Życzenia od gości i wzruszające gratulacje najbliższych',
    'Pierwszy taniec Joanny i Piotra – romantyczna choreografia',
    'Radosna zabawa na parkiecie i wspólne toasty weselne',
    'Krojenie tortu weselnego i podziękowania dla rodziców',
    'Finałowa nocna sceneria i podsumowanie tego wspaniałego dnia'
  ];

  const timeline = items.map((item, idx) => {
    const startSecTotal = idx * 30;
    const endSecTotal = (idx + 1) * 30;
    const sMin = Math.floor(startSecTotal / 60);
    const sSec = startSecTotal % 60;
    const eMin = Math.floor(endSecTotal / 60);
    const eSec = endSecTotal % 60;
    const timeStr = `${sMin}:${sSec < 10 ? '0' : ''}${sSec}-${eMin}:${eSec < 10 ? '0' : ''}${eSec}`;

    return {
      time: timeStr,
      elementName: item.name || `Scena ${idx + 1}`,
      action: actions[idx % actions.length]
    };
  });

  return {
    title: 'Joanna & Piotr – Niezapomniane Chwile',
    concept: 'Romantyczny i pełen ciepła reportaż filmowy łączący najważniejsze chwile ceremonii oraz wesela Joanny i Piotra.',
    musicSuggestion: 'Ed Sheeran – Perfect (Cinematic Piano & String Mix)',
    timeline,
    voiceover: 'To był dzień, w którym każde spojrzenie miało znaczenie, a przysięga stała się początkiem najpiękniejszej wspólnej drogi Joanny i Piotra.'
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
    const { items, accessToken } = req.body;
    // items is an array of { type: 'drive', id: string, name: string } or { type: 'local', base64: string, mimeType: string, name: string }
    
    if (!items || !items.length) {
      return res.status(400).json({ error: 'No items provided' });
    }

    const analysisResults = [];

    for (const item of items) {
      console.log(`Analyzing item: ${item.name} (${item.type})`);
      let base64 = '';
      let mimeType = '';
      
      if (item.type === 'drive') {
        if (!accessToken) throw new Error("Missing access token for Drive file");
        const driveData = await fetchDriveFileBase64(item.id, accessToken);
        base64 = driveData.base64;
        mimeType = driveData.mimeType;
      } else {
        base64 = item.base64;
        mimeType = item.mimeType;
      }
      
      const isVideo = mimeType.startsWith('video/');
      const isImage = mimeType.startsWith('image/');
      
      if (isVideo) {
        // Analyze video with single consolidated prompt to reduce token count and prevent 429
        try {
          const modelResponse = await retryWithBackoff(() => 
            ai.models.generateContent({
              model: 'gemini-3.1-flash-lite',
              contents: {
                parts: [
                  { inlineData: { mimeType, data: base64 } },
                  { text: "Analiza wideo ślubnego Joanny i Piotra: opisz krótko (2-3 zdania) emocje, kluczowe ujęcia i atmosferę. Jeśli słychać przysięgę lub ważne słowa, zacytuj je." }
                ]
              }
            })
          );
          
          analysisResults.push({
            name: item.name,
            type: 'video',
            description: modelResponse.text || `Nagranie ślubne: ${item.name}`,
            transcription: null
          });
        } catch (videoErr: any) {
          console.log("Dostosowanie opisu wideo (limit API lub rozmiar):", videoErr.message);
          analysisResults.push({
            name: item.name,
            type: 'video',
            description: `Nagranie ślubne: ${item.name} – kluczowy moment ceremonii lub wesela Joanny i Piotra.`,
            transcription: null
          });
        }
        await new Promise(r => setTimeout(r, 600));
      } else if (isImage) {
        try {
          const modelResponse = await retryWithBackoff(() => 
            ai.models.generateContent({
              model: 'gemini-3.1-flash-lite',
              contents: {
                parts: [
                  { inlineData: { mimeType, data: base64 } },
                  { text: "Opisz krótko (1-2 zdania) to zdjęcie ślubne i widoczne emocje." }
                ]
              }
            })
          );
          
          analysisResults.push({
            name: item.name,
            type: 'image',
            description: modelResponse.text || `Zdjęcie ślubne: ${item.name}`,
            transcription: null
          });
        } catch (imgErr: any) {
          console.log("Dostosowanie opisu zdjęcia (limit API):", imgErr.message);
          analysisResults.push({
            name: item.name,
            type: 'image',
            description: `Zdjęcie ślubne: ${item.name} – pamiątkowe ujęcie z uroczystości Joanny i Piotra.`,
            transcription: null
          });
        }
        await new Promise(r => setTimeout(r, 400));
      }
    }
    
    res.json({ results: analysisResults });
  } catch (err: any) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/generate-story', async (req, res) => {
  try {
    const { analyzedItems } = req.body;
    
    const prompt = `
Jesteś profesjonalnym montażystą i reżyserem wideo weselnych. 
Oto przeanalizowane klipy i zdjęcia z wesela Joanny i Piotra:
${JSON.stringify(analyzedItems, null, 2)}

Twoim zadaniem jest stworzenie pięknej, pełnej czułości i wzruszającej narracji.
Zaprojektuj "Niezapomniane widowisko muzyczne" łącząc te elementy.
Zwróć wynik jako JSON z polami:
- "title": Tytuł filmu
- "concept": Koncept i motyw przewodni
- "musicSuggestion": Sugestia utworu muzycznego
- "timeline": Tablica obiektów { "time": "zakres np. 0:00-0:15", "elementName": "nazwa pliku", "action": "opis przejścia/efektu i narracji" }
- "voiceover": Sugerowany tekst z offu, który mógłby przeczytać lektor.
    `;

    try {
      const response = await retryWithBackoff(() => 
        ai.models.generateContent({
          model: 'gemini-3.8-flash',
          contents: prompt,
          config: {
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
          }
        })
      );

      const parsed = JSON.parse(response.text || '{}');
      if (parsed.timeline && parsed.title) {
        return res.json(parsed);
      }
      throw new Error("Pusta lub niepoprawna odpowiedź modelu");
    } catch (apiErr: any) {
      console.log('Gemini API limit (429) lub błąd, użycie automatycznego generatora awaryjnego:', apiErr.message);
      const fallback = generateFallbackStory(analyzedItems);
      return res.json(fallback);
    }
  } catch (err: any) {
    console.error('Błąd ogólny generate-story:', err);
    const fallback = generateFallbackStory(req.body?.analyzedItems);
    res.json(fallback);
  }
});

// Stream a file from Google Drive directly to client (e.g. <video> or <img>)
app.get('/api/drive/stream/:id', async (req, res) => {
  try {
    const fileId = req.params.id;
    const token = req.query.accessToken as string;
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
            aspectRatio: "16:9",
            imageSize: imageSize
          }
        }
      })
    ).catch(err => {
      console.warn("Image generation failed due to quota or other error, using fallback.", err.message);
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
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
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
