import { convertOldToNew, searchProvince, searchWard } from 'vietnam-address-kit';
import type { ExtractionResult } from '../documents/registry';
import type { AddressField, NormalizedAddress } from '../core/types';
import { fold } from '../utils/text';

function stripPrefix(value: string): string {
  return value.trim().replace(/^(?:xã|phường|thị trấn|huyện|quận|thành phố|tỉnh|x|p|tt|h|q|tp|t)\.?\s+/iu, '');
}

function displayPart(source: string, canonical: string): string {
  const prefix = source.match(/^(xã|phường|thị trấn|huyện|quận|thành phố|tỉnh|x|p|tt|h|q|tp|t)\.?(?=\s)/iu)?.[0];
  return prefix ? `${prefix} ${canonical}` : canonical;
}

export function normalizeDocumentAddress(value: string): NormalizedAddress | null {
  const pieces = value.split(',').map((part) => part.trim()).filter(Boolean);
  if (pieces.length < 2) return null;
  if (pieces.length === 2 || (pieces.length === 3 && /^(?:xã|phường|đặc khu|x|p)\.?(?=\s)/iu.test(pieces[1]!))) {
    const province = pieces.at(-1)!;
    const ward = pieces.at(-2)!;
    const streetAddress = pieces.slice(0, -2).join(', ') || null;
    const provinces = searchProvince(stripPrefix(province)).filter((match) => match.score === 1);
    if (provinces.length !== 1) return null;
    const wards = searchWard(stripPrefix(ward), { provinceCode: provinces[0]!.item.code })
      .filter((match) => match.score === 1);
    if (wards.length !== 1) return null;
    const normalized = [streetAddress, displayPart(ward, wards[0]!.item.name), displayPart(province, provinces[0]!.item.name)]
      .filter(Boolean).join(', ');
    return {
      original: value, normalized, streetAddress,
      ward: wards[0]!.item.name, district: null, province: provinces[0]!.item.name,
      wardCode: wards[0]!.item.code, districtCode: null, provinceCode: provinces[0]!.item.code,
      confidence: 1,
    };
  }
  if (pieces.length < 3) return null;
  const province = pieces.at(-1)!;
  const district = pieces.at(-2)!;
  const ward = pieces.at(-3)!;
  const streetAddress = pieces.slice(0, -3).join(', ') || null;
  const provinceName = stripPrefix(province);
  const districtName = stripPrefix(district);
  const wardName = stripPrefix(ward);
  const candidates = [provinceName, ...searchProvince(provinceName).slice(0, 3).map((match) => match.item.name)];
  const matches = candidates
    .map((candidate) => convertOldToNew({ province: candidate, district: districtName, ward: wardName }))
    .filter((result) => result.confidence >= 0.95)
    .filter((result) => result.oldAddress?.provinceName && result.oldAddress.districtName && result.oldAddress.wardName);
  const verified = matches.filter((result) =>
    fold(result.oldAddress!.districtName!) === fold(districtName) &&
    fold(result.oldAddress!.wardName!) === fold(wardName));
  const unique = new Map(verified.map((match) => [match.oldAddress!.wardCode, match]));
  if (unique.size !== 1) return null;
  const match = [...unique.values()][0]!;
  const old = match.oldAddress!;
  const normalized = [
    streetAddress,
    displayPart(ward, old.wardName!),
    displayPart(district, old.districtName!),
    displayPart(province, old.provinceName!),
  ].filter(Boolean).join(', ');
  return {
    original: value,
    normalized,
    streetAddress,
    ward: old.wardName!,
    district: old.districtName!,
    province: old.provinceName!,
    wardCode: old.wardCode!,
    districtCode: old.districtCode!,
    provinceCode: old.provinceCode!,
    confidence: match.confidence,
    currentAdministrativeArea: match.success && match.newAddress ? {
      ward: match.newAddress.wardName,
      province: match.newAddress.provinceName,
      wardCode: match.newAddress.wardCode,
      provinceCode: match.newAddress.provinceCode,
    } : undefined,
  };
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
  }
  return addresses;
}
