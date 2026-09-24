/**
 * Live Performance & Hardware Acceleration Monitor for Merge Studio
 * Tracks UI FPS, dropped frames, GPU capability, WebCodecs encoder/decoder acceleration,
 * and memory metrics at conservative 3Hz refresh rates.
 */

export interface HardwareDiagnostics {
  gpuAvailable: boolean;
  gpuRenderer: string;
  webCodecsSupported: boolean;
  videoDecoderType: 'HARDWARE' | 'SOFTWARE' | 'UNKNOWN';
  videoEncoderType: 'HARDWARE' | 'SOFTWARE' | 'UNKNOWN';
  offscreenCanvasSupported: boolean;
  webgl2Supported: boolean;
  memoryMb?: {
    used: number;
    total: number;
    limit: number;
  };
}

export interface LivePerformanceMetrics {
  uiFps: number;
  averageFrameTimeMs: number;
  droppedFramesCount: number;
  totalFramesSampled: number;
  timestamp: number;
}

class PerformanceMonitor {
  private listeners = new Set<(metrics: LivePerformanceMetrics) => void>();
  private debugOverlayListeners = new Set<(enabled: boolean) => void>();
  private isDebugOverlayEnabled = false;

  private hardwareDiagCache: HardwareDiagnostics | null = null;
  private currentMetrics: LivePerformanceMetrics = {
    uiFps: 60,
    averageFrameTimeMs: 16.6,
    droppedFramesCount: 0,
    totalFramesSampled: 0,
    timestamp: Date.now()
  };

  private isRunning = false;
  private animFrameId: number | null = null;
  private frameTimes: number[] = [];
  private lastEmitTime = 0;
  private droppedFrames = 0;
  private totalFrames = 0;

  constructor() {
    if (typeof window !== 'undefined') {
      this.startSampling();
    }
  }

  startSampling() {
    if (this.isRunning || typeof window === 'undefined') return;
    this.isRunning = true;
    let lastTime = performance.now();

    const sample = (now: number) => {
      const delta = now - lastTime;
      lastTime = now;
      this.totalFrames++;

      if (delta > 32) {
        // Longer than ~2 frames at 60fps
        this.droppedFrames++;
      }

      this.frameTimes.push(delta);
      if (this.frameTimes.length > 60) {
        this.frameTimes.shift();
      }

      // Emit metrics every ~333ms (3 times per second)
      if (now - this.lastEmitTime > 333) {
        const avgDelta = this.frameTimes.length > 0
          ? this.frameTimes.reduce((a, b) => a + b, 0) / this.frameTimes.length
          : 16.6;

        const instantaneousFps = Math.min(120, Math.max(1, Math.round(1000 / avgDelta)));

        this.currentMetrics = {
          uiFps: instantaneousFps,
          averageFrameTimeMs: Math.round(avgDelta * 10) / 10,
          droppedFramesCount: this.droppedFrames,
          totalFramesSampled: this.totalFrames,
          timestamp: Date.now()
        };

        this.lastEmitTime = now;
        this.listeners.forEach(l => l(this.currentMetrics));
      }

      if (this.isRunning) {
        this.animFrameId = requestAnimationFrame(sample);
      }
    };

    this.animFrameId = requestAnimationFrame(sample);
  }

  stopSampling() {
    this.isRunning = false;
    if (this.animFrameId) {
      cancelAnimationFrame(this.animFrameId);
      this.animFrameId = null;
    }
  }

  async getHardwareDiagnostics(): Promise<HardwareDiagnostics> {
    if (this.hardwareDiagCache) {
      this.updateMemoryInCache();
      return this.hardwareDiagCache;
    }

    let gpuAvailable = false;
    let gpuRenderer = 'Nieznany akcelerator';
    let webgl2Supported = false;
    let offscreenCanvasSupported = typeof OffscreenCanvas !== 'undefined';

    // 1. Detect GPU via WebGL
    try {
      const canvas = document.createElement('canvas');
      const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
      if (gl) {
        gpuAvailable = true;
        webgl2Supported = typeof WebGL2RenderingContext !== 'undefined' && gl instanceof WebGL2RenderingContext;
        const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
        if (debugInfo) {
          gpuRenderer = gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) || 'Standardowy sterownik GPU';
        } else {
          gpuRenderer = gl.getParameter(gl.RENDERER) || 'Akcelerator WebGL';
        }
      }
    } catch {
      gpuAvailable = false;
    }

    // 2. Detect WebCodecs Decoder & Encoder
    const webCodecsSupported = typeof window !== 'undefined' &&
      typeof (window as any).VideoEncoder === 'function' &&
      typeof (window as any).VideoFrame === 'function';

    let videoEncoderType: 'HARDWARE' | 'SOFTWARE' | 'UNKNOWN' = 'UNKNOWN';
    let videoDecoderType: 'HARDWARE' | 'SOFTWARE' | 'UNKNOWN' = 'UNKNOWN';

    if (webCodecsSupported && typeof (window as any).VideoEncoder.isConfigSupported === 'function') {
      try {
        const hwRes = await (window as any).VideoEncoder.isConfigSupported({
          codec: 'avc1.420028',
          width: 1920,
          height: 1080,
          bitrate: 6_000_000,
          framerate: 30,
          hardwareAcceleration: 'prefer-hardware',
          avc: { format: 'avc' }
        });
        if (hwRes && hwRes.supported) {
          videoEncoderType = 'HARDWARE';
        } else {
          const swRes = await (window as any).VideoEncoder.isConfigSupported({
            codec: 'avc1.420028',
            width: 1920,
            height: 1080,
            bitrate: 6_000_000,
            framerate: 30,
            hardwareAcceleration: 'prefer-software',
            avc: { format: 'avc' }
          });
          videoEncoderType = swRes && swRes.supported ? 'SOFTWARE' : 'UNKNOWN';
        }
      } catch {
        videoEncoderType = 'UNKNOWN';
      }
    }

    if (typeof (window as any).VideoDecoder !== 'undefined' && typeof (window as any).VideoDecoder.isConfigSupported === 'function') {
      try {
        const decHw = await (window as any).VideoDecoder.isConfigSupported({
          codec: 'avc1.420028',
          hardwareAcceleration: 'prefer-hardware'
        });
        if (decHw && decHw.supported) {
          videoDecoderType = 'HARDWARE';
        } else {
          const decSw = await (window as any).VideoDecoder.isConfigSupported({
            codec: 'avc1.420028',
            hardwareAcceleration: 'prefer-software'
          });
          videoDecoderType = decSw && decSw.supported ? 'SOFTWARE' : 'UNKNOWN';
        }
      } catch {
        videoDecoderType = 'UNKNOWN';
      }
    }

    this.hardwareDiagCache = {
      gpuAvailable,
      gpuRenderer,
      webCodecsSupported,
      videoDecoderType,
      videoEncoderType,
      offscreenCanvasSupported,
      webgl2Supported
    };

    this.updateMemoryInCache();
    return this.hardwareDiagCache;
  }

  private updateMemoryInCache() {
    if (!this.hardwareDiagCache) return;
    if (typeof performance !== 'undefined' && (performance as any).memory) {
      const mem = (performance as any).memory;
      this.hardwareDiagCache.memoryMb = {
        used: Math.round(mem.usedJSHeapSize / 1024 / 1024),
        total: Math.round(mem.totalJSHeapSize / 1024 / 1024),
        limit: Math.round(mem.jsHeapSizeLimit / 1024 / 1024)
      };
    }
  }

  getCurrentMetrics(): LivePerformanceMetrics {
    return this.currentMetrics;
  }

  subscribe(listener: (metrics: LivePerformanceMetrics) => void): () => void {
    this.listeners.add(listener);
    listener(this.currentMetrics);
    return () => {
      this.listeners.delete(listener);
    };
  }

  isDebugEnabled(): boolean {
    return this.isDebugOverlayEnabled;
  }

  setDebugEnabled(enabled: boolean) {
    this.isDebugOverlayEnabled = enabled;
    this.debugOverlayListeners.forEach(l => l(enabled));
  }

  subscribeDebugOverlay(listener: (enabled: boolean) => void): () => void {
    this.debugOverlayListeners.add(listener);
    listener(this.isDebugOverlayEnabled);
    return () => {
      this.debugOverlayListeners.delete(listener);
    };
  }
}

export const performanceMonitor = new PerformanceMonitor();
