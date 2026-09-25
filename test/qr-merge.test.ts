import { describe, expect, it } from 'vitest';
import { EMPTY_FIELDS } from '../src/core/types';
import type { ExtractionResult } from '../src/documents/registry';
import { mergeQrFields } from '../src/qr/merge';
import { parseVietnamIdQr } from '../src/qr/vietnam-id';

function result(): ExtractionResult {
  return { fields: { ...EMPTY_FIELDS }, confidence: {}, evidence: {} };
}

describe('QR and OCR reconciliation', () => {
  const raw = '079091001234|123456789|NGUYEN VAN A|01/01/1991|Nam|Phường A, Quận B|01/01/2021';
  it('fills fields absent from OCR and derives Vietnamese nationality', () => {
    const parsed = result();
    mergeQrFields(parsed, { detected: true, raw, parsed: parseVietnamIdQr(raw) });
    expect(parsed.fields).toMatchObject({
      idNumber: '079091001234', fullName: 'NGUYEN VAN A', dateOfBirth: '1991-01-01',
      sex: 'M', nationality: 'VN', placeOfResidence: 'Phường A, Quận B', dateOfIssue: '2021-01-01',
    });
  });
  it('preserves a matching accented OCR name and rejects a QR from another card', () => {
    const parsed = result();
    parsed.fields.idNumber = '079091001234';
    parsed.fields.fullName = 'NGUYỄN VĂN A';
    mergeQrFields(parsed, { detected: true, raw, parsed: parseVietnamIdQr(raw) });
    expect(parsed.fields.fullName).toBe('NGUYỄN VĂN A');
    const other = result();
    other.fields.idNumber = '079091009999';
    mergeQrFields(other, { detected: true, raw, parsed: parseVietnamIdQr(raw) });
    expect(other.fields.fullName).toBeNull();
    expect(other.fields.idNumber).toBe('079091009999');
  });
  it('parses compact QR dates used on Vietnamese identity cards', () => {
    const compact = '079091001234|123456789|Nguyễn Văn A|07071994|Nam|Phường A, Quận B|05092022';
    expect(parseVietnamIdQr(compact)).toMatchObject({
      dateOfBirth: '1994-07-07',
      dateOfIssue: '2022-09-05',
      placeOfResidence: 'Phường A, Quận B',
    });
  });
});
