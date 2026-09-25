export function fold(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[đĐ]/g, 'd')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}
function editDistance(a: string, b: string): number {
  const previous = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    for (let j = 1; j <= b.length; j++)
      row[j] = Math.min(
        row[j - 1]! + 1,
        previous[j]! + 1,
        previous[j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    previous.splice(0, previous.length, ...row);
  }
  return previous[b.length]!;
}
export function labelScore(text: string, alias: string): number {
  const value = fold(text),
    target = fold(alias);
  if (!value || !target) return 0;
  if (value.includes(target)) return 1;
  if (target.length < 5) return 0;
  const segments = text.split(/[/:：]/).map(fold);
  const candidates = [value, ...segments];
  let best = 0;
  for (const candidate of candidates) {
    const words = candidate.split(' '),
      count = target.split(' ').length;
    for (let i = 0; i < words.length; i++) {
      const phrase = words.slice(i, i + count).join(' ');
      const ratio = editDistance(phrase, target) / Math.max(phrase.length, target.length);
      if (ratio <= 0.28) best = Math.max(best, 1 - ratio);
    }
  }
  return best;
}
export function matches(text: string, aliases: readonly string[]): boolean {
  return aliases.some((alias) => labelScore(text, alias) >= 0.72);
}
export function afterLabel(text: string): string {
  const parts = text.split(/[:：]/);
  return parts.length > 1 ? parts.slice(1).join(':').trim() : '';
}
