import { PaddleOCR } from '@paddleocr/paddleocr-js';
import type { OcrEngine, OCRLine } from './types';
import { VReadError } from '../core/errors';
const LATIN_MODEL =
  'https://paddle-model-ecology.bj.bcebos.com/paddlex/official_inference_model/paddle3.0.0/latin_PP-OCRv5_mobile_rec_onnx_infer.tar';
export async function createPaddleEngine(backend: 'wasm' | 'webgpu'): Promise<OcrEngine> {
  let ocr: Awaited<ReturnType<typeof PaddleOCR.create>>;
  try {
    ocr = await PaddleOCR.create({
      worker: true,
      textDetectionModelName: 'PP-OCRv5_mobile_det',
      textRecognitionModelName: 'latin_PP-OCRv5_mobile_rec',
      textRecognitionModelAsset: { url: LATIN_MODEL },
      ortOptions: { backend, numThreads: 1, simd: true },
    });
  } catch (cause) {
    throw new VReadError(
      'OCR_INITIALIZATION_FAILED',
      'PaddleOCR could not initialize. Check model download and browser WASM support.',
      cause,
    );
  }
  return {
    async recognize(image) {
      try {
        const [result] = await ocr.predict(image);
        return (result?.items ?? []).map((item) => {
          const polygon = item.poly.map((point) => ({ x: point[0], y: point[1] }));
          const xs = polygon.map((p) => p.x),
            ys = polygon.map((p) => p.y);
          return {
            text: item.text,
            confidence: item.score,
            polygon,
            boundingBox: {
              x: Math.min(...xs),
              y: Math.min(...ys),
              width: Math.max(...xs) - Math.min(...xs),
              height: Math.max(...ys) - Math.min(...ys),
            },
          } satisfies OCRLine;
        });
      } catch (cause) {
        throw new VReadError('OCR_FAILED', 'PaddleOCR failed to process image', cause);
      }
    },
  };
}
