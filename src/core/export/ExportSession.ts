import { ExportStage, ExportError, DiagnosticLogEntry, StageDetail } from './videoExportTypes';

export class ExportSession {
  public readonly id: string;
  public readonly startedAt: number;
  public stage: ExportStage = 'PREPARATION';
  public abortController: AbortController;
  public logs: DiagnosticLogEntry[] = [];
  public error: ExportError | null = null;
  public processedFrames = 0;
  public totalFrames = 0;
  public droppedFrames = 0;
  public encodeQueueSize = 0;
  public lastTimestampMicros = 0;
  public outputSizeBytes = 0;
  public activeClipName = '';
  public audioSamplesProcessed = 0;
  public totalAudioSamples = 0;
  public muxerChunksWritten = 0;

  public stages: Record<ExportStage, StageDetail>;

  constructor(id?: string) {
    this.id = id || `exp_sess_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    this.startedAt = Date.now();
    this.abortController = new AbortController();

    const stageNames: Record<ExportStage, string> = {
      PREPARATION: 'Inicjalizacja środowiska',
      MEDIA_ANALYSIS: 'Analiza materiałów',
      DECODING: 'Dekodowanie strumieni',
      FRAME_NORMALIZATION: 'Normalizacja kadrów',
      VIDEO_ENCODING: 'Kodowanie wideo (H.264)',
      AUDIO_ENCODING: 'Kodowanie audio (AAC)',
      MUXING: 'Muxowanie kontenera MP4',
      FINAL_FLUSH: 'Opróżnianie buforów',
      VALIDATION: 'Walidacja pliku wyjściowego',
      SAVING: 'Zapisywanie pliku',
      COMPLETED: 'Zakończono',
      FAILED: 'Błąd eksportu',
      CANCELLED: 'Anulowano'
    };

    const initialStages: Partial<Record<ExportStage, StageDetail>> = {};
    const allStages: ExportStage[] = [
      'PREPARATION',
      'MEDIA_ANALYSIS',
      'AUDIO_ENCODING',
      'DECODING',
      'FRAME_NORMALIZATION',
      'VIDEO_ENCODING',
      'FINAL_FLUSH',
      'MUXING',
      'VALIDATION',
      'SAVING',
      'COMPLETED',
      'FAILED',
      'CANCELLED'
    ];

    allStages.forEach(st => {
      initialStages[st] = {
        stage: st,
        name: stageNames[st],
        status: 'PENDING',
        progressPercent: 0
      };
    });

    this.stages = initialStages as Record<ExportStage, StageDetail>;
    this.stages.PREPARATION.status = 'RUNNING';
    this.stages.PREPARATION.startedAt = this.startedAt;

    this.log('EXPORT_START', `Rozpoczęto sesję eksportu ${this.id}`);
  }

  get isCancelled(): boolean {
    return this.abortController.signal.aborted || this.stage === 'CANCELLED';
  }

  setStageStatus(
    stage: ExportStage,
    status: StageDetail['status'],
    progressPercent = 0,
    message?: string,
    errorMessage?: string
  ): void {
    const current = this.stages[stage];
    if (!current) return;

    const now = Date.now();
    current.status = status;
    current.progressPercent = Math.min(100, Math.max(0, progressPercent));
    if (message) current.message = message;
    if (errorMessage) current.errorMessage = errorMessage;

    if (status === 'RUNNING' && !current.startedAt) {
      current.startedAt = now;
    } else if (status === 'COMPLETED' || status === 'FAILED') {
      current.completedAt = now;
      if (current.startedAt) {
        current.durationMs = now - current.startedAt;
      }
    }
  }

  log(category: DiagnosticLogEntry['category'], message: string, details?: any): void {
    const entry: DiagnosticLogEntry = {
      timestamp: Date.now(),
      category,
      message,
      details
    };
    this.logs.push(entry);
    if (this.logs.length > 500) {
      this.logs.shift();
    }
  }

  cancel(): void {
    if (!this.isCancelled) {
      this.stage = 'CANCELLED';
      this.setStageStatus('CANCELLED', 'RUNNING', 100, 'Eksport anulowany');
      this.abortController.abort();
      this.log('EXPORT_CANCELLED', 'Sesja została przerwana przez użytkownika.');
    }
  }
}
