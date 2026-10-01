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
  onMagicProduce?: () => void;
  onOpenTemplateGallery?: () => void;
}

export function QuickActionsBar({
  project,
  onUpdateProject,
  onOpenDirectorModal,
  onNavigateToExport,
  onSelectRatingFilter,
  onOpenChronologicalModal,
  onOpenWeddingNarrativeModal,
  onOpenSoundscapes,
  onMagicProduce,
  onOpenTemplateGallery
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
      <div className="flex items-center gap-2 p-2 bg-gradient-to-r from-[#050705] via-[#0D1A10] to-[#050705] border border-[#1B4332]/30 rounded-2xl shadow-[0_8px_24px_rgba(0,0,0,0.6)] text-xs backdrop-blur-xl overflow-x-auto no-scrollbar touch-pan-x w-full max-w-full">
        <span className="text-[11px] font-bold text-[var(--gold-bright)] tracking-[0.12em] px-2.5 py-1.5 rounded-xl bg-[#0D1A10] border border-[var(--gold-primary)]/30 flex items-center gap-1.5 shrink-0 shadow-[0_0_12px_rgba(197,160,89,0.15)] font-cinematic whitespace-nowrap">
          <Sparkles className="w-3.5 h-3.5 text-[var(--gold-bright)]" /> KONSOLA REŻYSERSKA
        </span>

        {/* 0. MAGIC AI MASTER BUTTON - Unified Director & Narratives */}
        <button
          onClick={onMagicProduce || onOpenChronologicalModal}
          disabled={isRunning}
          className="group relative flex items-center gap-2 px-5 py-2.5 rounded-2xl bg-gradient-to-br from-[var(--gold-primary)] via-[var(--gold-bright)] to-[var(--gold-dark)] hover:scale-[1.03] active:scale-[0.98] text-black cursor-pointer transition-all font-extrabold disabled:opacity-50 shadow-[0_0_25px_rgba(197,160,89,0.4)] shrink-0 overflow-hidden"
          title="MAGICZNA PRODUKCJA (1-Kliknięcie): Reżyseria AI, Montaż i Eksport MP4 w jednym kroku"
        >
          <div className="absolute inset-0 bg-white/20 opacity-0 group-hover:opacity-100 transition-opacity" />
          <Sparkles className="w-4 h-4 text-black animate-pulse" />
          <span className="tracking-tight uppercase">MAGICZNA PRODUKCJA (1-Klik)</span>
          <div className="flex items-center justify-center w-5 h-5 rounded-full bg-black/10 border border-black/20 text-[10px]">
            <Zap className="w-3 h-3 fill-black/80" />
          </div>
        </button>

        {/* 1. Quality Analysis (Technical) */}
        <button
          onClick={handleAnalyzeProject}
          disabled={isRunning}
          className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] border border-white/10 hover:border-[#C5A059]/40 text-[#949B96] hover:text-[#E5C992] cursor-pointer transition-all font-medium disabled:opacity-50 shrink-0"
          title="Audyt techniczny: ostrość, stabilność i oświetlenie ujęć"
        >
          <RotateCw className={`w-3.5 h-3.5 ${isRunning && activeActionName.includes('Analiza') ? 'animate-spin' : ''}`} />
          <span>Analiza Jakości</span>
        </button>

        {/* 2. Proxy Optimization (Performance) */}
        <button
          onClick={handleOptimizeProject}
          disabled={isRunning}
          className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] border border-white/10 hover:border-cyan-500/40 text-[#949B96] hover:text-cyan-300 cursor-pointer transition-all font-medium disabled:opacity-50 shrink-0"
          title="Generuj lekkie proxy 540p dla płynnego montażu bez zacięć"
        >
          <Zap className="w-3.5 h-3.5" />
          <span>Optymalizacja Proxy</span>
        </button>

        {/* 3. Template Gallery (Firebase Cloud) */}
        {onOpenTemplateGallery && (
          <button
            onClick={onOpenTemplateGallery}
            disabled={isRunning}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#1C160F] hover:bg-[#2A2113] border border-[var(--gold-primary)]/40 text-[var(--gold-bright)] hover:text-white cursor-pointer transition-all font-semibold shadow-sm shrink-0"
            title="Otwórz Galerię Szablonów (Zapisuj i wczytuj struktury z Firebase)"
          >
            <SlidersHorizontal className="w-3.5 h-3.5 text-[var(--gold-primary)]" />
            <span>Galeria Szablonów (Firebase)</span>
          </button>
        )}

        {/* Spacer for right-alignment */}
        <div className="flex-1" />

        {/* 3. Export Action */}
        <button
          onClick={handlePrepareForExport}
          disabled={isRunning}
          className="flex items-center gap-2 px-5 py-2 rounded-2xl bg-gradient-to-r from-emerald-600/20 to-emerald-900/40 hover:from-emerald-600/30 hover:to-emerald-800/50 border border-emerald-500/40 text-emerald-300 hover:text-white cursor-pointer transition-all font-bold disabled:opacity-50 shadow-[0_0_20px_rgba(16,185,129,0.1)] shrink-0"
          title="Przejdź do renderowania i zapisu filmu"
        >
          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          <span>Finalny Eksport</span>
        </button>
      </div>

      {/* Real-time non-blocking progress dialog */}
      {isRunning && (
        <div className="fixed bottom-6 right-6 z-50 w-96 p-4 rounded-2xl bg-[#050705]/95 border border-[#C5A059]/40 shadow-2xl backdrop-blur-md animate-slideUp">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-white flex items-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin text-[#C5A059]" />
              {activeActionName}
            </span>
            <span className="text-xs font-mono font-bold text-[#C5A059]">{progressPercent}%</span>
          </div>

          <p className="text-[11px] text-[#949B96] mb-3 truncate">{statusMessage}</p>

          <div className="w-full h-1.5 bg-[#1B4332]/30 rounded-full overflow-hidden mb-3">
            <div 
              className="h-full bg-gradient-to-r from-[var(--gold-primary)] to-[var(--gold-bright)] transition-all duration-300"
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
