/**
 * Procedural high-resolution 2D canvas texture composer for Three.js 3D products.
 * Generates synchronized Front, Back, and Cylindrical Wrap textures with artwork
 * transform (zoom/offset), laser bamboo grain, 2027 calendar grid, and free X/Y
 * horizontal/vertical text placement.
 */

export type TextOrientation = 'horizontal' | 'vertical';
export type TextPlacementSide = 'front' | 'back' | 'both';

export interface Studio3DConfig {
  serviceId: string;
  sizeId: string;
  artworkSrc?: string;
  zoom: number;
  posX: number;
  posY: number;
  customText: string;
  fontStyle: string;
  textSize: number;
  textColor: '#151515' | '#FFFFFF';
  textX: number;
  textY: number;
  textOrientation: TextOrientation;
  textSide: TextPlacementSide;
  printColorMode: 'color' | 'bw';
  photoBordered: boolean;
  laminationFinish: 'Glossy' | 'Matte';
}

export interface ProductTextureSet {
  front: HTMLCanvasElement;
  back: HTMLCanvasElement;
  wrap?: HTMLCanvasElement;
}

const imageCache = new Map<string, Promise<HTMLImageElement | null>>();

function getCachedImage(src?: string): Promise<HTMLImageElement | null> {
  if (!src) return Promise.resolve(null);
  const existing = imageCache.get(src);
  if (existing) return existing;

  const promise = new Promise<HTMLImageElement | null>((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
  imageCache.set(src, promise);
  return promise;
}

function makeCanvas(w: number, h: number): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } | null {
  if (
    typeof document === 'undefined' ||
    (typeof navigator !== 'undefined' && navigator.userAgent?.includes('jsdom'))
  ) {
    return null;
  }
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  try {
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    return { canvas, ctx };
  } catch {
    return null;
  }
}

function drawCoverImage(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  boxX: number,
  boxY: number,
  boxW: number,
  boxH: number,
  config: Studio3DConfig,
  filterCss?: string,
) {
  ctx.save();
  ctx.beginPath();
  ctx.rect(boxX, boxY, boxW, boxH);
  ctx.clip();

  if (filterCss) {
    ctx.filter = filterCss;
  }

  const baseScale = Math.max(boxW / (img.width || boxW), boxH / (img.height || boxH));
  const scale = baseScale * (config.zoom / 100);
  const drawW = (img.width || boxW) * scale;
  const drawH = (img.height || boxH) * scale;
  const cx = boxX + boxW / 2 + (config.posX / 100) * boxW;
  const cy = boxY + boxH / 2 + (config.posY / 100) * boxH;

  ctx.drawImage(img, cx - drawW / 2, cy - drawH / 2, drawW, drawH);
  ctx.restore();
}

function drawBambooGrain(ctx: CanvasRenderingContext2D, w: number, h: number) {
  const grad = ctx.createLinearGradient(0, 0, w, h);
  grad.addColorStop(0, '#E9CD9E');
  grad.addColorStop(0.5, '#DFBC82');
  grad.addColorStop(1, '#D1AA6F');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);

  ctx.save();
  ctx.strokeStyle = 'rgba(130, 86, 36, 0.14)';
  ctx.lineWidth = 2;
  for (let y = 8; y < h; y += 11) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.bezierCurveTo(w * 0.33, y + Math.sin(y) * 5, w * 0.66, y - Math.cos(y) * 5, w, y);
    ctx.stroke();
  }
  ctx.restore();
}

function shouldRenderTextOnSide(side: 'front' | 'back', config: Studio3DConfig): boolean {
  if (config.textSide === 'both') return true;
  return config.textSide === side;
}

export function drawPlacedText(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  config: Studio3DConfig,
  side: 'front' | 'back',
  overrideText?: string,
  region?: { x: number; y: number; w: number; h: number },
) {
  const raw = (overrideText ?? config.customText).trim();
  if (!raw || !shouldRenderTextOnSide(side, config)) return;

  const box = region ?? { x: 0, y: 0, w, h };
  const cx = box.x + box.w * (0.5 + config.textX / 100);
  const cy = box.y + box.h * (0.5 + config.textY / 100);
  const scaleFactor = Math.min(box.w, box.h) / 360;
  const fontPx = Math.max(18, Math.round(config.textSize * Math.max(1.2, scaleFactor)));

  ctx.save();
  ctx.translate(cx, cy);
  if (config.textOrientation === 'vertical') {
    ctx.rotate(-Math.PI / 2);
  }
  ctx.font = `700 ${fontPx}px "${config.fontStyle}", sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  const isLaser = config.serviceId === 'laser-engraving';
  if (isLaser) {
    ctx.shadowColor = 'rgba(255, 240, 210, 0.45)';
    ctx.shadowOffsetY = 1.5;
    ctx.shadowBlur = 1;
    ctx.fillStyle = '#3B230E';
  } else {
    ctx.shadowColor = config.textColor === '#FFFFFF' ? 'rgba(0,0,0,0.65)' : 'rgba(255,255,255,0.55)';
    ctx.shadowBlur = 8;
    ctx.fillStyle = config.textColor;
  }

  const maxLineW = (config.textOrientation === 'vertical' ? box.h : box.w) * 0.84;
  ctx.fillText(raw, 0, 0, maxLineW);
  ctx.restore();
}

function drawCalendarGrid(ctx: CanvasRenderingContext2D, w: number, h: number) {
  const startY = Math.round(h * 0.56);
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, startY, w, h - startY);

  ctx.fillStyle = '#151515';
  ctx.font = '700 34px Inter, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('2027 STUDIO CALENDAR', w / 2, startY + 46);

  const months = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
  const padX = 54;
  const cols = 4;
  const cellW = (w - padX * 2) / cols;
  const cellH = Math.floor((h - startY - 72) / 3);

  months.forEach((m, idx) => {
    const col = idx % cols;
    const row = Math.floor(idx / cols);
    const x = padX + col * cellW;
    const y = startY + 68 + row * cellH;

    ctx.fillStyle = '#FAFAFA';
    ctx.strokeStyle = '#E5E5E5';
    ctx.lineWidth = 2;
    ctx.fillRect(x + 6, y + 4, cellW - 12, cellH - 10);
    ctx.strokeRect(x + 6, y + 4, cellW - 12, cellH - 10);

    ctx.fillStyle = '#38BDF8';
    ctx.fillRect(x + 6, y + 4, cellW - 12, 24);

    ctx.fillStyle = '#151515';
    ctx.font = '700 13px Inter, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(m, x + 16, y + 20);

    ctx.fillStyle = '#676767';
    ctx.font = '500 11px monospace';
    for (let r = 0; r < 4; r += 1) {
      const base = r * 7 + 1;
      const line = Array.from({ length: 7 }, (_, d) => (base + d <= 30 ? String(base + d).padStart(2, ' ') : '  ')).join(' ');
      ctx.fillText(line, x + 14, y + 46 + r * 17);
    }
  });
}

function drawDocumentSheet(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  img: HTMLImageElement | null,
  config: Studio3DConfig,
  side: 'front' | 'back',
) {
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, w, h);

  const filterCss =
    config.printColorMode === 'bw' && (config.sizeId === 'a4' || config.sizeId === 'short')
      ? 'grayscale(100%) contrast(1.06)'
      : undefined;

  if (config.sizeId === '2x2' && side === 'front') {
    const cols = 3;
    const rows = 2;
    const gap = 36;
    const marginX = 96;
    const marginY = 140;
    const cellW = Math.floor((w - marginX * 2 - gap * (cols - 1)) / cols);
    const cellH = cellW;
    for (let r = 0; r < rows; r += 1) {
      for (let c = 0; c < cols; c += 1) {
        const x = marginX + c * (cellW + gap);
        const y = marginY + r * (cellH + gap);
        if (img) {
          drawCoverImage(ctx, img, x, y, cellW, cellH, config, filterCss);
        } else {
          ctx.fillStyle = '#F3F4F6';
          ctx.fillRect(x, y, cellW, cellH);
        }
        ctx.strokeStyle = '#D4D4D4';
        ctx.lineWidth = 3;
        ctx.strokeRect(x, y, cellW, cellH);
      }
    }
    ctx.fillStyle = '#525252';
    ctx.font = '600 22px Inter, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('2 × 2 ID PHOTO SHEET (6 PCS)', w / 2, h - 72);
    drawPlacedText(ctx, w, h, config, side);
    return;
  }

  const inset =
    (config.sizeId === '4x4' || config.sizeId === '8x8') && config.photoBordered
      ? 54
      : config.sizeId === 'a4' || config.sizeId === 'short'
        ? 44
        : 0;

  if (img) {
    drawCoverImage(ctx, img, inset, inset, w - inset * 2, h - inset * 2, config, filterCss);
  }
  drawPlacedText(ctx, w, h, config, side);
}

/**
 * Builds fresh Front, Back, and optional Mug Wrap HTMLCanvasElements for the 3D scene.
 */
export async function buildProductTextures(config: Studio3DConfig): Promise<ProductTextureSet | null> {
  const dims: Record<string, [number, number]> = {
    'mug-customization': [1024, 1024],
    'custom-keychains': [640, 1024],
    'refrigerator-magnets': [780, 1024],
    'sintra-board': [800, 1080],
    lamination: [800, 1080],
    'a4-calendar': [800, 1100],
    'document-printing': [840, 1080],
    'laser-engraving': config.sizeId === 'brush' ? [680, 1080] : [800, 1024],
    'souvenir-making': [880, 880],
  };
  const [w, h] = dims[config.serviceId] ?? [880, 880];

  const frontSurface = makeCanvas(w, h);
  const backSurface = makeCanvas(w, h);
  if (!frontSurface || !backSurface) return null;

  const img = await getCachedImage(config.artworkSrc);

  // Special full wrap canvas for curved ceramic mug (2048 x 900 cover wrap)
  let wrapCanvas: HTMLCanvasElement | undefined;
  if (config.serviceId === 'mug-customization') {
    const wrapSurface = makeCanvas(2048, 900);
    if (wrapSurface) {
      const { canvas, ctx } = wrapSurface;
      ctx.fillStyle = '#FCFCFC';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      if (img) {
        drawCoverImage(ctx, img, 84, 52, 860, 796, config);
        drawCoverImage(ctx, img, 1104, 52, 860, 796, config);
      }

      drawPlacedText(ctx, canvas.width, canvas.height, config, 'front', undefined, {
        x: 84,
        y: 52,
        w: 860,
        h: 796,
      });
      drawPlacedText(ctx, canvas.width, canvas.height, config, 'back', undefined, {
        x: 1104,
        y: 52,
        w: 860,
        h: 796,
      });
      wrapCanvas = canvas;
    }
  }

  const paintFace = (ctx: CanvasRenderingContext2D, side: 'front' | 'back') => {
    if (config.serviceId === 'laser-engraving') {
      drawBambooGrain(ctx, w, h);
      if (img && side === 'front') {
        ctx.save();
        ctx.globalAlpha = 0.24;
        drawCoverImage(ctx, img, 40, 40, w - 80, h - 80, config, 'sepia(100%) contrast(1.25)');
        ctx.restore();
      }
      const laserLabel = config.customText.trim() || (config.sizeId === 'brush' || config.sizeId === 'pen' ? 'RJ HUB' : '');
      drawPlacedText(ctx, w, h, config, side, laserLabel);
      return;
    }

    if (config.serviceId === 'a4-calendar') {
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, w, h);
      if (side === 'front') {
        if (img) drawCoverImage(ctx, img, 0, 0, w, Math.round(h * 0.56), config);
        drawCalendarGrid(ctx, w, h);
        drawPlacedText(ctx, w, h, config, side, undefined, { x: 0, y: 0, w, h: Math.round(h * 0.56) });
      } else {
        if (img) drawCoverImage(ctx, img, 56, 56, w - 112, h - 112, config);
        drawPlacedText(ctx, w, h, config, side);
      }
      return;
    }

    if (config.serviceId === 'document-printing') {
      drawDocumentSheet(ctx, w, h, img, config, side);
      return;
    }

    if (config.serviceId === 'lamination') {
      ctx.fillStyle = '#F7F8FA';
      ctx.fillRect(0, 0, w, h);
      if (img) drawCoverImage(ctx, img, 44, 44, w - 88, h - 88, config);
      drawPlacedText(ctx, w, h, config, side);
      return;
    }

    // Standard full-bleed double-sided prints (Sintra Board, Keychain, Magnet, Souvenir)
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, w, h);
    if (img) {
      drawCoverImage(ctx, img, 0, 0, w, h, config);
    }
    drawPlacedText(ctx, w, h, config, side);
  };

  paintFace(frontSurface.ctx, 'front');
  paintFace(backSurface.ctx, 'back');

  return {
    front: frontSurface.canvas,
    back: backSurface.canvas,
    wrap: wrapCanvas,
  };
}
