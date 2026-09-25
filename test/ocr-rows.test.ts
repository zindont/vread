import { describe, expect, it } from 'vitest';
import { mergeOcrRows } from '../src/ocr/rows';
import type { OCRLine } from '../src/ocr/types';

function line(text: string, x: number, y: number, width: number, height = 32): OCRLine {
  return {
    text,
    confidence: 0.9,
    boundingBox: { x, y, width, height },
    polygon: [
      { x, y }, { x: x + width, y: y + width * 0.04 },
      { x: x + width, y: y + width * 0.04 + height }, { x, y: y + height },
    ],
  };
}

describe('OCR row reconstruction', () => {
  it('joins slanted fragments while keeping the label and value on separate rows', () => {
    const rows = mergeOcrRows([
      line('Họ và tên / Full', 440, 410, 200),
      line('name', 645, 418, 65),
      line('NGUYỄN', 440, 451, 155, 42),
      line('VĂN A', 605, 458, 135, 42),
    ]);
    expect(rows.map((row) => row.text)).toEqual([
      'Họ và tên / Full name',
      'NGUYỄN VĂN A',
    ]);
  });
});
