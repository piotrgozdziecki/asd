import React, { useState, useEffect } from 'react';
import { Layers, Play, Trash2, Download, AlertCircle, CheckCircle2, XCircle, Clock } from 'lucide-react';
import { batchRenderQueue, RenderJob } from '../../core/export/batchRenderQueue';
import { downloadRenderBlob } from '../../core/export/downloadService';
import { useStudioToast } from '../common/ToastContext';

interface BatchRenderPanelProps {
  onClose?: () => void;
}

export function BatchRenderPanel({ onClose }: BatchRenderPanelProps) {
  const [jobs, setJobs] = useState<RenderJob[]>([]);
  const [downloading, setDownloading] = useState<string | null>(null);
  const toast = useStudioToast();

  useEffect(() => {
    const unsubscribe = batchRenderQueue.subscribe(setJobs);
    return unsubscribe;
  }, []);

  const handleDownload = async (job: RenderJob) => {
    if (!job.output) return;
    setDownloading(job.id);
    try {
      const result = await downloadRenderBlob(
        job.projectId,
        job.output.fileName,
        (progress) => {
          // Progress callback
        }
      );
      if (result.success) {
        toast.showSuccess(result.message);
      } else {
        toast.showError(result.message);
      }
    } finally {
      setDownloading(null);
    }
  };

  const formatDuration = (sec: number) => {
    const mins = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${mins}:${s.toString().padStart(2, '0')}`;
  };

  if (jobs.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 w-96 bg-[#1a1a1e] border border-[#2a2a30] rounded-2xl shadow-2xl p-4 max-h-96 overflow-y-auto">
      <div className="flex items-center justify-between mb-4 pb-4 border-b border-[#2a2a30]">
        <div className="flex items-center gap-2">
          <Layers className="w-4 h-4 text-[#d4af37]" />
          <span className="text-xs font-bold text-[#d4af37] uppercase tracking-wider">
            Batch Queue ({jobs.length})
          </span>
        </div>
        {jobs.some(j => j.status === 'completed') && (
          <button
            onClick={() => batchRenderQueue.clearCompleted()}
            className="text-xs text-[#888] hover:text-white transition-colors"
          >
            Clear Done
          </button>
        )}
      </div>

      <div className="space-y-2">
        {jobs.map(job => (
          <div
            key={job.id}
            className={`p-3 rounded-lg border text-xs ${
              job.status === 'processing'
                ? 'bg-[#2a2014] border-[#d4af37] border-2'
                : job.status === 'completed'
                ? 'bg-[#1a3a1a] border-emerald-800'
                : job.status === 'failed'
                ? 'bg-[#3a1a1a] border-rose-800'
                : 'bg-[#161619] border-[#2a2a30]'
            }`}
          >
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2 flex-1">
                {job.status === 'processing' && (
                  <div className="w-2 h-2 rounded-full bg-[#d4af37] animate-pulse" />
                )}
                {job.status === 'completed' && (
                  <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                )}
                {job.status === 'failed' && <XCircle className="w-3 h-3 text-rose-400" />}
                <span className="font-mono text-white truncate">{job.projectName}</span>
                <span className="text-[#888]">{job.config.resolution}</span>
              </div>
              <span
                className={`px-2 py-0.5 rounded font-mono font-bold ${
                  job.status === 'processing'
                    ? 'bg-[#d4af37]/20 text-[#fde047]'
                    : job.status === 'completed'
                    ? 'bg-emerald-950/50 text-emerald-400'
                    : job.status === 'failed'
                    ? 'bg-rose-950/50 text-rose-400'
                    : 'bg-[#222]/50 text-[#888]'
                }`}
              >
                {job.status}
              </span>
            </div>

            {job.status === 'processing' && (
              <div className="space-y-1">
                <div className="w-full bg-[#000]/50 rounded-full h-1.5 overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-[#d4af37] to-[#fde047] transition-all"
                    style={{ width: `${job.progress}%` }}
                  />
                </div>
                <div className="flex justify-between text-[10px] text-[#888]">
                  <span>{job.progress}%</span>
                  <span>{formatDuration(job.config.durationSec)}</span>
                </div>
              </div>
            )}

            {job.status === 'failed' && job.error && (
              <div className="flex items-start gap-1.5 text-rose-300 text-[10px]">
                <AlertCircle className="w-3 h-3 mt-0.5 flex-shrink-0" />
                <span>{job.error}</span>
              </div>
            )}

            {job.status === 'completed' && (
              <div className="flex items-center gap-2 justify-between">
                <span className="text-emerald-300 text-[10px] flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  {job.completedAt && new Date(job.completedAt).toLocaleTimeString()}
                </span>
                <button
                  onClick={() => handleDownload(job)}
                  disabled={downloading === job.id}
                  className="flex items-center gap-1 px-2 py-1 bg-[#d4af37] hover:bg-[#e5c158] text-black font-bold text-[10px] rounded transition-colors disabled:opacity-50 cursor-pointer"
                >
                  <Download className="w-3 h-3" />
                  {downloading === job.id ? 'Downloading...' : 'Download'}
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
