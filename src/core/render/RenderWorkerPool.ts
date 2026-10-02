/**
 * RENDER WORKER POOL - Multi-threaded video rendering
 * Handles parallel encoding of multiple clips without blocking UI
 */

export interface RenderTask {
  id: string;
  projectId: string;
  clipIndex: number;
  totalClips: number;
  plan: any;
  onProgress: (percent: number, message: string) => void;
}

export interface RenderWorkerMessage {
  type: 'start' | 'progress' | 'complete' | 'error';
  taskId: string;
  data?: any;
  error?: string;
}

export class RenderWorkerPool {
  private workers: Worker[] = [];
  private queue: Array<{ task: RenderTask; resolve: Function; reject: Function }> = [];
  private activeJobs = new Map<string, RenderTask>();
  private workerPool: Map<Worker, boolean> = new Map();

  constructor(private workerCount: number = 4) {
    this.initializeWorkers();
  }

  private initializeWorkers() {
    for (let i = 0; i < this.workerCount; i++) {
      const worker = new Worker(new URL('./render.worker.ts', import.meta.url), { type: 'module' });
      this.workers.push(worker);
      this.workerPool.set(worker, false); // false = available
    }
  }

  /**
   * Enqueue a render task - returns promise that resolves when complete
   */
  async enqueue(task: RenderTask): Promise<Blob> {
    return new Promise((resolve, reject) => {
      const queueItem = { task, resolve, reject };

      const availableWorker = Array.from(this.workerPool.entries()).find(
        ([_, isBusy]) => !isBusy
      )?.[0];

      if (availableWorker) {
        this.processTask(availableWorker, queueItem);
      } else {
        this.queue.push(queueItem);
      }
    });
  }

  private processTask(
    worker: Worker,
    queueItem: { task: RenderTask; resolve: Function; reject: Function }
  ) {
    const { task, resolve, reject } = queueItem;
    this.workerPool.set(worker, true); // Mark as busy
    this.activeJobs.set(task.id, task);

    const handleMessage = (event: MessageEvent<RenderWorkerMessage>) => {
      const message = event.data;

      if (message.taskId !== task.id) return;

      switch (message.type) {
        case 'progress':
          task.onProgress(message.data?.percent || 0, message.data?.message || 'Rendering...');
          break;

        case 'complete':
          worker.removeEventListener('message', handleMessage);
          worker.removeEventListener('error', handleError);
          this.workerPool.set(worker, false); // Mark as available
          this.activeJobs.delete(task.id);
          resolve(message.data?.blob);
          this.processNextInQueue(worker);
          break;

        case 'error':
          worker.removeEventListener('message', handleMessage);
          worker.removeEventListener('error', handleError);
          this.workerPool.set(worker, false);
          this.activeJobs.delete(task.id);
          reject(new Error(message.error || 'Worker render error'));
          this.processNextInQueue(worker);
          break;
      }
    };

    const handleError = (error: ErrorEvent) => {
      worker.removeEventListener('message', handleMessage);
      worker.removeEventListener('error', handleError);
      this.workerPool.set(worker, false);
      this.activeJobs.delete(task.id);
      reject(new Error(`Worker error: ${error.message}`));
      this.processNextInQueue(worker);
    };

    worker.addEventListener('message', handleMessage);
    worker.addEventListener('error', handleError);
    worker.postMessage({ type: 'render', task });
  }

  private processNextInQueue(worker: Worker) {
    if (this.queue.length > 0) {
      const nextQueueItem = this.queue.shift()!;
      this.processTask(worker, nextQueueItem);
    }
  }

  /**
   * Get current queue status
   */
  getStatus() {
    const active = this.activeJobs.size;
    const queued = this.queue.length;
    return {
      active,
      queued,
      available: this.workers.length - active,
      totalWorkers: this.workers.length
    };
  }

  /**
   * Terminate all workers
   */
  terminate() {
    this.workers.forEach(w => w.terminate());
    this.workers = [];
    this.workerPool.clear();
    this.activeJobs.clear();
    this.queue = [];
  }
}

export const renderWorkerPool = new RenderWorkerPool(4);
