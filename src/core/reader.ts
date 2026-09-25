import type { ImageInput, ReadOptions, ReaderOptions, VReadResult } from './types';
import { EMPTY_FIELDS } from './types';
import { VReadError } from './errors';
import { normalizeImage } from '../image/normalize';
import { rotateCanvas } from '../image/rotate';
import { createPaddleEngine } from '../ocr/paddle';
import { refineVietnameseFields, refineDriverLicenseVietnamese } from '../ocr/vietnamese';
import type { OcrEngine, OCRLine } from '../ocr/types';
import { mergeOcrRows } from '../ocr/rows';
import { decodeQr } from '../qr/zxing';
import { mergeQrFields } from '../qr/merge';
import { DocumentRegistry, type DocumentAdapter } from '../documents/registry';
import { identityCardAdapter } from '../documents/identity-card';
import { driverLicenseAdapter } from '../documents/driver-license';
import { reconcileSexFromIdentityNumber } from '../documents/identity-card/sex-from-id';
import { normalizeExtractedAddresses } from '../address/normalize';
export class Reader {
  private registry = new DocumentRegistry();
  constructor(
    private ocr: OcrEngine,
    private options: ReaderOptions = {},
  ) {
    this.registry.register(identityCardAdapter);
    this.registry.register(driverLicenseAdapter);
  }
  register(adapter: DocumentAdapter): void {
    this.registry.register(adapter);
  }
  async read(input: ImageInput, options: ReadOptions = {}): Promise<VReadResult> {
    const choice = options.documentType ?? this.options.documentType ?? 'auto';
    if (!['auto', 'identity-card', 'driver-license'].includes(choice))
      throw new VReadError('UNSUPPORTED_DOCUMENT', 'Unsupported document type');
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
    const strength = (candidate: OCRLine[]) => this.registry.detect(candidate, qr).detection.confidence;
    if (strength(lines) < 0.55) {
      let best = strength(lines);
      for (const angle of [90, 180, 270] as const) {
        options.onProgress?.('rotation');
        const rotated = rotateCanvas(canvas, angle);
        const candidateRaw = await this.ocr.recognize(rotated);
        const candidate = mergeOcrRows(candidateRaw);
        const candidateStrength = strength(candidate);
        if (candidateStrength > best) {
          best = candidateStrength;
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
    let { adapter, detection } = this.registry.detect(lines, qr);
    if (choice !== 'auto') {
      const selectedType = choice === 'identity-card' ? 'vn.identity_card' : 'vn.driver_license';
      adapter = this.registry.get(selectedType);
      detection = adapter?.detect(lines, qr) ?? detection;
      if (detection.type === 'unknown')
        detection = { type: selectedType, version: 'unknown', side: 'unknown', confidence: 0.3 };
    }
    if (choice === 'auto' && detection.type === 'unknown' && qr.parsed) {
      detection.type = 'vn.identity_card';
      detection.confidence = 0.6;
      adapter = this.registry.get('vn.identity_card');
    }
    const parsed = adapter?.extract(lines, detection, rawLines) ?? {
      fields: { ...EMPTY_FIELDS },
      confidence: {},
      evidence: {},
    };
    if (detection.type === 'vn.identity_card') {
      options.onProgress?.('vietnamese');
      try {
        await refineVietnameseFields(activeCanvas, lines, parsed, rawLines);
      } catch {
        /* Preserve PaddleOCR results if the optional Vietnamese pass fails. */
      }
    }
    if (detection.type === 'vn.driver_license') {
      options.onProgress?.('vietnamese');
      try {
        await refineDriverLicenseVietnamese(activeCanvas, parsed, rawLines);
      } catch {
        /* Preserve other license fields when optional Vietnamese OCR fails. */
      }
    }
    if (detection.type === 'vn.identity_card') reconcileSexFromIdentityNumber(parsed);
    if (detection.type === 'vn.identity_card') mergeQrFields(parsed, qr);
    const addresses = normalizeExtractedAddresses(parsed);
    const parseMs = performance.now() - parseStart;
    options.onProgress?.('done');
    return {
      document: detection,
      fields: parsed.fields,
      addresses,
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
