import type { OCRLine } from '../../ocr/types';
import type { QrResult } from '../../core/types';
import { EMPTY_FIELDS } from '../../core/types';
import type { DetectionResult, DocumentAdapter, ExtractionResult } from '../registry';
import { fold } from '../../utils/text';
import { normalizeDate } from '../../utils/date';
import { normalizeNationality } from '../identity-card/normalize';

function has(line: OCRLine, pattern: RegExp): boolean {
  return pattern.test(fold(line.text));
}
function find(lines: OCRLine[], pattern: RegExp): OCRLine | undefined {
  return lines.find((line) => has(line, pattern));
}
function toRight(label: OCRLine | undefined, lines: OCRLine[]): OCRLine | undefined {
  if (!label) return undefined;
  const center = label.boundingBox.y + label.boundingBox.height / 2;
  const right = label.boundingBox.x + label.boundingBox.width;
  return lines
    .filter((line) => line !== label && line.boundingBox.x >= right - 8)
    .filter((line) => Math.abs(line.boundingBox.y + line.boundingBox.height / 2 - center) < 18)
    .sort((a, b) => a.boundingBox.x - b.boundingBox.x)[0];
}
function record(result: ExtractionResult, field: keyof typeof EMPTY_FIELDS, value: string | null, line?: OCRLine): void {
  if (!value || !line) return;
  (result.fields as unknown as Record<string, string | null>)[field] = value;
  result.confidence[field] = Math.min(0.95, line.confidence);
  result.evidence[field] = { source: 'ocr', rawText: line.text, confidence: line.confidence, box: line.boundingBox };
}
function issueDate(text: string): string | null {
  const direct = normalizeDate(text);
  if (direct) return direct;
  const numbers = [...text.matchAll(/\d{1,4}/g)].map((match) => match[0]);
  const year = numbers.at(-1);
  const month = numbers.at(-2);
  const day = numbers.at(-3);
  if (!year || !month || !day || year.length !== 4) return null;
  return normalizeDate(`${day}/${month}/${year}`);
}
export function classifyDriverLicense(lines: OCRLine[], _qr: QrResult): DetectionResult {
  void _qr;
  const title = lines.some((line) => /driver s licen[sc]e|giay phep lai ?xe/.test(fold(line.text)));
  const licenseClass = !!find(lines, /(?:^| )(?:class|hang)(?: |$)/);
  const expires = !!find(lines, /(?:expires|co gia tri den)/);
  const number = lines.some((line) => /\b\d{8,12}\b/.test(line.text));
  if (!title && !(licenseClass && expires && number))
    return { type: 'unknown', version: 'unknown', side: 'unknown', confidence: 0 };
  return { type: 'vn.driver_license', version: 'unknown', side: 'front', confidence: title ? 0.96 : 0.72 };
}

export function extractDriverLicense(lines: OCRLine[], rawLines: OCRLine[] = lines): ExtractionResult {
  const result: ExtractionResult = { fields: { ...EMPTY_FIELDS }, confidence: {}, evidence: {} };
  const source = rawLines;
  const number = find(source, /^(?:s[0o6]|no)(?: |$)/);
  const numberValue = number?.text.match(/(?:^|\D)(\d{8,12})(?:\D|$)/)?.[1] ?? null;
  record(result, 'licenseNumber', numberValue, number);

  const nameLabel = find(source, /full name|ho ten/);
  const name = toRight(nameLabel, source);
  if (name) {
    result.evidence.fullName = { source: 'ocr', rawText: name.text, confidence: name.confidence, box: name.boundingBox };
    result.confidence.fullName = 0;
  }

  const dobLabel = find(source, /date of birth|ngay sinh/);
  const dob = toRight(dobLabel, source) ?? dobLabel;
  record(result, 'dateOfBirth', dob ? normalizeDate(dob.text) : null, dob);

  const nationalityLabel = find(source, /nationality|quoc tich/);
  const nationality = toRight(nationalityLabel, source) ?? nationalityLabel;
  record(result, 'nationality', nationality ? normalizeNationality(nationality.text) : null, nationality);

  const addressLabel = find(source, /address|noi cu tru/);
  const addressFirst = toRight(addressLabel, source);
  if (addressFirst && addressLabel) {
    const continuation = source
      .filter((line) => line.boundingBox.y > addressFirst.boundingBox.y + 10)
      .filter((line) => line.boundingBox.y < addressFirst.boundingBox.y + 46)
      .filter((line) => line.boundingBox.x > addressLabel.boundingBox.x - 10)
      .sort((a, b) => a.boundingBox.y - b.boundingBox.y)[0];
    result.evidence.placeOfResidence = {
      source: 'ocr', rawText: [addressFirst.text, continuation?.text].filter(Boolean).join(', '),
      confidence: Math.min(addressFirst.confidence, continuation?.confidence ?? 1),
      box: addressFirst.boundingBox,
    };
    result.confidence.placeOfResidence = 0;
  }

  const classLine = find(source, /(?:^| )(?:class|hang)(?: |$)/);
  const licenseClass = classLine?.text.match(/\b(A1|A2|A3|A4|B1|B2|BE|C1|C|CE|D1|D2|D|DE|E|FB2|FC|FD|FE)\b/i)?.[1]?.toUpperCase() ?? null;
  record(result, 'licenseClass', licenseClass, classLine);

  const issueLine = source.find((line) => /(?:ngay|date|month)/i.test(fold(line.text)) && /\b\d{4}\b/.test(line.text) && /thang|month/i.test(fold(line.text)));
  record(result, 'dateOfIssue', issueLine ? issueDate(issueLine.text) : null, issueLine);

  const expiryLine = find(source, /expires|co gia tri den/);
  if (expiryLine) {
    const t = fold(expiryLine.text);
    if (/khong\s+(?:thoi|thi)\s+(?:han|hn)/.test(t)) {
      result.fields.expiryStatus = 'indefinite';
      result.confidence.expiryStatus = Math.min(0.9, expiryLine.confidence);
      result.evidence.expiryStatus = { source: 'ocr', rawText: expiryLine.text, confidence: expiryLine.confidence, box: expiryLine.boundingBox };
    } else record(result, 'dateOfExpiry', normalizeDate(expiryLine.text), expiryLine);
  }
  return result;
}

export const driverLicenseAdapter: DocumentAdapter = {
  id: 'vn.driver_license',
  detect: classifyDriverLicense,
  extract: (lines, _detection, rawLines) => extractDriverLicense(lines, rawLines),
};
