import { 
  SerialExportTask, 
  ExportTaskConfig, 
  ExportPlan, 
  ExportTaskStatus, 
  ExportProgress, 
  ExportOutput, 
  ExportError, 
  DiagnosticLogEntry 
} from './videoExportTypes';
import { videoExportService } from './videoExportService';

type QueueListener = (tasks: SerialExportTask[]) => void;

export class ExportQueueService {
  private tasks: SerialExportTask[] = [];
  private activeTaskId: string | null = null;
  private listeners: Set<QueueListener> = new Set();
  private isProcessing = false;

  public subscribe(listener: QueueListener): () => void {
    this.listeners.add(listener);
    listener([...this.tasks]);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify() {
    const copy = [...this.tasks];
    this.listeners.forEach((listener) => {
      try {
        listener(copy);
      } catch (err) {
        console.error('Queue listener error:', err);
      }
    });
  }

  public getTasks(): SerialExportTask[] {
    return [...this.tasks];
  }

  public getActiveTask(): SerialExportTask | null {
    if (!this.activeTaskId) return null;
    return this.tasks.find((t) => t.id === this.activeTaskId) || null;
  }

  public getTaskById(id: string): SerialExportTask | null {
    return this.tasks.find((t) => t.id === id) || null;
  }

  public enqueueTask(params: {
    title: string;
    projectName: string;
    config: ExportTaskConfig;
    plan: ExportPlan;
  }): SerialExportTask {
    const id = `export_task_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    
    const newTask: SerialExportTask = {
      id,
      title: params.title || `Eksport ${params.config.resolution} ${params.config.fps}fps`,
      projectName: params.projectName || 'Projekt Wideo',
      config: params.config,
      plan: params.plan,
      status: 'queued',
      progress: null,
      output: null,
      error: null,
      logs: [],
      createdAt: Date.now()
    };

    this.tasks.push(newTask);
    this.notify();

    // Process serial queue asynchronously
    this.processNextInQueue();

    return newTask;
  }

  private async processNextInQueue() {
    if (this.isProcessing) {
      return;
    }

    const nextTask = this.tasks.find((t) => t.status === 'queued');
    if (!nextTask) {
      this.isProcessing = false;
      this.activeTaskId = null;
      return;
    }

    this.isProcessing = true;
    this.activeTaskId = nextTask.id;
    nextTask.status = 'processing';
    nextTask.startedAt = Date.now();
    this.notify();

    try {
      const output = await videoExportService.startExport(
        nextTask.plan,
        (p: ExportProgress) => {
          const task = this.getTaskById(nextTask.id);
          if (task && task.status === 'processing') {
            task.progress = p;
            this.notify();
          }
        }
      );

      const task = this.getTaskById(nextTask.id);
      if (task && task.status === 'processing') {
        task.status = 'completed';
        task.output = output;
        task.completedAt = Date.now();
        this.notify();
      }
    } catch (err: any) {
      const task = this.getTaskById(nextTask.id);
      if (task && task.status === 'processing') {
        task.status = 'failed';
        task.error = {
          code: err.code || 'EXPORT_FAILED',
          message: err.message || 'Nieoczekiwany błąd podczas renderowania.',
          technicalDetails: err.technicalDetails || String(err)
        };
        task.completedAt = Date.now();
        this.notify();
      }
    } finally {
      this.isProcessing = false;
      this.activeTaskId = null;
      // Continue queue
      setTimeout(() => this.processNextInQueue(), 100);
    }
  }

  public async cancelTask(id: string): Promise<void> {
    const task = this.getTaskById(id);
    if (!task) return;

    if (task.status === 'processing') {
      await videoExportService.cancelExport();
      task.status = 'cancelled';
      task.completedAt = Date.now();
      this.notify();
    } else if (task.status === 'queued') {
      task.status = 'cancelled';
      task.completedAt = Date.now();
      this.notify();
    }
  }

  public retryTask(id: string): void {
    const task = this.getTaskById(id);
    if (!task) return;

    if (task.status === 'failed' || task.status === 'cancelled') {
      task.status = 'queued';
      task.progress = null;
      task.error = null;
      task.output = null;
      task.startedAt = undefined;
      task.completedAt = undefined;
      this.notify();
      this.processNextInQueue();
    }
  }

  public removeTask(id: string): void {
    const task = this.getTaskById(id);
    if (task && task.status === 'processing') {
      this.cancelTask(id);
    }
    this.tasks = this.tasks.filter((t) => t.id !== id);
    this.notify();
  }

  public clearCompleted(): void {
    this.tasks = this.tasks.filter((t) => t.status === 'processing' || t.status === 'queued');
    this.notify();
  }
}

export const exportQueueService = new ExportQueueService();
