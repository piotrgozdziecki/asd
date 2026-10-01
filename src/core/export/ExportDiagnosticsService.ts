import { Muxer, ArrayBufferTarget } from 'mp4-muxer';
import { DiagnosticsCapabilities } from './videoExportTypes';
import { ExportValidator } from './ExportValidator';

export class ExportDiagnosticsService {
  private static lastCapabilities: DiagnosticsCapabilities | null = null;

  static async getCapabilities(): Promise<DiagnosticsCapabilities> {
    const hasWebCodecs = typeof window !== 'undefined' && typeof (window as any).VideoEncoder !== 'undefined';
    const hasVideoDecoder = typeof window !== 'undefined' && typeof (window as any).VideoDecoder !== 'undefined';
    const hasVideoEncoder = typeof window !== 'undefined' && typeof (window as any).VideoEncoder !== 'undefined';
    const hasAudioDecoder = typeof window !== 'undefined' && typeof (window as any).AudioDecoder !== 'undefined';
    const hasAudioEncoder = typeof window !== 'undefined' && typeof (window as any).AudioEncoder !== 'undefined';

    const candidateProfiles = [
      'avc1.420028',
      'avc1.42001f',
      'avc1.42E028',
      'avc1.42E01F',
      'avc1.4D4028',
      'avc1.4D401F',
      'avc1.640028'
    ];

    const supportedH264Codecs: string[] = [];
    let h264Supported = false;
    let hevcSupported = false;
    let av1Supported = false;
    let vp9Supported = false;
    let aacSupported = false;

    let hevcHardware = false;
    let av1Hardware = false;
    let vp9Hardware = false;
    let h264Hardware = false;
    let opusSupported = false;

    if (hasVideoEncoder && typeof (window as any).VideoEncoder.isConfigSupported === 'function') {
      // 1. Probe H.264
      for (const codec of candidateProfiles) {
        try {
          const resHw = await (window as any).VideoEncoder.isConfigSupported({
            codec,
            width: 1920,
            height: 1080,
            bitrate: 10_000_000,
            framerate: 30,
            hardwareAcceleration: 'prefer-hardware'
          });
          if (resHw && resHw.supported) {
            supportedH264Codecs.push(codec);
            h264Supported = true;
            h264Hardware = true;
          } else {
            const resAny = await (window as any).VideoEncoder.isConfigSupported({
              codec,
              width: 1920,
              height: 1080,
              bitrate: 10_000_000,
              framerate: 30,
              hardwareAcceleration: 'no-preference'
            });
            if (resAny && resAny.supported) {
              supportedH264Codecs.push(codec);
              h264Supported = true;
            }
          }
        } catch {}
      }

      // 2. Probe HEVC / H.265
      const hevcCandidates = ['hvc1.1.6.L153.B0', 'hvc1.1.6.L120.B0', 'hev1.1.6.L120.B0', 'hvc1.1.6.L93.B0'];
      for (const c of hevcCandidates) {
        try {
          const res = await (window as any).VideoEncoder.isConfigSupported({
            codec: c,
            width: 1920,
            height: 1080,
            bitrate: 10_000_000,
            framerate: 30,
            hardwareAcceleration: 'prefer-hardware'
          });
          if (res && res.supported) {
            hevcSupported = true;
            hevcHardware = true;
            break;
          }
        } catch {}
      }

      // 3. Probe AV1
      const av1Candidates = ['av01.0.08M.10', 'av01.0.08M.08', 'av01.0.05M.08', 'av01.0.04M.08'];
      for (const c of av1Candidates) {
        try {
          const resHw = await (window as any).VideoEncoder.isConfigSupported({
            codec: c,
            width: 1920,
            height: 1080,
            bitrate: 8_000_000,
            framerate: 30,
            hardwareAcceleration: 'prefer-hardware'
          });
          if (resHw && resHw.supported) {
            av1Supported = true;
            av1Hardware = true;
            break;
          }
          const res = await (window as any).VideoEncoder.isConfigSupported({
            codec: c,
            width: 1920,
            height: 1080,
            bitrate: 8_000_000,
            framerate: 30,
            hardwareAcceleration: 'no-preference'
          });
          if (res && res.supported) {
            av1Supported = true;
            break;
          }
        } catch {}
      }

      // 4. Probe VP9
      const vp9Candidates = ['vp09.00.41.08', 'vp09.00.51.08', 'vp09.00.31.08'];
      for (const c of vp9Candidates) {
        try {
          const resHw = await (window as any).VideoEncoder.isConfigSupported({
            codec: c,
            width: 1920,
            height: 1080,
            bitrate: 8_000_000,
            framerate: 30,
            hardwareAcceleration: 'prefer-hardware'
          });
          if (resHw && resHw.supported) {
            vp9Supported = true;
            vp9Hardware = true;
            break;
          }
          const res = await (window as any).VideoEncoder.isConfigSupported({
            codec: c,
            width: 1920,
            height: 1080,
            bitrate: 8_000_000,
            framerate: 30,
            hardwareAcceleration: 'no-preference'
          });
          if (res && res.supported) {
            vp9Supported = true;
            break;
          }
        } catch {}
      }
    }

    if (hasAudioEncoder && typeof (window as any).AudioEncoder.isConfigSupported === 'function') {
      try {
        const resAac = await (window as any).AudioEncoder.isConfigSupported({
          codec: 'mp4a.40.2',
          numberOfChannels: 2,
          sampleRate: 48000,
          bitrate: 128000
        });
        aacSupported = Boolean(resAac && resAac.supported);
      } catch {
        aacSupported = false;
      }

      try {
        const resOpus = await (window as any).AudioEncoder.isConfigSupported({
          codec: 'opus',
          numberOfChannels: 2,
          sampleRate: 48000,
          bitrate: 192000
        });
        opusSupported = Boolean(resOpus && resOpus.supported);
      } catch {
        opusSupported = false;
      }
    }

    let recommendedCodec = 'H.264 (AVC)';
    if (av1Hardware) {
      recommendedCodec = 'AV1 (Sprzętowy Master)';
    } else if (hevcHardware) {
      recommendedCodec = 'H.265 / HEVC (Sprzętowy Apple/GPU)';
    } else if (av1Supported) {
      recommendedCodec = 'AV1 (Najwyższa kompresja)';
    } else if (h264Hardware) {
      recommendedCodec = 'H.264 High Profile (Sprzętowy)';
    }

    let availableMemoryMb: number | undefined;
    if (typeof performance !== 'undefined' && (performance as any).memory) {
      availableMemoryMb = Math.round((performance as any).memory.jsHeapSizeLimit / 1024 / 1024);
    }

    const browser = typeof navigator !== 'undefined' ? navigator.userAgent : 'Unknown';

    const capabilities: DiagnosticsCapabilities = {
      browser,
      version: '3.0.0',
      webCodecsSupported: hasWebCodecs,
      videoDecoderSupported: hasVideoDecoder,
      videoEncoderSupported: hasVideoEncoder,
      audioDecoderSupported: hasAudioDecoder,
      audioEncoderSupported: hasAudioEncoder,
      h264Supported,
      supportedH264Codecs,
      hevcSupported,
      hevcHardware,
      av1Supported,
      av1Hardware,
      vp9Supported,
      vp9Hardware,
      aacSupported,
      opusSupported,
      mp4MuxerSupported: true,
      webmMuxerSupported: true,
      recommendedCodec,
      availableMemoryMb
    };

    this.lastCapabilities = capabilities;
    return capabilities;
  }

  /**
   * Quick engine test: compiles a genuine 15-frame MP4 container with H.264
   * and runs full 9-point validation in < 1 second.
   */
  static async runEngineTest(): Promise<{ success: boolean; durationMs: number; details: string }> {
    const start = Date.now();
    try {
      const caps = await this.getCapabilities();
      if (!caps.videoEncoderSupported || !caps.h264Supported) {
        return {
          success: false,
          durationMs: Date.now() - start,
          details: 'VideoEncoder H.264 nie jest obsługiwany w bieżącym środowisku przeglądarki.'
        };
      }

      const codec = caps.supportedH264Codecs[0] || 'avc1.420028';
      const muxer = new Muxer({
        target: new ArrayBufferTarget(),
        video: { codec: 'avc', width: 640, height: 360 },
        fastStart: 'in-memory'
      });

      let encoderError: any = null;
      const encoder = new (window as any).VideoEncoder({
        output: (chunk: any, meta: any) => {
          try {
            muxer.addVideoChunk(chunk, meta);
          } catch (e) {
            encoderError = e;
          }
        },
        error: (e: any) => {
          encoderError = e;
        }
      });

      encoder.configure({
        codec,
        width: 640,
        height: 360,
        bitrate: 2_000_000,
        framerate: 30,
        avc: { format: 'avc' }
      });

      const testCanvas = document.createElement('canvas');
      testCanvas.width = 640;
      testCanvas.height = 360;
      const ctx = testCanvas.getContext('2d')!;
      ctx.fillStyle = '#14120D';
      ctx.fillRect(0, 0, 640, 360);
      ctx.fillStyle = '#D4AF37';
      ctx.font = 'bold 20px sans-serif';
      ctx.fillText('Test Silnika Wideo MP4', 200, 180);

      for (let i = 0; i < 15; i++) {
        if (encoder.state !== 'configured' || encoderError) {
          throw new Error(`VideoEncoder błąd: ${encoderError?.message || encoder.state}`);
        }
        const frame = new (window as any).VideoFrame(testCanvas, {
          timestamp: i * 33333,
          duration: 33333
        });
        encoder.encode(frame, { keyFrame: i === 0 });
        frame.close();
      }

      await encoder.flush();
      muxer.finalize();
      encoder.close();

      const blob = new Blob([muxer.target.buffer], { type: 'video/mp4' });
      const verification = await ExportValidator.verifyOutput(blob);

      return {
        success: verification.valid,
        durationMs: Date.now() - start,
        details: verification.valid
          ? `Pomyślnie wygenerowano i zweryfikowano plik MP4 (${blob.size} B, H.264 ${codec}, 15 klatek).`
          : `Weryfikacja nie powiodła się: ${verification.error}`
      };
    } catch (err: any) {
      return {
        success: false,
        durationMs: Date.now() - start,
        details: `Błąd podczas testu silnika: ${err?.message || String(err)}`
      };
    }
  }
}
