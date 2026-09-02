import React, { useEffect, useState, useRef } from 'react';
import { User } from 'firebase/auth';
import { initAuth, googleSignIn, getAccessToken, logout } from './lib/auth';
import { 
  db, 
  SavedStory, 
  saveStoryToFirestore, 
  subscribeToUserStories, 
  deleteStoryFromFirestore 
} from './lib/firebase';
import { doc, getDocFromServer } from 'firebase/firestore';
import { DrivePicker } from './components/DrivePicker';
import { MediaViewerModal } from './components/MediaViewerModal';
import { CinematicPlayerModal } from './components/CinematicPlayerModal';
import { AutoMontageModal } from './components/AutoMontageModal';
import { 
  Loader2, 
  Upload, 
  Video, 
  Image as ImageIcon, 
  Heart, 
  Music, 
  Clapperboard, 
  Star, 
  PlayCircle, 
  Plus, 
  AlertCircle, 
  X,
  Bookmark,
  Trash2,
  CheckCircle2,
  FolderHeart,
  Camera,
  Share2,
  Volume2,
  VolumeX,
  Sparkles,
  Layers,
  Sliders,
  ChevronRight,
  Maximize2,
  Film
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

export type MediaItem = {
  id?: string;
  name: string;
  mimeType: string;
  type: 'drive' | 'local';
  base64?: string;
  blobUrl?: string;
};

export type AnalysisResult = {
  name: string;
  type: 'video' | 'image';
  description: string;
  transcription?: string;
};

export type Storyboard = {
  id?: string;
  title: string;
  concept: string;
  musicSuggestion: string;
  timeline: { time: string; elementName: string; action: string }[];
  voiceover: string;
};

export default function App() {
  const [needsAuth, setNeedsAuth] = useState(true);
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  
  // Navigation Tabs for Mobile Ergonomics on POCO F6 (Studio, Storyboard, Library)
  const [activeTab, setActiveTab] = useState<'studio' | 'storyboard' | 'library'>('studio');

  const [mediaItems, setMediaItems] = useState<MediaItem[]>([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analyzingProgress, setAnalyzingProgress] = useState<{current: number, total: number} | null>(null);
  const [analysisResults, setAnalysisResults] = useState<AnalysisResult[] | null>(null);
  const [isGeneratingStory, setIsGeneratingStory] = useState(false);
  const [storyboard, setStoryboard] = useState<Storyboard | null>(null);
  const [coverUrl, setCoverUrl] = useState<string | null>(null);
  const [isGeneratingCover, setIsGeneratingCover] = useState(false);
  const [coverSize, setCoverSize] = useState("1K");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [savedStories, setSavedStories] = useState<SavedStory[]>([]);
  const [isSavingStory, setIsSavingStory] = useState(false);
  const [saveSuccessNotice, setSaveSuccessNotice] = useState<string | null>(null);
  const [isLiteMode, setIsLiteMode] = useState(false);

  // New features for POCO F6 AMOLED & Touch Experience
  const [selectedPreviewItem, setSelectedPreviewItem] = useState<MediaItem | null>(null);
  const [isCinematicOpen, setIsCinematicOpen] = useState(false);
  const [isAutoMontageOpen, setIsAutoMontageOpen] = useState(false);
  const [isSpeakingVoiceover, setIsSpeakingVoiceover] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  const triggerHaptic = (ms = 15) => {
    if (typeof window !== 'undefined' && 'vibrate' in navigator) {
      try { navigator.vibrate(ms); } catch (_) {}
    }
  };

  // Validate connection to Firestore on boot
  useEffect(() => {
    async function testConnection() {
      try {
        await getDocFromServer(doc(db, 'test', 'connection'));
      } catch (error) {
        if (error instanceof Error && error.message.includes('the client is offline')) {
          console.error("Please check your Firebase configuration.");
        }
      }
    }
    testConnection();
  }, []);

  useEffect(() => {
    const unsubscribe = initAuth(
      (currentUser, t) => {
        setUser(currentUser);
        setToken(t);
        setNeedsAuth(false);
      },
      () => {
        setUser(null);
        setToken(null);
        setNeedsAuth(true);
        setSavedStories([]);
      }
    );
    return () => unsubscribe();
  }, []);

  // Subscribe to real-time stories for authenticated user
  useEffect(() => {
    if (!user) {
      setSavedStories([]);
      return;
    }
    const unsubscribe = subscribeToUserStories(user.uid, (stories) => {
      setSavedStories(stories.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()));
    });
    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, [user]);

  const handleLogin = async () => {
    triggerHaptic(20);
    setIsLoggingIn(true);
    try {
      const result = await googleSignIn();
      if (result) {
        setToken(result.accessToken);
        setUser(result.user);
        setNeedsAuth(false);
      }
    } catch (err) {
      console.error('Login failed:', err);
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleDriveFilesPicked = (files: MediaItem[]) => {
    triggerHaptic(25);
    setMediaItems(prev => [...prev, ...files]);
  };

  const handleLocalFiles = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files?.length) return;
    triggerHaptic(25);
    const files = Array.from(e.target.files) as File[];
    
    const newItems: MediaItem[] = [];
    for (const file of files) {
      const buffer = await file.arrayBuffer();
      const base64 = btoa(
        new Uint8Array(buffer).reduce((data, byte) => data + String.fromCharCode(byte), '')
      );
      newItems.push({
        name: file.name,
        mimeType: file.type || 'image/jpeg',
        type: 'local',
        base64,
        blobUrl: URL.createObjectURL(file)
      });
    }
    setMediaItems(prev => [...prev, ...newItems]);
    if (e.target) e.target.value = '';
  };

  const removeMedia = (index: number) => {
    triggerHaptic(15);
    setMediaItems(prev => prev.filter((_, i) => i !== index));
  };

  const analyzeMedia = async () => {
    if (mediaItems.length === 0) return;
    triggerHaptic(30);
    setIsAnalyzing(true);
    setErrorMessage(null);
    setAnalyzingProgress({ current: 0, total: mediaItems.length });
    
    try {
      if (isLiteMode) {
        const mockResults: AnalysisResult[] = mediaItems.map(item => ({
          name: item.name,
          type: item.mimeType.startsWith('video') ? 'video' : 'image',
          description: `Plik ${item.name} (tryb ekonomiczny).`
        }));
        setAnalysisResults(mockResults);
        await generateStory(mockResults);
        return;
      }

      const t = await getAccessToken();
      const allResults: AnalysisResult[] = [];

      for (let i = 0; i < mediaItems.length; i++) {
        const item = mediaItems[i];
        setAnalyzingProgress({ current: i + 1, total: mediaItems.length });
        
        const payload = {
          items: [
            item.type === 'drive' 
              ? { type: 'drive', id: item.id, name: item.name }
              : { type: 'local', base64: item.base64, mimeType: item.mimeType, name: item.name }
          ],
          accessToken: t
        };

        const res = await fetch('/api/analyze-media', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });

        if (!res.ok) {
          const errorData = await res.json().catch(() => ({}));
          throw new Error(errorData.error || `Błąd serwera (${res.status})`);
        }

        const data = await res.json();
        if (data.results && data.results.length > 0) {
          allResults.push(data.results[0]);
        }

        if (i < mediaItems.length - 1) {
          await new Promise(r => setTimeout(r, 600));
        }
      }
      
      setAnalysisResults(allResults);
      await generateStory(allResults);
    } catch (err: any) {
      console.error(err);
      setErrorMessage(
        err.message?.includes('429') || err.message?.includes('RESOURCE_EXHAUSTED') || err.message?.includes('quota')
          ? "Chwilowy limit darmowego API. Odczekaj około 30 sekund i spróbuj ponownie lub włącz Tryb Ekonomiczny."
          : `Błąd analizy: ${err.message}`
      );
      setIsAnalyzing(false);
    } finally {
      setAnalyzingProgress(null);
    }
  };

  const generateStory = async (analyzedItems: AnalysisResult[]) => {
    setIsGeneratingStory(true);
    setErrorMessage(null);
    try {
      const res = await fetch('/api/generate-story', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ analyzedItems })
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setStoryboard(data);
      setCoverUrl(null);
      setActiveTab('storyboard');
      triggerHaptic(40);

      // Auto-save to Firestore if user logged in
      if (user) {
        try {
          const savedId = await saveStoryToFirestore(user.uid, {
            ...data,
            coverUrl: undefined
          });
          setStoryboard(prev => prev ? { ...prev, id: savedId } : null);
          setSaveSuccessNotice("Automatycznie zapisano w bibliotece chmury!");
          setTimeout(() => setSaveSuccessNotice(null), 4000);
        } catch (dbErr) {
          console.warn("Auto-save warning:", dbErr);
        }
      }
    } catch (err: any) {
      console.error(err);
      setErrorMessage(`Błąd generowania scenariusza: ${err.message}`);
    } finally {
      setIsAnalyzing(false);
      setIsGeneratingStory(false);
    }
  };

  const handleManualSave = async () => {
    if (!user) {
      setErrorMessage("Zaloguj się kontem Google, aby zapisać scenariusz w chmurze.");
      return;
    }
    if (!storyboard) return;

    triggerHaptic(20);
    setIsSavingStory(true);
    try {
      const savedId = await saveStoryToFirestore(user.uid, {
        id: storyboard.id,
        title: storyboard.title,
        concept: storyboard.concept,
        musicSuggestion: storyboard.musicSuggestion,
        timeline: storyboard.timeline,
        voiceover: storyboard.voiceover,
        coverUrl: coverUrl || undefined
      });
      setStoryboard(prev => prev ? { ...prev, id: savedId } : null);
      setSaveSuccessNotice("Pamiątka została pomyślnie zapisana!");
      setTimeout(() => setSaveSuccessNotice(null), 4000);
    } catch (err: any) {
      setErrorMessage("Nie udało się zapisać: " + err.message);
    } finally {
      setIsSavingStory(false);
    }
  };

  const loadSavedStory = (saved: SavedStory) => {
    triggerHaptic(20);
    setStoryboard({
      id: saved.id,
      title: saved.title,
      concept: saved.concept,
      musicSuggestion: saved.musicSuggestion,
      timeline: saved.timeline,
      voiceover: saved.voiceover
    });
    setCoverUrl(saved.coverUrl || null);
    setActiveTab('storyboard');
  };

  const handleDeleteSavedStory = async (e: React.MouseEvent, storyId: string) => {
    e.stopPropagation();
    triggerHaptic(20);
    if (!user) return;
    try {
      await deleteStoryFromFirestore(user.uid, storyId);
      if (storyboard?.id === storyId) {
        setStoryboard(null);
        setCoverUrl(null);
      }
    } catch (err: any) {
      setErrorMessage("Błąd usuwania: " + err.message);
    }
  };

  const generateCover = async () => {
    triggerHaptic(25);
    setIsGeneratingCover(true);
    setErrorMessage(null);
    try {
      const prompt = `Artystyczna, kinowa okładka ślubna dla Joanny i Piotra. Tytuł: ${storyboard?.title || "Nasza Pamiątka Weselna"}. Ekskluzywny styl, romantyzm, miękkie światło, fotorealizm.`;
      const res = await fetch('/api/generate-cover', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, size: coverSize })
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setCoverUrl(data.imageUrl);

      if (data.isFallback) {
        setSaveSuccessNotice(data.message);
        setTimeout(() => setSaveSuccessNotice(null), 5000);
      }

      if (user && storyboard) {
        try {
          await saveStoryToFirestore(user.uid, {
            id: storyboard.id,
            title: storyboard.title,
            concept: storyboard.concept,
            musicSuggestion: storyboard.musicSuggestion,
            timeline: storyboard.timeline,
            voiceover: storyboard.voiceover,
            coverUrl: data.imageUrl
          });
        } catch (dbErr) {
          console.warn("Could not update cover in Firestore:", dbErr);
        }
      }
    } catch (err: any) {
      console.error(err);
      setErrorMessage(`Błąd generowania okładki: ${err.message}`);
    } finally {
      setIsGeneratingCover(false);
    }
  };

  // Voiceover narrator audio speech synthesis
  const toggleVoiceover = () => {
    triggerHaptic(20);
    if (!('speechSynthesis' in window)) {
      alert("Twoja przeglądarka nie obsługuje syntezatora mowy.");
      return;
    }

    if (isSpeakingVoiceover) {
      window.speechSynthesis.cancel();
      setIsSpeakingVoiceover(false);
    } else {
      window.speechSynthesis.cancel();
      const textToRead = `${storyboard?.title}. ${storyboard?.voiceover}`;
      const utterance = new SpeechSynthesisUtterance(textToRead);
      utterance.lang = 'pl-PL';
      utterance.rate = 0.95;
      utterance.pitch = 1.0;

      const voices = window.speechSynthesis.getVoices();
      const plVoice = voices.find(v => v.lang.includes('pl') || v.lang.includes('PL'));
      if (plVoice) utterance.voice = plVoice;

      utterance.onend = () => setIsSpeakingVoiceover(false);
      utterance.onerror = () => setIsSpeakingVoiceover(false);

      window.speechSynthesis.speak(utterance);
      setIsSpeakingVoiceover(true);
    }
  };

  // Mobile Web Share for WhatsApp / SMS / Messenger
  const handleShareStory = async () => {
    triggerHaptic(20);
    if (!storyboard) return;

    const shareData = {
      title: `Ślubne Widowisko: ${storyboard.title}`,
      text: `Scenariusz ślubny dla Joanny i Piotra: "${storyboard.concept}"\nMuzyka: ${storyboard.musicSuggestion}\nOś czasu: ${storyboard.timeline.length} ujęć.`,
      url: window.location.href
    };

    if (navigator.share) {
      try {
        await navigator.share(shareData);
      } catch (err) {
        console.warn("Share aborted or failed", err);
      }
    } else {
      navigator.clipboard.writeText(`${shareData.title}\n\n${shareData.text}\n\nTekst z offu:\n${storyboard.voiceover}`);
      setSaveSuccessNotice("Skopiowano scenariusz do schowka!");
      setTimeout(() => setSaveSuccessNotice(null), 3500);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans-modern pb-safe-nav select-none">
      
      {/* POCO F6 AMOLED Top Header with Punch Hole & Safe Area */}
      <header className="sticky top-0 z-40 bg-slate-950/85 backdrop-blur-xl border-b border-slate-800/80 pt-safe px-4 py-3">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-rose-600 to-rose-400 flex items-center justify-center shadow-lg shadow-rose-600/30 ring-1 ring-white/20">
              <Heart className="w-5 h-5 text-white fill-white" />
            </div>
            <div>
              <h1 className="text-base sm:text-lg font-bold tracking-tight text-white flex items-center gap-1.5 font-serif-luxury">
                Joanna & Piotr
              </h1>
              <p className="text-[10px] sm:text-xs text-rose-300/80 font-medium">Reżyseria AI • POCO F6 Ready</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {!needsAuth && user ? (
              <div className="flex items-center gap-2">
                <span className="hidden sm:inline text-xs text-slate-300 truncate max-w-[120px]">
                  {user.displayName?.split(' ')[0]}
                </span>
                <button 
                  id="header-logout-btn"
                  onClick={logout} 
                  className="text-xs bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-white px-2.5 py-1.5 rounded-lg border border-slate-700/80 transition-colors"
                >
                  Wyloguj
                </button>
              </div>
            ) : (
              <button 
                id="header-login-btn"
                onClick={handleLogin} 
                disabled={isLoggingIn}
                className="min-h-[38px] bg-gradient-to-r from-rose-600 to-pink-600 hover:from-rose-500 hover:to-pink-500 active:scale-95 text-white text-xs font-semibold px-3 py-1.5 rounded-xl shadow-md transition flex items-center gap-1.5"
              >
                {isLoggingIn ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
                Zaloguj Google
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Main Content Area with Adaptive 20:9 Layout */}
      <main className="flex-1 max-w-4xl w-full mx-auto px-3.5 sm:px-6 py-4 space-y-5">
        
        {/* Alerts & Notifications */}
        <AnimatePresence>
          {errorMessage && (
            <motion.div 
              initial={{ opacity: 0, y: -10 }} 
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="bg-rose-950/80 border border-rose-700/60 text-rose-200 px-3.5 py-2.5 rounded-2xl flex items-start justify-between gap-2.5 shadow-lg backdrop-blur-md"
            >
              <div className="flex items-start gap-2.5">
                <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                <div className="text-xs leading-relaxed font-medium">{errorMessage}</div>
              </div>
              <button 
                onClick={() => setErrorMessage(null)} 
                className="text-rose-400 hover:text-rose-200 p-1"
                aria-label="Zamknij"
              >
                <X className="w-4 h-4" />
              </button>
            </motion.div>
          )}

          {saveSuccessNotice && (
            <motion.div 
              initial={{ opacity: 0, y: -10 }} 
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="bg-emerald-950/80 border border-emerald-700/60 text-emerald-200 px-3.5 py-2.5 rounded-2xl flex items-center gap-2.5 shadow-lg backdrop-blur-md"
            >
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              <span className="text-xs font-medium">{saveSuccessNotice}</span>
            </motion.div>
          )}
        </AnimatePresence>

        {/* TAB 1: STUDIO (UPLOAD & GENERATOR) */}
        {activeTab === 'studio' && (
          <div className="space-y-4">
            {/* Hero Card for Studio */}
            <div className="relative rounded-3xl overflow-hidden p-5 sm:p-7 bg-gradient-to-br from-slate-900 via-slate-900/90 to-rose-950/40 border border-slate-800/90 shadow-2xl">
              <div className="absolute top-0 right-0 w-48 h-48 bg-rose-500/10 rounded-full blur-3xl pointer-events-none"></div>
              <div className="relative z-10">
                <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-rose-500/20 border border-rose-500/30 text-rose-300 text-[11px] font-semibold tracking-wider uppercase mb-2.5">
                  <Sparkles className="w-3 h-3 text-rose-400" />
                  <span>Reżyser Gemini 3.5 Flash</span>
                </div>
                <h2 className="text-2xl sm:text-3xl font-extrabold font-serif-luxury tracking-tight text-white mb-2 leading-tight">
                  Stwórzcie Wasze <span className="text-transparent bg-clip-text bg-gradient-to-r from-rose-300 via-rose-400 to-amber-200">Widowisko Muzyczne</span>
                </h2>
                <p className="text-xs sm:text-sm text-slate-300 leading-relaxed max-w-lg font-light">
                  Załadujcie wideo i zdjęcia ze ślubu. Nasz inteligentny reżyser zanalizuje emocje, dźwięki i ułoży je w epicki zwiastun z gotową narracją i propozycją muzyki.
                </p>
              </div>
            </div>

            {/* Upload Buttons Section (Desktop & Mobile Optimized for POCO F6) */}
            <div className="bg-slate-900/80 rounded-3xl p-4 sm:p-6 border border-slate-800/80 shadow-xl backdrop-blur-md space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm sm:text-base font-bold text-white flex items-center gap-2">
                  <Upload className="w-4 h-4 text-rose-400" />
                  Dodaj materiały weselne
                </h3>
                <span className="text-[11px] text-slate-400 font-mono">
                  {mediaItems.length} {mediaItems.length === 1 ? 'plik' : mediaItems.length < 5 ? 'pliki' : 'plików'}
                </span>
              </div>

              {/* Hidden file & camera inputs */}
              <input 
                type="file" 
                multiple 
                accept="video/*,image/*" 
                className="hidden" 
                ref={fileInputRef}
                onChange={handleLocalFiles}
              />
              <input 
                type="file" 
                accept="image/*,video/*"
                capture="environment"
                className="hidden" 
                ref={cameraInputRef}
                onChange={handleLocalFiles}
              />

              {/* Action Buttons Grid with 44px+ touch targets for POCO F6 */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                <button 
                  id="pick-gallery-btn"
                  onClick={() => { triggerHaptic(20); fileInputRef.current?.click(); }}
                  className="min-h-[48px] flex items-center justify-center gap-2 bg-slate-800 hover:bg-slate-700/80 active:scale-95 text-slate-100 font-medium py-3 px-3 rounded-2xl border border-slate-700/80 shadow-sm transition text-xs sm:text-sm"
                >
                  <Plus className="w-4 h-4 text-rose-400" />
                  <span>Galeria / Pliki</span>
                </button>

                <button 
                  id="pick-camera-btn"
                  onClick={() => { triggerHaptic(20); cameraInputRef.current?.click(); }}
                  className="min-h-[48px] flex items-center justify-center gap-2 bg-slate-800 hover:bg-slate-700/80 active:scale-95 text-slate-100 font-medium py-3 px-3 rounded-2xl border border-slate-700/80 shadow-sm transition text-xs sm:text-sm"
                >
                  <Camera className="w-4 h-4 text-amber-400" />
                  <span>Aparat / Kamera</span>
                </button>

                <div className="col-span-2 sm:col-span-1">
                  {user ? (
                    <DrivePicker onFilesPicked={handleDriveFilesPicked} className="w-full min-h-[48px] flex items-center justify-center gap-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 active:scale-95 text-white font-medium py-3 px-3 rounded-2xl shadow-md text-xs sm:text-sm transition" />
                  ) : (
                    <button
                      onClick={handleLogin}
                      className="w-full min-h-[48px] flex items-center justify-center gap-2 bg-slate-800/80 hover:bg-slate-700/80 text-slate-300 font-medium py-3 px-3 rounded-2xl border border-slate-700/80 text-xs sm:text-sm"
                    >
                      <span>Google Drive (Zaloguj)</span>
                    </button>
                  )}
                </div>
              </div>

              {/* Selected Files Horizontal Scroll / Carousel for POCO F6 */}
              {mediaItems.length > 0 && (
                <div className="space-y-3 pt-2">
                  <div className="flex items-center justify-between text-xs text-slate-300">
                    <span className="font-semibold">Wybrane ujęcia (dotknij, aby podejrzeć):</span>
                    <button 
                      onClick={() => { triggerHaptic(15); setMediaItems([]); }} 
                      className="text-rose-400 hover:text-rose-300 text-[11px]"
                    >
                      Wyczyść listę
                    </button>
                  </div>

                  <div className="flex gap-2.5 overflow-x-auto pb-2 pt-1 no-scrollbar">
                    {mediaItems.map((item, i) => {
                      const isVid = item.mimeType.startsWith('video');
                      return (
                        <div 
                          key={i}
                          onClick={() => { triggerHaptic(15); setSelectedPreviewItem(item); }}
                          className="relative shrink-0 w-24 h-24 sm:w-28 sm:h-28 rounded-2xl overflow-hidden border border-slate-700/80 bg-slate-800/90 cursor-pointer group active:scale-95 transition-transform"
                        >
                          {item.blobUrl || item.base64 ? (
                            isVid ? (
                              <video 
                                src={item.blobUrl || `data:${item.mimeType};base64,${item.base64}`} 
                                className="w-full h-full object-cover" 
                              />
                            ) : (
                              <img 
                                src={item.blobUrl || `data:${item.mimeType};base64,${item.base64}`} 
                                alt={item.name} 
                                className="w-full h-full object-cover" 
                              />
                            )
                          ) : (
                            <div className="w-full h-full flex items-center justify-center bg-slate-800">
                              {isVid ? <Video className="w-6 h-6 text-rose-400" /> : <ImageIcon className="w-6 h-6 text-emerald-400" />}
                            </div>
                          )}

                          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent flex flex-col justify-between p-1.5">
                            <button 
                              onClick={(e) => { e.stopPropagation(); removeMedia(i); }}
                              className="self-end w-6 h-6 rounded-full bg-black/60 text-white flex items-center justify-center active:scale-90"
                              aria-label="Usuń plik"
                            >
                              <X className="w-3.5 h-3.5 text-rose-400" />
                            </button>
                            <div className="flex items-center gap-1 text-[10px] text-white font-medium truncate">
                              {isVid ? <Video className="w-3 h-3 text-rose-400 shrink-0" /> : <ImageIcon className="w-3 h-3 text-emerald-400 shrink-0" />}
                              <span className="truncate">{item.name}</span>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Mode Selector & Generator Control */}
                  <div className="p-3 bg-slate-950/60 rounded-2xl border border-slate-800/80 flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <Sliders className="w-4 h-4 text-rose-400 shrink-0" />
                      <div>
                        <div className="text-xs font-bold text-white flex items-center gap-1.5">
                          Tryb Ekonomiczny (Lite)
                          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-slate-800 text-slate-300 font-normal">Oszczędza API</span>
                        </div>
                        <p className="text-[10px] text-slate-400">Pominięcie głębokiej analizy plików w celu oszczędzenia limitów.</p>
                      </div>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer shrink-0">
                      <input 
                        type="checkbox" 
                        className="sr-only peer" 
                        checked={isLiteMode} 
                        onChange={() => { triggerHaptic(15); setIsLiteMode(!isLiteMode); }} 
                      />
                      <div className="w-11 h-6 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-rose-500"></div>
                    </label>
                  </div>

                  {/* Primary Generation Button (Thumb-Friendly on POCO F6) */}
                  <button 
                    id="generate-showcase-btn"
                    onClick={analyzeMedia} 
                    disabled={isAnalyzing}
                    className="w-full min-h-[52px] bg-gradient-to-r from-rose-600 via-pink-600 to-rose-700 hover:from-rose-500 hover:to-rose-600 active:scale-[0.98] text-white font-bold py-3.5 px-4 rounded-2xl shadow-xl shadow-rose-900/30 transition-all flex justify-center items-center gap-2 text-sm sm:text-base ring-2 ring-rose-500/30"
                  >
                    {isAnalyzing ? (
                      <Loader2 className="w-5 h-5 animate-spin" />
                    ) : (
                      <Star className="w-5 h-5 fill-rose-300 text-rose-200" />
                    )}
                    <span>
                      {isAnalyzing 
                        ? (analyzingProgress 
                            ? `Analizowanie ${analyzingProgress.current} z ${analyzingProgress.total}...` 
                            : "Reżyserowanie wspomnień...") 
                        : "Wygeneruj nasze widowisko muzyczne"}
                    </span>
                  </button>
                </div>
              )}
            </div>

            {/* If storyboard already exists, show teaser card to jump to it */}
            {storyboard && (
              <div 
                onClick={() => { triggerHaptic(15); setActiveTab('storyboard'); }}
                className="p-4 rounded-2xl bg-gradient-to-r from-rose-950/40 to-slate-900 border border-rose-500/30 flex items-center justify-between cursor-pointer active:scale-98 transition"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-rose-500/20 flex items-center justify-center text-rose-400">
                    <Clapperboard className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-white">{storyboard.title}</h4>
                    <p className="text-[10px] text-rose-300">Dotknij, aby zobaczyć gotowy scenariusz</p>
                  </div>
                </div>
                <ChevronRight className="w-5 h-5 text-rose-400" />
              </div>
            )}
          </div>
        )}

        {/* TAB 2: SCENARIUSZ (STORYBOARD & TIMELINE) */}
        {activeTab === 'storyboard' && (
          <div className="space-y-5">
            {storyboard ? (
              <motion.div 
                initial={{ opacity: 0, scale: 0.98 }} 
                animate={{ opacity: 1, scale: 1 }} 
                className="space-y-4"
              >
                {/* Hero Showcase Card */}
                <div className="relative rounded-3xl overflow-hidden bg-slate-900 border border-slate-800 shadow-2xl">
                  <div className="p-6 sm:p-8 text-center relative overflow-hidden bg-radial from-rose-950/70 via-slate-900 to-slate-950">
                    <div className="flex items-center justify-between gap-2 mb-3">
                      <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-rose-500/20 border border-rose-500/30 text-rose-300 text-[10px] uppercase font-bold tracking-wider">
                        <Sparkles className="w-3 h-3 text-rose-400" />
                        <span>Widowisko Muzyczne</span>
                      </div>

                      <div className="flex items-center gap-1.5">
                        <button 
                          id="share-story-btn"
                          onClick={handleShareStory}
                          className="min-h-[36px] bg-white/10 hover:bg-white/20 active:scale-95 text-white text-xs font-medium px-3 py-1.5 rounded-xl border border-white/10 transition flex items-center gap-1"
                          title="Udostępnij scenariusz"
                        >
                          <Share2 className="w-3.5 h-3.5" />
                          <span className="hidden sm:inline">Udostępnij</span>
                        </button>
                        
                        {user && (
                          <button 
                            id="save-story-btn"
                            onClick={handleManualSave}
                            disabled={isSavingStory}
                            className="min-h-[36px] bg-rose-600/80 hover:bg-rose-600 active:scale-95 text-white text-xs font-semibold px-3 py-1.5 rounded-xl transition flex items-center gap-1.5 shadow-md shadow-rose-900/30"
                          >
                            {isSavingStory ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Bookmark className="w-3.5 h-3.5" />}
                            <span>{isSavingStory ? "Zapis..." : "Zapisz"}</span>
                          </button>
                        )}
                      </div>
                    </div>

                    <h2 className="text-2xl sm:text-4xl font-extrabold font-serif-luxury tracking-tight mb-2 text-white">
                      {storyboard.title}
                    </h2>
                    <p className="text-xs sm:text-base text-slate-300 font-light italic max-w-xl mx-auto leading-relaxed">
                      "{storyboard.concept}"
                    </p>

                    {/* Quick action buttons: Auto Montage / Launch Cinema Mode / Play Voiceover */}
                    <div className="mt-5 flex flex-wrap items-center justify-center gap-2.5">
                      <button 
                        id="open-auto-montage-btn"
                        onClick={() => { triggerHaptic(25); setIsAutoMontageOpen(true); }}
                        className="min-h-[46px] bg-gradient-to-r from-amber-400 via-rose-500 to-pink-600 hover:from-amber-300 hover:to-pink-500 active:scale-95 text-slate-950 font-extrabold text-xs sm:text-sm px-4 py-2.5 rounded-2xl shadow-xl shadow-rose-600/30 flex items-center gap-2 ring-2 ring-amber-300/50"
                      >
                        <Film className="w-4 h-4 text-slate-950 stroke-[2.5]" />
                        <span>Zmontuj Gotowy Film (.mp4)</span>
                      </button>

                      <button 
                        id="open-cinematic-mode-btn"
                        onClick={() => { triggerHaptic(25); setIsCinematicOpen(true); }}
                        className="min-h-[46px] bg-slate-800/90 hover:bg-slate-700/90 active:scale-95 text-white font-semibold text-xs sm:text-sm px-4 py-2.5 rounded-2xl border border-slate-700 shadow-lg flex items-center gap-2"
                      >
                        <PlayCircle className="w-4 h-4 text-rose-400" />
                        <span>Pokaz Kinowy</span>
                      </button>

                      <button 
                        id="toggle-narrator-speech-btn"
                        onClick={toggleVoiceover}
                        className={`min-h-[46px] px-4 py-2.5 rounded-2xl text-xs sm:text-sm font-medium flex items-center gap-2 transition-all active:scale-95 border ${
                          isSpeakingVoiceover 
                            ? 'bg-amber-500 text-slate-950 font-bold border-amber-300 ring-2 ring-amber-400/40 shadow-lg' 
                            : 'bg-slate-800/80 hover:bg-slate-700 text-slate-200 border-slate-700'
                        }`}
                      >
                        {isSpeakingVoiceover ? <Volume2 className="w-4 h-4 animate-bounce text-slate-950" /> : <VolumeX className="w-4 h-4 text-slate-400" />}
                        <span>{isSpeakingVoiceover ? 'Lektor czyta...' : 'Lektor (Głos)'}</span>
                      </button>
                    </div>
                  </div>
                </div>

                {/* Direct Call to Action for Automatic Montage */}
                <div className="bg-gradient-to-r from-rose-950/60 via-slate-900 to-amber-950/40 rounded-3xl p-4 sm:p-5 border border-rose-500/30 shadow-xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                  <div className="flex items-start gap-3.5">
                    <div className="w-11 h-11 rounded-2xl bg-gradient-to-tr from-amber-500 to-rose-500 flex items-center justify-center text-slate-950 shrink-0 shadow-lg shadow-rose-900/30">
                      <Film className="w-5 h-5 stroke-[2.5]" />
                    </div>
                    <div>
                      <h4 className="font-bold text-white text-xs sm:text-sm flex items-center gap-1.5">
                        Automatyczny Montaż Wideo
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-rose-500 text-white font-semibold">Gotowe do pobrania</span>
                      </h4>
                      <p className="text-xs text-slate-300 mt-1 font-light leading-relaxed">
                        Wyrenderuj pełny film z Waszych zdjęć, płynnymi przejściami Ken Burns, cytatami i romantyczną muzyką prosto do pliku wideo na POCO F6.
                      </p>
                    </div>
                  </div>

                  <button
                    id="banner-montage-btn"
                    onClick={() => { triggerHaptic(25); setIsAutoMontageOpen(true); }}
                    className="w-full sm:w-auto shrink-0 min-h-[44px] bg-gradient-to-r from-rose-600 to-amber-500 hover:from-rose-500 hover:to-amber-400 active:scale-95 text-white font-bold text-xs px-4 py-2.5 rounded-xl shadow-lg transition flex items-center justify-center gap-2"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>Uruchom montaż teraz</span>
                  </button>
                </div>

                {/* Music Suggestion */}
                <div className="bg-slate-900/80 rounded-3xl p-4 sm:p-5 border border-slate-800/80 shadow-xl flex items-start gap-3.5">
                  <div className="w-10 h-10 rounded-2xl bg-amber-500/20 flex items-center justify-center text-amber-400 shrink-0">
                    <Music className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="font-bold text-white text-xs sm:text-sm">Sugerowany utwór muzyczny</h4>
                    <p className="text-xs sm:text-sm text-amber-200/90 mt-0.5 font-medium">{storyboard.musicSuggestion}</p>
                  </div>
                </div>

                {/* Timeline / Oś Czasu */}
                <div className="bg-slate-900/80 rounded-3xl p-4 sm:p-6 border border-slate-800/80 shadow-xl">
                  <h3 className="text-base sm:text-lg font-bold text-white mb-5 flex items-center gap-2">
                    <Clapperboard className="w-5 h-5 text-rose-400" />
                    Oś czasu widowiska ({storyboard.timeline.length} ujęć)
                  </h3>

                  <div className="space-y-3 relative before:absolute before:inset-0 before:ml-4 before:h-full before:w-0.5 before:bg-gradient-to-b before:from-rose-500/40 before:via-slate-700 before:to-transparent">
                    {storyboard.timeline.map((item, idx) => (
                      <div 
                        key={idx} 
                        className="relative flex items-start gap-3 pl-1"
                      >
                        <div className="flex items-center justify-center w-7 h-7 rounded-full bg-slate-900 border-2 border-rose-500 text-rose-400 shrink-0 z-10 text-[10px] font-bold shadow-md">
                          {idx + 1}
                        </div>
                        <div className="flex-1 p-3.5 rounded-2xl bg-slate-950/70 border border-slate-800/90 shadow-sm">
                          <div className="flex items-center justify-between gap-2 mb-1">
                            <span className="text-xs font-bold text-white truncate">{item.elementName}</span>
                            <span className="text-[11px] font-mono text-rose-400 bg-rose-500/10 px-2 py-0.5 rounded-full shrink-0 font-semibold">{item.time}</span>
                          </div>
                          <p className="text-xs text-slate-300 leading-relaxed font-light">{item.action}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Voiceover Script Card */}
                <div className="bg-slate-900/80 rounded-3xl p-5 border border-slate-800/80 shadow-xl space-y-2">
                  <div className="flex items-center justify-between">
                    <h4 className="font-bold text-white text-xs sm:text-sm flex items-center gap-1.5">
                      <Volume2 className="w-4 h-4 text-rose-400" />
                      Tekst z offu (Voiceover)
                    </h4>
                    <button 
                      onClick={toggleVoiceover} 
                      className="text-xs text-rose-400 hover:text-rose-300 font-medium"
                    >
                      {isSpeakingVoiceover ? 'Zatrzymaj' : 'Odtwórz'}
                    </button>
                  </div>
                  <p className="text-xs sm:text-sm text-slate-200 italic font-serif-luxury leading-relaxed border-l-2 border-rose-500/60 pl-3.5 py-1">
                    "{storyboard.voiceover}"
                  </p>
                </div>

                {/* Cover Generation Section */}
                <div className="bg-slate-900/80 rounded-3xl p-5 border border-slate-800/80 shadow-xl space-y-4">
                  <div>
                    <h3 className="text-sm sm:text-base font-bold text-white mb-1">Artystyczna Okładka AI</h3>
                    <p className="text-xs text-slate-400">Wygeneruj oficjalną okładkę Waszego filmu weselnego.</p>
                  </div>

                  <div className="flex flex-col sm:flex-row gap-2.5">
                    <select 
                      value={coverSize} 
                      onChange={e => setCoverSize(e.target.value)}
                      className="min-h-[44px] bg-slate-800 border border-slate-700 text-slate-200 text-xs rounded-xl py-2 px-3 focus:ring-rose-500"
                    >
                      <option value="1K">Jakość mobilna (1K)</option>
                      <option value="2K">Wysoka rozdzielczość (2K)</option>
                      <option value="4K">Ultra AMOLED (4K)</option>
                    </select>

                    <button 
                      id="generate-cover-btn"
                      onClick={generateCover} 
                      disabled={isGeneratingCover}
                      className="min-h-[44px] flex-1 bg-slate-800 hover:bg-slate-700 active:scale-95 text-white text-xs sm:text-sm font-semibold py-2.5 px-4 rounded-xl border border-slate-700 transition flex items-center justify-center gap-2"
                    >
                      {isGeneratingCover ? <Loader2 className="w-4 h-4 animate-spin" /> : <ImageIcon className="w-4 h-4 text-rose-400" />}
                      <span>{isGeneratingCover ? "Generowanie okładki..." : "Wygeneruj okładkę"}</span>
                    </button>
                  </div>

                  {coverUrl && (
                    <div className="relative rounded-2xl overflow-hidden border border-slate-700/80 shadow-2xl">
                      <img 
                        src={coverUrl} 
                        alt="Okładka ślubna" 
                        referrerPolicy="no-referrer" 
                        className="w-full h-auto object-cover max-h-[420px]" 
                      />
                    </div>
                  )}
                </div>

              </motion.div>
            ) : (
              <div className="text-center py-16 px-4 bg-slate-900/60 rounded-3xl border border-slate-800">
                <Clapperboard className="w-12 h-12 text-slate-600 mx-auto mb-3" />
                <h3 className="text-base font-bold text-white mb-1">Brak aktywnego scenariusza</h3>
                <p className="text-xs text-slate-400 max-w-xs mx-auto mb-4">
                  Przejdź do zakładki Studio, wybierz zdjęcia i filmy, a następnie wygeneruj widowisko.
                </p>
                <button 
                  onClick={() => setActiveTab('studio')}
                  className="min-h-[44px] px-5 py-2.5 bg-rose-600 active:scale-95 text-white font-semibold rounded-xl text-xs"
                >
                  Przejdź do Studio
                </button>
              </div>
            )}
          </div>
        )}

        {/* TAB 3: ZAPISANE W CHMURZE (LIBRARY) */}
        {activeTab === 'library' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold text-white font-serif-luxury">Wasze Pamiątki w Chmurze</h2>
                <p className="text-xs text-slate-400">Bezpiecznie zapisane w Firebase Firestore</p>
              </div>
              <span className="text-xs font-mono px-2.5 py-1 rounded-full bg-slate-800 border border-slate-700 text-rose-300">
                {savedStories.length} {savedStories.length === 1 ? 'historia' : 'historii'}
              </span>
            </div>

            {!user ? (
              <div className="text-center py-14 px-5 bg-slate-900/80 rounded-3xl border border-slate-800 space-y-3">
                <FolderHeart className="w-12 h-12 text-rose-400/80 mx-auto" />
                <h3 className="text-base font-bold text-white">Zaloguj się, aby mieć dostęp do pamiątek</h3>
                <p className="text-xs text-slate-400 max-w-sm mx-auto">
                  Logowanie kontem Google pozwala na synchronizację scenariuszy pomiędzy Twoim telefonem a komputerem.
                </p>
                <button 
                  onClick={handleLogin}
                  className="min-h-[44px] px-5 py-2.5 bg-rose-600 hover:bg-rose-500 text-white font-semibold rounded-xl text-xs shadow-lg"
                >
                  Zaloguj przez Google
                </button>
              </div>
            ) : savedStories.length === 0 ? (
              <div className="text-center py-14 px-5 bg-slate-900/60 rounded-3xl border border-slate-800 space-y-2">
                <FolderHeart className="w-10 h-10 text-slate-600 mx-auto mb-2" />
                <h3 className="text-sm font-semibold text-slate-200">Brak zapisanych pamiątek</h3>
                <p className="text-xs text-slate-500">Wygeneruj scenariusz w zakładce Studio i zapisz go w swojej bibliotece.</p>
              </div>
            ) : (
              <div className="grid sm:grid-cols-2 gap-3.5">
                {savedStories.map((story) => (
                  <div 
                    key={story.id}
                    onClick={() => loadSavedStory(story)}
                    className={`p-4 rounded-2xl border transition-all cursor-pointer flex flex-col justify-between active:scale-[0.98] ${
                      storyboard?.id === story.id 
                        ? 'border-rose-500 bg-rose-950/30 ring-1 ring-rose-500/50' 
                        : 'border-slate-800 bg-slate-900/90 hover:border-slate-700'
                    }`}
                  >
                    <div>
                      <div className="flex items-start justify-between gap-2">
                        <h4 className="font-bold text-white text-sm line-clamp-1">{story.title}</h4>
                        <button 
                          onClick={(e) => handleDeleteSavedStory(e, story.id)}
                          className="text-slate-500 hover:text-rose-400 p-1.5 transition-colors"
                          title="Usuń z bazy"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                      <p className="text-xs text-slate-400 mt-1 line-clamp-2 italic font-light">"{story.concept}"</p>
                    </div>

                    <div className="mt-4 pt-2.5 border-t border-slate-800 flex items-center justify-between text-[11px] text-slate-500">
                      <span className="text-rose-300 font-medium">{story.timeline.length} ujęć</span>
                      <span>{new Date(story.updatedAt).toLocaleDateString('pl-PL')}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

      </main>

      {/* POCO F6 AMOLED Bottom Navigation Bar (Fixed for Ergonomic Thumb Access) */}
      <nav className="fixed bottom-0 inset-x-0 z-40 bg-slate-950/90 backdrop-blur-2xl border-t border-slate-800/90 pb-safe px-6 py-2 shadow-2xl">
        <div className="max-w-md mx-auto flex items-center justify-around">
          
          <button 
            id="tab-studio-btn"
            onClick={() => { triggerHaptic(15); setActiveTab('studio'); }}
            className={`flex flex-col items-center gap-1 py-1 px-3 rounded-xl transition-all active:scale-95 ${
              activeTab === 'studio' ? 'text-rose-400 font-bold' : 'text-slate-400 hover:text-slate-200 font-normal'
            }`}
          >
            <div className="relative">
              <Upload className="w-5 h-5" />
              {mediaItems.length > 0 && (
                <span className="absolute -top-1 -right-2 w-4 h-4 rounded-full bg-rose-500 text-white text-[9px] font-bold flex items-center justify-center">
                  {mediaItems.length}
                </span>
              )}
            </div>
            <span className="text-[10px] tracking-tight">Studio</span>
          </button>

          <button 
            id="tab-storyboard-btn"
            onClick={() => { triggerHaptic(15); setActiveTab('storyboard'); }}
            className={`flex flex-col items-center gap-1 py-1 px-3 rounded-xl transition-all active:scale-95 ${
              activeTab === 'storyboard' ? 'text-rose-400 font-bold' : 'text-slate-400 hover:text-slate-200 font-normal'
            }`}
          >
            <div className="relative">
              <Clapperboard className="w-5 h-5" />
              {storyboard && (
                <span className="absolute -top-1 -right-1.5 w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
              )}
            </div>
            <span className="text-[10px] tracking-tight">Scenariusz</span>
          </button>

          <button 
            id="tab-library-btn"
            onClick={() => { triggerHaptic(15); setActiveTab('library'); }}
            className={`flex flex-col items-center gap-1 py-1 px-3 rounded-xl transition-all active:scale-95 ${
              activeTab === 'library' ? 'text-rose-400 font-bold' : 'text-slate-400 hover:text-slate-200 font-normal'
            }`}
          >
            <div className="relative">
              <FolderHeart className="w-5 h-5" />
              {savedStories.length > 0 && (
                <span className="absolute -top-1 -right-2 w-4 h-4 rounded-full bg-slate-800 border border-slate-700 text-slate-300 text-[9px] font-bold flex items-center justify-center">
                  {savedStories.length}
                </span>
              )}
            </div>
            <span className="text-[10px] tracking-tight">Pamiątki</span>
          </button>

        </div>
      </nav>

      {/* Fullscreen Media Viewer Modal */}
      {selectedPreviewItem && (
        <MediaViewerModal 
          item={selectedPreviewItem} 
          onClose={() => setSelectedPreviewItem(null)} 
        />
      )}

      {/* Fullscreen Cinematic Player Modal with Real Base Video, Overlays & Ambiance */}
      {isCinematicOpen && storyboard && (
        <CinematicPlayerModal 
          storyboard={storyboard} 
          coverUrl={coverUrl} 
          mediaItems={mediaItems}
          token={token}
          onClose={() => setIsCinematicOpen(false)} 
          onOpenAutoMontage={() => {
            setIsCinematicOpen(false);
            setIsAutoMontageOpen(true);
          }}
          onAddMedia={(newItems) => setMediaItems(prev => [...prev, ...newItems])}
        />
      )}

      {/* Fullscreen Automatic Montage Engine Modal */}
      {isAutoMontageOpen && storyboard && (
        <AutoMontageModal 
          storyboard={storyboard} 
          mediaItems={mediaItems}
          coverUrl={coverUrl} 
          token={token}
          onClose={() => setIsAutoMontageOpen(false)} 
          onAddMedia={(newItems) => setMediaItems(prev => [...prev, ...newItems])}
        />
      )}

    </div>
  );
}
