import { FFmpeg } from '@ffmpeg/ffmpeg';
import { toBlobURL } from '@ffmpeg/util';
import { ExportPreset, ExportProgress, MediaSource } from './videoExportTypes';

export class FfmpegService {
  private ffmpeg: FFmpeg | null = null;
  private isLoaded = false;

  async ensureFFmpeg(): Promise<FFmpeg> {
    if (this.ffmpeg && this.isLoaded) return this.ffmpeg;

    this.ffmpeg = new FFmpeg();
    
    // Log handler for reliability (Phase 3.2)
    this.ffmpeg.on('log', ({ message }) => {
      if (message.toLowerCase().includes('error')) {
        console.error('[FFmpeg Error]', message);
      } else {
        // console.log('[FFmpeg]', message);
      }
    });

    const baseURL = 'https://unpkg.com/@ffmpeg/core-mt@0.12.6/dist/umd';
    
    try {
      // Load multi-thread core (Phase 1.1)
      await this.ffmpeg.load({
        coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript'),
        wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm'),
        workerURL: await toBlobURL(`${baseURL}/ffmpeg-core.worker.js`, 'text/javascript')
      });
      this.isLoaded = true;
    } catch (err) {
      console.warn('[FFmpeg] Multi-thread load failed, falling back to single-thread', err);
      // Fallback to single-thread (Phase 3.3)
      const stBaseURL = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd';
      await this.ffmpeg.load({
        coreURL: await toBlobURL(`${stBaseURL}/ffmpeg-core.js`, 'text/javascript'),
        wasmURL: await toBlobURL(`${stBaseURL}/ffmpeg-core.wasm`, 'application/wasm')
      });
      this.isLoaded = true;
    }

    return this.ffmpeg;
  }

  async runExport(
    sources: MediaSource[],
    preset: ExportPreset,
    onProgress: (p: ExportProgress) => void,
    signal?: AbortSignal
  ): Promise<Blob> {
    const ffmpeg = await this.ensureFFmpeg();
    const startTime = Date.now();
    const TIMEOUT_MS = 300000; // 5 minutes (Phase 3.1)

    // Limit resolution for performance (Phase 5.1)
    let targetWidth = preset.width;
    let targetHeight = preset.height;
    if (sources.length > 10 && targetWidth > 1920) {
      targetWidth = 1920;
      targetHeight = 1080;
    }

    const inputDir = '/input';
    try {
      await ffmpeg.createDir(inputDir);
    } catch (e) {}

    const filesToMount = sources.filter(s => s.file).map(s => s.file as File);
    await (ffmpeg as any).mount('WORKERFS', { files: filesToMount }, inputDir);

    // Optimized FFmpeg command (Phase 5.2, 5.3)
    const canCopy = sources.length > 1 && sources.every(s => 
      s.width === sources[0].width && 
      s.height === sources[0].height && 
      s.fps === sources[0].fps &&
      s.videoCodec === sources[0].videoCodec
    );

    const args = canCopy 
      ? ['-f', 'concat', '-safe', '0', '-i', 'inputs.txt', '-c', 'copy', 'output.mp4']
      : ['-f', 'concat', '-safe', '0', '-i', 'inputs.txt', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23', '-threads', '0', '-vf', `scale=${targetWidth}:${targetHeight}`, '-c:a', 'aac', '-b:a', '192k', 'output.mp4'];
    
    const inputList = sources.map(s => `file '${inputDir}/${s.name}'`).join('\n');
    await ffmpeg.writeFile('inputs.txt', inputList);

    const progressHandler = ({ progress }: { progress: number }) => {
      const percent = Math.min(99, progress * 100);
      const elapsed = (Date.now() - startTime) / 1000;
      const eta = percent > 0 ? (elapsed / (percent / 100) - elapsed) : 0;
      
      onProgress({
        stage: 'VIDEO_ENCODING',
        percent: Math.round(percent),
        stages: {} as any,
        currentFrame: 0,
        totalFrames: 100,
        fps: 0,
        elapsedSeconds: Math.round(elapsed),
        etaSeconds: Math.round(eta),
        statusMessage: `Renderowanie ${canCopy ? '(Tryb Direct Stream)' : ''}... ETA: ${Math.round(eta)}s`
      });
    };

    ffmpeg.on('progress', progressHandler);

    const timeoutPromise = new Promise((_, reject) => 
      setTimeout(() => reject(new Error('TIMEOUT')), TIMEOUT_MS)
    );

    try {
      // Execute with signal support if possible (ffmpeg.wasm 0.12 supports it via options)
      const execPromise = (ffmpeg as any).exec(args, { signal });
      await Promise.race([execPromise, timeoutPromise]);
      
      const data = await ffmpeg.readFile('output.mp4');
      return new Blob([data as any], { type: 'video/mp4' });
    } catch (err: any) {
      if (err.name === 'AbortError' || err.message === 'TIMEOUT') {
        console.warn('[FFmpeg] Export aborted or timed out');
        throw new Error('TIMEOUT');
      }
      throw err;
    } finally {
      ffmpeg.off('progress', progressHandler);
      try {
        await (ffmpeg as any).unmount(inputDir);
        await ffmpeg.deleteDir(inputDir);
      } catch (e) {}
    }
  }
}

export const ffmpegService = new FfmpegService();
