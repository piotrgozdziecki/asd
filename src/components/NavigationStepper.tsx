import React from 'react';
import { 
  Sparkles, 
  FileText, 
  PlayCircle, 
  FolderHeart, 
  Check 
} from 'lucide-react';
import { AppViewTab, Storyboard } from '../types/legacy';

interface NavigationStepperProps {
  activeTab: AppViewTab;
  setActiveTab: (tab: AppViewTab) => void;
  mediaCount: number;
  storyboard: Storyboard | null;
  savedStoriesCount: number;
  hasCover?: boolean;
  onOpenAutoMontage?: () => void;
  triggerHaptic?: (ms: number) => void;
}

export const STEPS: { id: AppViewTab; stepNumber: number; title: string; subtitle: string; icon: any }[] = [
  { 
    id: 'studio', 
    stepNumber: 1, 
    title: '1. Klipy & Podpisy', 
    subtitle: 'Wgraj & Ułóż Filmy',
    icon: Sparkles 
  },
  { 
    id: 'timeline', 
    stepNumber: 2, 
    title: '2. Montaż & Reżyseria', 
    subtitle: 'Oś Czasu & Muzyka',
    icon: FileText 
  },
  { 
    id: 'cinema', 
    stepNumber: 3, 
    title: '3. Odtwarzacz & Eksport', 
    subtitle: 'Połącz & Pobierz Film',
    icon: PlayCircle 
  },
  { 
    id: 'vault', 
    stepNumber: 4, 
    title: '4. Skarbiec', 
    subtitle: 'Zapisane Projekty',
    icon: FolderHeart 
  }
];

export const NavigationStepper: React.FC<NavigationStepperProps> = ({
  activeTab,
  setActiveTab,
  mediaCount,
  storyboard,
  savedStoriesCount,
  triggerHaptic
}) => {
  return (
    <div className="w-full">
      {/* Visual Stepper Bar (Desktop & Mobile) */}
      <div className="flex overflow-x-auto md:overflow-visible items-center md:justify-between gap-2 py-2 px-2 mb-2 bg-[#030303]/70 backdrop-blur-xl md:rounded-2xl border-b md:border border-white/10 shadow-lg no-scrollbar">
        {STEPS.map((step) => {
          const Icon = step.icon;
          const isActive = activeTab === step.id;
          
          let isCompleted = false;
          let badge: React.ReactNode = null;

          if (step.id === 'studio' && mediaCount > 0) {
            isCompleted = true;
            badge = <span className="text-[0.625rem] px-1.5 py-0.5 rounded-full bg-[#D4AF37] text-black font-bold font-mono shrink-0">{mediaCount}</span>;
          } else if (step.id === 'timeline' && storyboard) {
            isCompleted = true;
            badge = <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse shrink-0" />;
          } else if (step.id === 'vault') {
            badge = <span className="text-[0.625rem] px-1.5 py-0.5 rounded-full bg-white/15 text-[#D4AF37] font-bold font-mono shrink-0">{savedStoriesCount}</span>;
          }

          return (
            <button
              key={step.id}
              id={`stepper-tab-${step.id}`}
              onClick={() => {
                setActiveTab(step.id);
                if (triggerHaptic) triggerHaptic(15);
              }}
              className={`flex-none md:flex-1 flex items-center gap-2.5 p-2 rounded-xl transition-all text-left cursor-pointer group min-w-[160px] md:min-w-0 ${
                isActive 
                  ? 'glass-panel-gold border-[#D4AF37] text-[#FDE047] shadow-md' 
                  : 'hover:bg-white/5 text-stone-300'
              }`}
            >
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 transition-transform group-hover:scale-105 ${
                isActive 
                  ? 'bg-[#D4AF37] text-black font-bold shadow-md shadow-[#D4AF37]/30' 
                  : isCompleted 
                  ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' 
                  : 'bg-white/10 text-stone-400 border border-white/10'
              }`}>
                {isCompleted && !isActive ? (
                  <Check className="w-4 h-4 text-emerald-400 stroke-[3]" />
                ) : (
                  <Icon className="w-4 h-4" />
                )}
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-mono-label font-bold truncate block">{step.title}</span>
                  {badge}
                </div>
                <span className="text-[0.6875rem] font-sans-modern opacity-70 truncate block">{step.subtitle}</span>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
};
