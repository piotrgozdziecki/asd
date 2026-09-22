import React, { useState } from 'react';
import { 
  Activity, 
  CheckCircle2, 
  AlertTriangle, 
  XCircle, 
  HelpCircle, 
  RotateCw, 
  Wrench, 
  ChevronDown, 
  ChevronUp,
  HardDrive,
  Film,
  Layers,
  Volume2,
  Cpu
} from 'lucide-react';
import { ProjectState } from '../../types/project';
import { 
  ProjectHealthReport, 
  createInitialUntestedHealthReport, 
  runRealRuntimeHealthCheck, 
  autoFixProjectHealthIssues 
} from '../../core/director/projectHealthEngine';

interface ProjectHealthPanelProps {
  project: ProjectState;
  onApplyFixedProject: (updated: ProjectState) => void;
  onOpenFullReport?: () => void;
}

export function ProjectHealthPanel({
  project,
  onApplyFixedProject,
  onOpenFullReport
}: ProjectHealthPanelProps) {
  const [report, setReport] = useState<ProjectHealthReport>(createInitialUntestedHealthReport());
  const [isChecking, setIsChecking] = useState<boolean>(false);
  const [isExpanded, setIsExpanded] = useState<boolean>(false);
  const [fixSuccessMsg, setFixSuccessMsg] = useState<string | null>(null);

  const handleRunTest = async () => {
    setIsChecking(true);
    setFixSuccessMsg(null);
    try {
      const res = await runRealRuntimeHealthCheck(project);
      setReport(res);
    } catch (err) {
      console.error('Błąd testu kondycji projektu:', err);
    } finally {
      setIsChecking(false);
    }
  };

  const handleAutoFix = () => {
    const { updatedProject, fixedCount, fixedItems } = autoFixProjectHealthIssues(project);
    if (fixedCount > 0) {
      onApplyFixedProject(updatedProject);
      setFixSuccessMsg(`Naprawiono ${fixedCount} problemów montażowych.`);
      // Re-run test
      runRealRuntimeHealthCheck(updatedProject).then(setReport);
    } else {
      setFixSuccessMsg('Wszystkie elementy osi czasu są poprawne.');
    }
    setTimeout(() => setFixSuccessMsg(null), 5000);
  };

  const getStatusBadge = (status: 'OK' | 'WARNING' | 'ERROR' | 'UNTESTED') => {
    switch (status) {
      case 'OK':
        return (
          <span className="flex items-center gap-1 text-[11px] font-bold text-emerald-400 bg-emerald-950/60 border border-emerald-500/40 px-2 py-0.5 rounded-full">
            <CheckCircle2 className="w-3 h-3" /> OK
          </span>
        );
      case 'WARNING':
        return (
          <span className="flex items-center gap-1 text-[11px] font-bold text-amber-400 bg-amber-950/60 border border-amber-500/40 px-2 py-0.5 rounded-full">
            <AlertTriangle className="w-3 h-3" /> OSTRZEŻENIE
          </span>
        );
      case 'ERROR':
        return (
          <span className="flex items-center gap-1 text-[11px] font-bold text-red-400 bg-red-950/60 border border-red-500/40 px-2 py-0.5 rounded-full">
            <XCircle className="w-3 h-3" /> BŁĄD
          </span>
        );
      case 'UNTESTED':
      default:
        return (
          <span className="flex items-center gap-1 text-[11px] font-medium text-[#888] bg-[#222] border border-[#333] px-2 py-0.5 rounded-full">
            <HelpCircle className="w-3 h-3" /> NIEPRZETESTOWANO
          </span>
        );
    }
  };

  const modulesList = [
    { key: 'media', icon: Film, label: 'Media', data: report.modules.media },
    { key: 'timeline', icon: Layers, label: 'Timeline', data: report.modules.timeline },
    { key: 'audio', icon: Volume2, label: 'Audio', data: report.modules.audio },
    { key: 'render', icon: Cpu, label: 'Render', data: report.modules.render },
    { key: 'storage', icon: HardDrive, label: 'Storage', data: report.modules.storage }
  ];

  return (
    <div className="bg-[#141412] border border-[#2A2824] rounded-xl p-3 shadow-md transition-all">
      {/* Header bar */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-[#D4AF37]/10 text-[#D4AF37] border border-[#D4AF37]/30">
            <Activity className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-white tracking-wide">PROJECT HEALTH</span>
              {report.tested ? (
                getStatusBadge(report.overallStatus)
              ) : (
                <span className="text-[10px] text-[#888] bg-[#1E1E1C] px-2 py-0.5 rounded border border-[#2A2824]">
                  Wymaga testu runtime
                </span>
              )}
            </div>
            <p className="text-[11px] text-[#8E8B82]">
              {report.tested 
                ? `Ostatni test: ${report.testedAt} • ${report.canExport ? 'Gotowy do eksportu' : 'Wymaga naprawy przed eksportem'}`
                : 'Kliknij "Sprawdź", aby wykonać rzeczywisty test plików, koderów i osi'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleRunTest}
            disabled={isChecking}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#1E1C18] border border-[#D4AF37]/40 text-[#D4AF37] hover:bg-[#D4AF37]/20 text-xs font-semibold cursor-pointer transition-all disabled:opacity-50"
          >
            <RotateCw className={`w-3.5 h-3.5 ${isChecking ? 'animate-spin' : ''}`} />
            <span>{isChecking ? 'Testowanie...' : 'Sprawdź (Runtime)'}</span>
          </button>

          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="p-1.5 rounded-lg bg-[#1A1A18] text-[#AAA69D] hover:text-white border border-[#2A2824] cursor-pointer"
            title={isExpanded ? 'Zwiń szczegóły' : 'Rozwiń szczegóły'}
          >
            {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* 5 module pills bar */}
      <div className="grid grid-cols-5 gap-2 mt-3 pt-2.5 border-t border-[#22201C]">
        {modulesList.map(({ key, icon: Icon, label, data }) => (
          <div 
            key={key}
            className="flex flex-col items-center justify-center p-2 rounded-lg bg-[#191917] border border-[#262420] text-center"
          >
            <div className="flex items-center gap-1 text-[11px] font-medium text-[#AAA69D] mb-1">
              <Icon className="w-3 h-3 text-[#D4AF37]" />
              <span>{label}</span>
            </div>
            {getStatusBadge(data.status)}
            {data.metrics && (
              <span className="text-[9px] text-[#777] mt-1 truncate max-w-full px-1">
                {data.metrics}
              </span>
            )}
          </div>
        ))}
      </div>

      {/* Success notification */}
      {fixSuccessMsg && (
        <div className="mt-2.5 p-2 rounded-lg bg-emerald-950/50 border border-emerald-500/40 text-emerald-300 text-xs flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{fixSuccessMsg}</span>
        </div>
      )}

      {/* Expanded details */}
      {isExpanded && (
        <div className="mt-3 pt-3 border-t border-[#22201C] space-y-2.5 text-xs">
          <div className="flex items-center justify-between">
            <span className="font-semibold text-white">Szczegółowa diagnostyka modułowa:</span>
            {report.modules.timeline.canAutoFix && (
              <button
                onClick={handleAutoFix}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-amber-500/20 text-amber-300 border border-amber-500/40 hover:bg-amber-500/30 cursor-pointer font-medium text-[11px]"
              >
                <Wrench className="w-3 h-3" /> Napraw automatycznie oś czasu
              </button>
            )}
          </div>

          <div className="space-y-1.5 max-h-48 overflow-y-auto custom-scrollbar pr-1">
            {modulesList.map(({ key, label, data }) => (
              <div key={key} className="p-2 rounded bg-[#181816] border border-[#24221E] space-y-1">
                <div className="flex items-center justify-between">
                  <span className="font-medium text-[#D4AF37]">{label}</span>
                  <span className="text-[10px] text-[#777]">{data.metrics}</span>
                </div>
                {data.issues.length > 0 ? (
                  <ul className="list-disc list-inside text-[11px] text-[#BBB] space-y-0.5">
                    {data.issues.map((iss, i) => (
                      <li key={i} className={data.status === 'ERROR' ? 'text-red-300' : 'text-amber-200/90'}>
                        {iss}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-[11px] text-emerald-400 flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3" /> Brak uwag - moduł działa optymalnie.
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
