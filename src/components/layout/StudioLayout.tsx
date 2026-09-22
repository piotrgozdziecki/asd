import React, { useState } from 'react';
import { 
  Film, 
  Layout, 
  Download, 
  Search, 
  Save, 
  User as UserIcon, 
  LogOut, 
  Loader2, 
  Cloud,
  Undo2,
  Redo2,
  AlertCircle,
  Sparkles,
  Mic,
  Bookmark,
  Keyboard,
  Activity,
  Sliders,
  Wand2,
  Check,
  RotateCcw,
  ShieldCheck,
  Zap
} from 'lucide-react';
import { useAuth } from '../../lib/firebase/AuthContext';
import { PWAInstallButton } from '../common/PWAInstallButton';

function GoogleIcon({ className = "w-3.5 h-3.5" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24">
      <path
        fill="#4285F4"
        d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.66-5.17 3.66-9.17z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.25v3.15C3.26 21.36 7.35 24 12 24z"
      />
      <path
        fill="#FBBC05"
        d="M5.28 14.27c-.25-.72-.38-1.49-.38-2.27s.13-1.55.38-2.27V6.58H1.25C.45 8.18 0 9.99 0 12s.45 3.82 1.25 5.42l4.03-3.15z"
      />
      <path
        fill="#EA4335"
        d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.35 0 3.26 2.64 1.25 6.58l4.03 3.15c.95-2.83 3.6-4.98 6.72-4.98z"
      />
    </svg>
  );
}

function AuthStatus({ isCompact = false }: { isCompact?: boolean }) {
  const { user, loading, login, logout, hasDriveAccess } = useAuth();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  
  if (loading) return <div className="w-8 h-8 rounded-full bg-[#1A1A1A] animate-pulse" />;
  
  if (!user) {
    return (
      <button 
        onClick={() => login()} 
        className="text-xs font-medium text-white bg-[#1A1A1A] border border-[#D4AF37]/50 px-3 py-1.5 rounded-full hover:bg-[#D4AF37]/15 hover:border-[#D4AF37] transition-all flex items-center gap-2 shadow-sm cursor-pointer"
        title="Zaloguj się przez konto Google, aby korzystać z Dysku Google"
      >
        <GoogleIcon className="w-3.5 h-3.5" />
        <span>{isCompact ? 'Google' : 'Zaloguj przez Google'}</span>
      </button>
    );
  }

  return (
    <div className="relative">
      <button 
        onClick={() => setIsMenuOpen(!isMenuOpen)}
        className="flex items-center gap-2 p-1 rounded-full hover:bg-[#1A1A1A] transition-colors focus:outline-none cursor-pointer"
        title={`${user.displayName || user.email} (Dysk Google aktywny)`}
      >
        <div className="w-8 h-8 rounded-full bg-[#2A2824] overflow-hidden border border-[#D4AF37]/50 relative">
          {user.photoURL ? (
            <img src={user.photoURL} alt={user.displayName || 'User'} className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-[#D4AF37]">
              <UserIcon className="w-4 h-4" />
            </div>
          )}
          {hasDriveAccess && (
            <div className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-emerald-500 rounded-full border border-black" title="Dysk Google połączony" />
          )}
        </div>
      </button>

      {isMenuOpen && (
        <div className="absolute top-full right-0 mt-2 bg-[#121212] border border-[#2A2824] rounded-xl shadow-2xl p-3 z-50 flex flex-col min-w-[210px] backdrop-blur-md">
          <div className="px-2 py-1.5 border-b border-[#2A2824] mb-2">
            <p className="text-xs text-white truncate font-medium">{user.displayName || 'Użytkownik'}</p>
            <p className="text-[11px] text-[#888] truncate">{user.email}</p>
            <div className="flex items-center gap-1.5 mt-2 px-2 py-1 rounded bg-[#1A1A1A] border border-[#2A2824] text-[10px] text-emerald-400">
              <Cloud className="w-3 h-3 text-[#D4AF37]" />
              <span>Dysk Google: Połączony</span>
            </div>
          </div>
          
          <button 
            onClick={() => {
              setIsMenuOpen(false);
              login();
            }}
            className="flex items-center gap-2 px-2 py-1.5 text-xs text-[#D4AF37] hover:bg-[#D4AF37]/10 rounded-md transition-colors w-full text-left cursor-pointer"
          >
            <GoogleIcon className="w-3.5 h-3.5" />
            Odśwież uprawnienia Dysku
          </button>

          <button 
            onClick={() => {
              setIsMenuOpen(false);
              logout();
            }} 
            className="flex items-center gap-2 px-2 py-1.5 text-xs text-red-400 hover:bg-red-500/10 rounded-md transition-colors w-full text-left mt-1 cursor-pointer"
          >
            <LogOut className="w-3.5 h-3.5" />
            Wyloguj się
          </button>
        </div>
      )}
    </div>
  );
}

interface StudioLayoutProps {
  children: React.ReactNode;
  activeTab: string;
  onTabChange: (tab: string) => void;
  projectName: string;
  onProjectNameChange?: (name: string) => void;
  isSaving: boolean;
  onSave: () => void;
  hasUnsavedChanges?: boolean;
  canUndo?: boolean;
  canRedo?: boolean;
  onUndo?: () => void;
  onRedo?: () => void;
  recoveryAvailable?: boolean;
  onRestoreRecovery?: () => void;
  onDismissRecovery?: () => void;
  onResetProject?: () => void;
  onOpenAiAssistant?: () => void;
  onOpenDirector?: () => void;
  onToggleHealthPanel?: () => void;
  isHealthPanelOpen?: boolean;
  onOpenVoiceRecorder?: () => void;
  isDbConnected?: boolean;
}

export function StudioLayout({ 
  children, 
  activeTab, 
  onTabChange, 
  projectName, 
  onProjectNameChange, 
  isSaving, 
  onSave, 
  hasUnsavedChanges = false, 
  canUndo = false, 
  canRedo = false, 
  onUndo, 
  onRedo, 
  recoveryAvailable = false, 
  onRestoreRecovery, 
  onDismissRecovery, 
  onResetProject,
  onOpenAiAssistant, 
  onOpenDirector,
  onToggleHealthPanel,
  isHealthPanelOpen = false,
  onOpenVoiceRecorder, 
  isDbConnected = true 
}: StudioLayoutProps) {
  
  const [isEditingName, setIsEditingName] = useState(false);
  const [tempName, setTempName] = useState(projectName);

  const tabs = [
    { id: 'media', label: 'Filmy', icon: Layout },
    { id: 'quick', label: 'Szybki Montaż', icon: Zap },
    { id: 'timeline', label: 'Edytor', icon: Film },
    { id: 'chapters', label: 'Plan', icon: Bookmark },
    { id: 'preview', label: 'Podgląd', icon: Search },
    { id: 'export', label: 'Zapisz', icon: Download },
  ];

  const handleFinishNameEdit = () => {
    setIsEditingName(false);
    if (tempName.trim() && onProjectNameChange) {
      onProjectNameChange(tempName.trim());
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#090909] text-[#F2EFE8]">
      
      {/* Session Recovery Banner */}
      {recoveryAvailable && (
        <div className="bg-[#1C1708] border-b border-[#D4AF37]/40 px-4 py-2.5 flex flex-wrap items-center justify-between gap-3 text-xs text-[#F2EFE8] z-50 shadow-lg">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-[#D4AF37] shrink-0" />
            <span>Wykryto zapisany szkic projektu. Czy chcesz go przywrócić, czy zacząć na nowo z czystym projektem?</span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={onRestoreRecovery}
              className="px-3 py-1 bg-[#D4AF37] text-black font-bold rounded-lg text-[11px] hover:bg-[#FDE047] transition-colors cursor-pointer shadow"
            >
              Przywróć szkic
            </button>
            <button
              onClick={onDismissRecovery}
              className="px-2.5 py-1 bg-[#221C18] text-[#AAA69D] hover:text-red-400 border border-[#3A2A20] rounded-lg text-[11px] transition-colors cursor-pointer"
              title="Usuwa stary szkic ze startu aplikacji i rozpoczyna czysty projekt"
            >
              Usuń stare i zacznij na czysto
            </button>
          </div>
        </div>
      )}

      {/* Top Header - Desktop */}
      <header className="hidden lg:flex h-16 border-b border-[#2A2824] bg-[#121212] items-center justify-between px-6 shrink-0 z-40">
        
        {/* Left: Brand & Editable Project Name */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 text-[#D4AF37]">
            <Film className="w-5 h-5" />
            <span className="font-serif-luxury font-bold tracking-wider text-sm">NIEZAPOMNIANE CHWILE</span>
          </div>
          <div className="h-5 w-px bg-[#2A2824] mx-1" />
          
          {isEditingName ? (
            <input 
              type="text" 
              value={tempName}
              onChange={(e) => setTempName(e.target.value)}
              onBlur={handleFinishNameEdit}
              onKeyDown={(e) => e.key === 'Enter' && handleFinishNameEdit()}
              autoFocus
              className="bg-[#181818] border border-[#D4AF37] rounded px-2 py-0.5 text-xs text-white focus:outline-none"
            />
          ) : (
            <button 
              onClick={() => { setTempName(projectName); setIsEditingName(true); }}
              className="font-medium text-xs text-[#F2EFE8] hover:text-[#D4AF37] truncate max-w-[180px] text-left cursor-pointer"
              title="Kliknij, aby zmienić nazwę projektu"
            >
              {projectName || 'Projekt_Weselny'}
            </button>
          )}

          {/* Autosave badge */}
          <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-[#1A1A1A] border border-[#2A2824] text-[#AAA69D]">
            {hasUnsavedChanges ? 'Autozapis (IndexedDB)...' : 'Zsynchronizowano'}
          </span>
        </div>

        {/* Center Tabs */}
        <div className="flex items-center gap-1 bg-[#0D0D0D] p-1 rounded-xl border border-[#222]">
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => onTabChange(tab.id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer ${
                activeTab === tab.id 
                  ? 'bg-[#1E1C17] text-[#D4AF37] border border-[#D4AF37]/30 shadow-sm' 
                  : 'text-[#AAA69D] hover:text-[#F2EFE8] hover:bg-[#151515]'
              }`}
            >
              <div className="flex items-center gap-1.5">
                <tab.icon className="w-3.5 h-3.5" />
                <span>{tab.label}</span>
              </div>
            </button>
          ))}
        </div>

        {/* Right Tools: Voiceover, AI, History, Diagnostics, Help & Auth */}
        <div className="flex items-center gap-2.5">
          
          {/* Quick Voiceover trigger */}
          {onOpenVoiceRecorder && (
            <button
              onClick={onOpenVoiceRecorder}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs bg-[#1A1A1A] border border-[#2A2824] text-[#AAA69D] hover:text-[#D4AF37] hover:border-[#D4AF37]/40 transition-colors cursor-pointer"
              title="Nagraj głos lektora lub przysięgę ślubną"
            >
              <Mic className="w-3.5 h-3.5 text-[#D4AF37]" />
              <span className="hidden xl:inline">Lektor</span>
            </button>
          )}

          {/* AI Wedding Director Button */}
          {onOpenDirector && (
            <button
              onClick={onOpenDirector}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs bg-gradient-to-r from-[#D4AF37]/20 to-[#D4AF37]/10 border border-[#D4AF37] text-[#D4AF37] hover:bg-[#D4AF37]/25 transition-all cursor-pointer font-bold shadow-[0_0_12px_rgba(212,175,55,0.15)]"
              title="Otwórz moduł Reżysera AI (Najlepsze ujęcia, eliminacja dubli, propozycje)"
            >
              <Sparkles className="w-3.5 h-3.5 text-[#D4AF37]" />
              <span>Reżyser AI</span>
            </button>
          )}

          {/* Project Health Panel Toggle */}
          {onToggleHealthPanel && (
            <button
              onClick={onToggleHealthPanel}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs border transition-colors cursor-pointer ${
                isHealthPanelOpen 
                  ? 'bg-emerald-950/40 border-emerald-500/60 text-emerald-300' 
                  : 'bg-[#1A1A1A] border-[#2A2824] text-[#AAA69D] hover:text-white'
              }`}
              title="Stan integralności projektu (Health Check)"
            >
              <ShieldCheck className="w-3.5 h-3.5 text-[#D4AF37]" />
              <span className="hidden xl:inline">Stan</span>
            </button>
          )}

          {/* AI Assistant Button */}
          {onOpenAiAssistant && (
            <button
              onClick={onOpenAiAssistant}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs bg-[#1C1A14] border border-[#2A2824] text-[#AAA69D] hover:text-[#D4AF37] hover:border-[#D4AF37]/50 transition-all cursor-pointer font-medium"
              title="Otwórz Asystenta Montażu AI"
            >
              <Wand2 className="w-3.5 h-3.5" />
              <span className="hidden xl:inline">Czat AI</span>
            </button>
          )}

          {/* History Undo / Redo */}
          <div className="flex items-center gap-0.5 bg-[#1A1A1A] p-0.5 rounded-lg border border-[#2A2824]">
            <button
              onClick={onUndo}
              disabled={!canUndo}
              className="p-1.5 rounded hover:bg-[#252525] text-[#AAA69D] hover:text-white disabled:opacity-30 disabled:hover:bg-transparent cursor-pointer"
              title="Cofnij (Ctrl+Z)"
            >
              <Undo2 className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={onRedo}
              disabled={!canRedo}
              className="p-1.5 rounded hover:bg-[#252525] text-[#AAA69D] hover:text-white disabled:opacity-30 disabled:hover:bg-transparent cursor-pointer"
              title="Ponów (Ctrl+Y)"
            >
              <Redo2 className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="h-5 w-px bg-[#2A2824]" />

          {onResetProject && (
            <button
              onClick={() => {
                if (window.confirm("Czy na pewno chcesz rozpocząć NOWY, czysty projekt? Wszystkie stare wczytane filmy zostaną całkowicie usunięte z bazy danych i pamięci podręcznej.")) {
                  onResetProject();
                }
              }}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium text-[#AAA69D] hover:text-amber-400 hover:bg-[#1C1710] transition-colors border border-[#2A2824] cursor-pointer"
              title="Rozpocznij nowy, czysty projekt bez starych filmów"
            >
              <RotateCcw className="w-3.5 h-3.5 text-amber-500" />
              <span className="hidden xl:inline">Nowy projekt</span>
            </button>
          )}

          <AuthStatus />
          
          <PWAInstallButton />
          
          <button 
            onClick={onSave}
            disabled={isSaving}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium text-[#AAA69D] hover:bg-[#191919] transition-colors border border-[#2A2824] cursor-pointer"
          >
            {isSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin text-[#D4AF37]" /> : <Save className="w-3.5 h-3.5 text-[#D4AF37]" />}
            <span>{isSaving ? 'Zapisywanie...' : 'Zapisz'}</span>
          </button>
          
          <button 
            onClick={() => onTabChange('export')}
            className="luxury-btn-primary px-4 py-1.5 rounded-lg text-xs font-bold uppercase cursor-pointer"
          >
            Eksportuj
          </button>
        </div>
      </header>

      {/* Top Header - Mobile / Tablet */}
      <header className="lg:hidden h-14 border-b border-[#2A2824] bg-[#121212] flex items-center justify-between px-3 shrink-0 z-40">
        <div className="flex items-center gap-2 text-[#D4AF37]">
          <Film className="w-4 h-4 shrink-0" />
          <span className="font-serif-luxury font-bold text-xs tracking-wider truncate max-w-[100px]">{projectName}</span>
        </div>

        <div className="flex items-center gap-1.5">
          {onResetProject && (
            <button
              onClick={() => {
                if (window.confirm("Czy na pewno chcesz rozpocząć NOWY, czysty projekt? Wszystkie stare wczytane filmy zostaną całkowicie usunięte z bazy danych i pamięci podręcznej.")) {
                  onResetProject();
                }
              }}
              className="p-1.5 text-amber-400 hover:bg-[#201A10] rounded-lg cursor-pointer"
              title="Nowy czysty projekt (usuń stare filmy)"
            >
              <RotateCcw className="w-4 h-4" />
            </button>
          )}

          {onOpenVoiceRecorder && (
            <button
              onClick={onOpenVoiceRecorder}
              className="p-1.5 text-[#D4AF37] hover:bg-[#202020] rounded-lg"
              title="Lektor"
            >
              <Mic className="w-4 h-4" />
            </button>
          )}

          {onOpenAiAssistant && (
            <button
              onClick={onOpenAiAssistant}
              className="p-1.5 text-[#D4AF37] hover:bg-[#202020] rounded-lg"
              title="AI Asystent"
            >
              <Sparkles className="w-4 h-4" />
            </button>
          )}

          {/* Undo/Redo */}
          <button
            onClick={onUndo}
            disabled={!canUndo}
            className="p-1 text-[#AAA69D] disabled:opacity-30"
            title="Cofnij"
          >
            <Undo2 className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={onRedo}
            disabled={!canRedo}
            className="p-1 text-[#AAA69D] disabled:opacity-30"
            title="Ponów"
          >
            <Redo2 className="w-3.5 h-3.5" />
          </button>

          <button 
            onClick={onSave}
            disabled={isSaving}
            className="flex items-center gap-1 px-2 py-1 rounded-full bg-[#191919] border border-[#2A2824] text-[11px] font-medium text-[#AAA69D]"
          >
            {isSaving ? <Loader2 className="w-3 h-3 animate-spin text-[#D4AF37]" /> : <Save className="w-3 h-3 text-[#D4AF37]" />}
            <span>{isSaving ? '...' : 'Zapisz'}</span>
          </button>

          <AuthStatus isCompact />

          <PWAInstallButton className="scale-90" />
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 relative overflow-y-auto overflow-x-hidden flex flex-col md:flex-row">
        {children}
      </main>

      {/* Bottom Navigation - Mobile Only (Scrollable horizontally on narrow screens) */}
      <nav className="lg:hidden min-h-16 h-[calc(4rem+env(safe-area-inset-bottom))] border-t border-[#2A2824] bg-[#121212] flex items-start pt-2 justify-start sm:justify-around px-2 shrink-0 z-40 pb-safe overflow-x-auto touch-pan-x no-scrollbar">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => onTabChange(tab.id)}
            className={`flex flex-col items-center justify-center min-w-[56px] px-2 h-12 gap-1 transition-colors shrink-0 ${
              activeTab === tab.id ? 'text-[#D4AF37]' : 'text-[#AAA69D]'
            }`}
          >
            <tab.icon className={`w-4 h-4 ${activeTab === tab.id ? 'fill-[#D4AF37]/10' : ''}`} />
            <span className="text-[9px] font-medium whitespace-nowrap">{tab.label}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}
