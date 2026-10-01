import React, { useState, useEffect, useMemo } from 'react';
import { 
  Sparkles, 
  X, 
  Bookmark, 
  Plus, 
  Trash2, 
  Check, 
  Play, 
  Copy, 
  Layers, 
  Palette, 
  Tv, 
  Music, 
  Clock, 
  Sliders, 
  Cloud, 
  CloudOff, 
  Loader2, 
  Info,
  CheckCircle2,
  FolderHeart,
  Wand2,
  ShieldCheck,
  ChevronRight
} from 'lucide-react';
import type { ProjectState, LookPreset, TitleCard } from '../../types/project';
import type { ProjectTemplate, TemplateStructure } from '../../types/template';
import { PREBUILT_TEMPLATES, getUserTemplates, saveUserTemplate, deleteUserTemplate } from '../../lib/firebase/templateApi';
import { useAuth } from '../../lib/firebase/AuthContext';
import { useStudioToast } from '../common/ToastContext';

interface TemplateGalleryModalProps {
  isOpen: boolean;
  onClose: () => void;
  project: ProjectState;
  onApplyTemplate: (
    template: ProjectTemplate, 
    options: { applySettingsOnly: boolean; generateChapters: boolean; applyTitleCards: boolean }
  ) => void;
}

export function TemplateGalleryModal({
  isOpen,
  onClose,
  project,
  onApplyTemplate
}: TemplateGalleryModalProps) {
  const { user, login } = useAuth();
  const toast = useStudioToast();

  const [activeTab, setActiveTab] = useState<'prebuilt' | 'custom' | 'save_new'>('prebuilt');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [customTemplates, setCustomTemplates] = useState<ProjectTemplate[]>([]);
  const [isLoadingCustom, setIsLoadingCustom] = useState<boolean>(false);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [selectedTemplate, setSelectedTemplate] = useState<ProjectTemplate | null>(PREBUILT_TEMPLATES[0]);

  // Apply options state
  const [applySettingsOnly, setApplySettingsOnly] = useState<boolean>(false);
  const [generateChapters, setGenerateChapters] = useState<boolean>(true);
  const [applyTitleCards, setApplyTitleCards] = useState<boolean>(true);

  // New template form state
  const [newTitle, setNewTitle] = useState<string>('');
  const [newDescription, setNewDescription] = useState<string>('');
  const [newCategory, setNewCategory] = useState<ProjectTemplate['category']>('wedding_highlights');
  const [newIcon, setNewIcon] = useState<string>('✨');

  // Load user templates from Firebase Firestore when modal opens or user logs in
  const loadCloudTemplates = async () => {
    if (!user) {
      setCustomTemplates([]);
      return;
    }
    setIsLoadingCustom(true);
    try {
      const docs = await getUserTemplates();
      setCustomTemplates(docs);
    } catch (err: any) {
      console.warn('[TemplateGallery] Error loading custom templates:', err);
    } finally {
      setIsLoadingCustom(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadCloudTemplates();
    }
  }, [isOpen, user]);

  // Handle Save Current Project as Template to Firebase
  const handleSaveCurrentAsTemplate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim()) {
      toast.showWarning('Wprowadź tytuł szablonu.');
      return;
    }

    if (!user) {
      toast.showInfo('Zaloguj się kontem Google, aby zapisać szablon w chmurze Firebase.');
      await login();
      return;
    }

    setIsSaving(true);
    try {
      // Extract structure from current project state
      const chaptersList = (project.chapters || []).map(ch => ({
        chapterKey: ch.chapterKey || 'unassigned',
        name: ch.name,
        targetDurationSec: Math.round(ch.endTime - ch.startTime) || 60,
        description: ch.description || ''
      }));

      const structure: TemplateStructure = {
        pacing: 'cinematic',
        colorGrade: (project.settings?.colorGrade as LookPreset) || 'golden_hour',
        resolution: project.settings?.resolution || '1080p',
        fps: project.settings?.fps || 30,
        fitMode: project.settings?.fitMode || 'fit',
        applySmartTrim: true,
        applyTransitions: true,
        introCard: project.settings?.introCard,
        outroCard: project.settings?.outroCard,
        chapters: chaptersList.length > 0 ? chaptersList : PREBUILT_TEMPLATES[0].structure.chapters,
        sampleTextLayers: project.textLayers || []
      };

      const saved = await saveUserTemplate({
        id: `tpl_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        title: newTitle.trim(),
        description: newDescription.trim() || 'Customowa struktura projektu ślubnego.',
        category: newCategory,
        icon: newIcon,
        isPrebuilt: false,
        structure
      });

      setCustomTemplates(prev => [saved, ...prev]);
      toast.showSuccess(`✨ Zapisano szablon "${saved.title}" w chmurze Firebase!`);
      setNewTitle('');
      setNewDescription('');
      setActiveTab('custom');
      setSelectedTemplate(saved);
    } catch (err: any) {
      toast.showError(`Nie udało się zapisać szablonu: ${err.message || err}`);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteTemplate = async (templateId: string, title: string) => {
    if (!confirm(`Czy na pewno chcesz usunąć szablon "${title}" z chmury Firebase?`)) return;

    try {
      await deleteUserTemplate(templateId);
      setCustomTemplates(prev => prev.filter(t => t.id !== templateId));
      if (selectedTemplate?.id === templateId) {
        setSelectedTemplate(PREBUILT_TEMPLATES[0]);
      }
      toast.showSuccess(`Usunięto szablon "${title}".`);
    } catch (err: any) {
      toast.showError(`Nie udało się usunąć szablonu: ${err.message}`);
    }
  };

  const handleApplySelectedTemplate = () => {
    if (!selectedTemplate) return;

    onApplyTemplate(selectedTemplate, {
      applySettingsOnly,
      generateChapters,
      applyTitleCards
    });

    toast.showSuccess(`🎬 Zastosowano szablon "${selectedTemplate.title}" do projektu!`);
    onClose();
  };

  const allDisplayedTemplates = useMemo(() => {
    let list: ProjectTemplate[] = [];
    if (activeTab === 'prebuilt') {
      list = PREBUILT_TEMPLATES;
    } else if (activeTab === 'custom') {
      list = customTemplates;
    } else {
      list = [...PREBUILT_TEMPLATES, ...customTemplates];
    }

    if (selectedCategory === 'all') return list;
    return list.filter(t => t.category === selectedCategory);
  }, [activeTab, customTemplates, selectedCategory]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-black/85 backdrop-blur-md animate-fadeIn">
      <div className="relative w-full max-w-5xl max-h-[92vh] flex flex-col bg-[#110F0B] border border-[#C5A059]/40 rounded-2xl shadow-[0_24px_64px_rgba(0,0,0,0.95)] overflow-hidden">
        
        {/* Header */}
        <div className="px-5 py-4 border-b border-[#2A2317] bg-gradient-to-r from-[#1A160F] via-[#201B11] to-[#14110A] flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#2A2113] border border-[#C5A059]/50 flex items-center justify-center shadow-[0_0_15px_rgba(197,160,89,0.25)] shrink-0">
              <FolderHeart className="w-5 h-5 text-[#E5C992]" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-cinematic font-bold text-transparent bg-clip-text bg-gradient-to-r from-[#FFF0A0] via-[#C5A059] to-[#8B6B35]">
                Galeria Szablonów Projektów (Firebase Cloud)
              </h2>
              <p className="text-xs text-[#949B96]">
                Zapisuj i wczytuj powtarzalne struktury weselne, rozkład rozdziałów i profile barwne
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="p-2 rounded-xl bg-[#1D1912] text-[#A69C87] hover:text-white hover:bg-white/[0.08] transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Modal Navigation Tabs */}
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 border-b border-[#251E14] bg-[#16130C]">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setActiveTab('prebuilt')}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                activeTab === 'prebuilt'
                  ? 'bg-[#2A2213] text-[#E5C992] border border-[#C5A059]/60 shadow-sm'
                  : 'text-[#949B96] hover:text-white'
              }`}
            >
              ✨ Wbudowane Szablony ({PREBUILT_TEMPLATES.length})
            </button>

            <button
              onClick={() => setActiveTab('custom')}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer flex items-center gap-1.5 ${
                activeTab === 'custom'
                  ? 'bg-[#2A2213] text-[#E5C992] border border-[#C5A059]/60 shadow-sm'
                  : 'text-[#949B96] hover:text-white'
              }`}
            >
              <Cloud className="w-3.5 h-3.5 text-[#C5A059]" />
              <span>Moje Szablony w Firebase ({customTemplates.length})</span>
            </button>

            <button
              onClick={() => setActiveTab('save_new')}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer flex items-center gap-1.5 ${
                activeTab === 'save_new'
                  ? 'bg-gradient-to-r from-[#C5A059] to-[#E5C992] text-black font-bold shadow-md'
                  : 'bg-[#211B10] text-[#E5C992] border border-[#C5A059]/40 hover:border-[#C5A059]'
              }`}
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Zapisz obecny jako Szablon</span>
            </button>
          </div>

          {/* User Auth Info */}
          <div className="text-[11px] font-mono text-[#949B96] flex items-center gap-2">
            {user ? (
              <span className="flex items-center gap-1 text-emerald-400 font-bold">
                <CheckCircle2 className="w-3.5 h-3.5" /> Firebase Cloud
              </span>
            ) : (
              <button
                onClick={() => login()}
                className="text-[#E5C992] underline hover:text-white cursor-pointer"
              >
                Zaloguj się, aby zapisywać w chmurze
              </button>
            )}
          </div>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto custom-scrollbar p-5">
          
          {/* TAB 3: SAVE CURRENT PROJECT AS TEMPLATE */}
          {activeTab === 'save_new' ? (
            <div className="max-w-2xl mx-auto space-y-5 py-2">
              <div className="p-4 rounded-xl bg-[#1A160F] border border-[#C5A059]/40 space-y-2">
                <h3 className="text-sm font-bold text-[#E5C992] flex items-center gap-2">
                  <Bookmark className="w-4 h-4 text-[#C5A059]" />
                  Zapisz obecną strukturę projektu jako wielorazowy szablon
                </h3>
                <p className="text-xs text-[#DEDCD5] leading-relaxed">
                  Zapisze obecną konfigurację (profile barwne LUT, rozdzielczość, styl planszy tytułowej Intro i Outro, podział na rozdziały oraz styl podpisów) w Twoim koncie Firebase.
                </p>
              </div>

              <form onSubmit={handleSaveCurrentAsTemplate} className="space-y-4">
                <div>
                  <label className="text-xs font-semibold text-[#DEDCD5] block mb-1">
                    Nazwa szablonu *
                  </label>
                  <input
                    type="text"
                    value={newTitle}
                    onChange={(e) => setNewTitle(e.target.value)}
                    placeholder="np. Mój Złoty Standard Ślubny 2026"
                    className="w-full bg-[#16130A] border border-[#3E311B] rounded-xl px-3.5 py-2.5 text-xs text-white focus:border-[#C5A059] focus:outline-none"
                    required
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-semibold text-[#DEDCD5] block mb-1">
                      Kategoria
                    </label>
                    <select
                      value={newCategory}
                      onChange={(e: any) => setNewCategory(e.target.value)}
                      className="w-full bg-[#16130A] border border-[#3E311B] rounded-xl px-3.5 py-2.5 text-xs text-white focus:border-[#C5A059] focus:outline-none cursor-pointer"
                    >
                      <option value="wedding_highlights">Wedding Highlights (Pełny Reportaż)</option>
                      <option value="ceremony_only">Ceremony Only (Uroczysta Msza)</option>
                      <option value="photo_mix">Photo Gallery Mix (Foto & Wideo)</option>
                      <option value="party_reel">Party Reel (Szalona Impreza)</option>
                      <option value="custom">Niestandardowy Szablon</option>
                    </select>
                  </div>

                  <div>
                    <label className="text-xs font-semibold text-[#DEDCD5] block mb-1">
                      Ikona wyróżniająca
                    </label>
                    <select
                      value={newIcon}
                      onChange={(e) => setNewIcon(e.target.value)}
                      className="w-full bg-[#16130A] border border-[#3E311B] rounded-xl px-3.5 py-2.5 text-xs text-white focus:border-[#C5A059] focus:outline-none cursor-pointer"
                    >
                      <option value="✨">✨ Złote Błyski</option>
                      <option value="💍">💍 Pierścionki / Obrączki</option>
                      <option value="⛪">⛪ Kościół / Katedra</option>
                      <option value="💃">💃 Taniec & Zabawa</option>
                      <option value="🥂">🥂 Toasty & Szampan</option>
                      <option value="🌹">🌹 Kwiaty & Plener</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="text-xs font-semibold text-[#DEDCD5] block mb-1">
                    Opis szablonu (opcjonalny)
                  </label>
                  <textarea
                    value={newDescription}
                    onChange={(e) => setNewDescription(e.target.value)}
                    placeholder="Opisz przeznaczenie tego szablonu (np. Idealny do szybkich 10-minutowych teledysków dla klientów wyższego standardu)..."
                    rows={3}
                    className="w-full bg-[#16130A] border border-[#3E311B] rounded-xl px-3.5 py-2.5 text-xs text-white focus:border-[#C5A059] focus:outline-none resize-none leading-relaxed"
                  />
                </div>

                <div className="flex items-center justify-end gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => setActiveTab('prebuilt')}
                    className="px-4 py-2.5 rounded-xl border border-[#3E311B] text-xs font-medium text-[#949B96] hover:text-white transition-colors cursor-pointer"
                  >
                    Anuluj
                  </button>
                  <button
                    type="submit"
                    disabled={isSaving}
                    className="luxury-btn-primary px-6 py-2.5 rounded-xl text-xs font-bold uppercase flex items-center gap-2 cursor-pointer shadow-lg disabled:opacity-50"
                  >
                    {isSaving ? (
                      <Loader2 className="w-4 h-4 animate-spin text-black" />
                    ) : (
                      <Cloud className="w-4 h-4 text-black" />
                    )}
                    <span className="text-black font-extrabold">Zapisz w Firebase</span>
                  </button>
                </div>
              </form>
            </div>
          ) : (
            /* TAB 1 & 2: TEMPLATE BROWSER & DETAILS */
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
              
              {/* Left Column: Template Cards List */}
              <div className="lg:col-span-7 space-y-3">
                {isLoadingCustom ? (
                  <div className="py-12 flex flex-col items-center justify-center gap-2">
                    <Loader2 className="w-6 h-6 animate-spin text-[#C5A059]" />
                    <span className="text-xs text-[#949B96]">Pobieranie szablonów z chmury Firebase...</span>
                  </div>
                ) : allDisplayedTemplates.length === 0 ? (
                  <div className="p-8 text-center bg-[#15120C] border border-[#2A2216] rounded-2xl space-y-2">
                    <FolderHeart className="w-10 h-10 text-[#C5A059]/40 mx-auto" />
                    <h4 className="text-sm font-bold text-white">Brak zapisanych szablonów w tej kategorii</h4>
                    <p className="text-xs text-[#949B96]">
                      {activeTab === 'custom' 
                        ? 'Nie utworzyłeś jeszcze własnych szablonów. Kliknij "Zapisz obecny jako Szablon", aby dodać pierwszy.'
                        : 'Brak szablonów spełniających kryteria.'}
                    </p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-[58vh] overflow-y-auto custom-scrollbar pr-1">
                    {allDisplayedTemplates.map(template => {
                      const isSelected = selectedTemplate?.id === template.id;
                      return (
                        <div
                          key={template.id}
                          onClick={() => setSelectedTemplate(template)}
                          className={`p-4 rounded-2xl border transition-all cursor-pointer flex flex-col justify-between relative ${
                            isSelected
                              ? 'bg-gradient-to-br from-[#2D2313] via-[#20190D] to-[#141008] border-[#C5A059] shadow-[0_0_20px_rgba(197,160,89,0.25)] ring-1 ring-[#C5A059]/50'
                              : 'bg-[#15120B]/90 border-[#2A2216] hover:border-[#C5A059]/50 hover:bg-[#1C1710]'
                          }`}
                        >
                          <div>
                            <div className="flex items-center justify-between gap-2 mb-2">
                              <span className="text-xl">{template.icon || '✨'}</span>
                              <div className="flex items-center gap-1.5">
                                <span className={`text-[10px] font-mono px-2 py-0.5 rounded-full font-bold uppercase ${
                                  template.isPrebuilt 
                                    ? 'bg-[#C5A059]/20 text-[#E5C992] border border-[#C5A059]/30' 
                                    : 'bg-emerald-950 text-emerald-300 border border-emerald-500/30'
                                }`}>
                                  {template.isPrebuilt ? 'Wbudowany' : 'Firebase'}
                                </span>

                                {!template.isPrebuilt && (
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleDeleteTemplate(template.id, template.title);
                                    }}
                                    className="p-1 rounded text-rose-400 hover:text-rose-300 hover:bg-rose-950/50 transition-colors"
                                    title="Usuń szablon z Firebase"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                )}
                              </div>
                            </div>

                            <h3 className={`text-xs font-bold font-cinematic line-clamp-1 mb-1 ${
                              isSelected ? 'text-[#E5C992]' : 'text-white'
                            }`}>
                              {template.title}
                            </h3>

                            <p className="text-[11px] text-[#949B96] line-clamp-2 leading-relaxed mb-3">
                              {template.description}
                            </p>
                          </div>

                          <div className="pt-2 border-t border-[#2A2216] flex items-center justify-between text-[10px] text-[#A69777] font-mono">
                            <span>Rozdziały: {template.structure.chapters?.length || 0}</span>
                            <span>LUT: {template.structure.colorGrade || 'Brak'}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Right Column: Detailed Selected Template Preview & Apply Controls */}
              <div className="lg:col-span-5 bg-[#16130B] border border-[#2B2317] rounded-2xl p-4 flex flex-col justify-between space-y-4">
                {selectedTemplate ? (
                  <div className="space-y-4">
                    <div className="border-b border-[#2A2216] pb-3">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-2xl">{selectedTemplate.icon}</span>
                        <div>
                          <h3 className="text-sm font-bold text-[#E5C992] font-cinematic">
                            {selectedTemplate.title}
                          </h3>
                          <span className="text-[10px] font-mono text-[#949B96]">
                            Kategoria: {selectedTemplate.category}
                          </span>
                        </div>
                      </div>
                      <p className="text-xs text-[#DEDCD5] leading-relaxed mt-2">
                        {selectedTemplate.description}
                      </p>
                    </div>

                    {/* Structure Breakdown */}
                    <div className="space-y-2 text-xs">
                      <h4 className="text-[11px] font-bold uppercase tracking-wider text-[#C5A059] flex items-center gap-1.5">
                        <Sliders className="w-3.5 h-3.5" /> Parametry Struktury:
                      </h4>

                      <div className="grid grid-cols-2 gap-2 text-[11px] font-mono">
                        <div className="p-2 rounded-lg bg-[#110E08] border border-[#261F13]">
                          <span className="text-[#949B96] block">Tempo:</span>
                          <span className="text-white font-bold">{selectedTemplate.structure.pacing || 'cinematic'}</span>
                        </div>
                        <div className="p-2 rounded-lg bg-[#110E08] border border-[#261F13]">
                          <span className="text-[#949B96] block">Profil barwny:</span>
                          <span className="text-[#E5C992] font-bold">{selectedTemplate.structure.colorGrade || 'golden_hour'}</span>
                        </div>
                        <div className="p-2 rounded-lg bg-[#110E08] border border-[#261F13]">
                          <span className="text-[#949B96] block">Rozdzielczość:</span>
                          <span className="text-white font-bold">{selectedTemplate.structure.resolution || '1080p'} ({selectedTemplate.structure.fps || 30} FPS)</span>
                        </div>
                        <div className="p-2 rounded-lg bg-[#110E08] border border-[#261F13]">
                          <span className="text-[#949B96] block">Format kadru:</span>
                          <span className="text-white font-bold">{selectedTemplate.structure.fitMode || 'fit'}</span>
                        </div>
                      </div>

                      {/* Chapters List */}
                      {selectedTemplate.structure.chapters && selectedTemplate.structure.chapters.length > 0 && (
                        <div className="pt-2 space-y-1.5">
                          <span className="text-[11px] font-bold text-[#E5C992] block">
                            Układ Rozdziałów Wideo ({selectedTemplate.structure.chapters.length}):
                          </span>
                          <div className="max-h-36 overflow-y-auto custom-scrollbar space-y-1 pr-1">
                            {selectedTemplate.structure.chapters.map((ch, cIdx) => (
                              <div key={cIdx} className="p-2 rounded-lg bg-[#110E08] border border-[#261F13] flex items-center justify-between text-[11px]">
                                <span className="font-semibold text-white truncate max-w-[170px]">
                                  {cIdx + 1}. {ch.name}
                                </span>
                                <span className="text-[10px] font-mono text-[#C5A059]">
                                  ~{ch.targetDurationSec}s
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Apply Configuration Options */}
                    <div className="pt-3 border-t border-[#2A2216] space-y-2 text-xs">
                      <label className="flex items-center justify-between cursor-pointer">
                        <span className="text-[#DEDCD5]">Generuj rozdziały i opisy</span>
                        <input
                          type="checkbox"
                          checked={generateChapters}
                          onChange={(e) => setGenerateChapters(e.target.checked)}
                          className="accent-[#C5A059] w-4 h-4 rounded cursor-pointer"
                        />
                      </label>
                      <label className="flex items-center justify-between cursor-pointer">
                        <span className="text-[#DEDCD5]">Aplikuj karty Intro & Outro</span>
                        <input
                          type="checkbox"
                          checked={applyTitleCards}
                          onChange={(e) => setApplyTitleCards(e.target.checked)}
                          className="accent-[#C5A059] w-4 h-4 rounded cursor-pointer"
                        />
                      </label>
                    </div>
                  </div>
                ) : (
                  <div className="py-20 text-center text-xs text-[#949B96]">
                    Wybierz szablon z listy po lewej stronie
                  </div>
                )}

                {/* Apply Button */}
                {selectedTemplate && (
                  <button
                    onClick={handleApplySelectedTemplate}
                    className="w-full luxury-btn-primary py-3 rounded-xl font-extrabold text-xs uppercase tracking-wider flex items-center justify-center gap-2 shadow-lg cursor-pointer mt-4"
                  >
                    <Wand2 className="w-4 h-4 text-black" />
                    <span className="text-black font-extrabold">Zastosuj Szablon do Projektu</span>
                  </button>
                )}
              </div>
            </div>
          )}

        </div>

      </div>
    </div>
  );
}
