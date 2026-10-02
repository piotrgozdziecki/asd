/**
 * BATCH RENDER QUEUE - Manage multiple export jobs
 * Handles queuing, sequencing, and progress tracking for batch renders
 */

import { renderWorkerPool } from '../render/RenderWorkerPool';
import { localIndexedDB } from '../storage/indexedDBProvider';

export interface RenderJob {
  id: string;
  projectId: string;
  projectName: string;
  plan: any;
  config: {
    resolution: string;
    fps: number;
    videoCodec: string;
    quality: string;
    clipCount: number;
    durationSec: number;
  };
  status: 'queued' | 'processing' | 'completed' | 'failed' | 'cancelled';
  progress: number;
  output?: {
    blob: Blob;
    fileName: string;
    duration: number;
    width: number;
    height: number;
  };
  error?: string;
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
}

export class BatchRenderQueue {
  private queue: RenderJob[] = [];
  private isProcessing = false;
  private currentJobId: string | null = null;
  private listeners = new Set<(jobs: RenderJob[]) => void>();

  /**
   * Add jobs to queue
   */
  enqueueJobs(jobs: RenderJob[]): string[] {
    const ids = jobs.map(job => job.id);
    this.queue.push(...jobs);
    this.notifyListeners();
    this.processQueue();
    return ids;
  }

  /**
   * Main queue processor - runs serially
   */
  private async processQueue() {
    if (this.isProcessing || this.queue.length === 0) return;
    this.isProcessing = true;

    while (this.queue.length > 0) {
      const job = this.queue.find(j => j.status === 'queued');
      if (!job) break;

      this.currentJobId = job.id;
      job.status = 'processing';
      job.startedAt = new Date().toISOString();
      this.notifyListeners();

      try {
        const clipIndex = this.queue.indexOf(job);
        const totalClips = this.queue.length;

        const output = await renderWorkerPool.enqueue({
          id: job.id,
          projectId: job.projectId,
          clipIndex,
          totalClips,
          plan: job.plan,
          onProgress: (percent: number, message: string) => {
            job.progress = percent;
            this.notifyListeners();
          }
        });

        // Save to IndexedDB after successful render
        if (output instanceof Blob) {
          await localIndexedDB.saveMasterRenderBlob(job.projectId, output, {
            fileName: job.config.resolution + '_' + job.config.videoCodec + '.mp4',
            duration: job.config.durationSec,
            width: 1920,
            height: 1080,
            sizeBytes: output.size,
            mimeType: 'video/mp4',
            resolution: job.config.resolution,
            verifiedPlayable: true
          });
        }

        job.status = 'completed';
        job.progress = 100;
        job.completedAt = new Date().toISOString();
        job.output = {
          blob: output,
          fileName: `${job.projectName}_${job.config.resolution}.mp4`,
          duration: job.config.durationSec,
          width: 1920,
          height: 1080
        };
      } catch (error: any) {
        job.status = 'failed';
        job.error = error?.message || 'Unknown error';
        job.completedAt = new Date().toISOString();
      }

      this.notifyListeners();
      this.currentJobId = null;
    }

    this.isProcessing = false;
  }

  /**
   * Cancel a specific job
   */
  cancelJob(jobId: string) {
    const job = this.queue.find(j => j.id === jobId);
    if (job && job.status === 'queued') {
      job.status = 'cancelled';
      this.notifyListeners();
    }
  }

  /**
   * Remove completed/failed jobs
   */
  clearCompleted() {
    this.queue = this.queue.filter(
      j => j.status !== 'completed' && j.status !== 'failed' && j.status !== 'cancelled'
    );
    this.notifyListeners();
  }

  /**
   * Get all jobs
   */
  getJobs(): RenderJob[] {
    return [...this.queue];
  }

  /**
   * Subscribe to queue changes
   */
  subscribe(callback: (jobs: RenderJob[]) => void): () => void {
    this.listeners.add(callback);
    callback(this.queue);
    return () => this.listeners.delete(callback);
  }

  private notifyListeners() {
    this.listeners.forEach(cb => cb([...this.queue]));
  }
}

export const batchRenderQueue = new BatchRenderQueue();
