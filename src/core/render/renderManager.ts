import { ProjectState } from '../../types/project';
import { IRenderProvider, RenderOptions, RenderProgress, RenderResult } from './renderTypes';
import { localBrowserRenderProvider } from './localRenderProvider';
import { webCodecsMp4RenderProvider } from './webCodecsMp4Provider';
import { renderPersistence } from './renderPersistence';

class RenderManager {
  private providers: Map<string, IRenderProvider> = new Map();
  private activeAbortController: AbortController | null = null;
  private activeProgress: RenderProgress | null = null;
  private activeOptions: RenderOptions | null = null;
  private activeProviderId: string | null = null;
  private activeProjectId: string | null = null;
  private lastCheckpointTime: number = 0;
  private listeners: Set<(state: { progress: RenderProgress | null; options: RenderOptions | null; providerId: string | null; isRendering: boolean }) => void> = new Set();

  constructor() {
    this.registerProvider(webCodecsMp4RenderProvider);
    this.registerProvider(localBrowserRenderProvider);
  }

  registerProvider(provider: IRenderProvider) {
    this.providers.set(provider.id, provider);
  }

  getAvailableProviders(): IRenderProvider[] {
    return Array.from(this.providers.values()).filter(p => p.isSupported());
  }

  getProvider(id?: string): IRenderProvider {
    if (id && this.providers.has(id)) {
      const p = this.providers.get(id)!;
      if (p.isSupported()) return p;
    }
    // Prefer WebCodecs MP4 provider if supported, else fallback to MediaRecorder provider
    if (webCodecsMp4RenderProvider.isSupported()) {
      return webCodecsMp4RenderProvider;
    }
    return localBrowserRenderProvider;
  }

  subscribe(listener: (state: { progress: RenderProgress | null; options: RenderOptions | null; providerId: string | null; isRendering: boolean }) => void) {
    this.listeners.add(listener);
    // Emit current state immediately
    listener({
      progress: this.activeProgress,
      options: this.activeOptions,
      providerId: this.activeProviderId,
      isRendering: this.isRendering()
    });
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify() {
    const state = {
      progress: this.activeProgress,
      options: this.activeOptions,
      providerId: this.activeProviderId,
      isRendering: this.isRendering()
    };
    this.listeners.forEach(cb => cb(state));
  }

  async startRender(
    project: ProjectState,
    options: RenderOptions,
    onProgress: (p: RenderProgress) => void,
    providerId?: string
  ): Promise<RenderResult> {
    if (this.activeAbortController) {
      this.activeAbortController.abort();
    }

    this.activeAbortController = new AbortController();
    const provider = this.getProvider(providerId);
    this.activeOptions = options;
    this.activeProviderId = provider.id;
    this.activeProjectId = project.id || 'default';
    this.lastCheckpointTime = Date.now();

    // 1. Enable beforeunload protection so closing/refreshing page asks user confirmation
    renderPersistence.enableUnloadProtection(() => 
      `Trwa renderowanie Twojego filmu ślubnego (${this.activeProgress?.percent || 0}%). Opuszczenie lub odświeżenie strony przerwie eksport!`
    );

    this.activeProgress = {
      stage: 'preparing',
      percent: 0,
      currentFrame: 0,
      totalFrames: 100,
      fps: 0,
      targetFps: options.fps,
      statusMessage: 'Inicjalizacja renderowania...'
    };
    this.notify();

    // Save initial checkpoint
    renderPersistence.saveCheckpoint({
      projectId: this.activeProjectId,
      currentFrame: 0,
      totalFrames: 100,
      percent: 0,
      stage: 'preparing',
      options,
      statusMessage: 'Rozpoczęcie eksportu',
      timestamp: Date.now()
    });

    try {
      const result = await provider.render(
        project,
        options,
        (progress) => {
          this.activeProgress = progress;
          this.notify();
          onProgress(progress);

          // Periodically save checkpoint (every ~2.5s) to allow seamless recovery on reload
          const now = Date.now();
          if (now - this.lastCheckpointTime > 2500) {
            this.lastCheckpointTime = now;
            renderPersistence.saveCheckpoint({
              projectId: this.activeProjectId!,
              currentFrame: progress.currentFrame,
              totalFrames: progress.totalFrames,
              percent: progress.percent,
              stage: progress.stage,
              options,
              statusMessage: progress.statusMessage,
              timestamp: now
            });
          }
        },
        this.activeAbortController.signal
      );
      
      this.activeProgress = {
        ...(this.activeProgress || {}),
        stage: 'completed',
        percent: 100,
        statusMessage: 'Renderowanie ukończone sukcesem!'
      } as RenderProgress;
      this.notify();

      // Clear in-progress checkpoint and persist master movie blob to IndexedDB
      await renderPersistence.clearCheckpoint(this.activeProjectId);
      await renderPersistence.saveCompletedMovie(this.activeProjectId, result, options);

      return result;
    } catch (err: any) {
      // If WebCodecs failed and it was not an intentional user cancellation,
      // attempt fallback to localBrowserRenderProvider (MediaRecorder)
      const wasAborted = this.activeAbortController?.signal.aborted;
      if (!wasAborted && provider.id === 'webcodecs_mp4_muxer' && localBrowserRenderProvider.isSupported()) {
        console.warn('[renderManager] WebCodecs napotkał problem. Uruchamiam silnik awaryjny (MediaRecorder)...', err);
        this.activeProviderId = localBrowserRenderProvider.id;
        this.activeProgress = {
          stage: 'preparing',
          percent: 5,
          currentFrame: 0,
          totalFrames: 100,
          fps: options.fps,
          targetFps: options.fps,
          statusMessage: 'Przełączanie na silnik kompatybilny (MediaRecorder)...',
          diagnostics: {
            fallbackReason: err?.message || String(err),
            primaryProvider: 'webcodecs_mp4_muxer'
          }
        };
        this.notify();

        try {
          const fallbackResult = await localBrowserRenderProvider.render(
            project,
            options,
            (progress) => {
              this.activeProgress = progress;
              this.notify();
              onProgress(progress);
            },
            this.activeAbortController?.signal
          );

          this.activeProgress = {
            ...(this.activeProgress || {}),
            stage: 'completed',
            percent: 100,
            statusMessage: 'Renderowanie ukończone sukcesem (silnik kompatybilny)!'
          } as RenderProgress;
          this.notify();

          // Save completed movie on fallback success
          if (this.activeProjectId) {
            await renderPersistence.clearCheckpoint(this.activeProjectId);
            await renderPersistence.saveCompletedMovie(this.activeProjectId, fallbackResult, options);
          }

          return fallbackResult;
        } catch (fallbackErr: any) {
          err = fallbackErr;
        }
      }

      this.activeProgress = {
        ...(this.activeProgress || {}),
        stage: 'error',
        statusMessage: `Błąd renderowania: ${err?.message || err}`,
        diagnostics: {
          ...(this.activeProgress?.diagnostics || {}),
          lastError: err?.stack || err?.message || String(err)
        }
      } as RenderProgress;
      this.notify();
      throw err;
    } finally {
      this.activeAbortController = null;
      renderPersistence.disableUnloadProtection();
      this.notify();
    }
  }

  cancelActiveRender() {
    if (this.activeAbortController) {
      this.activeAbortController.abort();
      this.activeAbortController = null;
      renderPersistence.disableUnloadProtection();
      if (this.activeProjectId) {
        renderPersistence.clearCheckpoint(this.activeProjectId);
      }
      
      this.activeProgress = {
        ...(this.activeProgress || {}),
        stage: 'cancelled',
        statusMessage: 'Renderowanie przerwane przez użytkownika.'
      } as RenderProgress;
      this.notify();
    }
  }

  isRendering(): boolean {
    return this.activeAbortController !== null;
  }
}

export const renderManager = new RenderManager();

