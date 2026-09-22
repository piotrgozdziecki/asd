import { ProjectState } from '../../types/project';
import { IRenderProvider, RenderOptions, RenderProgress, RenderResult } from './renderTypes';
import { localBrowserRenderProvider } from './localRenderProvider';
import { webCodecsMp4RenderProvider } from './webCodecsMp4Provider';

class RenderManager {
  private providers: Map<string, IRenderProvider> = new Map();
  private activeAbortController: AbortController | null = null;
  private activeProgress: RenderProgress | null = null;
  private activeOptions: RenderOptions | null = null;
  private activeProviderId: string | null = null;
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

    try {
      const result = await provider.render(
        project,
        options,
        (progress) => {
          this.activeProgress = progress;
          this.notify();
          onProgress(progress);
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
      return result;
    } catch (err: any) {
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
      this.notify();
    }
  }

  cancelActiveRender() {
    if (this.activeAbortController) {
      this.activeAbortController.abort();
      this.activeAbortController = null;
      
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
