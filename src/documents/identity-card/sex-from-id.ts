import type { IdentityFields } from '../../core/types';
import type { ExtractionResult } from '../registry';

// The fourth CCCD digit encodes century and sex; the next two encode birth year.
// Check both pieces against the read DOB before using the encoded sex.
export function sexFromIdentityNumber(
  idNumber: IdentityFields['idNumber'],
  dateOfBirth: IdentityFields['dateOfBirth'],
): 'M' | 'F' | null {
  if (!idNumber || !/^\d{12}$/.test(idNumber) || !dateOfBirth || !/^\d{4}-\d{2}-\d{2}$/.test(dateOfBirth))
    return null;
  const code = Number(idNumber[3]);
  if (code > 7) return null;
  const encodedYear = 1900 + Math.floor(code / 2) * 100 + Number(idNumber.slice(4, 6));
  if (encodedYear !== Number(dateOfBirth.slice(0, 4))) return null;
  return code % 2 === 0 ? 'M' : 'F';
}

export function reconcileSexFromIdentityNumber(result: ExtractionResult): void {
  const sex = sexFromIdentityNumber(result.fields.idNumber, result.fields.dateOfBirth);
  if (!sex || result.fields.sex === sex) return;
  result.fields.sex = sex;
  result.confidence.sex = Math.min(
    0.95,
    result.confidence.idNumber ?? 0.8,
    result.confidence.dateOfBirth ?? 0.8,
  );
  result.evidence.sex = {
    source: 'derived',
    rawText: 'CCCD sex code agrees with the birth year',
    confidence: result.confidence.sex,
  };
}
