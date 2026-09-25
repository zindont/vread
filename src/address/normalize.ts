import { convertOldToNew, parseAddress, searchProvince, searchWard } from 'vietnam-address-kit';
import type { ExtractionResult } from '../documents/registry';
import type { AddressField, NormalizedAddress } from '../core/types';
import { fold } from '../utils/text';

function stripPrefix(value: string): string {
  return value.trim().replace(/^(?:(?:x|p|tt|h|q|tp|t)(?:\.\s*|\s+)|(?:xã|phường|thị trấn|đặc khu|huyện|quận|thành phố|tỉnh)\s+)/iu, '');
}

function displayPart(source: string, canonical: string): string {
  const prefix = source.match(/^(?:(?:x|p|tt|h|q|tp|t)(?:\.\s*|\s+)|(?:xã|phường|thị trấn|đặc khu|huyện|quận|thành phố|tỉnh)\s+)/iu)?.[0];
  return prefix ? `${prefix.trimEnd()} ${canonical}` : canonical;
}

function similarity(a: string, b: string): number {
  const left = fold(a);
  const right = fold(b);
  if (!left || !right) return 0;
  const previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let row = 1; row <= left.length; row++) {
    const next = [row];
    for (let column = 1; column <= right.length; column++) {
      next[column] = Math.min(
        next[column - 1]! + 1,
        previous[column]! + 1,
        previous[column - 1]! + (left[row - 1] === right[column - 1] ? 0 : 1),
      );
    }
    previous.splice(0, previous.length, ...next);
  }
  return 1 - previous[right.length]! / Math.max(left.length, right.length);
}

function normalizeTwoLevel(value: string, pieces: string[]): NormalizedAddress | null {
  const province = pieces.at(-1)!;
  const ward = pieces.at(-2)!;
  const streetAddress = pieces.slice(0, -2).join(', ') || null;
  const provinces = searchProvince(stripPrefix(province)).filter((match) => match.score >= 0.82);
  const matches = provinces.flatMap((provinceMatch) =>
    searchWard(stripPrefix(ward), { provinceCode: provinceMatch.item.code })
      .filter((wardMatch) => wardMatch.score >= 0.82)
      .map((wardMatch) => ({ province: provinceMatch.item, ward: wardMatch.item,
        score: Math.min(similarity(stripPrefix(province), provinceMatch.item.name), similarity(stripPrefix(ward), wardMatch.item.name)) })));
  const ranked = matches.filter((match) => match.score >= 0.82)
    .sort((a, b) => b.score - a.score);
  if (!ranked.length || (ranked[1] && ranked[0]!.score - ranked[1].score < 0.08)) return null;
  const best = ranked[0]!;
  return {
    original: value,
    normalized: [streetAddress, displayPart(ward, best.ward.name), displayPart(province, best.province.name)].filter(Boolean).join(', '),
    streetAddress, ward: best.ward.name, district: null, province: best.province.name,
    wardCode: best.ward.code, districtCode: null, provinceCode: best.province.code,
    confidence: best.score,
  };
}

function normalizeThreeLevel(value: string, pieces: string[]): NormalizedAddress | null {
  const province = pieces.at(-1)!;
  const district = pieces.at(-2)!;
  const ward = pieces.at(-3)!;
  const streetAddress = pieces.slice(0, -3).join(', ') || null;
  const provinceName = stripPrefix(province);
  const districtName = stripPrefix(district);
  const wardName = stripPrefix(ward);
  const provinceCandidates = [provinceName, ...searchProvince(provinceName)
    .filter((match) => match.score >= 0.8).slice(0, 5).map((match) => match.item.name)];
  const wardCandidates = [wardName, ...searchWard(wardName)
    .filter((match) => match.score >= 0.8).slice(0, 20).map((match) => match.item.name)];
  const matches = provinceCandidates.flatMap((provinceCandidate) => wardCandidates
    .map((wardCandidate) => convertOldToNew({ province: provinceCandidate, district: districtName, ward: wardCandidate })))
    .filter((result) => result.confidence >= 0.65)
    .filter((result) => result.oldAddress?.provinceName && result.oldAddress.districtName && result.oldAddress.wardName)
    .map((result) => {
      const provinceScore = similarity(provinceName, result.oldAddress!.provinceName!);
      const districtScore = similarity(districtName, result.oldAddress!.districtName!);
      const wardScore = similarity(wardName, result.oldAddress!.wardName!);
      return { result, provinceScore, districtScore, wardScore,
        score: provinceScore * 0.2 + districtScore * 0.4 + wardScore * 0.4 };
    })
    .filter((match) => match.provinceScore >= 0.65 && match.districtScore >= 0.8 && match.wardScore >= 0.8);
  const unique = new Map<string, typeof matches[number]>();
  for (const match of matches) {
    const code = match.result.oldAddress!.wardCode!;
    if (!unique.has(code) || unique.get(code)!.score < match.score) unique.set(code, match);
  }
  const ranked = [...unique.values()].sort((a, b) => b.score - a.score);
  if (!ranked.length || (ranked[1] && ranked[0]!.score - ranked[1].score < (ranked[0]!.wardScore === 1 ? 0.02 : 0.08))) return null;
  const { result: match, score } = ranked[0]!;
  const old = match.oldAddress!;
  const normalized = [
    streetAddress,
    displayPart(ward, old.wardName!),
    displayPart(district, old.districtName!),
    displayPart(province, old.provinceName!),
  ].filter(Boolean).join(', ');
  return {
    original: value, normalized, streetAddress,
    ward: old.wardName!, district: old.districtName!, province: old.provinceName!,
    wardCode: old.wardCode!, districtCode: old.districtCode!, provinceCode: old.provinceCode!,
    confidence: Math.min(match.confidence, score),
    currentAdministrativeArea: match.success && match.strategy !== 'fuzzy' && match.newAddress ? {
      ward: match.newAddress.wardName, province: match.newAddress.provinceName,
      wardCode: match.newAddress.wardCode, provinceCode: match.newAddress.provinceCode,
    } : undefined,
  };
}

export function normalizeDocumentAddress(value: string): NormalizedAddress | null {
  const pieces = value.split(',').map((part) => part.trim()).filter(Boolean);
  if (pieces.length < 2) {
    const parsed = parseAddress(value);
    if (!parsed.province || !parsed.district || !parsed.ward) return null;
    if (parsed.approximate && !/(?:^|\s)(?:huyện|quận|thành phố|h\.|q\.|tp\.)/iu.test(value)) return null;
    const segments = [parsed.streetAddress, parsed.ward, parsed.district, parsed.province].filter((part): part is string => !!part);
    const normalized = normalizeThreeLevel(value, segments);
    if (normalized) normalized.confidence = Math.min(normalized.confidence, parsed.approximate ? 0.7 : 0.8);
    return normalized;
  }
  if (pieces.length === 2) return normalizeTwoLevel(value, pieces);
  const old = normalizeThreeLevel(value, pieces);
  if (old) return old;
  const street = pieces.slice(0, -2).join(', ');
  const hasWardPrefix = /^(?:(?:x|p)(?:\.|\s)|(?:xã|phường|đặc khu)\s)/iu.test(pieces.at(-2)!);
  const hasStreetCue = /^(?:\d+|tổ|ấp|thôn|khu phố|đường|ngõ|ngách|hẻm)\b/iu.test(street);
  return hasWardPrefix || (pieces.length === 3 && hasStreetCue) ? normalizeTwoLevel(value, pieces) : null;
}

export function normalizeExtractedAddresses(result: ExtractionResult): Partial<Record<AddressField, NormalizedAddress>> {
  const addresses: Partial<Record<AddressField, NormalizedAddress>> = {};
  for (const field of ['placeOfOrigin', 'placeOfResidence'] as const) {
    const value = result.fields[field];
    if (!value) continue;
    const normalized = normalizeDocumentAddress(value);
    if (!normalized) continue;
    addresses[field] = normalized;
    result.fields[field] = normalized.normalized;
    if (normalized.normalized !== value)
      result.confidence[field] = Math.min(result.confidence[field] ?? normalized.confidence, normalized.confidence);
  }
  return addresses;
}
