import { FitMode, TimelineClip } from './videoExportTypes';
import { FrameCompositor } from '../render/FrameCompositor';
import { TitleCard, TextLayer } from '../../types/project';

export class FrameNormalizationService {
  static getColorGradeFilter(colorGrade?: string): string {
    return FrameCompositor.buildColorFilter(undefined, colorGrade);
  }

  static applyLetterbox(ctx: CanvasRenderingContext2D, width: number, height: number, letterboxMode?: string): void {
    FrameCompositor.applyLetterbox(ctx, width, height, letterboxMode);
  }

  static drawVideoWithFitMode(
    ctx: CanvasRenderingContext2D,
    video: HTMLVideoElement | ImageBitmap,
    fitMode: FitMode,
    targetWidth: number,
    targetHeight: number,
    rotationDeg: number = 0,
    colorGrade?: string,
    colorAdjustments?: any,
    crop?: any
  ): void {
    const srcW = (video as any).videoWidth || (video as any).width || targetWidth;
    const srcH = (video as any).videoHeight || (video as any).height || targetHeight;

    FrameCompositor.drawMedia(
      ctx,
      video as any,
      srcW,
      srcH,
      targetWidth,
      targetHeight,
      {
        fitMode,
        rotation: rotationDeg,
        crop,
        colorAdjustments,
        globalPreset: colorGrade
      }
    );
  }

  static applyTransitions(
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    currentFrame: number,
    totalClipFrames: number,
    fps: number,
    clip: TimelineClip
  ): void {
    const elapsedSec = currentFrame / fps;
    const remainingSec = (totalClipFrames - currentFrame) / fps;
    const transDur = clip.transitionDuration || 0.5;

    // Transition In
    if (clip.transitionIn && clip.transitionIn !== 'cut' && elapsedSec < transDur) {
      const progress = 1 - (elapsedSec / transDur);
      FrameCompositor.applyTransition(ctx, width, height, progress, clip.transitionIn);
    }

    // Transition Out
    if (clip.transitionOut && clip.transitionOut !== 'cut' && remainingSec < transDur) {
      const progress = 1 - (remainingSec / transDur);
      FrameCompositor.applyTransition(ctx, width, height, progress, clip.transitionOut);
    }
  }

  static drawTitleCard(ctx: CanvasRenderingContext2D, width: number, height: number, card: TitleCard): void {
    FrameCompositor.drawTitleCard(ctx, width, height, card);
  }

  static drawTextLayers(
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    layers: TextLayer[],
    currentTimelineSec: number
  ): void {
    if (!layers || layers.length === 0) return;
    for (const layer of layers) {
      FrameCompositor.drawTextLayer(ctx, width, height, layer, currentTimelineSec);
    }
  }

  static applyWatermark(
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    watermark?: { enabled: boolean; text: string; position: string; opacity: number }
  ): void {
    FrameCompositor.applyWatermark(ctx, width, height, watermark);
  }
}
