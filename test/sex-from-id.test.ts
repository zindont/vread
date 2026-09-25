import { describe, expect, it } from 'vitest';
import { EMPTY_FIELDS } from '../src/core/types';
import { reconcileSexFromIdentityNumber, sexFromIdentityNumber } from '../src/documents/identity-card/sex-from-id';

describe('CCCD sex code', () => {
  it('derives sex only when the encoded birth year matches the printed DOB', () => {
    expect(sexFromIdentityNumber('079185001234', '1985-01-22')).toBe('F');
    expect(sexFromIdentityNumber('079085001234', '1985-01-22')).toBe('M');
    expect(sexFromIdentityNumber('079305001234', '2005-01-22')).toBe('F');
    expect(sexFromIdentityNumber('079385001234', '1985-01-22')).toBeNull();
    expect(sexFromIdentityNumber('079185001234', '1986-01-22')).toBeNull();
  });

  it('corrects a conflicting OCR value and records derived evidence', () => {
    const result = {
      fields: { ...EMPTY_FIELDS, idNumber: '079185001234', dateOfBirth: '1985-01-22', sex: 'M' as const },
      confidence: { idNumber: 0.91, dateOfBirth: 0.93, sex: 0.78 },
      evidence: {},
    };
    reconcileSexFromIdentityNumber(result);
    expect(result.fields.sex).toBe('F');
    expect(result.confidence.sex).toBe(0.91);
    expect(result.evidence).toHaveProperty('sex.source', 'derived');
  });
});
