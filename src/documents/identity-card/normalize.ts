import { fold } from '../../utils/text';
export function normalizeId(text: string): string | null {
  const value = text.replace(/[Oo]/g, '0').replace(/[Il|]/g, '1').replace(/\s/g, '');
  const m = value.match(/(?:^|\D)(\d{12})(?:\D|$)/);
  return m?.[1] ?? null;
}
export function normalizeSex(text: string): 'M' | 'F' | null {
  const t = fold(text);
  if (/^(nam|male|m)$/.test(t)) return 'M';
  if (/^(nu|female|f)$/.test(t)) return 'F';
  return null;
}
export function normalizeNationality(text: string): string | null {
  return /\b(viet nam|vietnam|vietnamese)\b/.test(fold(text)) ? 'VN' : null;
}
export function normalizeName(text: string): string | null {
  const value = text.trim().replace(/\s+/g, ' ').toLocaleUpperCase('vi-VN');
  return /^[\p{L} ]{4,80}$/u.test(value) && value.split(' ').length >= 2 ? value : null;
}
