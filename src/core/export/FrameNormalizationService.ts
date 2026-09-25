import { FitMode, TimelineClip } from './videoExportTypes';

export class FrameNormalizationService {
  /**
   * Translates preset color grading key to CSS canvas filter
   */
  static getColorGradeFilter(colorGrade?: string): string {
    switch (colorGrade) {
      case 'golden_hour':
        return 'contrast(1.06) brightness(1.04) saturate(1.18) sepia(0.18)';
      case 'cinematic_noir':
        return 'grayscale(1) contrast(1.25) brightness(0.96)';
      case 'pastel_boho':
        return 'contrast(0.95) brightness(1.08) saturate(0.92)';
      case 'vintage_35mm':
        return 'sepia(0.28) contrast(1.12) saturate(1.1) brightness(0.98)';
      case 'vivid_master':
        return 'contrast(1.08) saturate(1.12) brightness(1.02)';
      default:
        return 'none';
    }
  }

  /**
   * Applies CinemaScope (2.39:1) Hollywood black letterbox bars
   */
  static applyLetterbox(ctx: CanvasRenderingContext2D, width: number, height: number, letterboxMode?: string): void {
    if (letterboxMode === 'cinemascope') {
      const activeHeight = Math.round(width / 2.39);
      const barHeight = Math.max(0, Math.round((height - activeHeight) / 2));
      if (barHeight > 0) {
        ctx.fillStyle = '#000000';
        ctx.fillRect(0, 0, width, barHeight);
        ctx.fillRect(0, height - barHeight, width, barHeight);
      }
    }
  }

  /**
   * Draws video onto canvas adhering strictly to FIT, FILL, or ORIGINAL modes
   * For vertical videos (9:16) placed in horizontal frames (16:9), renders an ultra-fast
   * downscaled blurred backdrop to eliminate harsh empty borders.
   */
  static drawVideoWithFitMode(
    ctx: CanvasRenderingContext2D,
    video: HTMLVideoElement | ImageBitmap,
    fitMode: FitMode,
    targetWidth: number,
    targetHeight: number,
    rotationDeg: number = 0,
    colorGrade?: string
  ): void {
    const srcW = (video as any).videoWidth || (video as any).width || targetWidth;
    const srcH = (video as any).videoHeight || (video as any).height || targetHeight;

    ctx.save();
    ctx.translate(targetWidth / 2, targetHeight / 2);

    if (rotationDeg !== 0) {
      ctx.rotate((rotationDeg * Math.PI) / 180);
    }

    const filter = this.getColorGradeFilter(colorGrade);
    if (filter !== 'none') {
      ctx.filter = filter;
    }

    const effectiveTargetW = (rotationDeg === 90 || rotationDeg === 270) ? targetHeight : targetWidth;
    const effectiveTargetH = (rotationDeg === 90 || rotationDeg === 270) ? targetWidth : targetHeight;

    const scaleX = effectiveTargetW / srcW;
    const scaleY = effectiveTargetH / srcH;

    if (fitMode === 'fit') {
      const isPortraitInLandscape = (srcH > srcW) && (effectiveTargetW > effectiveTargetH);

      // Fast blurred background for vertical video in 16:9 canvas
      if (isPortraitInLandscape) {
        ctx.save();
        const fillScale = Math.max(scaleX, scaleY) * 1.05;
        const bgW = srcW * fillScale;
        const bgH = srcH * fillScale;

        // Downscale to tiny canvas first for O(1) blur performance
        const tinyCanvas = document.createElement('canvas');
        tinyCanvas.width = 64;
        tinyCanvas.height = 64;
        const tinyCtx = tinyCanvas.getContext('2d');
        if (tinyCtx) {
          tinyCtx.drawImage(video as any, 0, 0, 64, 64);
          ctx.filter = 'blur(6px) brightness(0.35)';
          ctx.drawImage(tinyCanvas, -bgW / 2, -bgH / 2, bgW, bgH);
        } else {
          ctx.filter = 'blur(25px) brightness(0.35)';
          ctx.drawImage(video as any, -bgW / 2, -bgH / 2, bgW, bgH);
        }
        ctx.restore();
      }

      const scale = Math.min(scaleX, scaleY);
      const drawW = srcW * scale;
      const drawH = srcH * scale;
      ctx.drawImage(video as any, -drawW / 2, -drawH / 2, drawW, drawH);
    } else if (fitMode === 'fill') {
      const scale = Math.max(scaleX, scaleY);
      const drawW = srcW * scale;
      const drawH = srcH * scale;
      ctx.drawImage(video as any, -drawW / 2, -drawH / 2, drawW, drawH);
    } else if (fitMode === 'original') {
      ctx.drawImage(video as any, -srcW / 2, -srcH / 2, srcW, srcH);
    }

    ctx.restore();
  }

  /**
   * Applies transition overlays (dissolve, fade, dip to black, dip to white)
   */
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
      if (clip.transitionIn === 'fade' || clip.transitionIn === 'dip_black' || clip.transitionIn === 'dissolve') {
        ctx.fillStyle = `rgba(0, 0, 0, ${Math.min(1, Math.max(0, progress))})`;
        ctx.fillRect(0, 0, width, height);
      } else if (clip.transitionIn === 'dip_white') {
        ctx.fillStyle = `rgba(255, 255, 255, ${Math.min(1, Math.max(0, progress))})`;
        ctx.fillRect(0, 0, width, height);
      }
    }

    // Transition Out
    if (clip.transitionOut && clip.transitionOut !== 'cut' && remainingSec < transDur) {
      const progress = 1 - (remainingSec / transDur);
      if (clip.transitionOut === 'fade' || clip.transitionOut === 'dip_black' || clip.transitionOut === 'dissolve') {
        ctx.fillStyle = `rgba(0, 0, 0, ${Math.min(1, Math.max(0, progress))})`;
        ctx.fillRect(0, 0, width, height);
      } else if (clip.transitionOut === 'dip_white') {
        ctx.fillStyle = `rgba(255, 255, 255, ${Math.min(1, Math.max(0, progress))})`;
        ctx.fillRect(0, 0, width, height);
      }
    }
  }

  /**
   * Renders title cards / plansze tekstowe
   */
  static drawTitleCard(ctx: CanvasRenderingContext2D, width: number, height: number, card: any): void {
    if (card.backgroundColor === 'gradient') {
      const grad = ctx.createLinearGradient(0, 0, width, height);
      grad.addColorStop(0, '#111827');
      grad.addColorStop(1, '#030712');
      ctx.fillStyle = grad;
    } else {
      ctx.fillStyle = card.backgroundColor || '#0A0A0A';
    }
    ctx.fillRect(0, 0, width, height);

    if (card.style === 'cinematic' || card.style === 'elegant') {
      ctx.strokeStyle = 'rgba(212, 175, 55, 0.25)';
      ctx.lineWidth = 1.5;
      const padding = 40;
      ctx.strokeRect(padding, padding, width - padding * 2, height - padding * 2);
    }

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    const text = card.text || 'Wprowadzenie';
    const subtitle = card.subtitle || '';

    if (card.style === 'classic') {
      ctx.font = 'bold 36px Georgia, serif';
      ctx.fillStyle = '#EADFC9';
      if (subtitle) {
        ctx.fillText(text, width / 2, height / 2 - 25);
        ctx.font = 'italic 20px Georgia, serif';
        ctx.fillStyle = '#A89E8D';
        ctx.fillText(subtitle, width / 2, height / 2 + 30);
      } else {
        ctx.fillText(text, width / 2, height / 2);
      }
    } else if (card.style === 'elegant') {
      ctx.font = '300 42px "Times New Roman", serif';
      ctx.fillStyle = '#D4AF37';
      if (subtitle) {
        ctx.fillText(text.toUpperCase(), width / 2, height / 2 - 30);
        ctx.font = '300 18px "Times New Roman", serif';
        ctx.fillStyle = '#EADFC9';
        ctx.fillText(subtitle, width / 2, height / 2 + 35);
      } else {
        ctx.fillText(text.toUpperCase(), width / 2, height / 2);
      }
    } else {
      ctx.font = 'bold 38px Impact, sans-serif';
      ctx.fillStyle = '#FFFFFF';
      ctx.shadowColor = 'rgba(0, 0, 0, 0.8)';
      ctx.shadowBlur = 10;
      if (subtitle) {
        ctx.fillText(text.toUpperCase(), width / 2, height / 2 - 25);
        ctx.font = 'italic 18px Georgia, serif';
        ctx.fillStyle = '#D4AF37';
        ctx.shadowBlur = 0;
        ctx.fillText(subtitle, width / 2, height / 2 + 35);
      } else {
        ctx.fillText(text.toUpperCase(), width / 2, height / 2);
      }
      ctx.shadowBlur = 0;
    }
  }
}
