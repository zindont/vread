import type { ImageInput, ReadOptions, ReaderOptions, VReadResult } from './types';
import { EMPTY_FIELDS } from './types';
import { VReadError } from './errors';
import { normalizeImage } from '../image/normalize';
import { rotateCanvas } from '../image/rotate';
import { createPaddleEngine } from '../ocr/paddle';
import { refineVietnameseFields } from '../ocr/vietnamese';
import type { OcrEngine, OCRLine } from '../ocr/types';
import { mergeOcrRows } from '../ocr/rows';
import { decodeQr } from '../qr/zxing';
import { mergeQrFields } from '../qr/merge';
import { DocumentRegistry, type DocumentAdapter } from '../documents/registry';
import { identityCardAdapter } from '../documents/identity-card';
import { anchorStrength } from '../documents/identity-card/classify';
export class Reader {
  private registry = new DocumentRegistry();
  constructor(
    private ocr: OcrEngine,
    private options: ReaderOptions = {},
  ) {
    this.registry.register(identityCardAdapter);
  }
  register(adapter: DocumentAdapter): void {
    this.registry.register(adapter);
  }
  async read(input: ImageInput, options: ReadOptions = {}): Promise<VReadResult> {
    if (
      options.documentType &&
      options.documentType !== 'auto' &&
      options.documentType !== 'identity-card'
    )
      throw new VReadError('UNSUPPORTED_DOCUMENT', 'Only identity-card is supported');
    const start = performance.now();
    const prepStart = performance.now();
    options.onProgress?.('preprocess');
    const canvas = await normalizeImage(input, this.options.maxImageSide ?? 1800);
    const imagePreprocessMs = performance.now() - prepStart;
    const qrStart = performance.now();
    options.onProgress?.('qr');
    let qr = decodeQr(canvas);
    let qrMs = performance.now() - qrStart;
    const ocrStart = performance.now();
    options.onProgress?.('ocr');
    let rawLines: OCRLine[] = await this.ocr.recognize(canvas);
    let lines = mergeOcrRows(rawLines);
    let activeCanvas = canvas;
    if (anchorStrength(lines) < 0.55) {
      let best = anchorStrength(lines);
      for (const angle of [90, 180, 270] as const) {
        options.onProgress?.('rotation');
        const rotated = rotateCanvas(canvas, angle);
        const candidateRaw = await this.ocr.recognize(rotated);
        const candidate = mergeOcrRows(candidateRaw);
        const strength = anchorStrength(candidate);
        if (strength > best) {
          best = strength;
          lines = candidate;
          rawLines = candidateRaw;
          activeCanvas = rotated;
        }
        if (best >= 0.75) break;
      }
    }
    if (activeCanvas !== canvas && !qr.parsed) {
      const rotatedQrStart = performance.now();
      const rotatedQr = decodeQr(activeCanvas);
      if (rotatedQr.parsed || (!qr.detected && rotatedQr.detected)) qr = rotatedQr;
      qrMs += performance.now() - rotatedQrStart;
    }
    const ocrMs = performance.now() - ocrStart;
    const parseStart = performance.now();
    options.onProgress?.('parse');
    const { adapter, detection } = this.registry.detect(lines, qr);
    if (detection.type === 'unknown' && qr.parsed) {
      detection.type = 'vn.identity_card';
      detection.confidence = 0.6;
    }
    const parsed = adapter?.extract(lines, detection) ?? {
      fields: { ...EMPTY_FIELDS },
      confidence: {},
      evidence: {},
    };
    if (detection.type !== 'unknown') {
      options.onProgress?.('vietnamese');
      try {
        await refineVietnameseFields(activeCanvas, lines, parsed, rawLines);
      } catch {
        /* Preserve PaddleOCR results if the optional Vietnamese pass fails. */
      }
    }
    mergeQrFields(parsed, qr);
    const parseMs = performance.now() - parseStart;
    options.onProgress?.('done');
    return {
      document: detection,
      fields: parsed.fields,
      confidence: parsed.confidence,
      evidence: parsed.evidence,
      qr,
      ocrLines: rawLines,
      meta: {
        backend: this.options.backend ?? 'wasm',
        imagePreprocessMs,
        qrMs,
        ocrMs,
        parseMs,
        totalMs: performance.now() - start,
      },
    };
  }
}
export async function createReader(options: ReaderOptions = {}): Promise<Reader> {
  return new Reader(await createPaddleEngine(options.backend ?? 'wasm'), options);
}
let defaultReader: Promise<Reader> | undefined;
export async function read(input: ImageInput): Promise<VReadResult> {
  defaultReader ??= createReader();
  try {
    return await (await defaultReader).read(input);
  } catch (error) {
    if (
      error instanceof Error &&
      error.name === 'VReadError' &&
      'code' in error &&
      error.code === 'OCR_INITIALIZATION_FAILED'
    )
      defaultReader = undefined;
    throw error;
  }
}
