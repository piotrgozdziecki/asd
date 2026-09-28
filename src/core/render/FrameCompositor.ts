import { 
  FitMode, 
  ClipColorAdjustments, 
  LookPreset, 
  TransitionType, 
  TextLayer, 
  TitleCard 
} from '../../types/project';

export interface LayerRenderContext {
  ctx: CanvasRenderingContext2D;
  width: number;
  height: number;
  timeSec: number;
  frameIndex: number;
  fps: number;
}

export class FrameCompositor {
  /**
   * Generates composite CSS filter string for granular color grading + LUT look
   */
  static buildColorFilter(adjustments?: ClipColorAdjustments, globalPreset?: string): string {
    if (!adjustments && (!globalPreset || globalPreset === 'none')) {
      return 'none';
    }

    const filters: string[] = [];
    
    // 1. Exposure / Brightness (-100 to 100)
    const exposure = adjustments?.exposure ?? 0;
    const brightness = adjustments?.brightness ?? 0;
    const netBrightness = 1 + (exposure * 0.005) + (brightness * 0.004);
    if (Math.abs(netBrightness - 1) > 0.01) {
      const clamped = Math.max(0.2, Math.min(2.5, netBrightness));
      filters.push(`brightness(${clamped.toFixed(3)})`);
    }

    // 2. Contrast (-100 to 100)
    const contrast = adjustments?.contrast ?? 0;
    if (contrast !== 0) {
      const contrastVal = 1 + (contrast * 0.006);
      const clamped = Math.max(0.3, Math.min(2.5, contrastVal));
      filters.push(`contrast(${clamped.toFixed(3)})`);
    }

    // 3. Saturation (-100 to 100)
    const saturation = adjustments?.saturation ?? 0;
    if (saturation !== 0) {
      const satVal = 1 + (saturation * 0.008);
      const clamped = Math.max(0, Math.min(3.0, satVal));
      filters.push(`saturate(${clamped.toFixed(3)})`);
    }

    // 4. Temperature & Tint
    const temperature = adjustments?.temperature ?? 0; // Warm (+) / Cool (-)
    if (temperature > 0) {
      // Warm golden tint
      filters.push(`sepia(${(temperature * 0.003).toFixed(3)})`);
    } else if (temperature < 0) {
      // Cool blueish tint
      filters.push(`hue-rotate(${(temperature * 0.15).toFixed(1)}deg)`);
    }

    const tint = adjustments?.tint ?? 0; // Green (-) / Magenta (+)
    if (tint !== 0) {
      filters.push(`hue-rotate(${(tint * 0.2).toFixed(1)}deg)`);
    }

    // 5. Look Preset with Intensity
    const look = (adjustments?.lookPreset || globalPreset) as LookPreset | undefined;
    const lookIntensity = (adjustments?.lookIntensity ?? 100) / 100;

    if (look && look !== 'none' && lookIntensity > 0) {
      switch (look) {
        case 'golden_hour':
          filters.push(`sepia(${(0.25 * lookIntensity).toFixed(2)}) contrast(${(1 + 0.08 * lookIntensity).toFixed(2)}) saturate(${(1 + 0.2 * lookIntensity).toFixed(2)})`);
          break;
        case 'cinematic':
          filters.push(`contrast(${(1 + 0.25 * lookIntensity).toFixed(2)}) brightness(${(1 - 0.05 * lookIntensity).toFixed(2)}) saturate(${(1 - 0.3 * lookIntensity).toFixed(2)})`);
          break;
        case 'warm':
          filters.push(`sepia(${(0.18 * lookIntensity).toFixed(2)}) saturate(${(1 + 0.12 * lookIntensity).toFixed(2)})`);
          break;
        case 'cool':
          filters.push(`hue-rotate(${(-12 * lookIntensity).toFixed(1)}deg) saturate(${(1 - 0.1 * lookIntensity).toFixed(2)})`);
          break;
        case 'vintage':
          filters.push(`sepia(${(0.3 * lookIntensity).toFixed(2)}) contrast(${(1 + 0.12 * lookIntensity).toFixed(2)}) brightness(${(1 - 0.04 * lookIntensity).toFixed(2)})`);
          break;
        case 'bw':
          filters.push(`grayscale(${(1 * lookIntensity).toFixed(2)}) contrast(${(1 + 0.2 * lookIntensity).toFixed(2)})`);
          break;
        case 'film':
          filters.push(`contrast(${(1 + 0.15 * lookIntensity).toFixed(2)}) saturate(${(1 + 0.15 * lookIntensity).toFixed(2)})`);
          break;
        case 'natural':
          filters.push(`contrast(${(1 + 0.08 * lookIntensity).toFixed(2)}) saturate(${(1 + 0.1 * lookIntensity).toFixed(2)})`);
          break;
      }
    }

    return filters.length > 0 ? filters.join(' ') : 'none';
  }

  /**
   * Draw media frame with high precision transform, crop, aspect ratio, and backdrop
   */
  static drawMedia(
    ctx: CanvasRenderingContext2D,
    media: CanvasImageSource,
    srcWidth: number,
    srcHeight: number,
    targetWidth: number,
    targetHeight: number,
    options: {
      fitMode: FitMode;
      rotation?: number;
      scale?: number;
      position?: { x: number; y: number };
      crop?: { x: number; y: number; width: number; height: number };
      colorAdjustments?: ClipColorAdjustments;
      globalPreset?: string;
    }
  ): void {
    if (!srcWidth || !srcHeight || targetWidth <= 0 || targetHeight <= 0) return;

    const {
      fitMode = 'fit',
      rotation = 0,
      scale = 1,
      position = { x: 0, y: 0 },
      crop,
      colorAdjustments,
      globalPreset
    } = options;

    const sourceAspect = srcWidth / srcHeight;
    const targetAspect = targetWidth / targetHeight;
    const aspectDiff = Math.abs(sourceAspect - targetAspect);

    // 1. Ambient Background Blur if significant aspect ratio mismatch and fitMode === 'fit'
    if (fitMode === 'fit' && aspectDiff > 0.15) {
      ctx.save();
      ctx.filter = 'blur(30px) brightness(0.4) contrast(1.1)';
      let bgW = targetWidth;
      let bgH = targetHeight;
      if (sourceAspect > targetAspect) {
        bgH = targetHeight;
        bgW = targetHeight * sourceAspect;
      } else {
        bgW = targetWidth;
        bgH = targetWidth / sourceAspect;
      }
      const bgX = (targetWidth - bgW) / 2;
      const bgY = (targetHeight - bgH) / 2;
      ctx.drawImage(media, bgX, bgY, bgW, bgH);
      ctx.restore();
    }

    ctx.save();
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';

    // Apply color filter
    const filter = this.buildColorFilter(colorAdjustments, globalPreset);
    if (filter !== 'none') {
      ctx.filter = filter;
    }

    // Determine Foreground Crop / Scale Bounds
    let sX = 0, sY = 0, sW = srcWidth, sH = srcHeight;
    if (crop) {
      sX = Math.max(0, Math.min(srcWidth, crop.x * srcWidth));
      sY = Math.max(0, Math.min(srcHeight, crop.y * srcHeight));
      sW = Math.max(1, Math.min(srcWidth - sX, crop.width * srcWidth));
      sH = Math.max(1, Math.min(srcHeight - sY, crop.height * srcHeight));
    }

    const effectiveAspect = sW / sH;
    let renderW = targetWidth;
    let renderH = targetHeight;
    let renderX = 0;
    let renderY = 0;

    if (fitMode === 'fit') {
      if (effectiveAspect > targetAspect) {
        renderW = targetWidth;
        renderH = targetWidth / effectiveAspect;
        renderY = (targetHeight - renderH) / 2;
      } else {
        renderH = targetHeight;
        renderW = targetHeight * effectiveAspect;
        renderX = (targetWidth - renderW) / 2;
      }
    } else if (fitMode === 'fill' || fitMode === 'smart_crop') {
      if (effectiveAspect > targetAspect) {
        renderH = targetHeight;
        renderW = targetHeight * effectiveAspect;
        renderX = (targetWidth - renderW) / 2;
      } else {
        renderW = targetWidth;
        renderH = targetWidth / effectiveAspect;
        // Top-biased crop (0.35 from top instead of 0.5 center) to keep faces in frame
        renderY = (targetHeight - renderH) * 0.35;
      }
    } else if (fitMode === 'original') {
      renderW = sW;
      renderH = sH;
      renderX = (targetWidth - renderW) / 2;
      renderY = (targetHeight - renderH) / 2;
    }

    const centerX = renderX + renderW / 2;
    const centerY = renderY + renderH / 2;

    ctx.translate(centerX, centerY);

    if (rotation !== 0) {
      ctx.rotate((rotation * Math.PI) / 180);
    }

    if (position && (position.x !== 0 || position.y !== 0)) {
      const offsetX = position.x * targetWidth * 0.5;
      const offsetY = position.y * targetHeight * 0.5;
      ctx.translate(offsetX, offsetY);
    }

    const effectiveScale = scale || 1;
    if (effectiveScale !== 1) {
      ctx.scale(effectiveScale, effectiveScale);
    }

    // Shadow for fitted foreground on ambient background
    if (fitMode === 'fit' && aspectDiff > 0.15) {
      ctx.shadowColor = 'rgba(0, 0, 0, 0.65)';
      ctx.shadowBlur = 24;
      ctx.shadowOffsetX = 0;
      ctx.shadowOffsetY = 4;
    }

    ctx.drawImage(media, sX, sY, sW, sH, -renderW / 2, -renderH / 2, renderW, renderH);
    ctx.restore();

    // Vignette overlay
    if (colorAdjustments?.vignette && colorAdjustments.vignette > 0) {
      this.applyVignette(ctx, targetWidth, targetHeight, colorAdjustments.vignette);
    }
  }

  /**
   * Applies vignette gradient
   */
  static applyVignette(ctx: CanvasRenderingContext2D, width: number, height: number, intensity: number): void {
    if (intensity <= 0) return;
    ctx.save();
    const radius = Math.max(width, height) * 0.75;
    const grad = ctx.createRadialGradient(
      width / 2, height / 2, radius * 0.35,
      width / 2, height / 2, radius
    );
    const alpha = Math.min(0.85, (intensity / 100) * 0.85);
    grad.addColorStop(0, 'rgba(0, 0, 0, 0)');
    grad.addColorStop(1, `rgba(0, 0, 0, ${alpha.toFixed(3)})`);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, width, height);
    ctx.restore();
  }

  /**
   * Renders advanced transition effects (Transitions 2.0)
   */
  static applyTransition(
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    progress: number, // 0.0 (start) to 1.0 (fully active / peak)
    type: TransitionType
  ): void {
    if (type === 'cut' || progress <= 0) return;

    const clampedProg = Math.max(0, Math.min(1, progress));

    ctx.save();

    switch (type) {
      case 'fade':
      case 'dissolve':
      case 'dip_black': {
        ctx.fillStyle = `rgba(0, 0, 0, ${clampedProg.toFixed(3)})`;
        ctx.fillRect(0, 0, width, height);
        break;
      }

      case 'dip_white': {
        ctx.fillStyle = `rgba(255, 255, 255, ${clampedProg.toFixed(3)})`;
        ctx.fillRect(0, 0, width, height);
        break;
      }

      case 'zoom': {
        ctx.fillStyle = `rgba(0, 0, 0, ${(clampedProg * 0.6).toFixed(3)})`;
        ctx.fillRect(0, 0, width, height);
        break;
      }

      case 'slide': {
        ctx.fillStyle = `rgba(0, 0, 0, ${(0.4 * clampedProg).toFixed(3)})`;
        ctx.fillRect(0, 0, width, height);
        break;
      }

      case 'wipe': {
        const wipeX = width * clampedProg;
        ctx.fillStyle = '#000000';
        ctx.fillRect(0, 0, wipeX, height);
        break;
      }

      case 'blur': {
        ctx.fillStyle = `rgba(18, 18, 22, ${(clampedProg * 0.8).toFixed(3)})`;
        ctx.fillRect(0, 0, width, height);
        break;
      }

      case 'light_leak': {
        const grad = ctx.createLinearGradient(0, 0, width, height);
        const a = (clampedProg * 0.85).toFixed(3);
        grad.addColorStop(0, `rgba(253, 224, 71, ${a})`);
        grad.addColorStop(0.5, `rgba(249, 115, 22, ${a})`);
        grad.addColorStop(1, `rgba(239, 68, 68, ${(clampedProg * 0.4).toFixed(3)})`);
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, width, height);
        break;
      }

      case 'film_burn': {
        const grad = ctx.createRadialGradient(width / 2, height / 2, 50, width / 2, height / 2, width * 0.8);
        const a = (clampedProg * 0.9).toFixed(3);
        grad.addColorStop(0, `rgba(255, 255, 255, ${a})`);
        grad.addColorStop(0.4, `rgba(245, 158, 11, ${a})`);
        grad.addColorStop(1, `rgba(180, 83, 9, ${(clampedProg * 0.6).toFixed(3)})`);
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, width, height);
        break;
      }
    }

    ctx.restore();
  }

  /**
   * Renders animated Text / Subtitle / Lower Third Layer with subframe deterministic precision
   */
  static drawTextLayer(
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    layer: TextLayer,
    currentTimelineSec: number
  ): void {
    const elapsed = currentTimelineSec - layer.timelineStart;
    if (elapsed < 0 || elapsed > layer.duration) return;

    const remaining = layer.duration - elapsed;

    ctx.save();

    // Compute Animation State
    let opacity = layer.opacity ?? 1;
    let offsetY = 0;
    let scaleFactor = 1;
    let displayText = layer.text;

    const animDuration = 0.35; // 350ms smooth transition window

    if (layer.animation === 'fade') {
      if (elapsed < animDuration) {
        opacity *= (elapsed / animDuration);
      } else if (remaining < animDuration) {
        opacity *= (remaining / animDuration);
      }
    } else if (layer.animation === 'slide') {
      if (elapsed < animDuration) {
        const t = 1 - (elapsed / animDuration);
        offsetY = t * 30 * (height / 1080);
        opacity *= (elapsed / animDuration);
      } else if (remaining < animDuration) {
        const t = 1 - (remaining / animDuration);
        offsetY = -t * 30 * (height / 1080);
        opacity *= (remaining / animDuration);
      }
    } else if (layer.animation === 'scale') {
      if (elapsed < animDuration) {
        const t = elapsed / animDuration;
        scaleFactor = 0.85 + (0.15 * t);
        opacity *= t;
      }
    } else if (layer.animation === 'typewriter') {
      const typeDuration = Math.min(2.0, layer.duration * 0.75);
      const charProgress = Math.min(1, Math.max(0, elapsed / typeDuration));
      const charCount = Math.round(charProgress * layer.text.length);
      displayText = layer.text.substring(0, charCount);
    } else if (layer.animation === 'blur_in') {
      if (elapsed < animDuration) {
        const t = elapsed / animDuration;
        opacity *= t;
      }
    }

    ctx.globalAlpha = Math.max(0, Math.min(1, opacity));

    const posX = (layer.position?.x ?? 0.5) * width;
    const posY = ((layer.position?.y ?? 0.85) * height) + offsetY;

    const fontScale = height / 1080;
    const baseSize = Math.max(14, Math.round((layer.fontSize || 32) * fontScale * scaleFactor));
    const weight = layer.fontWeight || (layer.type === 'title' || layer.type === 'chapter' ? 'bold' : 'normal');
    
    let family = layer.fontFamily;
    if (!family) {
      if (layer.style === 'cinematic') {
        family = '"Cinzel", "Playfair Display", "Times New Roman", serif';
      } else if (layer.style === 'elegant') {
        family = '"Playfair Display", "Georgia", serif';
      } else if (layer.style === 'minimalist') {
        family = '"Inter", system-ui, -apple-system, sans-serif';
      } else {
        family = '"Inter", system-ui, sans-serif';
      }
    }

    ctx.font = `${weight} ${baseSize}px ${family}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // Support multiline text
    const lines = displayText.split('\n');
    const lineHeight = baseSize * 1.35;
    const totalTextHeight = lines.length * lineHeight;

    // Measure maximum line width
    let maxLineWidth = 0;
    for (const line of lines) {
      const metrics = ctx.measureText(line);
      if (metrics.width > maxLineWidth) {
        maxLineWidth = metrics.width;
      }
    }

    const padX = baseSize * 0.7;
    const padY = baseSize * 0.45;
    const boxW = maxLineWidth + padX * 2;
    const boxH = totalTextHeight + padY * 2;

    // Draw Background Pill or Lower-Third Card
    if (layer.type === 'lower_third') {
      ctx.save();
      const ltGrad = ctx.createLinearGradient(posX - boxW / 2, posY - boxH / 2, posX + boxW / 2 + 100, posY + boxH / 2);
      ltGrad.addColorStop(0, 'rgba(10, 10, 14, 0.85)');
      ltGrad.addColorStop(0.7, 'rgba(24, 24, 30, 0.75)');
      ltGrad.addColorStop(1, 'rgba(10, 10, 14, 0)');
      ctx.fillStyle = ltGrad;
      ctx.fillRect(posX - boxW / 2, posY - boxH / 2, boxW + 80, boxH);
      // Gold accent bar
      ctx.fillStyle = '#D4AF37';
      ctx.fillRect(posX - boxW / 2, posY - boxH / 2, 4, boxH);
      ctx.restore();
    } else if (layer.backgroundColor) {
      ctx.save();
      ctx.fillStyle = layer.backgroundColor;
      ctx.beginPath();
      if (typeof ctx.roundRect === 'function') {
        ctx.roundRect(posX - boxW / 2, posY - boxH / 2, boxW, boxH, 8);
      } else {
        ctx.rect(posX - boxW / 2, posY - boxH / 2, boxW, boxH);
      }
      ctx.fill();
      ctx.restore();
    }

    // Drop Shadow
    if (layer.shadow !== false) {
      ctx.shadowColor = 'rgba(0, 0, 0, 0.9)';
      ctx.shadowBlur = Math.round(10 * fontScale);
      ctx.shadowOffsetX = Math.round(2 * fontScale);
      ctx.shadowOffsetY = Math.round(2 * fontScale);
    }

    // Render each line
    const startY = posY - (totalTextHeight / 2) + (lineHeight / 2);
    for (let i = 0; i < lines.length; i++) {
      const lineText = lines[i];
      const curY = startY + (i * lineHeight);

      // Outline
      if (layer.outlineWidth && layer.outlineWidth > 0) {
        ctx.strokeStyle = layer.outlineColor || '#000000';
        ctx.lineWidth = layer.outlineWidth * fontScale;
        ctx.strokeText(lineText, posX, curY);
      }

      // Main Text Fill
      ctx.fillStyle = layer.color || (layer.style === 'cinematic' ? '#D4AF37' : '#FFFFFF');
      ctx.fillText(lineText, posX, curY);
    }

    // Optional Speaker Badge for subtitles
    if (layer.subtitleSpeaker) {
      ctx.save();
      const badgeFontSize = Math.max(11, Math.round(baseSize * 0.65));
      ctx.font = `600 ${badgeFontSize}px ${family}`;
      ctx.fillStyle = '#D4AF37';
      ctx.shadowColor = 'rgba(0, 0, 0, 0.9)';
      ctx.shadowBlur = 6;
      ctx.fillText(layer.subtitleSpeaker.toUpperCase(), posX, posY - (boxH / 2) - 8);
      ctx.restore();
    }

    ctx.restore();
  }

  /**
   * Applies CinemaScope (2.39:1) Hollywood black bars
   */
  static applyLetterbox(ctx: CanvasRenderingContext2D, width: number, height: number, mode?: string): void {
    if (mode === 'cinemascope') {
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
   * Renders optional watermark branding
   */
  static applyWatermark(
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    watermark?: { enabled: boolean; text: string; position: string; opacity: number }
  ): void {
    if (!watermark || !watermark.enabled || !watermark.text) return;

    ctx.save();
    ctx.globalAlpha = Math.max(0.1, Math.min(1, watermark.opacity || 0.4));
    ctx.font = 'bold 16px Inter, sans-serif';
    ctx.fillStyle = '#FFFFFF';
    ctx.shadowColor = 'rgba(0, 0, 0, 0.8)';
    ctx.shadowBlur = 4;

    const pad = 30;
    const text = watermark.text;

    switch (watermark.position) {
      case 'top_left':
        ctx.textAlign = 'left';
        ctx.fillText(text, pad, pad + 16);
        break;
      case 'top_right':
        ctx.textAlign = 'right';
        ctx.fillText(text, width - pad, pad + 16);
        break;
      case 'bottom_left':
        ctx.textAlign = 'left';
        ctx.fillText(text, pad, height - pad);
        break;
      default: // bottom_right
        ctx.textAlign = 'right';
        ctx.fillText(text, width - pad, height - pad);
        break;
    }

    ctx.restore();
  }

  /**
   * Renders high-end Title Cards before clips
   */
  static drawTitleCard(ctx: CanvasRenderingContext2D, width: number, height: number, card: TitleCard): void {
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
      ctx.strokeStyle = 'rgba(212, 175, 55, 0.3)';
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
