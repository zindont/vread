import { describe, expect, it } from 'vitest';
import { advanceCaptureProgress, evaluateFrame } from '../demo/camera-detection';

function frame(width: number, height: number, pixel: (x: number, y: number) => number): ImageData {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const offset = (y * width + x) * 4;
      data.fill(pixel(x, y), offset, offset + 3);
      data[offset + 3] = 255;
    }
  }
  return { width, height, data } as ImageData;
}

describe('camera capture gate', () => {
  it('rejects a blank frame and a moving frame, then accepts a stable detailed frame', () => {
    const blank = frame(80, 50, () => 120);
    expect(evaluateFrame(blank, evaluateFrame(blank).gray).ready).toBe(false);

    const detailed = frame(80, 50, (x, y) => ((Math.floor(x / 4) + Math.floor(y / 4)) % 2 ? 210 : 55));
    const first = evaluateFrame(detailed);
    expect(first.ready).toBe(false);
    const still = evaluateFrame(detailed, first.gray);
    expect(still.ready).toBe(true);

    const shifted = frame(80, 50, (x, y) => ((Math.floor((x + 4) / 4) + Math.floor(y / 4)) % 2 ? 210 : 55));
    expect(evaluateFrame(shifted, first.gray).ready).toBe(false);
  });
  it('reaches capture despite ordinary frame motion and exposure changes', () => {
    const detailed = frame(80, 50, (x, y) => ((Math.floor(x / 4) + Math.floor(y / 4)) % 2 ? 190 : 65));
    const brighter = frame(80, 50, (x, y) => ((Math.floor(x / 4) + Math.floor(y / 4)) % 2 ? 215 : 90));
    const first = evaluateFrame(detailed);
    expect(evaluateFrame(brighter, first.gray).ready).toBe(true);

    let progress = { steadyFrames: 0, usableFrames: 0 };
    for (let i = 0; i < 8; i++) {
      progress = advanceCaptureProgress(progress, { ready: false, visualReady: true });
    }
    expect(progress.usableFrames).toBe(8);
  });
});
