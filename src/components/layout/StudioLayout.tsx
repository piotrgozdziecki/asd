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
  Zap,
  Scissors,
  Settings
} from 'lucide-react';
import { useAuth } from '../../lib/firebase/AuthContext';
import { PWAInstallButton } from '../common/PWAInstallButton';
import { ConfirmModal } from '../common/ConfirmModal';

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
  const [isResetConfirmOpen, setIsResetConfirmOpen] = useState(false);

  const tabs = [
    { id: 'project', label: 'Projekt', icon: Layout },
    { id: 'media', label: 'Media', icon: Film },
    { id: 'montage', label: 'Montaż', icon: Scissors },
    { id: 'export', label: 'Eksport', icon: Download },
    { id: 'settings', label: 'Ustawienia', icon: Settings },
  ];

  const handleFinishNameEdit = () => {
    setIsEditingName(false);
    if (tempName.trim() && onProjectNameChange) {
      onProjectNameChange(tempName.trim());
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#070707] text-[#F5F2EA] relative selection:bg-[#D4AF37] selection:text-black">
      {/* Subtle Cinematic Ambient Lighting */}
      <div className="fixed top-0 left-1/2 -translate-x-1/2 w-[1000px] h-[350px] bg-gradient-to-b from-[#D4AF37]/10 via-[#9A7B1C]/5 to-transparent blur-[120px] pointer-events-none z-0" />
      <div className="fixed -bottom-40 -right-40 w-[600px] h-[600px] bg-[#9A7B1C]/5 blur-[140px] pointer-events-none z-0" />
      
      {/* Session Recovery Banner */}
      {recoveryAvailable && (
        <div className="relative bg-gradient-to-r from-[#241A08] via-[#1A1406] to-[#241A08] border-b border-[#D4AF37]/50 px-5 py-2.5 flex flex-wrap items-center justify-between gap-3 text-xs text-[#F5F2EA] z-50 shadow-[0_8px_30px_rgba(0,0,0,0.8)] backdrop-blur-md">
          <div className="flex items-center gap-2.5">
            <span className="p-1 rounded-full bg-[#D4AF37]/20 border border-[#D4AF37]/40 text-[#FDE047]">
              <AlertCircle className="w-3.5 h-3.5" />
            </span>
            <span className="font-medium tracking-wide">Wykryto zapisaną sesję projektu ślubnego. Czy chcesz przywrócić ostatni stan montażu?</span>
          </div>
          <div className="flex items-center gap-2.5 shrink-0">
            <button
              onClick={onRestoreRecovery}
              className="px-3.5 py-1.5 luxury-btn-primary rounded-lg text-[11px] font-bold tracking-wider uppercase cursor-pointer"
            >
              Przywróć szkic
            </button>
            <button
              onClick={onDismissRecovery}
              className="px-3 py-1.5 bg-[#181310] text-[#A89E8D] hover:text-rose-400 border border-[#3E2C1A] rounded-lg text-[11px] transition-colors cursor-pointer hover:border-rose-500/30"
              title="Usuwa stary szkic ze startu aplikacji i rozpoczyna czysty projekt"
            >
              Zacznij na czysto
            </button>
          </div>
        </div>
      )}

      {/* Top Header - Desktop (Haute Couture Atelier Console) */}
      <header className="hidden lg:flex h-16 border-b border-[#26221A] bg-[#0E0D0B]/85 backdrop-blur-2xl items-center justify-between px-6 shrink-0 z-40 shadow-[0_4px_30px_rgba(0,0,0,0.6)]">
        
        {/* Left: Brand & Editable Project Name */}
        <div className="flex items-center gap-3.5">
          <div className="flex items-center gap-2.5">
            <div className="relative w-9 h-9 rounded-xl bg-gradient-to-br from-[#2D2411] to-[#12100A] border border-[#D4AF37]/40 flex items-center justify-center shadow-[0_0_15px_rgba(212,175,55,0.2)]">
              <Film className="w-4 h-4 text-[#FDE047]" />
              <div className="absolute inset-0 rounded-xl bg-[#D4AF37]/10 animate-pulse-subtle pointer-events-none" />
            </div>
            <div>
              <span className="font-cinematic font-bold tracking-[0.14em] text-sm text-transparent bg-clip-text bg-gradient-to-r from-[#FFF5C0] via-[#D4AF37] to-[#E3C368] drop-shadow-sm block leading-none">
                NIEZAPOMNIANE CHWILE
              </span>
              <span className="text-[8.5px] uppercase tracking-[0.24em] text-[#9E9070] font-semibold mt-1 block">
                ATELIER MONTAŻU ŚLUBNEGO • 4K HDR
              </span>
            </div>
          </div>

          <div className="h-6 w-px bg-gradient-to-b from-transparent via-[#3A3222] to-transparent mx-1" />
          
          {isEditingName ? (
            <input 
              type="text" 
              value={tempName}
              onChange={(e) => setTempName(e.target.value)}
              onBlur={handleFinishNameEdit}
              onKeyDown={(e) => e.key === 'Enter' && handleFinishNameEdit()}
              autoFocus
              className="bg-[#16130D] border border-[#D4AF37] rounded-lg px-2.5 py-1 text-xs text-white focus:outline-none shadow-[0_0_15px_rgba(212,175,55,0.25)] font-medium"
            />
          ) : (
            <button 
              onClick={() => { setTempName(projectName); setIsEditingName(true); }}
              className="group flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[#14120D] border border-[#2D261A] hover:border-[#D4AF37]/50 text-xs text-[#EADFC9] hover:text-[#FDE047] transition-all cursor-pointer max-w-[200px]"
              title="Kliknij, aby zmienić nazwę filmu ślubnego"
            >
              <span className="truncate font-medium">{projectName || 'Film_Weselny'}</span>
              <span className="text-[10px] text-[#8C7D5B] opacity-0 group-hover:opacity-100 transition-opacity">✎</span>
            </button>
          )}

          {/* Sync indicator */}
          <span className="text-[9.5px] font-mono uppercase tracking-wider px-2 py-0.5 rounded-full bg-[#18150F] border border-[#2A2317] text-[#A69777] flex items-center gap-1">
            <span className={`w-1.5 h-1.5 rounded-full ${hasUnsavedChanges ? 'bg-amber-400 animate-pulse' : 'bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.8)]'}`} />
            {hasUnsavedChanges ? 'Zapisywanie...' : 'Zsynchronizowano'}
          </span>
        </div>

        {/* Center Tabs - Floating Glass Dock */}
        <div className="flex items-center gap-1 p-1 rounded-2xl dock-pill">
          {tabs.map(tab => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => onTabChange(tab.id)}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold tracking-wide transition-all cursor-pointer relative ${
                  isActive 
                    ? 'dock-pill-active text-[#FDE047]' 
                    : 'text-[#A09886] hover:text-[#F5F2EA] hover:bg-white/[0.04]'
                }`}
              >
                <div className="flex items-center gap-1.5 relative z-10">
                  <tab.icon className={`w-3.5 h-3.5 ${isActive ? 'text-[#FDE047]' : 'text-[#8E8675]'}`} />
                  <span>{tab.label}</span>
                </div>
              </button>
            );
          })}
        </div>

        {/* Right Tools: Voiceover, AI, History, Diagnostics, Help & Auth */}
        <div className="flex items-center gap-2">
          
          {/* Quick Voiceover trigger */}
          {onOpenVoiceRecorder && (
            <button
              onClick={onOpenVoiceRecorder}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs bg-[#16130D] border border-[#2D261A] text-[#B0A590] hover:text-[#FDE047] hover:border-[#D4AF37]/40 transition-all cursor-pointer font-medium"
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
              className="animate-gold-shimmer flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs bg-gradient-to-r from-[#3D3012] via-[#2A210C] to-[#1E1708] border border-[#D4AF37]/60 text-[#FDE047] hover:border-[#D4AF37] transition-all cursor-pointer font-bold shadow-[0_0_18px_rgba(212,175,55,0.22)]"
              title="Otwórz moduł Reżysera AI (Najlepsze ujęcia, eliminacja dubli, propozycje)"
            >
              <Sparkles className="w-3.5 h-3.5 text-[#FDE047]" />
              <span>Reżyser AI</span>
            </button>
          )}

          {/* Project Health Panel Toggle */}
          {onToggleHealthPanel && (
            <button
              onClick={onToggleHealthPanel}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs border transition-all cursor-pointer ${
                isHealthPanelOpen 
                  ? 'bg-emerald-950/60 border-emerald-500/60 text-emerald-300 shadow-[0_0_12px_rgba(16,185,129,0.25)]' 
                  : 'bg-[#16130D] border-[#2D261A] text-[#A69C87] hover:text-white hover:border-[#3E3424]'
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
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs bg-[#16130D] border border-[#2D261A] text-[#A69C87] hover:text-[#FDE047] hover:border-[#D4AF37]/40 transition-all cursor-pointer font-medium"
              title="Otwórz Asystenta Montażu AI"
            >
              <Wand2 className="w-3.5 h-3.5" />
              <span className="hidden xl:inline">Czat AI</span>
            </button>
          )}

          {/* History Undo / Redo */}
          <div className="flex items-center gap-0.5 bg-[#14120D] p-0.5 rounded-xl border border-[#262117]">
            <button
              onClick={onUndo}
              disabled={!canUndo}
              className="p-1.5 rounded-lg hover:bg-white/[0.06] text-[#A69C87] hover:text-white disabled:opacity-25 disabled:hover:bg-transparent cursor-pointer transition-colors"
              title="Cofnij (Ctrl+Z)"
            >
              <Undo2 className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={onRedo}
              disabled={!canRedo}
              className="p-1.5 rounded-lg hover:bg-white/[0.06] text-[#A69C87] hover:text-white disabled:opacity-25 disabled:hover:bg-transparent cursor-pointer transition-colors"
              title="Ponów (Ctrl+Y)"
            >
              <Redo2 className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="h-5 w-px bg-gradient-to-b from-transparent via-[#3A3222] to-transparent mx-0.5" />

          {onResetProject && (
            <button
              onClick={() => setIsResetConfirmOpen(true)}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-medium text-[#A69C87] hover:text-amber-300 hover:bg-[#1C170E] transition-all border border-[#2A2317] hover:border-amber-500/40 cursor-pointer"
              title="Rozpocznij nowy, czysty projekt bez starych filmów"
            >
              <RotateCcw className="w-3.5 h-3.5 text-amber-500" />
              <span className="hidden xl:inline">Nowy</span>
            </button>
          )}

          <AuthStatus />
          
          <PWAInstallButton />
          
          <button 
            onClick={onSave}
            disabled={isSaving}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium text-[#A69C87] hover:text-white hover:bg-white/[0.05] transition-all border border-[#2A2317] cursor-pointer"
          >
            {isSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin text-[#D4AF37]" /> : <Save className="w-3.5 h-3.5 text-[#D4AF37]" />}
            <span>{isSaving ? 'Zapis...' : 'Zapisz'}</span>
          </button>
          
          <button 
            onClick={() => onTabChange('export')}
            className="luxury-btn-primary px-4 py-1.5 rounded-xl text-xs font-bold uppercase tracking-wider cursor-pointer shadow-[0_4px_20px_rgba(212,175,55,0.35)]"
          >
            Eksportuj
          </button>
        </div>
      </header>

      {/* Top Header - Mobile / Tablet */}
      <header className="lg:hidden h-14 border-b border-[#26221A] bg-[#0E0D0B]/95 backdrop-blur-xl flex items-center justify-between px-3 shrink-0 z-40 shadow-lg w-full max-w-full overflow-hidden">
        <div className="flex items-center gap-2 text-[#D4AF37] min-w-0 shrink">
          <div className="w-7 h-7 rounded-lg bg-[#241D0E] border border-[#D4AF37]/40 flex items-center justify-center shrink-0">
            <Film className="w-3.5 h-3.5 text-[#FDE047]" />
          </div>
          <span className="font-cinematic font-bold text-xs tracking-wider truncate max-w-[110px] xs:max-w-[160px] text-transparent bg-clip-text bg-gradient-to-r from-[#FFF0A0] to-[#D4AF37]">
            {projectName}
          </span>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          {onResetProject && (
            <button
              onClick={() => setIsResetConfirmOpen(true)}
              className="p-1.5 text-amber-400 hover:bg-[#201A10] rounded-lg cursor-pointer"
              title="Nowy czysty projekt"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
          )}

          {onOpenVoiceRecorder && (
            <button
              onClick={onOpenVoiceRecorder}
              className="p-1.5 text-[#D4AF37] hover:bg-[#202020] rounded-lg hidden xs:flex items-center justify-center"
              title="Lektor"
            >
              <Mic className="w-3.5 h-3.5" />
            </button>
          )}

          {onOpenAiAssistant && (
            <button
              onClick={onOpenAiAssistant}
              className="p-1.5 text-[#D4AF37] hover:bg-[#202020] rounded-lg"
              title="AI Asystent"
            >
              <Sparkles className="w-3.5 h-3.5" />
            </button>
          )}

          {/* Undo/Redo */}
          {canUndo && (
            <button
              onClick={onUndo}
              className="p-1.5 text-[#AAA69D] hover:text-white rounded-lg"
              title="Cofnij"
            >
              <Undo2 className="w-3.5 h-3.5" />
            </button>
          )}
          {canRedo && (
            <button
              onClick={onRedo}
              className="p-1.5 text-[#AAA69D] hover:text-white rounded-lg hidden sm:flex"
              title="Ponów"
            >
              <Redo2 className="w-3.5 h-3.5" />
            </button>
          )}

          <button 
            onClick={onSave}
            disabled={isSaving}
            className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[#18150F] border border-[#2D261A] text-[11px] font-medium text-[#C8BDA6] cursor-pointer"
          >
            {isSaving ? <Loader2 className="w-3 h-3 animate-spin text-[#D4AF37]" /> : <Save className="w-3 h-3 text-[#D4AF37]" />}
            <span className="hidden xs:inline">{isSaving ? '...' : 'Zapisz'}</span>
          </button>

          <AuthStatus isCompact />

          <PWAInstallButton className="scale-75 hidden sm:flex" />
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 relative overflow-hidden flex flex-col min-w-0 w-full max-w-full">
        {children}
      </main>

      {/* Bottom Navigation - Mobile Only (Even 5-col grid for the 5 main sections with 44px+ touch targets) */}
      <nav className="lg:hidden min-h-16 h-[calc(4rem+env(safe-area-inset-bottom))] border-t border-[#26221A] bg-[#0E0D0B]/95 backdrop-blur-2xl grid grid-cols-5 items-center px-1 shrink-0 z-40 pb-safe w-full max-w-full">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => onTabChange(tab.id)}
            className={`flex flex-col items-center justify-center py-2 px-1 h-14 gap-1 transition-colors w-full min-w-0 min-h-[44px] cursor-pointer ${
              activeTab === tab.id ? 'text-[#FDE047]' : 'text-[#8C8370]'
            }`}
          >
            <tab.icon className={`w-4 h-4 shrink-0 ${activeTab === tab.id ? 'fill-[#D4AF37]/20 drop-shadow-[0_0_8px_rgba(212,175,55,0.4)]' : ''}`} />
            <span className="text-[10px] font-semibold truncate max-w-full text-center tracking-tight">{tab.label}</span>
          </button>
        ))}
      </nav>

      {/* Luxury Confirm Reset Modal */}
      <ConfirmModal
        isOpen={isResetConfirmOpen}
        title="Rozpocząć nowy projekt?"
        message="Czy na pewno chcesz rozpocząć nowy, czysty projekt? Wszystkie wczytane materiały i sekwencje zostaną usunięte z pamięci podręcznej i bazy danych, umożliwiając stworzenie świeżej kompozycji od zera."
        confirmText="Rozpocznij nowy projekt"
        cancelText="Anuluj"
        type="danger"
        onConfirm={() => {
          setIsResetConfirmOpen(false);
          if (onResetProject) onResetProject();
        }}
        onCancel={() => setIsResetConfirmOpen(false)}
      />
    </div>
  );
}
