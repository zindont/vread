import { describe, expect, it } from 'vitest';
import { compareFields, normalizeCorrectionDate } from '../demo/feedback';
import type { IdentityFields } from '../src/core/types';

const correct: IdentityFields = {
  idNumber: '079091001234',
  fullName: 'NGUYỄN VĂN A',
  dateOfBirth: '1991-01-01',
  sex: 'M',
  nationality: 'VN',
  placeOfOrigin: 'Hà Nội',
  placeOfResidence: 'Phường A, Quận B, Thành phố C',
  dateOfIssue: null,
  dateOfExpiry: '2031-01-01',
};

describe('private feedback comparison', () => {
  it('accepts displayed ISO dates and rejects impossible dates', () => {
    expect(normalizeCorrectionDate('1991-01-01')).toBe('1991-01-01');
    expect(normalizeCorrectionDate('01/01/1991')).toBe('1991-01-01');
    expect(normalizeCorrectionDate('1991-02-30')).toBeNull();
  });
  it('checks every field, including a null field and the complete residence', () => {
    expect(compareFields(correct, correct)).toEqual([]);
    expect(
      compareFields(
        {
          ...correct,
          sex: 'F',
          nationality: null,
          placeOfResidence: 'Phường A',
          dateOfIssue: '2024-07-07',
        },
        correct,
      ),
    ).toEqual(['sex', 'nationality', 'placeOfResidence', 'dateOfIssue']);
  });
});
