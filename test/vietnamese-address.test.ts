import { expect, it } from 'vitest';
import { findResidenceContinuation, normalizePlaceCase } from '../src/ocr/vietnamese';
import type { OCRLine } from '../src/ocr/types';

function line(text: string, x: number, y: number, width: number, height = 38): OCRLine {
  return { text, confidence: 0.9, boundingBox: { x, y, width, height },
    polygon: [{ x, y }, { x: x + width, y }, { x: x + width, y: y + height }, { x, y: y + height }] };
}

it('repairs a common accent error in Thành phố without changing other address words', () => {
  expect(normalizePlaceCase('Vĩnh Hòa, Thành Phó Hà Nội')).toBe('Vĩnh Hòa, Thành phố Hà Nội');
});

it('normalizes known public place names when OCR reads the same letters with wrong accents', () => {
  expect(normalizePlaceCase('Đoán Trần Nghiệp, Khánh Hòa')).toBe('Đoàn Trần Nghiệp, Khánh Hòa');
  expect(normalizePlaceCase('Nghị Lộc, Nghệ An')).toBe('Nghi Lộc, Nghệ An');
});

it('finds the second residence line even when row merging attaches an expiry label', () => {
  const box = { x: 298, y: 522, width: 500, height: 38 };
  const residence = line('Nơi thường trú / Place of residence: 58 Đoàn Trần', 298, 522, 500);
  const expiry = line('Có giá trị đến: 20/09/2031', 61, 538, 230);
  const expiryEnglish = line('Date of expiry', 64, 563, 108, 24);
  const continuation = line('Nghiệp, Vĩnh Phước, Nha Trang, Khánh Hòa', 299, 557, 549);
  const merged = [residence, expiry, line('Date of expiry Nghiệp, Vĩnh Phước, Nha Trang, Khánh Hòa', 64, 557, 784)];
  expect(findResidenceContinuation(merged, [residence, expiry, expiryEnglish, continuation], box)?.text)
    .toBe(continuation.text);
});
