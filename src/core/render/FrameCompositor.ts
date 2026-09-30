import { 
  FitMode, 
  ClipColorAdjustments, 
  LookPreset, 
  TransitionType, 
  TextLayer, 
  TitleCard 
} from '../../types/project';

export type AnyCanvasContext = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

export interface LayerRenderContext {
  ctx: AnyCanvasContext;
  width: number;
  height: number;
  timeSec: number;
  frameIndex: number;
  fps: number;
}

export class FrameCompositor {
  /**
   * Creates an OffscreenCanvas or fallback HTMLCanvasElement for high-throughput headless frame drawing
   */
  static createOffscreenCanvas(width: number, height: number): OffscreenCanvas | HTMLCanvasElement {
    if (typeof OffscreenCanvas !== 'undefined') {
      return new OffscreenCanvas(width, height);
    }
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    return canvas;
  }

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
    ctx: AnyCanvasContext,
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

    // 1. IV.1 Smart Ambient Background Blur: Eliminates black bars on vertical/horizontal mixed clips
    const needsSmartBackground = (fitMode === 'fit' || fitMode === 'original') && (aspectDiff > 0.02);
    if (needsSmartBackground) {
      ctx.save();
      ctx.filter = 'blur(35px) brightness(0.42) contrast(1.15)';
      let bgW = targetWidth;
      let bgH = targetHeight;
      if (sourceAspect > targetAspect) {
        bgH = targetHeight;
        bgW = targetHeight * sourceAspect * 1.05;
      } else {
        bgW = targetWidth;
        bgH = (targetWidth / sourceAspect) * 1.05;
      }
      const bgX = (targetWidth - bgW) / 2;
      const bgY = (targetHeight - bgH) / 2;
      ctx.drawImage(media, bgX, bgY, bgW, bgH);
      
      // Semi-transparent dark wash for high contrast against sharp foreground
      ctx.filter = 'none';
      ctx.fillStyle = 'rgba(0, 0, 0, 0.25)';
      ctx.fillRect(0, 0, targetWidth, targetHeight);
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

    // Drop shadow for fitted foreground on ambient background to create depth
    if (needsSmartBackground) {
      ctx.shadowColor = 'rgba(0, 0, 0, 0.75)';
      ctx.shadowBlur = 28;
      ctx.shadowOffsetX = 0;
      ctx.shadowOffsetY = 6;
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
  static applyVignette(ctx: AnyCanvasContext, width: number, height: number, intensity: number): void {
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
    ctx: AnyCanvasContext,
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
    ctx: AnyCanvasContext,
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
  static applyLetterbox(ctx: AnyCanvasContext, width: number, height: number, mode?: string): void {
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
    ctx: AnyCanvasContext,
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
   * Renders high-end Title Cards before clips (including Liturgical Church Theme and Outro Gratitude)
   */
  static drawTitleCard(ctx: AnyCanvasContext, width: number, height: number, card: TitleCard): void {
    ctx.save();

    const fontScale = height / 1080;
    const isLiturgical = card.style === 'liturgical' || (card.text && card.text.toLowerCase().includes('ślub'));
    const isOutro = card.cardType === 'outro' || (card.text && (card.text.toLowerCase().includes('dziękujemy') || card.text.toLowerCase().includes('finał')));

    if (isLiturgical) {
      // Warm deep cathedral background with candlelight amber aura
      const grad = ctx.createRadialGradient(
        width / 2, height * 0.45, Math.round(width * 0.1),
        width / 2, height / 2, Math.round(width * 0.75)
      );
      grad.addColorStop(0, '#261C12'); // Warm amber-candlelit cathedral interior
      grad.addColorStop(0.35, '#17110B');
      grad.addColorStop(0.7, '#0E0A06');
      grad.addColorStop(1, '#050403');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, width, height);

      // Gothic / Romanesque Cathedral Arch Framing in burnished gold
      const archWidth = Math.round(width * 0.78);
      const archLeft = (width - archWidth) / 2;
      const archRight = archLeft + archWidth;
      const archRadius = archWidth / 2;
      const archTop = Math.round(50 * fontScale);
      const archBottom = height - Math.round(50 * fontScale);
      const archCenterY = archTop + archRadius;

      ctx.save();
      ctx.strokeStyle = 'rgba(212, 175, 55, 0.65)';
      ctx.lineWidth = Math.max(2, Math.round(2.5 * fontScale));

      // Outer Arch
      ctx.beginPath();
      ctx.moveTo(archLeft, archBottom);
      ctx.lineTo(archLeft, archCenterY);
      ctx.arc(width / 2, archCenterY, archRadius, Math.PI, 0, false);
      ctx.lineTo(archRight, archBottom);
      ctx.stroke();

      // Inner Delicate Hairline
      ctx.strokeStyle = 'rgba(212, 175, 55, 0.25)';
      ctx.lineWidth = 1;
      const innerGap = Math.round(12 * fontScale);
      ctx.beginPath();
      ctx.moveTo(archLeft + innerGap, archBottom - innerGap);
      ctx.lineTo(archLeft + innerGap, archCenterY);
      ctx.arc(width / 2, archCenterY, Math.max(10, archRadius - innerGap), Math.PI, 0, false);
      ctx.lineTo(archRight - innerGap, archBottom - innerGap);
      ctx.stroke();
      ctx.restore();

      // Sacred Monogram / Golden Liturgical Cross Ornament at the arch apex
      ctx.save();
      const crossSize = Math.max(22, Math.round(36 * fontScale));
      ctx.font = `${crossSize}px serif`;
      ctx.fillStyle = '#D4AF37';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.shadowColor = 'rgba(212, 175, 55, 0.6)';
      ctx.shadowBlur = Math.round(16 * fontScale);
      ctx.fillText('✝', width / 2, archTop + Math.round(24 * fontScale));
      ctx.restore();

    } else if (isOutro) {
      // Warm romantic dark royal velvet with golden starlight vignette
      const grad = ctx.createRadialGradient(
        width / 2, height / 2, Math.round(width * 0.15),
        width / 2, height / 2, Math.round(width * 0.8)
      );
      grad.addColorStop(0, '#221815');
      grad.addColorStop(0.45, '#150E0C');
      grad.addColorStop(1, '#060404');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, width, height);

      // Elegant double frame with corner accents
      const pad = Math.round(54 * fontScale);
      ctx.strokeStyle = 'rgba(212, 175, 55, 0.55)';
      ctx.lineWidth = Math.max(1.5, Math.round(2 * fontScale));
      ctx.strokeRect(pad, pad, width - pad * 2, height - pad * 2);

      ctx.strokeStyle = 'rgba(212, 175, 55, 0.2)';
      ctx.lineWidth = 1;
      ctx.strokeRect(pad + 10, pad + 10, width - (pad + 10) * 2, height - (pad + 10) * 2);

      // Heart / Rings Monogram Emblem
      ctx.save();
      ctx.font = `${Math.round(34 * fontScale)}px serif`;
      ctx.fillStyle = '#D4AF37';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.shadowColor = 'rgba(212, 175, 55, 0.8)';
      ctx.shadowBlur = Math.round(18 * fontScale);
      ctx.fillText('❦', width / 2, (height / 2) - Math.round(110 * fontScale));
      ctx.restore();

    } else {
      // Cinematic / Modern Gradient or solid
      if (card.backgroundColor === 'gradient') {
        const grad = ctx.createLinearGradient(0, 0, width, height);
        grad.addColorStop(0, '#0F172A');
        grad.addColorStop(0.5, '#0A0E17');
        grad.addColorStop(1, '#020617');
        ctx.fillStyle = grad;
      } else {
        ctx.fillStyle = card.backgroundColor || '#0A0A0A';
      }
      ctx.fillRect(0, 0, width, height);

      // Gold Frame
      ctx.strokeStyle = 'rgba(212, 175, 55, 0.45)';
      ctx.lineWidth = Math.max(1.5, Math.round(2 * fontScale));
      const padding = Math.round(48 * fontScale);
      ctx.strokeRect(padding, padding, width - padding * 2, height - padding * 2);

      ctx.strokeStyle = 'rgba(212, 175, 55, 0.18)';
      ctx.lineWidth = 1;
      const innerPadding = padding + Math.round(10 * fontScale);
      ctx.strokeRect(innerPadding, innerPadding, width - innerPadding * 2, height - innerPadding * 2);
    }

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    const text = card.text || 'Wprowadzenie';
    const subtitle = card.subtitle || '';

    if (isLiturgical) {
      // Regal liturgical typography
      const titleSize = Math.max(28, Math.round(62 * fontScale));
      const subSize = Math.max(16, Math.round(26 * fontScale));

      ctx.font = `bold ${titleSize}px "Cinzel", "Playfair Display", "Times New Roman", serif`;
      ctx.fillStyle = '#FFF8EB';
      ctx.shadowColor = 'rgba(212, 175, 55, 0.75)';
      ctx.shadowBlur = Math.round(18 * fontScale);

      const titleY = subtitle ? (height / 2) - Math.round(20 * fontScale) : (height / 2);
      ctx.fillText(text.toUpperCase(), width / 2, titleY);

      if (subtitle) {
        ctx.font = `italic 500 ${subSize}px "Playfair Display", Georgia, serif`;
        ctx.fillStyle = '#E5C158';
        ctx.shadowColor = 'rgba(0, 0, 0, 0.9)';
        ctx.shadowBlur = Math.round(10 * fontScale);
        ctx.fillText(`♦  ${subtitle}  ♦`, width / 2, (height / 2) + Math.round(52 * fontScale));
      }
    } else if (isOutro) {
      // Outro gratitude typography with intelligent word wrap
      const titleSize = Math.max(28, Math.round(56 * fontScale));
      const subSize = Math.max(16, Math.round(24 * fontScale));

      ctx.font = `bold ${titleSize}px "Cinzel", "Playfair Display", serif`;
      ctx.fillStyle = '#FAF5EB';
      ctx.shadowColor = 'rgba(212, 175, 55, 0.8)';
      ctx.shadowBlur = Math.round(16 * fontScale);
      ctx.fillText(text.toUpperCase(), width / 2, (height / 2) - Math.round(40 * fontScale));

      if (subtitle) {
        ctx.font = `400 ${subSize}px "Playfair Display", Georgia, serif`;
        ctx.fillStyle = '#E8DFD1';
        ctx.shadowColor = 'rgba(0, 0, 0, 0.95)';
        ctx.shadowBlur = Math.round(8 * fontScale);

        // Multi-line wrap for heartwarming thank you note
        const maxWidth = width * 0.74;
        const words = subtitle.split(' ');
        let line = '';
        let lineY = (height / 2) + Math.round(22 * fontScale);
        const lineHeight = Math.round(34 * fontScale);

        for (let n = 0; n < words.length; n++) {
          const testLine = line + words[n] + ' ';
          const metrics = ctx.measureText(testLine);
          if (metrics.width > maxWidth && n > 0) {
            ctx.fillText(line.trim(), width / 2, lineY);
            line = words[n] + ' ';
            lineY += lineHeight;
          } else {
            line = testLine;
          }
        }
        ctx.fillText(line.trim(), width / 2, lineY);
      }
    } else if (card.style === 'classic') {
      const titleSize = Math.max(22, Math.round(44 * fontScale));
      const subSize = Math.max(14, Math.round(22 * fontScale));
      
      ctx.font = `bold ${titleSize}px "Cinzel", "Playfair Display", Georgia, serif`;
      ctx.fillStyle = '#F5EBD7';
      ctx.shadowColor = 'rgba(0, 0, 0, 0.85)';
      ctx.shadowBlur = Math.round(8 * fontScale);

      if (subtitle) {
        ctx.fillText(text, width / 2, (height / 2) - Math.round(30 * fontScale));
        ctx.font = `italic ${subSize}px "Cinzel", Georgia, serif`;
        ctx.fillStyle = '#D4AF37';
        ctx.fillText(subtitle, width / 2, (height / 2) + Math.round(35 * fontScale));
      } else {
        ctx.fillText(text, width / 2, height / 2);
      }
    } else if (card.style === 'elegant') {
      const titleSize = Math.max(24, Math.round(50 * fontScale));
      const subSize = Math.max(14, Math.round(20 * fontScale));

      ctx.font = `300 ${titleSize}px "Cinzel", "Playfair Display", "Times New Roman", serif`;
      ctx.fillStyle = '#D4AF37';
      ctx.shadowColor = 'rgba(0, 0, 0, 0.9)';
      ctx.shadowBlur = Math.round(12 * fontScale);

      if (subtitle) {
        ctx.fillText(text.toUpperCase(), width / 2, (height / 2) - Math.round(32 * fontScale));
        ctx.font = `300 ${subSize}px "Playfair Display", serif`;
        ctx.fillStyle = '#E8E1D5';
        ctx.fillText(subtitle, width / 2, (height / 2) + Math.round(40 * fontScale));
      } else {
        ctx.fillText(text.toUpperCase(), width / 2, height / 2);
      }
    } else {
      // Cinematic / Modern Luxury
      const titleSize = Math.max(24, Math.round(52 * fontScale));
      const subSize = Math.max(14, Math.round(22 * fontScale));

      ctx.font = `bold ${titleSize}px "Cinzel", "Playfair Display", serif`;
      ctx.fillStyle = '#FDFDFD';
      ctx.shadowColor = 'rgba(0, 0, 0, 0.95)';
      ctx.shadowBlur = Math.round(14 * fontScale);

      if (subtitle) {
        ctx.fillText(text.toUpperCase(), width / 2, (height / 2) - Math.round(30 * fontScale));
        ctx.font = `italic 500 ${subSize}px "Playfair Display", serif`;
        ctx.fillStyle = '#D4AF37';
        ctx.shadowBlur = Math.round(8 * fontScale);
        ctx.fillText(subtitle, width / 2, (height / 2) + Math.round(40 * fontScale));
      } else {
        ctx.fillText(text.toUpperCase(), width / 2, height / 2);
      }
    }

    ctx.restore();
  }
}
