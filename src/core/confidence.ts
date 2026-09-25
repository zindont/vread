export const clamp = (value: number) => Math.max(0, Math.min(1, value));
export function fieldScore(ocr: number, anchor: number, geometry: number, valid: boolean): number {
  return clamp(ocr * 0.45 + anchor * 0.25 + geometry * 0.15 + (valid ? 0.15 : 0));
}
