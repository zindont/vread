export interface FrameQuality {
  gray: Uint8Array;
  contrast: number;
  sharpness: number;
  motion: number | null;
  visualReady: boolean;
  ready: boolean;
  reason: string;
}

export interface CaptureProgress {
  steadyFrames: number;
  usableFrames: number;
}

export function advanceCaptureProgress(
  progress: CaptureProgress,
  quality: Pick<FrameQuality, 'ready' | 'visualReady'>,
): CaptureProgress {
  return {
    steadyFrames: quality.ready ? progress.steadyFrames + 1 : Math.max(0, progress.steadyFrames - 1),
    usableFrames: quality.visualReady
      ? Math.min(8, progress.usableFrames + 1)
      : Math.max(0, progress.usableFrames - 1),
  };
}

export function evaluateFrame(
  pixels: ImageData,
  previous?: Uint8Array,
): FrameQuality {
  const { width, height, data } = pixels;
  const gray = new Uint8Array(width * height);
  let sum = 0;
  let sumSquares = 0;
  let previousSum = 0;
  for (let i = 0; i < gray.length; i++) {
    const offset = i * 4;
    const value = Math.round(
      data[offset]! * 0.299 + data[offset + 1]! * 0.587 + data[offset + 2]! * 0.114,
    );
    gray[i] = value;
    sum += value;
    sumSquares += value * value;
    if (previous?.length === gray.length) previousSum += previous[i]!;
  }
  const mean = sum / gray.length;
  const contrast = Math.sqrt(Math.max(0, sumSquares / gray.length - mean * mean));
  let motionTotal = 0;
  if (previous?.length === gray.length) {
    const exposureChange = mean - previousSum / gray.length;
    for (let i = 0; i < gray.length; i++) {
      motionTotal += Math.abs(gray[i]! - previous[i]! - exposureChange);
    }
  }
  let edges = 0;
  let count = 0;
  for (let y = 1; y < height - 1; y += 2) {
    for (let x = 1; x < width - 1; x += 2) {
      const i = y * width + x;
      edges += Math.abs(gray[i + 1]! - gray[i - 1]!);
      edges += Math.abs(gray[i + width]! - gray[i - width]!);
      count++;
    }
  }
  const sharpness = count ? edges / count : 0;
  const motion = previous?.length === gray.length ? motionTotal / gray.length : null;
  const visualReady = mean >= 45 && mean <= 225 && contrast >= 18 && sharpness >= 14;
  const ready = visualReady && motion !== null && motion <= 18;
  const reason =
    mean < 45 || mean > 225
      ? 'Improve lighting'
      : contrast < 18 || sharpness < 14
        ? 'Move closer and focus on the card'
        : ready
          ? 'Card looks clear'
          : 'Selecting the sharpest frame';
  return { gray, contrast, sharpness, motion, visualReady, ready, reason };
}
