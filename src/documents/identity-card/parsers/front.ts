import type { OCRLine } from '../../../ocr/types';
import type { ExtractionResult } from '../../registry';
import { EMPTY_FIELDS, type IdentityFields } from '../../../core/types';
import { fieldScore } from '../../../core/confidence';
import { fold, afterLabel, labelScore } from '../../../utils/text';
import { normalizeDate } from '../../../utils/date';
import { normalizeId, normalizeName, normalizeSex, normalizeNationality } from '../normalize';
type IdentityFieldName = keyof IdentityFields;
const LABELS: Partial<Record<IdentityFieldName, string[]>> = {
  idNumber: ['so', 'no', 'so dinh danh ca nhan', 'personal identification number'],
  fullName: ['ho va ten', 'ho chu dem va ten khai sinh', 'full name', 'name'],
  dateOfBirth: ['ngay sinh', 'ngay thang nam sinh', 'date of birth'],
  sex: ['gioi tinh', 'sex'],
  nationality: ['quoc tich', 'nationality'],
  placeOfOrigin: ['que quan', 'place of origin'],
  placeOfResidence: ['noi thuong tru', 'place of residence', 'noi cu tru'],
  dateOfIssue: ['ngay cap', 'date of issue'],
  dateOfExpiry: ['co gia tri den', 'date of expiry', 'valid until'],
};
const NORMALIZERS: Record<IdentityFieldName, (text: string) => string | null> = {
  idNumber: normalizeId,
  fullName: normalizeName,
  dateOfBirth: normalizeDate,
  sex: normalizeSex,
  nationality: normalizeNationality,
  placeOfOrigin: (v) => (v.trim().length > 3 ? v.trim() : null),
  placeOfResidence: (v) => (v.trim().length > 3 ? v.trim() : null),
  dateOfIssue: normalizeDate,
  dateOfExpiry: normalizeDate,
};
function candidate(
  lines: OCRLine[],
  index: number,
  field: IdentityFieldName,
  rawLines: OCRLine[],
): { line: OCRLine; text: string; score: number } | null {
  const anchor = lines[index]!;
  if (field === 'sex') {
    const inline = anchor.text.match(/(?:sex|giới\s*tính)\s*[:：]?\s*(nam|nữ|nu|male|female)(?=\s|[.,;:]|$)/iu);
    if (inline) return { line: anchor, text: inline[1]!, score: 1 };
    const vietnam = anchor.text.search(/\bvi(?:e|é|ệ)?t\s*nam\b/iu);
    const beforeNationality = vietnam >= 0 ? anchor.text.slice(0, vietnam) : anchor.text;
    const loose = beforeNationality.match(/(?:^|\s)(nam|nữ|nu|male|female)(?=\s|[.,;:]|$)/iu);
    if (loose) return { line: anchor, text: loose[1]!, score: 0.85 };
  }
  if (field === 'nationality') {
    const inline = anchor.text.match(
      /(?:nationality|quốc\s*tịch)[^:：]*[:：]?\s*(việt\s*nam|viet\s*nam|vietnam|vietnamese)\b/iu,
    );
    if (inline) return { line: anchor, text: inline[1]!, score: 1 };
    if (normalizeNationality(anchor.text)) return { line: anchor, text: anchor.text, score: 0.85 };
  }
  if (field === 'placeOfResidence') {
    const numberLine = rawLines.find((line) =>
      /^\d{1,4}\s+\p{L}/u.test(line.text.trim()) &&
      line.boundingBox.x > anchor.boundingBox.x + anchor.boundingBox.width * 0.5 &&
      line.boundingBox.y >= anchor.boundingBox.y - anchor.boundingBox.height * 0.2 &&
      line.boundingBox.y < anchor.boundingBox.y + anchor.boundingBox.height,
    );
    if (numberLine) {
      const adjacent = rawLines.filter((line) =>
        line.boundingBox.x >= numberLine.boundingBox.x &&
        line.boundingBox.y >= numberLine.boundingBox.y - numberLine.boundingBox.height * 0.3 &&
        line.boundingBox.y < numberLine.boundingBox.y + numberLine.boundingBox.height * 0.7,
      ).sort((a, b) => a.boundingBox.x - b.boundingBox.x);
      const right = Math.max(...adjacent.map((line) => line.boundingBox.x + line.boundingBox.width));
      const bottom = Math.max(...adjacent.map((line) => line.boundingBox.y + line.boundingBox.height));
      return {
        line: { ...numberLine, boundingBox: { ...numberLine.boundingBox,
          width: right - numberLine.boundingBox.x, height: bottom - numberLine.boundingBox.y } },
        text: adjacent.map((line) => line.text).join(' '), score: 0.9,
      };
    }
    const number = anchor.text.match(/(?:^|\s)(\d{1,4})(?=\s)/u);
    if (!anchor.text.includes(':') && number?.index !== undefined && number[1]!.length >= 2) {
      return { line: anchor, text: anchor.text.slice(number.index).trim(), score: 0.8 };
    }
  }
  if (field === 'idNumber' || field.startsWith('dateOf')) {
    const inline = NORMALIZERS[field](anchor.text);
    if (inline) return { line: anchor, text: anchor.text, score: 1 };
  }
  const raw = afterLabel(anchor.text);
  if (raw && NORMALIZERS[field](raw)) return { line: anchor, text: raw, score: 1 };
  const box = anchor.boundingBox;
  const nearby = lines
    .filter((line, i) => i !== index)
    .map((line) => {
      const b = line.boundingBox;
      const dy = b.y - (box.y + box.height),
        dx = Math.abs(b.x - box.x);
      const below = dy >= -box.height * 0.8 && dy < box.height * 4;
      const sameRow = Math.abs(b.y - box.y) < box.height * 0.8 && b.x > box.x;
      const geometry = below ? Math.max(0.35, 1 - dy / (box.height * 5)) : sameRow ? 0.8 : 0;
      const penalty = dx > Math.max(box.width * 2, 200) ? 0.35 : 1;
      return { line, text: line.text, score: geometry * penalty };
    })
    .filter(
      (item) =>
        item.score > 0 &&
        NORMALIZERS[field](item.text) &&
        !Object.values(LABELS)
          .flat()
          .some((label) => fold(item.text) === fold(label)),
    );
  nearby.sort((a, b) => b.score - a.score);
  return nearby[0] ?? null;
}
export function extractFields(lines: OCRLine[], rawLines: OCRLine[] = lines): ExtractionResult {
  const result: ExtractionResult = { fields: { ...EMPTY_FIELDS }, confidence: {}, evidence: {} };
  const sorted = [...lines].sort(
    (a, b) => a.boundingBox.y - b.boundingBox.y || a.boundingBox.x - b.boundingBox.x,
  );
  for (const field of Object.keys(LABELS) as IdentityFieldName[]) {
    let best: { line: OCRLine; text: string; score: number; anchor: number } | null = null;
    sorted.forEach((line, index) => {
      const alias = (LABELS[field] ?? []).find((a) => labelScore(line.text, a) >= 0.72);
      if (!alias) return;
      const found = candidate(sorted, index, field, rawLines);
      if (!found) return;
      const strength = labelScore(line.text, alias);
      let score = fieldScore(found.line.confidence, strength, found.score, true);
      if (
        found.line.boundingBox.height < 18 &&
        (field === 'fullName' || field === 'placeOfOrigin' || field === 'placeOfResidence')
      )
        score = Math.min(score, 0.72);
      if (!best || score > best.anchor) best = { ...found, anchor: score };
    });
    if (best) {
      const found = best as { line: OCRLine; text: string; score: number; anchor: number };
      const value = NORMALIZERS[field](found.text);
      if (value) {
        (result.fields as unknown as Record<string, string | null>)[field] = value;
        result.confidence[field] = found.anchor;
        result.evidence[field] = {
          source: 'ocr',
          rawText: found.text,
          confidence: found.line.confidence,
          box: found.line.boundingBox,
        };
      }
    }
  }
  // A 12-digit ID without its label is accepted only when other card labels are present.
  if (!result.fields.idNumber && sorted.some((l) => /ho|name|sinh|birth/i.test(fold(l.text)))) {
    const line = sorted.find((l) => normalizeId(l.text));
    if (line) {
      result.fields.idNumber = normalizeId(line.text);
      result.confidence.idNumber = fieldScore(line.confidence, 0.5, 0.5, true);
      result.evidence.idNumber = {
        source: 'ocr',
        rawText: line.text,
        confidence: line.confidence,
        box: line.boundingBox,
      };
    }
  }
  if (!result.fields.dateOfExpiry && result.fields.dateOfBirth && result.evidence.idNumber?.box) {
    const idBox = result.evidence.idNumber.box;
    const expiry = sorted.find((line) =>
      line.boundingBox.x + line.boundingBox.width < idBox.x &&
      line.boundingBox.y > idBox.y &&
      normalizeDate(line.text) !== null &&
      normalizeDate(line.text) !== result.fields.dateOfBirth,
    );
    if (expiry) {
      result.fields.dateOfExpiry = normalizeDate(expiry.text);
      result.confidence.dateOfExpiry = Math.min(0.75, fieldScore(expiry.confidence, 0.5, 0.7, true));
      result.evidence.dateOfExpiry = {
        source: 'ocr', rawText: expiry.text, confidence: expiry.confidence, box: expiry.boundingBox,
      };
    }
  }
  return result;
}
