import React, { useState } from 'react';
import { 
  Sparkles, 
  Star, 
  Zap, 
  Share2, 
  RotateCw, 
  Loader2, 
  CheckCircle2, 
  X,
  Check,
  ShieldCheck,
  SlidersHorizontal,
  Music
} from 'lucide-react';
import { ProjectState, MediaClip } from '../../types/project';
import { analyzeWholeLibrary } from '../../core/director/videoAnalysisEngine';
import { batchGenerateProxies } from '../../core/director/proxyEngine';
import { autoFixProjectHealthIssues, runRealRuntimeHealthCheck } from '../../core/director/projectHealthEngine';

interface QuickActionsBarProps {
  project: ProjectState;
  onUpdateProject: (updated: ProjectState) => void;
  onOpenDirectorModal: () => void;
  onNavigateToExport: () => void;
  onSelectRatingFilter?: (rating: string) => void;
  onOpenChronologicalModal?: () => void;
  onOpenWeddingNarrativeModal?: () => void;
  onOpenSoundscapes?: () => void;
}

export function QuickActionsBar({
  project,
  onUpdateProject,
  onOpenDirectorModal,
  onNavigateToExport,
  onSelectRatingFilter,
  onOpenChronologicalModal,
  onOpenWeddingNarrativeModal,
  onOpenSoundscapes
}: QuickActionsBarProps) {
  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [activeActionName, setActiveActionName] = useState<string>('');
  const [progressPercent, setProgressPercent] = useState<number>(0);
  const [statusMessage, setStatusMessage] = useState<string>('');
  const [feedbackResult, setFeedbackResult] = useState<{ title: string; message: string; type: 'success' | 'info' } | null>(null);
  const [abortController, setAbortController] = useState<AbortController | null>(null);

  // 1. Analyze Project
  const handleAnalyzeProject = async () => {
    if (project.mediaLibrary.length === 0) {
      setFeedbackResult({
        title: 'Biblioteka jest pusta',
        message: 'Dodaj ujęcia do biblioteki przed uruchomieniem analizy.',
        type: 'info'
      });
      return;
    }

    const controller = new AbortController();
    setAbortController(controller);
    setIsRunning(true);
    setActiveActionName('Analiza Projektu (Klatki & Jakość)');
    setProgressPercent(0);

    try {
      const analysisMap = await analyzeWholeLibrary(
        project.mediaLibrary,
        controller.signal,
        (p, msg) => {
          setProgressPercent(p);
          setStatusMessage(msg);
        }
      );

      const updatedLibrary = project.mediaLibrary.map(clip => {
        const a = analysisMap.get(clip.id);
        return a ? { ...clip, analysis: a } : clip;
      });

      onUpdateProject({
        ...project,
        mediaLibrary: updatedLibrary,
        updatedAt: new Date().toISOString()
      });

      const bestCount = Array.from(analysisMap.values()).filter(a => a.ratingCategory === 'BEST').length;
      const problemCount = Array.from(analysisMap.values()).filter(a => a.ratingCategory === 'PROBLEM').length;

      setFeedbackResult({
        title: 'Analiza ukończona pomyślnie',
        message: `Przeanalizowano ${analysisMap.size} klipów. Wykryto ${bestCount} ujęć oznaczonych jako BEST oraz ${problemCount} z ostrzeżeniami technicznymi.`,
        type: 'success'
      });
    } catch (e: any) {
      if (e?.message !== 'Operacja została przerwana') {
        setFeedbackResult({
          title: 'Wystąpił problem podczas analizy',
          message: e?.message || 'Nie udało się przeanalizować klipów.',
          type: 'info'
        });
      }
    } finally {
      setIsRunning(false);
      setAbortController(null);
    }
  };

  // 2. Find Best Moments
  const handleFindBestMoments = async () => {
    // If clips aren't analyzed yet, run quick analyze first
    const hasAnalyses = project.mediaLibrary.some(c => c.analysis);
    if (!hasAnalyses) {
      await handleAnalyzeProject();
    }
    if (onSelectRatingFilter) {
      onSelectRatingFilter('BEST');
    }
    setFeedbackResult({
      title: 'Włączono filtr: Najlepsze Ujęcia (BEST)',
      message: 'Wyświetlam ujęcia o najwyższej ostrości, stabilności i potencjale montażowym.',
      type: 'success'
    });
  };

  // 4. Optimize Project (Proxy & Fixes)
  const handleOptimizeProject = async () => {
    const controller = new AbortController();
    setAbortController(controller);
    setIsRunning(true);
    setActiveActionName('Optymalizacja Projektu (Generowanie Proxy 540p)');
    setProgressPercent(0);

    try {
      // 1. Auto fix timeline defects
      const { updatedProject, fixedCount } = autoFixProjectHealthIssues(project);

      // 2. Batch generate proxies for all video clips
      const { successCount } = await batchGenerateProxies(
        updatedProject.mediaLibrary,
        controller.signal,
        (p, msg) => {
          setProgressPercent(p);
          setStatusMessage(msg);
        }
      );

      // Enable proxy mode in settings
      const finalizedProject: ProjectState = {
        ...updatedProject,
        settings: {
          ...updatedProject.settings,
          useProxyMode: true
        },
        updatedAt: new Date().toISOString()
      };

      onUpdateProject(finalizedProject);

      setFeedbackResult({
        title: 'Projekt zoptymalizowany',
        message: `Wygenerowano ${successCount} lekkich proxy 540p dla płynnego podglądu. Naprawiono ${fixedCount} drobnych usterek osi czasu. Oryginały zostaną zachowane do finalnego eksportu.`,
        type: 'success'
      });
    } catch (e: any) {
      if (e?.message !== 'Generowanie proxy zostało przerwane') {
        alert('Błąd optymalizacji: ' + e?.message);
      }
    } finally {
      setIsRunning(false);
      setAbortController(null);
    }
  };

  // 5. Prepare for Export
  const handlePrepareForExport = async () => {
    setIsRunning(true);
    setActiveActionName('Przygotowanie do Eksportu (Audyt Pre-Flight)');
    setProgressPercent(30);
    setStatusMessage('Sprawdzanie kodeków, nośnika pamięci i ciągłości osi czasu...');

    try {
      const report = await runRealRuntimeHealthCheck(project);
      setProgressPercent(100);
      setStatusMessage('Audyt zakończony.');

      if (report.canExport) {
        onNavigateToExport();
      } else {
        setFeedbackResult({
          title: 'Wymagana korekta przed eksportem',
          message: `Znaleziono blokady: ${report.exportReadiness.blockers.join(', ')}. Użyj opcji "Napraw automatycznie" w panelu Project Health.`,
          type: 'info'
        });
      }
    } finally {
      setIsRunning(false);
    }
  };

  const handleCancel = () => {
    if (abortController) {
      abortController.abort();
    }
    setIsRunning(false);
  };

  return (
    <>
      {/* Action buttons bar */}
      <div className="flex items-center gap-2 p-2 bg-gradient-to-r from-[#14120D] via-[#100F0C] to-[#14120D] border border-[#2D261A] rounded-2xl shadow-[0_8px_24px_rgba(0,0,0,0.6)] text-xs backdrop-blur-xl overflow-x-auto no-scrollbar touch-pan-x w-full max-w-full">
        <span className="text-[11px] font-bold text-[#FDE047] tracking-[0.12em] px-2.5 py-1.5 rounded-xl bg-[#241D0E] border border-[#D4AF37]/30 flex items-center gap-1.5 shrink-0 shadow-[0_0_12px_rgba(212,175,55,0.15)] font-cinematic whitespace-nowrap">
          <Sparkles className="w-3.5 h-3.5 text-[#FDE047]" /> KONSOLA REŻYSERSKA
        </span>

        {/* 0. Smart Chronological Merge & Auto-Captioning */}
        {onOpenChronologicalModal && project.mediaLibrary.length > 0 && (
          <button
            onClick={onOpenChronologicalModal}
            disabled={isRunning}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-gradient-to-r from-[#3D2E12] to-[#251C0A] hover:from-[#523E18] hover:to-[#382A0E] border border-[#D4AF37] text-[#FDE047] cursor-pointer transition-all font-bold disabled:opacity-50 shadow-[0_0_15px_rgba(212,175,55,0.2)] shrink-0 whitespace-nowrap"
            title="Inteligentne scalanie chronologiczne ujęć i generowanie podpisów scen przez AI"
          >
            <Sparkles className="w-3.5 h-3.5 text-[#FDE047] animate-pulse" />
            <span>Scal & Podpisz AI</span>
          </button>
        )}

        {/* 0b. Wedding Narrative Builder */}
        {onOpenWeddingNarrativeModal && (
          <button
            onClick={onOpenWeddingNarrativeModal}
            disabled={isRunning}
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-gradient-to-r from-[#3A1D28] to-[#24131B] hover:from-[#4E2636] hover:to-[#321A25] border border-[#E879F9]/60 text-[#F472B6] hover:text-[#F43F5E] cursor-pointer transition-all font-bold disabled:opacity-50 shadow-[0_0_15px_rgba(232,121,249,0.15)] shrink-0 whitespace-nowrap"
            title="Utwórz nostalgiczną narrację ślubną dla Joanny i Piotra z datami, imionami i opisami momentów"
          >
            <SlidersHorizontal className="w-3.5 h-3.5 text-[#F472B6]" />
            <span>Narracja Ślubna (Joanna & Piotr)</span>
          </button>
        )}

        {/* 0c. AI Soundscapes & Wedding Music */}
        {onOpenSoundscapes && (
          <button
            onClick={onOpenSoundscapes}
            disabled={isRunning}
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-gradient-to-r from-[#1A2535] to-[#111A24] hover:from-[#25354D] hover:to-[#172535] border border-sky-500/50 text-sky-300 hover:text-sky-200 cursor-pointer transition-all font-bold disabled:opacity-50 shadow-[0_0_15px_rgba(56,189,248,0.15)] shrink-0 whitespace-nowrap"
            title="Generator profesjonalnej ścieżki dźwiękowej AI (organy, wiedeński walc, romantyczny fortepian, uroczyste dzwonki)"
          >
            <Music className="w-3.5 h-3.5 text-sky-400" />
            <span>Ścieżka Dźwiękowa AI</span>
          </button>
        )}

        {/* 1. Analyze Project */}
        <button
          onClick={handleAnalyzeProject}
          disabled={isRunning}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#16130D] hover:bg-[#201A10] border border-[#2D261A] hover:border-[#D4AF37]/50 text-[#F5F2EA] hover:text-[#FDE047] cursor-pointer transition-all font-medium disabled:opacity-50 shadow-sm shrink-0 whitespace-nowrap"
          title="Przeanalizuj stabilność, jakość i oświetlenie każdego ujęcia"
        >
          <RotateCw className="w-3 h-3 text-[#D4AF37]" />
          <span>Analiza Jakości</span>
        </button>

        {/* 2. Find Best Moments */}
        <button
          onClick={handleFindBestMoments}
          disabled={isRunning}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#16130D] hover:bg-[#201A10] border border-[#2D261A] hover:border-amber-400/50 text-[#F5F2EA] hover:text-amber-300 cursor-pointer transition-all font-medium disabled:opacity-50 shadow-sm shrink-0 whitespace-nowrap"
          title="Pokaż wyłącznie najwyżej ocenione ujęcia"
        >
          <Star className="w-3 h-3 text-amber-400 fill-amber-400/20" />
          <span>Najlepsze Chwile (Best)</span>
        </button>

        {/* 4. Optimize Project */}
        <button
          onClick={handleOptimizeProject}
          disabled={isRunning}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#16130D] hover:bg-[#201A10] border border-[#2D261A] hover:border-cyan-400/50 text-[#F5F2EA] hover:text-cyan-300 cursor-pointer transition-all font-medium disabled:opacity-50 shadow-sm shrink-0 whitespace-nowrap"
          title="Generuj lekkie proxy 540p dla płynnego montażu"
        >
          <Zap className="w-3 h-3 text-cyan-400" />
          <span>Optymalizacja Proxy</span>
        </button>

        {/* 6. Prepare for Export */}
        <button
          onClick={handlePrepareForExport}
          disabled={isRunning}
          className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-gradient-to-r from-emerald-950/80 to-[#122A1E] hover:from-emerald-900/90 hover:to-[#173827] border border-emerald-500/50 text-emerald-300 hover:text-emerald-200 cursor-pointer transition-all font-semibold sm:ml-auto disabled:opacity-50 shadow-[0_0_15px_rgba(16,185,129,0.15)] shrink-0 whitespace-nowrap"
          title="Przetestuj projekt i przygotuj do finalnego eksportu"
        >
          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
          <span>Do Eksportu</span>
        </button>
      </div>

      {/* Real-time non-blocking progress dialog */}
      {isRunning && (
        <div className="fixed bottom-6 right-6 z-50 w-96 p-4 rounded-2xl bg-[#141412]/95 border border-[#D4AF37]/40 shadow-2xl backdrop-blur-md animate-slideUp">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-white flex items-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin text-[#D4AF37]" />
              {activeActionName}
            </span>
            <span className="text-xs font-mono font-bold text-[#D4AF37]">{progressPercent}%</span>
          </div>

          <p className="text-[11px] text-[#AAA69D] mb-3 truncate">{statusMessage}</p>

          <div className="w-full h-1.5 bg-[#222] rounded-full overflow-hidden mb-3">
            <div 
              className="h-full bg-gradient-to-r from-[#D4AF37] to-amber-300 transition-all duration-300"
              style={{ width: `${progressPercent}%` }}
            />
          </div>

          <div className="flex justify-end">
            <button
              onClick={handleCancel}
              className="px-3 py-1 rounded-lg bg-[#222] hover:bg-[#333] text-[#AAA] hover:text-white text-[11px] font-medium cursor-pointer"
            >
              Anuluj operację
            </button>
          </div>
        </div>
      )}

      {/* Feedback modal / notification */}
      {feedbackResult && (
        <div className="fixed bottom-6 right-6 z-50 w-96 p-4 rounded-2xl bg-[#151513] border border-[#2A2824] shadow-2xl animate-slideUp text-xs">
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-2 font-bold text-white">
              {feedbackResult.type === 'success' ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              ) : (
                <ShieldCheck className="w-4 h-4 text-[#D4AF37] shrink-0" />
              )}
              <span>{feedbackResult.title}</span>
            </div>
            <button
              onClick={() => setFeedbackResult(null)}
              className="p-1 text-[#888] hover:text-white rounded"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
          <p className="text-[11px] text-[#AAA69D] mt-1.5 leading-relaxed">
            {feedbackResult.message}
          </p>
        </div>
      )}
    </>
  );
}
