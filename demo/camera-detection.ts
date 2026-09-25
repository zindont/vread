export interface FrameQuality {
  gray: Uint8Array;
  contrast: number;
  sharpness: number;
  motion: number | null;
  cardAligned: boolean;
  cardBounds: CardBounds | null;
  visualReady: boolean;
  ready: boolean;
  reason: string;
}

export interface CaptureProgress {
  steadyFrames: number;
}

export function advanceCaptureProgress(
  progress: CaptureProgress,
  quality: Pick<FrameQuality, 'ready'>,
): CaptureProgress {
  return { steadyFrames: quality.ready ? progress.steadyFrames + 1 : 0 };
}

type Side = 'top' | 'bottom' | 'left' | 'right';
interface EdgeLine { position: number; slope: number; score: number; coverage: number }
export interface CardBounds { top: number; bottom: number; left: number; right: number }

function detectEdgeLine(pixels: ImageData, side: Side): EdgeLine | null {
  const { width, height, data } = pixels;
  const horizontal = side === 'top' || side === 'bottom';
  const length = horizontal ? width : height;
  const extent = horizontal ? height : width;
  const min = side === 'top' || side === 'left' ? 3 : Math.floor(extent * 0.76);
  const max = side === 'top' || side === 'left' ? Math.floor(extent * 0.24) : extent - 4;
  const offset = 3;
  const samples = 9;
  const intensity = (x: number, y: number, channel: number) => data[(y * width + x) * 4 + channel]!;
  let best: EdgeLine | null = null;
  for (let position = min; position <= max; position += 2) {
    for (const slope of [-0.08, -0.04, 0, 0.04, 0.08]) {
      let total = 0;
      let covered = 0;
      for (let index = 0; index < samples; index++) {
        const along = Math.round(length * (0.12 + index * 0.095));
        const across = Math.round(position + slope * (along - length / 2));
        if (across - offset < 0 || across + offset >= extent) continue;
        const x0 = horizontal ? along : across - offset;
        const y0 = horizontal ? across - offset : along;
        const x1 = horizontal ? along : across + offset;
        const y1 = horizontal ? across + offset : along;
        const difference = ([0, 1, 2] as const).reduce<number>(
          (sum, channel) => sum + Math.abs(intensity(x0, y0, channel) - intensity(x1, y1, channel)), 0,
        ) / 3;
        total += Math.min(80, difference);
        if (difference >= 15) covered++;
      }
      const candidate = { position, slope, score: total / samples, coverage: covered / samples };
      if (candidate.coverage >= 0.67 && (!best || candidate.score > best.score)) best = candidate;
    }
  }
  return best && best.score >= 19 ? best : null;
}

function detectCardBounds(pixels: ImageData): CardBounds | null {
  const { width, height } = pixels;
  if (width < 80 || height < 50) return null;
  const top = detectEdgeLine(pixels, 'top');
  const bottom = detectEdgeLine(pixels, 'bottom');
  const left = detectEdgeLine(pixels, 'left');
  const right = detectEdgeLine(pixels, 'right');
  if (!top || !bottom || !left || !right) return null;
  const cardWidth = right.position - left.position;
  const cardHeight = bottom.position - top.position;
  const aligned = cardWidth >= width * 0.75 && cardHeight >= height * 0.72 &&
    cardWidth <= width * 0.98 && cardHeight <= height * 0.98 &&
    Math.abs(top.slope - bottom.slope) <= 0.08 &&
    Math.abs(left.slope - right.slope) <= 0.08;
  return aligned ? { top: top.position, bottom: bottom.position,
    left: left.position, right: right.position } : null;
}

export function detectAlignedCard(pixels: ImageData): boolean {
  return detectCardBounds(pixels) !== null;
}

export function evaluateFrame(
  pixels: ImageData,
  previous?: Uint8Array,
  previousBounds?: CardBounds | null,
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
  const cardBounds = detectCardBounds(pixels);
  const cardAligned = cardBounds !== null;
  const cardStill = !!cardBounds && !!previousBounds &&
    Math.max(...(['top', 'bottom', 'left', 'right'] as const)
      .map((side) => Math.abs(cardBounds[side] - previousBounds[side]))) <= 5;
  const visualReady = cardAligned && mean >= 45 && mean <= 225 && contrast >= 18 && sharpness >= 14;
  const ready = visualReady && cardStill && motion !== null && motion <= 12;
  const reason = !cardAligned
    ? 'Place the whole card inside the frame and align its edges'
    : mean < 45 || mean > 225
      ? 'Improve lighting'
      : contrast < 18 || sharpness < 14
        ? 'Move closer and focus on the card'
        : 'Hold the card steady';
  return { gray, contrast, sharpness, motion, cardAligned, cardBounds, visualReady, ready, reason };
}
