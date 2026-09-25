# VRead

Local-first Vietnamese document reader for JavaScript.

**Playground:** https://zindont.github.io/vread/ · **Source:** https://github.com/zindont/vread

Turn Vietnamese documents into structured data directly in the browser.

- Local inference
- No API key or backend
- No image upload or telemetry
- WASM / CPU by default
- WebGPU optional

## Status

VRead is an early CCCD and driver license pilot. Real-document accuracy has not been measured. Model files and ONNX runtime assets are downloaded on first use; document images remain in the browser.

## Use the reader

The library is not published to npm yet. In this repository, import it from `src`:

```ts
import { read, createReader } from './src';
const result = await read(file);
const reader = await createReader({ backend: 'wasm', documentType: 'auto' });
const another = await reader.read(file, { documentType: 'identity-card' });
const license = await reader.read(file, { documentType: 'driver-license' });
```

Inputs: `File`, `Blob`, `ImageData`, `HTMLImageElement`, `HTMLCanvasElement`, `ImageBitmap`. Run from a browser served over HTTP(S). `createReader` loads PP-OCRv5 detection and Latin recognition models, which may take time on first use. OCR runs in a Web Worker. A targeted Tesseract Vietnamese pass rereads detected name and address lines; its language model is downloaded on first use. The output includes normalized fields, confidence, evidence, QR data, OCR lines, and phase timings. In the API, `sex` uses `M`/`F` and Vietnamese nationality uses `VN`; the demo displays their full Vietnamese labels too.

Supported pilot: the front side of Vietnamese CCCD 2021, Căn cước 2024, and giấy phép lái xe. `documentType: 'auto'` detects CCCD or GPLX from OCR layout; choose `identity-card` or `driver-license` when the type is already known. GPLX results include `licenseNumber`, `licenseClass`, and `expiryStatus` (`indefinite` for a license without an expiry date). Fields outside the chosen document family remain `null`. Back-only and unknown images return `document.type: 'unknown'` with empty fields. Additional document families are planned: passport, vehicle registration, health insurance, and other Vietnamese documents.

`vietnam-address-kit` validates and corrects recognized administrative names after OCR. VRead accepts both two-level addresses (ward/commune and province/city) and three-level addresses (ward/commune, district, province/city), including a preceding street or hamlet. Version 1.2.0 also helps recover small spelling errors in older administrative names and read some three-level addresses without commas. VRead uses nearby name candidates only when the other components identify a unique match; uncertain text remains unchanged. Verified components and codes are returned in `result.addresses`. Historical addresses remain as printed on the document; the current administrative area is separate metadata and does not replace them. Street/hamlet text is kept from OCR because the administrative dataset does not validate it.

## Development

```bash
git clone git@github.com:zindont/vread.git
cd vread
pnpm install
pnpm demo
pnpm typecheck
pnpm exec vitest run test/driver-license.test.ts
pnpm build
```

The playground is deployed from `demo/dist` to GitHub Pages by `.github/workflows/pages.yml` on pushes to `main`. The deployment build sets the Vite base path to `/vread/`; local development stays at `/`. GitHub Pages serves the code over HTTPS, so camera access is available after the user grants browser permission. OCR models are fetched on first use. Images and corrections stay in the user's browser.

Open the demo URL shown by Vite, choose auto detection or a known document type, then select, drop, or capture a front-side image with the camera. Align the document inside the camera guide. The camera uses only lightweight brightness, detail, and motion measurements to choose a clear frame, then stops the video stream. OCR runs once on the captured still image. Manual capture remains available. Camera access requires HTTPS or localhost and is stopped after capture or when the camera panel closes. For a vertically stacked front/back CCCD sample, only the front OCR region is used; a separate front crop gives OCR more pixels and generally works better. The demo has no backend, analytics, upload, or remote logging. Keep private test images under `fixtures/private/`; this directory is ignored by Git. Do not add real identity documents to tests, snapshots, or commits.

To track accuracy without sending images anywhere, expand **Correct results and track accuracy** in the demo. Edit incorrect fields and choose **Save corrected sample**. This stores the image and corrected values in this browser's IndexedDB only after you click Save. **Recheck saved samples** runs the current reader against every saved image and reports matching fields and remaining errors. **Delete saved samples** removes the stored data. Browser storage may be cleared by the browser, and these samples are not shared with other browsers or machines. Corrections form a local regression set; they do not automatically retrain the OCR model. Fine-tuning would require a larger, consented and labeled dataset plus a separate offline training process.

## Current limits

OCR quality depends on lighting, focus, and card size. The targeted Vietnamese pass improves clear name and address lines, but tiny, blurry, or unverified lines may still return `null` with raw OCR preserved in `evidence`. A recognized QR can supply supported fields. Layout rules are conservative and may miss fields on unusual scans. QR parsing supports the common seven-part CCCD layout only; uncertain payloads are returned raw. No accuracy or performance benchmark has been established on a real private corpus.

### Vite integration

PaddleOCR.js 0.4.2 needs its Worker module served from the package path. In Vite development, exclude PaddleOCR.js from dependency prebundling while prebundling its CommonJS dependencies (see `demo/vite.config.ts`). The demo already includes this configuration. Other bundlers may need equivalent Worker asset handling.

The `meta` timings measure image processing after the OCR engine is initialized; first-run model and WASM downloads are additional. The bundled OCR and WASM assets are large, so first use can be noticeably slower.
