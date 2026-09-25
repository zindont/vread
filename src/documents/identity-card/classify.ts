import type { OCRLine } from '../../ocr/types';
import type { QrResult } from '../../core/types';
import type { DetectionResult } from '../registry';
import { labelScore } from '../../utils/text';
import { CCCD_2021 } from './templates/cccd-2021';
import { IDENTITY_2024 } from './templates/identity-card-2024';
const FRONT = [...CCCD_2021.front, ...IDENTITY_2024.front];
const NAME = ['ho va ten', 'ho chu dem va ten khai sinh', 'full name'];
const DOB = ['ngay sinh', 'ngay thang nam sinh', 'date of birth'];
const SEX = ['gioi tinh', 'sex'];
export function classifyIdentity(lines: OCRLine[], qr: QrResult): DetectionResult {
  const has = (labels: readonly string[]) =>
    lines.some((line) => labels.some((label) => labelScore(line.text, label) >= 0.72));
  const cccd = has(CCCD_2021.version);
  const newer = has(['ho chu dem va ten khai sinh']) || (!cccd && has(IDENTITY_2024.version));
  const frontLines = lines.filter((line) =>
    FRONT.some((label) => labelScore(line.text, label) >= 0.72),
  );
  const id =
    lines.some((line) => /(?:^|\D)\d{12}(?:\D|$)/.test(line.text)) || !!qr.parsed?.idNumber;
  const primaryAnchor = has(NAME) || has(DOB) || has(SEX);
  if (!primaryAnchor || frontLines.length < 2 || !(cccd || newer || id))
    return { type: 'unknown', version: 'unknown', side: 'unknown', confidence: 0 };
  return {
    type: 'vn.identity_card',
    version: cccd ? '2021' : newer ? '2024' : 'unknown',
    side: 'front',
    confidence: Math.min(0.98, 0.5 + frontLines.length * 0.1 + (id ? 0.1 : 0)),
  };
}
export function anchorStrength(lines: OCRLine[]): number {
  return classifyIdentity(lines, { detected: false }).confidence;
}
