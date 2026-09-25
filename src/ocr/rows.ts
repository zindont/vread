import type { OCRLine } from './types';

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)] ?? 0;
}

export function mergeOcrRows(lines: OCRLine[]): OCRLine[] {
  if (lines.length < 2) return lines;
  const slopes = lines
    .map((line) => {
      const [a, b] = line.polygon;
      return a && b && Math.abs(b.x - a.x) > 40 ? (b.y - a.y) / (b.x - a.x) : NaN;
    })
    .filter((slope) => Number.isFinite(slope) && Math.abs(slope) < 0.2);
  const slope = median(slopes);
  const key = (line: OCRLine) => {
    const b = line.boundingBox;
    return b.y + b.height / 2 - slope * (b.x + b.width / 2);
  };
  const rows: OCRLine[][] = [];
  for (const line of [...lines].sort((a, b) => key(a) - key(b))) {
    const row = rows.find((group) => {
      const center = median(group.map(key));
      const typicalHeight = median(group.map((part) => part.boundingBox.height));
      return Math.abs(key(line) - center) <= Math.max(9, Math.min(typicalHeight, line.boundingBox.height) * 0.4);
    });
    if (row) row.push(line);
    else rows.push([line]);
  }
  return rows.map((row) => {
    if (row.length === 1) return row[0]!;
    row.sort((a, b) => a.boundingBox.x - b.boundingBox.x);
    const x = Math.min(...row.map((line) => line.boundingBox.x));
    const y = Math.min(...row.map((line) => line.boundingBox.y));
    const right = Math.max(...row.map((line) => line.boundingBox.x + line.boundingBox.width));
    const bottom = Math.max(...row.map((line) => line.boundingBox.y + line.boundingBox.height));
    return {
      text: row.map((line) => line.text).join(' '),
      confidence: row.reduce((sum, line) => sum + line.confidence, 0) / row.length,
      boundingBox: { x, y, width: right - x, height: bottom - y },
      polygon: [
        { x, y }, { x: right, y }, { x: right, y: bottom }, { x, y: bottom },
      ],
    } satisfies OCRLine;
  });
}
