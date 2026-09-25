import { describe, expect, it } from 'vitest';
import type { OCRLine } from '../src/ocr/types';
import { classifyDriverLicense, extractDriverLicense } from '../src/documents/driver-license';
import { classifyIdentity } from '../src/documents/identity-card/classify';
import { DocumentRegistry } from '../src/documents/registry';
import { driverLicenseAdapter } from '../src/documents/driver-license';
import { identityCardAdapter } from '../src/documents/identity-card';

function line(text: string, x: number, y: number): OCRLine {
  return { text, confidence: 0.92, polygon: [], boundingBox: { x, y, width: Math.max(75, text.length * 6), height: 20 } };
}
const qr = { detected: false };
const license = [
  line("GIẤY PHÉP LÁI XE/DRIVER'S LICENSE", 150, 50),
  line('Số/No: 123456789012', 230, 80),
  line('Họ tên/Full name:', 150, 110), line('NGUYEN VAN A', 330, 110),
  line('Ngày sinh/Date of Birth:', 150, 140), line('01/02/1990', 340, 140),
  line('Quốc tịch/Nationality:', 150, 170), line('VIET NAM', 340, 170),
  line('Nơi cư trú/Address:', 150, 200), line('Phuong A', 340, 200),
  line('Q. B, TP. C', 200, 225),
  line('ngày 14 tháng 03 năm 2014', 180, 250),
  line('Hạng/Class: A1', 5, 285),
  line('Có giá trị đến/Expires: Không thời hạn', 5, 320),
];

describe('driver license adapter', () => {
  it('auto detects license ahead of the shared 12-digit identity number', () => {
    const registry = new DocumentRegistry();
    registry.register(identityCardAdapter);
    registry.register(driverLicenseAdapter);
    expect(registry.detect(license, qr).detection.type).toBe('vn.driver_license');
    expect(classifyIdentity(license, qr).type).toBe('unknown');
    expect(classifyDriverLicense(license, qr).side).toBe('front');
  });
  it('extracts every supported structured field and preserves uncertain Vietnamese text', () => {
    const result = extractDriverLicense(license);
    expect(result.fields).toMatchObject({
      idNumber: null, licenseNumber: '123456789012', fullName: null,
      dateOfBirth: '1990-02-01', sex: null, nationality: 'VN',
      placeOfOrigin: null, placeOfResidence: null,
      dateOfIssue: '2014-03-14', dateOfExpiry: null,
      licenseClass: 'A1', expiryStatus: 'indefinite',
    });
    expect(result.evidence.fullName?.rawText).toBe('NGUYEN VAN A');
    expect(result.evidence.placeOfResidence?.rawText).toContain('Q. B, TP. C');
  });
  it('rejects pages without license anchors', () => {
    expect(classifyDriverLicense([line('Date of Birth: 01/02/1990', 0, 0)], qr).type).toBe('unknown');
  });
});
