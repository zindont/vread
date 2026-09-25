import { describe, expect, it } from 'vitest';
import { normalizeDocumentAddress, normalizeExtractedAddresses } from '../src/address/normalize';
import { EMPTY_FIELDS } from '../src/core/types';

describe('administrative address normalization', () => {
  it('preserves the document-era address while returning validated components and codes', () => {
    const address = normalizeDocumentAddress('Ấp A, X. Thuận Thành, H. Cần Giuộc, T. Long An');
    expect(address).toMatchObject({
      normalized: 'Ấp A, X. Thuận Thành, H. Cần Giuộc, T. Long An',
      streetAddress: 'Ấp A', ward: 'Thuận Thành', district: 'Cần Giuộc',
      province: 'Long An', wardCode: '28189', districtCode: '807', provinceCode: '80',
      currentAdministrativeArea: { ward: 'Mỹ Lộc', province: 'Tây Ninh' },
    });
  });
  it('repairs an OCR damaged province only when ward and district establish a unique old address', () => {
    const address = normalizeDocumentAddress('P. Vĩnh Phước, TP. Nha Trang, Khẳnh Hôø');
    expect(address?.normalized).toBe('P. Vĩnh Phước, TP. Nha Trang, Khánh Hòa');
    expect(address?.ward).toBe('Vĩnh Phước');
    expect(address?.district).toBe('Nha Trang');
  });
  it('checks district identity because the package can match a same-named ward in another district', () => {
    const address = normalizeDocumentAddress('Tổ A, Vĩnh Hòa, Nha Trang, Khánh Hòa');
    expect(address).toMatchObject({
      ward: 'Vĩnh Hòa', district: 'Nha Trang', province: 'Khánh Hòa',
      wardCode: '22327', districtCode: '568', provinceCode: '56',
    });
  });
  it('validates historical names even when the 2025 migration is ambiguous', () => {
    const address = normalizeDocumentAddress('Nghi Văn, Nghi Lộc, Nghệ An');
    expect(address).toMatchObject({
      ward: 'Nghi Văn', district: 'Nghi Lộc', province: 'Nghệ An',
      wardCode: '17830', districtCode: '429', provinceCode: '40',
    });
    expect(address?.currentAdministrativeArea).toBeUndefined();
  });
  it('keeps unresolved addresses unchanged instead of guessing', () => {
    expect(normalizeDocumentAddress('Tổ A, Xã Không Có, Huyện Không Có, Khánh Hòa')).toBeNull();
    const parsed = { fields: { ...EMPTY_FIELDS, placeOfResidence: 'Tổ A, Xã Không Có, Huyện Không Có, Khánh Hòa' }, confidence: {}, evidence: {} };
    expect(normalizeExtractedAddresses(parsed)).toEqual({});
    expect(parsed.fields.placeOfResidence).toBe('Tổ A, Xã Không Có, Huyện Không Có, Khánh Hòa');
  });
  it('recognizes a verified two-level 2025 ward and province without adding a district', () => {
    expect(normalizeDocumentAddress('Phường Bắc Nha Trang, Khánh Hòa')).toMatchObject({
      ward: 'Bắc Nha Trang', district: null, province: 'Khánh Hòa', districtCode: null,
    });
  });
  it('repairs OCR spelling errors in a three-level address using cross-checked hierarchy', () => {
    const address = normalizeDocumentAddress('Ấp A, X. Thun Thành, H. Càn Giuc, T. Long An');
    expect(address?.normalized).toBe('Ấp A, X. Thuận Thành, H. Cần Giuộc, T. Long An');
    expect(address?.districtCode).toBe('807');
  });
  it('repairs OCR accent errors in a two-level address with a street component', () => {
    const address = normalizeDocumentAddress('123 Lê Lợi, P. Bắc Nha Tràng, Khánh Hòa');
    expect(address?.normalized).toBe('123 Lê Lợi, P. Bắc Nha Trang, Khánh Hòa');
    expect(address?.district).toBeNull();
  });
  it('does not reinterpret an old three-level address as a new two-level address', () => {
    const address = normalizeDocumentAddress('Diên Thạnh, Diên Khánh, Khánh Hòa');
    expect(address).toMatchObject({ ward: 'Diên Thạnh', district: 'Diên Khánh', province: 'Khánh Hòa' });
    expect(normalizeDocumentAddress('Tổ 1, Không Rõ, Nha Trang, Khánh Hòa')).toBeNull();
  });
});
