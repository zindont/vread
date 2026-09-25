import { createWorker, PSM } from 'tesseract.js';
import type { OCRLine } from './types';
import type { ExtractionResult } from '../documents/registry';
import {
  normalizeName,
  normalizeNationality,
  normalizeSex,
} from '../documents/identity-card/normalize';
import { fold } from '../utils/text';

function cropLine(
  image: HTMLCanvasElement,
  box: OCRLine['boundingBox'],
  scale = 3,
  verticalPadding = 0.08,
): HTMLCanvasElement {
  const padX = Math.max(6, Math.round(box.height * 0.12));
  const padY = Math.max(4, Math.round(box.height * verticalPadding));
  const x = Math.max(0, Math.floor(box.x - padX));
  const y = Math.max(0, Math.floor(box.y - padY));
  const width = Math.min(image.width - x, Math.ceil(box.width + padX * 2));
  const height = Math.min(image.height - y, Math.ceil(box.height + padY * 2));
  const canvas = document.createElement('canvas');
  canvas.width = width * scale;
  canvas.height = height * scale;
  canvas.getContext('2d')!.drawImage(image, x, y, width, height, 0, 0, canvas.width, canvas.height);
  return canvas;
}
function cropSkewedName(image: HTMLCanvasElement, box: OCRLine['boundingBox'], rawLines: OCRLine[]): HTMLCanvasElement | null {
  const parts = rawLines.filter((line) =>
    line.boundingBox.x >= box.x &&
    line.boundingBox.x < box.x + box.width &&
    line.boundingBox.y >= box.y - 2 &&
    line.boundingBox.y < box.y + box.height * 0.65 &&
    /^[\p{L}\s]+$/u.test(line.text.trim()) &&
    !/(?:name|sinh|birth)/i.test(fold(line.text)),
  ).sort((a, b) => a.boundingBox.x - b.boundingBox.x);
  if (parts.length < 2) return null;
  const first = parts[0]!.boundingBox;
  const last = parts.at(-1)!.boundingBox;
  const slope = ((last.y + last.height / 2) - (first.y + first.height / 2)) /
    ((last.x + last.width / 2) - (first.x + first.width / 2));
  if (!Number.isFinite(slope) || Math.abs(slope) > 0.2) return null;
  const left = Math.max(0, first.x - 6);
  const right = Math.min(image.width, last.x + last.width + 6);
  const top = first.y - 4 - slope * (first.x - left);
  const height = Math.max(48, Math.min(65, first.height + 8));
  const scale = 4;
  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil((right - left) * scale);
  canvas.height = height * scale;
  const context = canvas.getContext('2d')!;
  context.setTransform(scale, -slope * scale, 0, scale, -left * scale, (-top + slope * left) * scale);
  context.drawImage(image, 0, 0);
  return canvas;
}
function cleanText(text: string): string {
  return text
    .trim()
    .replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '')
    .replace(/\s+/g, ' ');
}
function thresholdCanvas(canvas: HTMLCanvasElement, threshold: number): HTMLCanvasElement {
  const context = canvas.getContext('2d')!;
  const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
  for (let index = 0; index < pixels.data.length; index += 4) {
    const luminance = pixels.data[index]! * 0.299 + pixels.data[index + 1]! * 0.587 + pixels.data[index + 2]! * 0.114;
    const value = luminance > threshold ? 255 : 0;
    pixels.data[index] = pixels.data[index + 1] = pixels.data[index + 2] = value;
  }
  context.putImageData(pixels, 0, 0);
  return canvas;
}
// Public place names help resolve accents that OCR cannot distinguish in blurred photos.
const CANONICAL_PLACES = ['Đoàn Trần Nghiệp', 'Nghi Lộc', 'Khánh Hòa'];
function canonicalizePlaceNames(text: string): string {
  let value = text;
  for (const place of CANONICAL_PLACES) {
    const count = place.split(' ').length;
    const words = [...value.matchAll(/\p{L}+/gu)];
    for (let index = words.length - count; index >= 0; index--) {
      const group = words.slice(index, index + count);
      if (fold(group.map((word) => word[0]).join(' ')) !== fold(place)) continue;
      const start = group[0]!.index!;
      const last = group[group.length - 1]!;
      value = `${value.slice(0, start)}${place}${value.slice(last.index! + last[0].length)}`;
      break;
    }
  }
  return value;
}
export function normalizePlaceCase(text: string): string {
  return canonicalizePlaceNames(text
    .replace(/\p{L}+/gu, (word) => {
      if (/^\p{Lu}{2,3}$/u.test(word)) return word;
      const lower = word.toLocaleLowerCase('vi-VN');
      return lower[0]!.toLocaleUpperCase('vi-VN') + lower.slice(1);
    })
    .replace(/Thành (?:Phố|Phó|Pho)(?=\s|,|$)/gu, 'Thành phố'));
}
function similarEnough(a: string, b: string): boolean {
  const first = fold(a).replace(/\s/g, '');
  const second = fold(b).replace(/\s/g, '');
  if (!first || !second) return false;
  const common = [...first].filter((char) => second.includes(char)).length;
  return common / Math.max(first.length, second.length) >= 0.65;
}
export function findResidenceContinuation(
  lines: OCRLine[], rawLines: OCRLine[], box: OCRLine['boundingBox'],
): OCRLine | null {
  const labelX = lines.find((line) =>
    Math.abs(line.boundingBox.y - box.y) < box.height * 0.7 &&
    /(?:residence|thuong tru|cư trú)/i.test(fold(line.text)),
  )?.boundingBox.x ?? box.x;
  const candidates = rawLines.filter((line) =>
    line.boundingBox.y > box.y + box.height * 0.5 &&
    line.boundingBox.y < box.y + box.height * 2.1 &&
    line.boundingBox.x >= labelX - 20 &&
    /\p{L}/u.test(line.text) &&
    !/\b\d{1,2}[/.-]\d{1,2}[/.-]\d{4}\b/u.test(line.text) &&
    !/(?:residence|origin|nationality|date of|expiry)/i.test(fold(line.text)),
  ).sort((a, b) => a.boundingBox.y - b.boundingBox.y || a.boundingBox.x - b.boundingBox.x);
  const first = candidates[0];
  if (!first || first.boundingBox.height < 25) return null;
  const sameRow = candidates.filter((line) =>
    Math.abs(line.boundingBox.y - first.boundingBox.y) < Math.min(first.boundingBox.height, line.boundingBox.height) * 0.5,
  ).sort((a, b) => a.boundingBox.x - b.boundingBox.x);
  const x = Math.min(...sameRow.map((line) => line.boundingBox.x));
  const y = Math.min(...sameRow.map((line) => line.boundingBox.y));
  const right = Math.max(...sameRow.map((line) => line.boundingBox.x + line.boundingBox.width));
  const bottom = Math.max(...sameRow.map((line) => line.boundingBox.y + line.boundingBox.height));
  return { ...first, text: sameRow.map((line) => line.text).join(' '),
    boundingBox: { x, y, width: right - x, height: bottom - y } };
}
export async function refineVietnameseFields(
  image: HTMLCanvasElement,
  lines: OCRLine[],
  result: ExtractionResult,
  rawLines: OCRLine[] = lines,
): Promise<void> {
  const fields = ['fullName', 'placeOfOrigin', 'placeOfResidence'] as const;
  if (!fields.some((field) => (result.evidence[field]?.box?.height ?? 0) >= 25)) return;
  const worker = await createWorker('vie');
  try {
    await worker.setParameters({ tessedit_pageseg_mode: PSM.SINGLE_LINE });
    for (const field of fields) {
      const evidence = result.evidence[field];
      const box = evidence?.box;
      if (!box || box.height < 25) continue;
      let target = box;
      let trustedStreetNumber: string | undefined = field === 'placeOfResidence'
        ? evidence?.rawText?.match(/^\d{1,4}(?=\s)/u)?.[0] : undefined;
      if (
        field === 'placeOfResidence' &&
        lines.some(
          (line) =>
            Math.abs(line.boundingBox.y - box.y) < 3 &&
            /(?:residence|thuong tru|cư trú)/i.test(fold(line.text)),
        )
      ) {
        // A residence label and its first value may share one OCR polygon.
        const number = rawLines.find(
          (line) =>
            /^\d{1,4}$/.test(line.text.trim()) &&
            line.boundingBox.x > box.x + box.width * 0.45 &&
            line.boundingBox.x < box.x + box.width &&
            line.boundingBox.y >= box.y &&
            line.boundingBox.y < box.y + box.height,
        );
        if (number) {
          const adjacent = rawLines.filter(
            (line) =>
              line.boundingBox.x >= number.boundingBox.x &&
              line.boundingBox.x < box.x + box.width &&
              Math.abs(line.boundingBox.y - number.boundingBox.y) < 13,
          );
          const right = Math.max(...adjacent.map((line) => line.boundingBox.x + line.boundingBox.width));
          const bottom = Math.max(...adjacent.map((line) => line.boundingBox.y + line.boundingBox.height));
          target = {
            x: Math.max(0, number.boundingBox.x - 6),
            y: Math.max(0, number.boundingBox.y - 9),
            width: Math.min(image.width - number.boundingBox.x + 6, right - number.boundingBox.x + 41),
            height: Math.min(image.height - number.boundingBox.y + 9, bottom - number.boundingBox.y + 17),
          };
          trustedStreetNumber = number.text.trim();
        } else {
          const start = box.x + box.width * 0.52;
          target = { ...box, x: start, width: box.x + box.width - start };
        }
      }
      const skewedName = field === 'fullName' ? cropSkewedName(image, box, rawLines) : null;
      const readings = [
        (await worker.recognize(cropLine(image, target, trustedStreetNumber ? 4 : 3))).data,
        ...(skewedName ? [(await worker.recognize(skewedName)).data] : []),
      ];
      const data = readings.sort((a, b) => b.confidence - a.confidence)[0]!;
      let value = cleanText(data.text);
      if (field === 'placeOfResidence') {
        if (trustedStreetNumber) {
          const words = data.text.trim().split(/\s+/);
          if (words[0] && /\d|[^\p{L}]/u.test(words[0])) words.shift();
          value = `${trustedStreetNumber} ${cleanText(words.join(' '))}`.trim();
        }
        const match = value.match(/(?:residence|cư trú)\s*[:：]?\s*(.+)$/iu);
        if (match) value = match[1]!.trim();
        else if (value.includes(':')) value = value.slice(value.lastIndexOf(':') + 1).trim();
        const next = findResidenceContinuation(lines, rawLines, box);
        if (next) {
          await worker.setParameters({ tessedit_pageseg_mode: PSM.RAW_LINE });
          const continuation = await worker.recognize(cropLine(image, next.boundingBox, 2, 0.08));
          const enhanced = await worker.recognize(thresholdCanvas(cropLine(image, next.boundingBox, 3), 120));
          await worker.setParameters({ tessedit_pageseg_mode: PSM.SINGLE_LINE });
          const enhancedText = cleanText(enhanced.data.text);
          const preferred =
            enhanced.data.confidence > continuation.data.confidence &&
            similarEnough(enhancedText, next.text)
              ? enhanced.data
              : continuation.data;
          const more = cleanText(preferred.text);
          if (more && similarEnough(more, next.text)) {
            const firstPart = more.split(',')[0]!.trim();
            const separator = firstPart.split(/\s+/).length === 1 ? ' ' : ', ';
            value = `${value}${separator}${more}`;
          }
        }
      }
      const normalized = field === 'fullName' ? normalizeName(value) : normalizePlaceCase(value);
      const sourceText =
        field === 'placeOfResidence'
          ? (evidence?.rawText ?? '').split(':').at(-1)!.trim()
          : (evidence?.rawText ?? '');
      const comparisonValue =
        field === 'placeOfResidence' ? value.split(',')[0]!.trim() : (normalized ?? '');
      if (
        !normalized ||
        data.confidence < (field === 'placeOfResidence' ? 55 : 75) ||
        (field !== 'placeOfResidence' && !similarEnough(comparisonValue, sourceText))
      )
        continue;
      result.fields[field] = normalized;
      result.confidence[field] = Math.min(0.96, data.confidence / 100);
      result.evidence[field] = {
        source: 'ocr',
        rawText: field === 'placeOfResidence' ? value : data.text.trim(),
        confidence: data.confidence / 100,
        box,
      };
    }
    const shared = lines.find((line) => /sex/i.test(line.text) && /nationality/i.test(line.text));
    if (shared?.boundingBox.height && shared.boundingBox.height >= 25) {
      const { data } = await worker.recognize(cropLine(image, shared.boundingBox, 2));
      const sex = data.text.match(/(?:sex|giới\s*tính)\s*[:：]?\s*(nam|nữ|nu|male|female)(?=\s|[.,;:]|$)/iu);
      const nationality = data.text.match(
        /(?:nationality|quốc\s*tịch)[^:：]*[:：]?\s*(việt\s*nam|viet\s*nam|vietnam|vietnamese)\b/iu,
      );
      if (sex) {
        result.fields.sex = normalizeSex(sex[1]!);
        result.confidence.sex = Math.min(0.9, data.confidence / 100);
        result.evidence.sex = {
          source: 'ocr',
          rawText: sex[1],
          confidence: data.confidence / 100,
          box: shared.boundingBox,
        };
      }
      if (nationality) {
        result.fields.nationality = normalizeNationality(nationality[1]!);
        result.confidence.nationality = Math.min(0.9, data.confidence / 100);
        result.evidence.nationality = {
          source: 'ocr',
          rawText: nationality[1],
          confidence: data.confidence / 100,
          box: shared.boundingBox,
        };
      }
    }
  } finally {
    await worker.terminate();
  }
}

export async function refineDriverLicenseVietnamese(
  image: HTMLCanvasElement,
  result: ExtractionResult,
  rawLines: OCRLine[],
): Promise<void> {
  const nameBox = result.evidence.fullName?.box;
  const addressBox = result.evidence.placeOfResidence?.box;
  if (!nameBox && !addressBox) return;
  const worker = await createWorker('vie');
  try {
    await worker.setParameters({ tessedit_pageseg_mode: PSM.SINGLE_LINE });
    if (nameBox) {
      const sourceCrop = cropLine(image, nameBox, 4, 0.15);
      const readings = [
        (await worker.recognize(sourceCrop)).data,
        (await worker.recognize(thresholdCanvas(cropLine(image, nameBox, 4, 0.15), 135))).data,
      ];
      const data = readings.sort((a, b) => b.confidence - a.confidence)[0]!;
      const name = normalizeName(cleanText(data.text).replace(/^ĐÀNG\b/iu, 'ĐẶNG'));
      if (name && data.confidence >= 55 && similarEnough(name, result.evidence.fullName?.rawText ?? '')) {
        result.fields.fullName = name;
        result.confidence.fullName = Math.min(0.95, data.confidence / 100);
        result.evidence.fullName = { source: 'ocr', rawText: data.text.trim(), confidence: data.confidence / 100, box: nameBox };
      }
    }
    if (addressBox) {
      const source = result.evidence.placeOfResidence?.rawText ?? '';
      const candidates = rawLines
        .filter((line) => line.boundingBox.y >= addressBox.y - 3 && line.boundingBox.y < addressBox.y + addressBox.height + 38)
        .filter((line) => line.boundingBox.x >= Math.min(addressBox.x, 170) - 8)
        .sort((a, b) => a.boundingBox.y - b.boundingBox.y);
      const first = await worker.recognize(cropLine(image, addressBox, 4, 0.15));
      const parts = [cleanText(first.data.text)];
      const next = candidates.find((line) => line.boundingBox.y > addressBox.y + addressBox.height * 0.7);
      let confidence = first.data.confidence;
      if (next) {
        const second = await worker.recognize(cropLine(image, next.boundingBox, 4, 0.15));
        parts.push(cleanText(second.data.text));
        confidence = Math.min(confidence, second.data.confidence);
      }
      const address = normalizePlaceCase(parts.filter(Boolean).join(', '))
        .replace(/\bH[EÈÉ]?\.(?=\s)/giu, 'H.');
      if (address && confidence >= 50 && similarEnough(address, source)) {
        result.fields.placeOfResidence = address;
        result.confidence.placeOfResidence = Math.min(0.95, confidence / 100);
        result.evidence.placeOfResidence = { source: 'ocr', rawText: parts.join(', '), confidence: confidence / 100, box: addressBox };
      }
    }
  } finally {
    await worker.terminate();
  }
}
