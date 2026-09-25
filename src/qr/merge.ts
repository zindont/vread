import type { FieldName, QrResult } from '../core/types';
import type { ExtractionResult } from '../documents/registry';
import { fold } from '../utils/text';

function hasVietnameseMarks(value: string): boolean {
  return /[\u0300-\u036f]/u.test(value.normalize('NFD')) || /[đĐ]/u.test(value);
}

export function mergeQrFields(result: ExtractionResult, qr: QrResult): void {
  const parsed = qr.parsed;
  if (!parsed) return;
  if (result.fields.idNumber && parsed.idNumber && result.fields.idNumber !== parsed.idNumber) return;
  for (const [name, value] of Object.entries(parsed)) {
    if (!value) continue;
    const field = name as FieldName;
    const existing = result.fields[field];
    const keepAccentedOcr =
      (field === 'fullName' || field === 'placeOfResidence') &&
      !!existing &&
      fold(existing) === fold(value) &&
      hasVietnameseMarks(existing) &&
      !hasVietnameseMarks(value);
    if (keepAccentedOcr) {
      result.confidence[field] = Math.max(result.confidence[field] ?? 0, 0.99);
      continue;
    }
    (result.fields as unknown as Record<string, string | null>)[field] = value;
    result.confidence[field] = existing === value ? 0.99 : 0.95;
    result.evidence[field] = {
      source: 'qr',
      rawText: String(value),
      confidence: result.confidence[field],
    };
  }
  if (!result.fields.nationality || result.fields.nationality === 'VN') {
    result.fields.nationality = 'VN';
    result.confidence.nationality = 0.9;
    result.evidence.nationality = { source: 'derived', rawText: 'Verified Vietnamese ID QR' };
  }
}
