import { createReader, type DocumentChoice, type DocumentFields, type DocumentType, type ReadProgressStage } from '../src';
import { advanceCaptureProgress, evaluateFrame, type CardBounds } from './camera-detection';
import { normalizeSex, normalizeNationality } from '../src/documents/identity-card/normalize';
import {
  fieldsFor,
  clearSamples,
  compareFields,
  listSamples,
  normalizeCorrectionDate,
  saveSample,
} from './feedback';
import './style.css';
const file = document.querySelector<HTMLInputElement>('#file')!;
const selectImageButton = document.querySelector<HTMLButtonElement>('#select-image-button')!;
const drop = document.querySelector<HTMLElement>('#drop')!;
const status = document.querySelector<HTMLElement>('#status')!;
const progressContainer = document.querySelector<HTMLElement>('#progress-container')!;
const progress = document.querySelector<HTMLProgressElement>('#progress')!;
const elapsed = document.querySelector<HTMLElement>('#elapsed')!;
const preview = document.querySelector<HTMLImageElement>('#preview')!;
const section = document.querySelector<HTMLElement>('#result')!;
const emptyResult = document.querySelector<HTMLElement>('#empty-result')!;
const documentBox = document.querySelector<HTMLElement>('#document')!;
const fields = document.querySelector<HTMLElement>('#fields')!;
const addressDetails = document.querySelector<HTMLDetailsElement>('#address-details')!;
const addressComponents = document.querySelector<HTMLElement>('#address-components')!;
const qr = document.querySelector<HTMLElement>('#qr')!;
const json = document.querySelector<HTMLElement>('#json')!;
const ocr = document.querySelector<HTMLElement>('#ocr')!;
const correctionFields = document.querySelector<HTMLElement>('#correction-fields')!;
const feedbackStatus = document.querySelector<HTMLElement>('#feedback-status')!;
const saveCorrection = document.querySelector<HTMLButtonElement>('#save-correction')!;
const runChecks = document.querySelector<HTMLButtonElement>('#run-checks')!;
const clearSaved = document.querySelector<HTMLButtonElement>('#clear-samples')!;
const cameraButton = document.querySelector<HTMLButtonElement>('#camera-button')!;
const cameraPanel = document.querySelector<HTMLElement>('#camera-panel')!;
const cameraStage = document.querySelector<HTMLElement>('#camera-stage')!;
const cameraPreview = document.querySelector<HTMLVideoElement>('#camera-preview')!;
const cardGuide = document.querySelector<HTMLElement>('#card-guide')!;
const cameraHint = document.querySelector<HTMLElement>('#camera-hint')!;
const captureButton = document.querySelector<HTMLButtonElement>('#capture-button')!;
const closeCameraButton = document.querySelector<HTMLButtonElement>('#close-camera-button')!;
let url: string | undefined;
let readerPromise: ReturnType<typeof createReader> | undefined;
let busy = false;
let cameraStream: MediaStream | undefined;
let cameraTimer: number | undefined;
let cameraGeneration = 0;
let previousFrame: Uint8Array | undefined;
let previousCardBounds: CardBounds | null = null;
let steadyFrames = 0;
let captureAnchor: CardBounds | null = null;
let bestCameraFrame: HTMLCanvasElement | undefined;
let bestCameraSharpness = 0;
let autoCapturing = false;
let currentImage: File | undefined;
let currentFields: DocumentFields | undefined;
let currentType: DocumentType = 'unknown';
let currentChoice: DocumentChoice = 'auto';
const stageText: Record<ReadProgressStage, string> = {
  preprocess: 'Preparing the image locally…',
  qr: 'Checking for a QR code…',
  ocr: 'Reading text with OCR…',
  rotation: 'Checking another image orientation…',
  parse: 'Extracting document fields…',
  vietnamese: 'Verifying Vietnamese text locally…',
  done: 'Finishing…',
};
function displayField(key: string, value: string): string {
  if (key === 'sex') return value === 'M' ? 'Nam (M)' : value === 'F' ? 'Nữ (F)' : value;
  if (key === 'nationality') return value === 'VN' ? 'Việt Nam (VN)' : value;
  return value;
}
function editField(key: string, value: string | null): string {
  if (!value) return '';
  if (key === 'sex') return value === 'M' ? 'Nam' : value === 'F' ? 'Nữ' : value;
  if (key === 'nationality') return value === 'VN' ? 'Việt Nam' : value;
  return value;
}
function renderCorrections(values: DocumentFields) {
  correctionFields.replaceChildren();
  for (const field of fieldsFor(currentType)) {
    const row = document.createElement('label');
    row.className = 'correction-row';
    const name = document.createElement('span');
    name.textContent = field;
    const input = document.createElement('input');
    input.name = field;
    input.value = editField(field, values[field]);
    input.autocomplete = 'off';
    row.append(name, input);
    correctionFields.append(row);
  }
}
function correctedFields(): DocumentFields {
  const result = { ...currentFields! };
  for (const field of fieldsFor(currentType)) {
    const raw = correctionFields.querySelector<HTMLInputElement>(`input[name="${field}"]`)!.value.trim();
    if (field === 'sex') {
      const value = raw ? normalizeSex(raw) : null;
      if (raw && !value) throw new Error('Sex must be Nam, Nữ, M, or F.');
      result.sex = value;
    } else if (field === 'nationality') {
      result.nationality = raw ? normalizeNationality(raw) ?? raw : null;
    } else if (field === 'dateOfBirth' || field === 'dateOfIssue' || field === 'dateOfExpiry') {
      const value = raw ? normalizeCorrectionDate(raw) : null;
      if (raw && !value) throw new Error(`${field} must be a valid date (YYYY-MM-DD).`);
      result[field] = value;
    } else if (field === 'expiryStatus') {
      if (raw && raw !== 'indefinite') throw new Error('expiryStatus must be indefinite or empty.');
      result.expiryStatus = raw ? 'indefinite' : null;
    } else {
      (result as unknown as Record<string, string | null>)[field] = raw || null;
    }
  }
  return result;
}
function setFeedbackBusy(value: boolean) {
  saveCorrection.disabled = value;
  runChecks.disabled = value;
  clearSaved.disabled = value;
}
function updateStage(stage: ReadProgressStage) {
  status.textContent = stageText[stage];
}
async function getReader() {
  if (!readerPromise) readerPromise = createReader({ backend: 'wasm' });
  try {
    return await readerPromise;
  } catch (error) {
    readerPromise = undefined;
    throw error;
  }
}
async function process(image: File, fromCamera = false) {
  if (busy) return;
  if (!image.type.startsWith('image/')) {
    status.textContent = 'Please choose an image file.';
    return;
  }
  busy = true;
  currentImage = undefined;
  currentFields = undefined;
  currentChoice = document.querySelector<HTMLInputElement>('input[name="document-type"]:checked')!.value as DocumentChoice;
  file.disabled = true;
  selectImageButton.disabled = true;
  cameraButton.disabled = true;
  if (url) URL.revokeObjectURL(url);
  url = URL.createObjectURL(image);
  preview.src = url;
  preview.hidden = false;
  section.hidden = true;
  emptyResult.hidden = false;
  progressContainer.hidden = false;
  progress.removeAttribute('value');
  status.textContent = fromCamera
    ? 'Photo captured. Reading OCR from the saved image…'
    : readerPromise
    ? 'Starting local document processing…'
    : 'Loading OCR models locally. The first run may take a while…';
  const started = performance.now();
  const timer = window.setInterval(() => {
    elapsed.textContent = `${Math.floor((performance.now() - started) / 1000)}s elapsed`;
  }, 200);
  elapsed.textContent = '0s elapsed';
  await new Promise((resolve) => setTimeout(resolve, 30));
  try {
    const result = await (await getReader()).read(image, { documentType: currentChoice, onProgress: updateStage });
    progress.value = 1;
    status.textContent = result.document.type === 'unknown'
      ? 'Document not identified. Select its type or try a clearer front-side image.'
      : `Done in ${((performance.now() - started) / 1000).toFixed(1)}s.`;
    documentBox.textContent = `${result.document.type} · ${result.document.version} · ${result.document.side} · confidence ${result.document.confidence.toFixed(2)}`;
    fields.replaceChildren();
    for (const key of fieldsFor(result.document.type)) {
      const value = result.fields[key];
      const row = document.createElement('div');
      row.className = 'row';
      const name = document.createElement('strong');
      name.textContent = key;
      const data = document.createElement('span');
      const confidence = result.confidence[key as keyof typeof result.confidence];
      data.textContent = value
        ? `${displayField(key, value)}  ${confidence?.toFixed(2) ?? ''}${confidence !== undefined && confidence < 0.8 ? ' · Review against image' : ''}`
        : result.evidence[key as keyof typeof result.evidence]
          ? '— · OCR unclear; review image or raw OCR'
          : '—';
      row.append(name, data);
      fields.append(row);
    }
    addressComponents.replaceChildren();
    for (const [field, address] of Object.entries(result.addresses)) {
      if (!address) continue;
      const card = document.createElement('div');
      card.className = 'address-card';
      const title = document.createElement('strong');
      title.textContent = field;
      const components = document.createElement('p');
      components.textContent = [
        address.streetAddress && `Street/hamlet: ${address.streetAddress}`,
        `Ward/commune: ${address.ward} (${address.wardCode})`,
        address.district && `District: ${address.district} (${address.districtCode})`,
        `Province: ${address.province} (${address.provinceCode})`,
      ].filter(Boolean).join(' · ');
      card.append(title, components);
      if (address.confidence < 0.8) {
        const review = document.createElement('p');
        review.textContent = `Approximate match (${address.confidence.toFixed(2)}) · Review against image`;
        card.append(review);
      }
      if (address.currentAdministrativeArea) {
        const current = document.createElement('p');
        current.textContent = `Current administrative area: ${address.currentAdministrativeArea.ward}, ${address.currentAdministrativeArea.province}`;
        card.append(current);
      }
      addressComponents.append(card);
    }
    addressDetails.hidden = !addressComponents.childElementCount;
    qr.textContent = JSON.stringify(result.qr, null, 2);
    json.textContent = JSON.stringify(result, null, 2);
    ocr.textContent = JSON.stringify(result.ocrLines, null, 2);
    currentImage = image;
    currentFields = result.fields;
    currentType = result.document.type;
    renderCorrections(result.fields);
    feedbackStatus.textContent = '';
    section.hidden = false;
    emptyResult.hidden = true;
  } catch (error) {
    progressContainer.hidden = true;
    status.textContent = error instanceof Error ? error.message : String(error);
  } finally {
    window.clearInterval(timer);
    elapsed.textContent = `${Math.floor((performance.now() - started) / 1000)}s elapsed`;
    file.disabled = false;
    selectImageButton.disabled = false;
    cameraButton.disabled = false;
    file.value = '';
    busy = false;
  }
}
saveCorrection.addEventListener('click', async () => {
  if (!currentImage || !currentFields || busy) return;
  setFeedbackBusy(true);
  try {
    const expected = correctedFields();
    const bytes = await currentImage.arrayBuffer();
    const digest = await crypto.subtle.digest('SHA-256', bytes);
    const id = [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
    await saveSample({
      id,
      fileName: currentImage.name,
      image: currentImage,
      expected,
      baseline: currentFields,
      documentType: currentChoice,
      detectedType: currentType,
      savedAt: new Date().toISOString(),
    });
    const count = (await listSamples()).length;
    const mismatches = compareFields(currentFields, expected, currentType);
    feedbackStatus.textContent = `Saved locally: ${count} sample(s). Current OCR differs in ${mismatches.length} field(s): ${mismatches.join(', ') || 'none'}.`;
  } catch (error) {
    feedbackStatus.textContent = error instanceof Error ? error.message : String(error);
  } finally {
    setFeedbackBusy(false);
  }
});
runChecks.addEventListener('click', async () => {
  if (busy) return;
  setFeedbackBusy(true);
  try {
    const samples = await listSamples();
    if (!samples.length) {
      feedbackStatus.textContent = 'No saved samples yet. Correct this result and save it first.';
      return;
    }
    const reader = await getReader();
    let matched = 0;
    let baselineMatched = 0;
    const failures: string[] = [];
    for (const [index, sample] of samples.entries()) {
      feedbackStatus.textContent = `Rechecking ${index + 1}/${samples.length}: ${sample.fileName}…`;
      await new Promise((resolve) => setTimeout(resolve, 30));
      const result = await reader.read(sample.image, {
        documentType: sample.documentType ?? 'identity-card',
      });
      const type = sample.detectedType ?? 'vn.identity_card';
      const fieldCount = fieldsFor(type).length;
      const wrong = compareFields(result.fields, sample.expected, type);
      matched += fieldCount - wrong.length;
      baselineMatched += fieldCount - compareFields(sample.baseline, sample.expected, type).length;
      if (wrong.length) failures.push(`${sample.fileName}: ${wrong.join(', ')}`);
    }
    const total = samples.reduce((sum, sample) => sum + fieldsFor(sample.detectedType ?? 'vn.identity_card').length, 0);
    feedbackStatus.textContent = `${matched}/${total} fields match (${baselineMatched}/${total} when saved). ${failures.length ? `Still wrong: ${failures.join('; ')}` : 'All saved samples match.'}`;
  } catch (error) {
    feedbackStatus.textContent = error instanceof Error ? error.message : String(error);
  } finally {
    setFeedbackBusy(false);
  }
});
clearSaved.addEventListener('click', async () => {
  if (busy) return;
  setFeedbackBusy(true);
  try {
    await clearSamples();
    feedbackStatus.textContent = 'All saved private samples were deleted from this browser.';
  } catch (error) {
    feedbackStatus.textContent = error instanceof Error ? error.message : String(error);
  } finally {
    setFeedbackBusy(false);
  }
});
function updateCardGuide() {
  const width = Math.min(cameraStage.clientWidth * 0.88, cameraStage.clientHeight * 0.78 * 1.586);
  cardGuide.style.width = `${width}px`;
  cardGuide.style.height = `${width / 1.586}px`;
}
function cameraSourceRect() {
  const sourceWidth = cameraPreview.videoWidth;
  const sourceHeight = cameraPreview.videoHeight;
  const stageWidth = cameraStage.clientWidth;
  const stageHeight = cameraStage.clientHeight;
  if (!sourceWidth || !sourceHeight || !stageWidth || !stageHeight) return null;
  const scale = Math.max(stageWidth / sourceWidth, stageHeight / sourceHeight);
  const renderedLeft = (stageWidth - sourceWidth * scale) / 2;
  const renderedTop = (stageHeight - sourceHeight * scale) / 2;
  const guideWidth = cardGuide.offsetWidth;
  const guideHeight = cardGuide.offsetHeight;
  const paddedWidth = guideWidth * 1.08;
  const paddedHeight = guideHeight * 1.08;
  const x = (stageWidth / 2 - paddedWidth / 2 - renderedLeft) / scale;
  const y = (stageHeight / 2 - paddedHeight / 2 - renderedTop) / scale;
  return {
    x: Math.max(0, x),
    y: Math.max(0, y),
    width: Math.min(sourceWidth - x, paddedWidth / scale),
    height: Math.min(sourceHeight - y, paddedHeight / scale),
  };
}
function captureCard(): HTMLCanvasElement | null {
  const crop = cameraSourceRect();
  if (!crop) return null;
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(crop.width);
  canvas.height = Math.round(crop.height);
  canvas.getContext('2d')!.drawImage(
    cameraPreview,
    crop.x, crop.y, crop.width, crop.height,
    0, 0, canvas.width, canvas.height,
  );
  return canvas;
}
function canvasToFile(canvas: HTMLCanvasElement): Promise<File> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => blob
        ? resolve(new File([blob], 'camera-capture.jpg', { type: 'image/jpeg' }))
        : reject(new Error('Could not capture a camera image. Please try again.')),
      'image/jpeg',
      0.94,
    );
  });
}
async function inspectCameraFrame() {
  if (!cameraStream || autoCapturing || busy) return;
  const crop = cameraSourceRect();
  if (!crop) return;
  const probe = document.createElement('canvas');
  probe.width = 240;
  probe.height = 152;
  const context = probe.getContext('2d', { willReadFrequently: true })!;
  context.drawImage(cameraPreview, crop.x, crop.y, crop.width, crop.height, 0, 0, 240, 152);
  const quality = evaluateFrame(context.getImageData(0, 0, 240, 152), previousFrame, previousCardBounds);
  previousFrame = quality.gray;
  previousCardBounds = quality.cardBounds;
  ({ steadyFrames, anchorBounds: captureAnchor } = advanceCaptureProgress(
    { steadyFrames, anchorBounds: captureAnchor }, quality,
  ));
  if (!quality.visualReady) {
    bestCameraFrame = undefined;
    bestCameraSharpness = 0;
  } else if (quality.ready && quality.sharpness > bestCameraSharpness) {
    bestCameraFrame = captureCard() ?? undefined;
    bestCameraSharpness = quality.sharpness;
  }
  cardGuide.classList.toggle('ready', quality.visualReady);
  cameraHint.textContent = quality.visualReady
    ? `Card aligned · hold steady ${steadyFrames}/6`
    : quality.reason;
  if (steadyFrames < 6) return;
  const image = bestCameraFrame ?? captureCard();
  if (!image) return;
  autoCapturing = true;
  stopCamera();
  status.textContent = 'Photo captured. Reading OCR from the saved frame…';
  try {
    await process(await canvasToFile(image), true);
  } catch (error) {
    status.textContent = error instanceof Error ? error.message : String(error);
  } finally {
    autoCapturing = false;
  }
}
function stopCamera() {
  cameraGeneration++;
  if (cameraTimer !== undefined) window.clearInterval(cameraTimer);
  cameraTimer = undefined;
  cameraStream?.getTracks().forEach((track) => track.stop());
  cameraStream = undefined;
  cameraPreview.srcObject = null;
  cameraPanel.hidden = true;
  cameraButton.disabled = false;
  cardGuide.classList.remove('ready');
  previousFrame = undefined;
  previousCardBounds = null;
  steadyFrames = 0;
  captureAnchor = null;
  bestCameraFrame = undefined;
  bestCameraSharpness = 0;
}
cameraButton.addEventListener('click', async () => {
  if (busy || autoCapturing || cameraStream) return;
  if (!navigator.mediaDevices?.getUserMedia) {
    status.textContent = 'Camera is unavailable. Use HTTPS or localhost, or select an image.';
    return;
  }
  cameraButton.disabled = true;
  status.textContent = 'Requesting camera access…';
  cameraHint.textContent = 'Starting the camera…';
  const generation = cameraGeneration;
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: {
        facingMode: { ideal: 'environment' },
        width: { ideal: 1920 },
        height: { ideal: 1080 },
      },
    });
    if (generation !== cameraGeneration) {
      stream.getTracks().forEach((track) => track.stop());
      return;
    }
    cameraStream = stream;
    cameraPreview.srcObject = cameraStream;
    cameraPanel.hidden = false;
    let timeout: number | undefined;
    try {
      await Promise.race([
        cameraPreview.play(),
        new Promise<never>((_, reject) => {
          timeout = window.setTimeout(() => reject(new Error('Camera did not provide a video frame.')), 8000);
        }),
      ]);
    } finally {
      if (timeout !== undefined) window.clearTimeout(timeout);
    }
    if (generation !== cameraGeneration) return;
    updateCardGuide();
    previousFrame = undefined;
    previousCardBounds = null;
    steadyFrames = 0;
    captureAnchor = null;
    bestCameraFrame = undefined;
    bestCameraSharpness = 0;
    cameraHint.textContent = 'Align the front of the document inside the frame. Capture is automatic when steady.';
    status.textContent = 'Camera ready. Hold the front of the document inside the frame.';
    cameraTimer = window.setInterval(() => { void inspectCameraFrame(); }, 450);
  } catch (error) {
    if (generation !== cameraGeneration) return;
    stopCamera();
    status.textContent =
      error instanceof Error ? `Camera unavailable: ${error.message}` : 'Camera unavailable.';
  }
});
captureButton.addEventListener('click', async () => {
  if (!cameraStream || !cameraPreview.videoWidth || busy || autoCapturing) return;
  const canvas = captureCard();
  if (!canvas) return;
  stopCamera();
  try {
    await process(await canvasToFile(canvas), true);
  } catch (error) {
    status.textContent = error instanceof Error ? error.message : String(error);
  }
});
closeCameraButton.addEventListener('click', () => {
  stopCamera();
  status.textContent = 'Camera closed. Choose a front-side image or scan again.';
});
window.addEventListener('pagehide', stopCamera);
window.addEventListener('resize', updateCardGuide);
document.addEventListener('visibilitychange', () => {
  if (document.hidden) stopCamera();
});
file.addEventListener('change', () => {
  const image = file.files?.[0];
  if (image) void process(image);
});
selectImageButton.addEventListener('click', () => file.click());
drop.addEventListener('dragover', (event) => {
  event.preventDefault();
  drop.classList.add('over');
});
drop.addEventListener('dragleave', () => drop.classList.remove('over'));
drop.addEventListener('drop', (event) => {
  event.preventDefault();
  drop.classList.remove('over');
  const image = event.dataTransfer?.files[0];
  if (image) void process(image);
});
