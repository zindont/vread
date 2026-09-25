import { BrowserQRCodeReader } from '@zxing/browser';
import type { QrResult } from '../core/types';
import { parseVietnamIdQr } from './vietnam-id';
const reader = new BrowserQRCodeReader();
function decode(canvas: HTMLCanvasElement): QrResult | null {
  try {
    const raw = reader.decodeFromCanvas(canvas).getText();
    return { detected: true, raw, parsed: parseVietnamIdQr(raw) };
  } catch {
    return null;
  }
}
export function decodeQr(canvas: HTMLCanvasElement): QrResult {
  const whole = decode(canvas);
  if (whole) return whole;
  // Phone photos often devote most pixels to the background. Retry the QR area
  // at a larger scale, including a high-contrast variant for uneven lighting.
  for (const [x, y, width, height] of [
    [0.55, 0.05, 0.4, 0.45],
    [0.64, 0.12, 0.27, 0.3],
  ] as const) {
    const crop = document.createElement('canvas');
    crop.width = Math.round(canvas.width * width * 2);
    crop.height = Math.round(canvas.height * height * 2);
    const context = crop.getContext('2d', { willReadFrequently: true })!;
    context.drawImage(
      canvas,
      canvas.width * x, canvas.height * y,
      canvas.width * width, canvas.height * height,
      0, 0, crop.width, crop.height,
    );
    const enlarged = decode(crop);
    if (enlarged) return enlarged;
    const pixels = context.getImageData(0, 0, crop.width, crop.height);
    for (let i = 0; i < pixels.data.length; i += 4) {
      const value = pixels.data[i]! * 0.299 + pixels.data[i + 1]! * 0.587 + pixels.data[i + 2]! * 0.114;
      const contrasted = Math.max(0, Math.min(255, (value - 128) * 1.7 + 128));
      pixels.data[i] = pixels.data[i + 1] = pixels.data[i + 2] = contrasted;
    }
    context.putImageData(pixels, 0, 0);
    const enhanced = decode(crop);
    if (enhanced) return enhanced;
  }
  return { detected: false };
}
