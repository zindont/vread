import type { DocumentAdapter } from '../registry';
import type { OCRLine } from '../../ocr/types';
import { labelScore } from '../../utils/text';
import { classifyIdentity } from './classify';
import { extractFields } from './parsers/front';
function frontLines(lines: OCRLine[]): OCRLine[] {
  // A scan may contain both sides stacked vertically. Stop front extraction at the back heading.
  const boundary = lines
    .filter((line) => labelScore(line.text, 'dac diem nhan dang') >= 0.65)
    .map((line) => line.boundingBox.y)
    .sort((a, b) => a - b)[0];
  return boundary === undefined ? lines : lines.filter((line) => line.boundingBox.y < boundary);
}
export const identityCardAdapter: DocumentAdapter = {
  id: 'vn.identity_card',
  detect: classifyIdentity,
  extract: (lines, _detection, rawLines = lines) => {
    const result = extractFields(frontLines(lines), frontLines(rawLines));
    // Paddle's Latin recognizer supplies anchors and candidate boxes. Free-form
    // Vietnamese strings are published only after the Vietnamese OCR pass.
    for (const field of ['fullName', 'placeOfOrigin', 'placeOfResidence'] as const) {
      if (result.evidence[field] === undefined) continue;
      result.fields[field] = null;
      result.confidence[field] = 0;
    }
    return result;
  },
};
