import { describe, expect, it } from 'vitest';
import { advanceCaptureProgress, detectAlignedCard, evaluateFrame } from '../demo/camera-detection';

function frame(
  card?: { left: number; top: number; right: number; bottom: number },
  shift = 0,
): ImageData {
  const width = 240;
  const height = 152;
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const inside = card && x >= card.left + shift && x < card.right + shift &&
        y >= card.top && y < card.bottom;
      const detail = Math.floor(x / 4) % 2 && Math.floor(y / 4) % 2;
      const value = inside ? (detail ? 205 : 120) : (detail ? 95 : 55);
      const offset = (y * width + x) * 4;
      data.fill(value, offset, offset + 3);
      data[offset + 3] = 255;
    }
  }
  return { width, height, data } as ImageData;
}

describe('camera capture gate', () => {
  const aligned = { left: 16, top: 12, right: 224, bottom: 140 };

  it('requires four card edges inside the guide', () => {
    expect(detectAlignedCard(frame())).toBe(false);
    expect(detectAlignedCard(frame({ left: 45, top: 34, right: 195, bottom: 118 }))).toBe(false);
    expect(detectAlignedCard(frame({ left: -20, top: 12, right: 224, bottom: 140 }))).toBe(false);
    expect(detectAlignedCard(frame(aligned))).toBe(true);
  });

  it('captures only after consecutive aligned, still frames', () => {
    const first = evaluateFrame(frame(aligned));
    expect(first.ready).toBe(false);
    const still = evaluateFrame(frame(aligned), first.gray, first.cardBounds);
    expect(still.ready).toBe(true);
    const moved = evaluateFrame(frame(aligned, 8), first.gray, first.cardBounds);
    expect(moved.ready).toBe(false);
    const background = evaluateFrame(frame(), first.gray, first.cardBounds);
    expect(background.ready).toBe(false);

    let progress = { steadyFrames: 0 };
    for (let i = 0; i < 4; i++) progress = advanceCaptureProgress(progress, still);
    expect(progress.steadyFrames).toBe(4);
    progress = advanceCaptureProgress(progress, moved);
    expect(progress.steadyFrames).toBe(0);
    for (let i = 0; i < 5; i++) progress = advanceCaptureProgress(progress, still);
    expect(progress.steadyFrames).toBe(5);
  });
});
