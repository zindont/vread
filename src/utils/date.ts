export function normalizeDate(text: string): string | null {
  const clean = text.replace(/[Oo]/g, '0').replace(/[Il]/g, '1');
  const m = clean.match(/(?:^|\D)(\d{1,2})[./-](\d{1,2})[./-](\d{4})(?:\D|$)/);
  if (!m) return null;
  const day = Number(m[1]),
    month = Number(m[2]),
    year = Number(m[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day ||
    year < 1900 ||
    year > 2150
  )
    return null;
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}
