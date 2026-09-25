import { expect, it } from 'vitest';
import { normalizePlaceCase } from '../src/ocr/vietnamese';

it('repairs a common accent error in Thành phố without changing other address words', () => {
  expect(normalizePlaceCase('Vĩnh Hòa, Thành Phó Hà Nội')).toBe('Vĩnh Hòa, Thành phố Hà Nội');
});

it('normalizes known public place names when OCR reads the same letters with wrong accents', () => {
  expect(normalizePlaceCase('Đoán Trần Nghiệp, Khánh Hòa')).toBe('Đoàn Trần Nghiệp, Khánh Hòa');
  expect(normalizePlaceCase('Nghị Lộc, Nghệ An')).toBe('Nghi Lộc, Nghệ An');
});
