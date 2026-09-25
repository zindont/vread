import type { IdentityFields } from '../core/types';
import { normalizeDate } from '../utils/date';
function qrDate(value: string): string | null {
  const compact = /^\d{8}$/.test(value)
    ? `${value.slice(0, 2)}/${value.slice(2, 4)}/${value.slice(4)}`
    : value;
  return normalizeDate(compact);
}
// Verified common CCCD layout: new ID | old ID | name | DOB | sex | address | issue date.
// Require all positional checks; any other layout is exposed as raw QR only.
export function parseVietnamIdQr(raw: string): Partial<IdentityFields> | null {
  const p = raw
    .trim()
    .split('|')
    .map((v) => v.trim());
  if (
    p.length !== 7 ||
    !/^\d{12}$/.test(p[0] ?? '') ||
    !/^(?:\d{9}|\d{12})?$/.test(p[1] ?? '') ||
    !p[2] ||
    !qrDate(p[3] ?? '')
  )
    return null;
  const sex = /^(nam|male|m)$/i.test(p[4] ?? '')
    ? 'M'
    : /^(nữ|nu|female|f)$/i.test(p[4] ?? '')
      ? 'F'
      : null;
  if (!sex || !p[5] || !qrDate(p[6] ?? '')) return null;
  return {
    idNumber: p[0],
    fullName: p[2],
    dateOfBirth: qrDate(p[3] ?? ''),
    sex,
    placeOfResidence: p[5],
    dateOfIssue: qrDate(p[6] ?? ''),
  };
}
