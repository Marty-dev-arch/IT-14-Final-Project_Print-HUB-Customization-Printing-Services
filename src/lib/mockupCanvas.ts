/** Pure HTML5 canvas helpers for studio background removal and 3D mockup snapshot export. */

function loadImageElement(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Unable to load image.'));
    img.src = src;
  });
}

function getSafe2dContext(
  width: number,
  height: number,
): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } | null {
  if (
    typeof document === 'undefined' ||
    (typeof navigator !== 'undefined' && navigator.userAgent?.includes('jsdom'))
  ) {
    return null;
  }
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  try {
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    return { canvas, ctx };
  } catch {
    return null;
  }
}

/**
 * Removes uniform edge backgrounds from an uploaded image by sampling the 4 corners
 * and softly feathering matching border pixels against `replacementBgHex`.
 */
export async function removeImageBackground(
  imageDataUrl: string,
  replacementBgHex: string | 'transparent' = '#FFFFFF',
  tolerance = 52,
): Promise<string> {
  try {
    const img = await loadImageElement(imageDataUrl);
    const maxDim = 720;
    const scale = Math.min(1, maxDim / Math.max(img.width || maxDim, img.height || maxDim));
    const width = Math.max(1, Math.round(img.width * scale));
    const height = Math.max(1, Math.round(img.height * scale));
    const surface = getSafe2dContext(width, height);
    if (!surface) return imageDataUrl;

    const { canvas, ctx } = surface;
    ctx.drawImage(img, 0, 0, width, height);
    const frame = ctx.getImageData(0, 0, width, height);
    const data = frame.data;

    const sampleAt = (x: number, y: number): [number, number, number] => {
      const i = (y * width + x) * 4;
      return [data[i] ?? 255, data[i + 1] ?? 255, data[i + 2] ?? 255];
    };

    const corners = [
      sampleAt(0, 0),
      sampleAt(width - 1, 0),
      sampleAt(0, height - 1),
      sampleAt(width - 1, height - 1),
    ];

    const avg = corners.reduce<[number, number, number]>(
      (acc, c) => [acc[0] + c[0] / 4, acc[1] + c[1] / 4, acc[2] + c[2] / 4],
      [0, 0, 0],
    );

    const softBand = tolerance * 0.45;
    for (let i = 0; i < data.length; i += 4) {
      const r = data[i] ?? 0;
      const g = data[i + 1] ?? 0;
      const b = data[i + 2] ?? 0;
      const dist = Math.hypot(r - avg[0], g - avg[1], b - avg[2]);
      if (dist <= tolerance) {
        data[i + 3] = 0;
      } else if (dist <= tolerance + softBand) {
        const factor = (dist - tolerance) / softBand;
        data[i + 3] = Math.round((data[i + 3] ?? 255) * factor);
      }
    }

    ctx.putImageData(frame, 0, 0);

    if (replacementBgHex !== 'transparent') {
      const composited = getSafe2dContext(width, height);
      if (composited) {
        composited.ctx.fillStyle = replacementBgHex;
        composited.ctx.fillRect(0, 0, width, height);
        composited.ctx.drawImage(canvas, 0, 0);
        return composited.canvas.toDataURL('image/png');
      }
    }

    return canvas.toDataURL('image/png');
  } catch {
    return imageDataUrl;
  }
}

export interface MockupSnapshotParams {
  serviceName: string;
  sizeLabel: string;
  summaryLine: string;
  artworkSrc?: string;
  customText?: string;
  bgColor?: string;
  isIdSheet?: boolean;
}

/**
 * Generates a lightweight composite preview JPEG for the inquiry chat attachment.
 */
export async function renderMockupSnapshot({
  serviceName,
  sizeLabel,
  summaryLine,
  artworkSrc,
  customText,
  bgColor = '#FFFFFF',
  isIdSheet = false,
}: MockupSnapshotParams): Promise<string | undefined> {
  const surface = getSafe2dContext(640, 480);
  if (!surface) return undefined;

  const { canvas, ctx } = surface;
  ctx.fillStyle = '#FAFAFA';
  ctx.fillRect(0, 0, 640, 480);

  // Inner product card surface
  ctx.fillStyle = bgColor === 'transparent' ? '#FFFFFF' : bgColor;
  ctx.strokeStyle = '#E5E5E5';
  ctx.lineWidth = 2;
  ctx.fillRect(140, 46, 360, 310);
  ctx.strokeRect(140, 46, 360, 310);

  if (artworkSrc) {
    try {
      const img = await loadImageElement(artworkSrc);
      if (isIdSheet) {
        const cols = 3;
        const rows = 2;
        const cellW = 86;
        const cellH = 86;
        const startX = 182;
        const startY = 104;
        for (let r = 0; r < rows; r += 1) {
          for (let c = 0; c < cols; c += 1) {
            const x = startX + c * (cellW + 10);
            const y = startY + r * (cellH + 14);
            ctx.drawImage(img, x, y, cellW, cellH);
            ctx.strokeStyle = '#D4D4D4';
            ctx.strokeRect(x, y, cellW, cellH);
          }
        }
      } else {
        const ratio = Math.min(320 / (img.width || 320), 270 / (img.height || 270));
        const drawW = Math.max(1, img.width * ratio);
        const drawH = Math.max(1, img.height * ratio);
        ctx.drawImage(img, 320 - drawW / 2, 201 - drawH / 2, drawW, drawH);
      }
    } catch {
      // Fallback to text card if artwork load fails in headless mode
    }
  }

  if (customText?.trim()) {
    ctx.fillStyle = '#151515';
    ctx.font = '700 24px Inter, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(customText.trim().slice(0, 32), 320, artworkSrc ? 336 : 206);
  }

  // Minimal daylight footer bar
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 392, 640, 88);
  ctx.fillStyle = '#38BDF8';
  ctx.fillRect(0, 392, 640, 3);

  ctx.fillStyle = '#151515';
  ctx.font = '700 18px Inter, sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText(`${serviceName} · ${sizeLabel}`, 28, 428);

  ctx.fillStyle = '#525252';
  ctx.font = '500 13px Inter, sans-serif';
  ctx.fillText(summaryLine.slice(0, 74), 28, 454);

  try {
    return canvas.toDataURL('image/jpeg', 0.85);
  } catch {
    return undefined;
  }
}
