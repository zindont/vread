import { describe, expect, it } from 'vitest';
import { classifyIdentity } from '../src/documents/identity-card/classify';
import { extractFields } from '../src/documents/identity-card/parsers/front';
import type { OCRLine } from '../src/ocr/types';
import { parseVietnamIdQr } from '../src/qr/vietnam-id';
import { identityCardAdapter } from '../src/documents/identity-card';
function line(text: string, y: number, x = 10): OCRLine {
  return {
    text,
    confidence: 0.96,
    polygon: [
      { x, y },
      { x: x + 220, y },
      { x: x + 220, y: y + 20 },
      { x, y: y + 20 },
    ],
    boundingBox: { x, y, width: 220, height: 20 },
  };
}
const front2021 = [
  line('CĂN CƯỚC CÔNG DÂN', 0),
  line('Số / No: 079091001234', 30),
  line('Họ và tên / Full name', 60),
  line('NGUYỄN VĂN A', 83),
  line('Ngày sinh / Date of birth', 110),
  line('01/01/1991', 133),
  line('Giới tính / Sex', 160),
  line('Nam', 183),
  line('Quốc tịch / Nationality', 210),
  line('Việt Nam', 233),
  line('Quê quán / Place of origin', 260),
  line('Hà Nội', 283),
  line('Nơi thường trú / Place of residence', 310),
  line('Hà Nội, Việt Nam', 333),
  line('Có giá trị đến / Valid until', 360),
  line('01/01/2031', 383),
];
describe('identity card parser', () => {
  it('extracts CCCD 2021 front fields', () => {
    const d = classifyIdentity(front2021, { detected: false });
    expect(d).toMatchObject({ type: 'vn.identity_card', version: '2021', side: 'front' });
    expect(extractFields(front2021).fields).toMatchObject({
      idNumber: '079091001234',
      fullName: 'NGUYỄN VĂN A',
      dateOfBirth: '1991-01-01',
      sex: 'M',
      nationality: 'VN',
      placeOfOrigin: 'Hà Nội',
      placeOfResidence: 'Hà Nội, Việt Nam',
      dateOfExpiry: '2031-01-01',
      dateOfIssue: null,
    });
    expect(Object.keys(extractFields(front2021).fields).sort()).toEqual(
      [
        'idNumber',
        'fullName',
        'dateOfBirth',
        'sex',
        'nationality',
        'placeOfOrigin',
        'placeOfResidence',
        'dateOfIssue',
        'dateOfExpiry',
      ].sort(),
    );
  });
  it('does not classify a back-only image as a front', () => {
    const lines = [
      line('CĂN CƯỚC CÔNG DÂN', 0),
      line('Đặc điểm nhận dạng', 30),
      line('Ngày cấp / Date of issue', 60),
      line('01/01/2021', 83),
      line('Nơi cấp / Issuing authority', 110),
    ];
    expect(classifyIdentity(lines, { detected: false }).type).toBe('unknown');
  });
  it('extracts 2024 front and rejects back-only input', () => {
    const front = [
      line('CĂN CƯỚC', 0),
      line('Số định danh cá nhân: 079091001234', 20),
      line('Họ, chữ đệm và tên khai sinh', 30),
      line('NGUYỄN VĂN A', 53),
      line('Ngày tháng năm sinh', 80),
      line('01/01/1991', 103),
      line('Giới tính', 130),
      line('Nam', 153),
      line('Quốc tịch', 180),
      line('Việt Nam', 203),
      line('Quê quán', 230),
      line('Hà Nội', 253),
      line('Nơi cư trú', 280),
      line('Hà Nội, Việt Nam', 303),
      line('Có giá trị đến', 330),
      line('01/01/2031', 353),
    ];
    expect(classifyIdentity(front, { detected: false })).toMatchObject({
      version: '2024',
      side: 'front',
    });
    expect(extractFields(front).fields).toMatchObject({
      idNumber: '079091001234',
      fullName: 'NGUYỄN VĂN A',
      dateOfBirth: '1991-01-01',
      sex: 'M',
      nationality: 'VN',
      placeOfOrigin: 'Hà Nội',
      placeOfResidence: 'Hà Nội, Việt Nam',
      dateOfIssue: null,
      dateOfExpiry: '2031-01-01',
    });
    expect(
      identityCardAdapter.extract(front, classifyIdentity(front, { detected: false })).fields,
    ).toMatchObject({ fullName: null, placeOfOrigin: null, placeOfResidence: null });
    const back = [
      line('CĂN CƯỚC', 0),
      line('Nơi cư trú', 30),
      line('Hà Nội, Việt Nam', 53),
      line('Ngày cấp', 80),
      line('01/01/2024', 103),
      line('Đặc điểm nhận dạng', 130),
    ];
    expect(classifyIdentity(back, { detected: false }).type).toBe('unknown');
  });
  it('normalizes numeric OCR mistakes, dates, and unaccented name', () => {
    const lines = [
      line('CĂN CƯỚC CÔNG DÂN', 0),
      line('Số: 079O91OO1234', 30),
      line('Họ và tên', 60),
      line('NGUYEN VAN A', 83),
      line('Ngày sinh', 110),
      line('O1/O1/1991', 133),
    ];
    expect(extractFields(lines).fields).toMatchObject({
      idNumber: '079091001234',
      fullName: 'NGUYEN VAN A',
      dateOfBirth: '1991-01-01',
    });
  });
  it('recognizes noisy OCR labels without inventing sex from Việt Nam', () => {
    const lines = [
      line('CN CUOC CONG DN', 0),
      line('Ho va ten / Fut name', 30),
      line('NGUYEN VAN A', 53),
      line('Que tich / Nasiya', 80),
      line('Viet Nam', 103),
      line('Gidi tinh / Sex', 130),
      line('NO', 153),
    ];
    expect(classifyIdentity(lines, { detected: false })).toMatchObject({
      version: '2021',
      side: 'front',
    });
    expect(extractFields(lines).fields).toMatchObject({ nationality: 'VN', sex: null });
  });
  it('extracts both values when sex and nationality share one OCR line', () => {
    const lines = [
      line('Giới tính / Sex: Nam Quốc tịch / Nationality: Việt Nam', 160),
    ];
    const parsed = extractFields(lines);
    expect(parsed.fields.sex).toBe('M');
    expect(parsed.fields.nationality).toBe('VN');
    expect(parsed.evidence.sex?.rawText).toBe('Nam');
    expect(parsed.evidence.nationality?.rawText).toBe('Việt Nam');
  });
  it('extracts female sex from a shared OCR line without reading the nationality as sex', () => {
    const lines = [line('Giới tính / Sex: Nữ Quốc tịch / Nationality: Việt Nam', 160)];
    expect(extractFields(lines).fields).toMatchObject({ sex: 'F', nationality: 'VN' });
  });
  it('does not classify a back MRZ as a front', () => {
    const lines = [line('IDVNM1234567890123456789012<<5', 0), line('NGON TRO TRAI', 30)];
    expect(classifyIdentity(lines, { detected: false }).type).toBe('unknown');
  });
  it('takes an inline DOB from the front of a combined scan', () => {
    const lines = [
      line('CAN CUOC CONG DAN', 0),
      line('Ho va ten / Full name', 30),
      line('NGUYN VAN A', 53),
      line('Ngay sinh / Date of birth 01/01/1991', 80),
      line('Dac diem nhan dang', 130),
      line('Ngay cap 02/01/2025', 155),
    ];
    const detection = identityCardAdapter.detect(lines, { detected: false });
    const parsed = identityCardAdapter.extract(lines, detection);
    expect(parsed.fields).toMatchObject({ fullName: null, dateOfBirth: '1991-01-01' });
    expect(parsed.evidence.fullName?.rawText).toBe('NGUYN VAN A');
    expect(parsed.fields.dateOfIssue).toBeNull();
  });
  it('withholds an unreadable tiny name but preserves its raw OCR evidence', () => {
    const lines = [
      line('CĂN CƯỚC CÔNG DÂN', 0),
      line('Họ và tên', 30),
      { ...line('NGUYN THI HNG NHUNG', 53), boundingBox: { x: 10, y: 53, width: 180, height: 13 } },
      line('Ngày sinh 22/01/1985', 80),
    ];
    const parsed = identityCardAdapter.extract(
      lines,
      identityCardAdapter.detect(lines, { detected: false }),
    );
    expect(parsed.fields.fullName).toBeNull();
    expect(parsed.evidence.fullName?.rawText).toBe('NGUYN THI HNG NHUNG');
    expect(parsed.fields.dateOfBirth).toBe('1985-01-22');
  });
  it('withholds an OCR-only unaccented name even when its text box is large', () => {
    const lines = [
      line('CĂN CƯỚC CÔNG DÂN', 0),
      line('Họ và tên', 30),
      line('NGUYEN VAN A', 53),
      line('Ngày sinh 01/01/1991', 80),
    ];
    const parsed = identityCardAdapter.extract(
      lines,
      identityCardAdapter.detect(lines, { detected: false }),
    );
    expect(parsed.fields.fullName).toBeNull();
    expect(parsed.evidence.fullName?.rawText).toBe('NGUYEN VAN A');
  });
  it('withholds tiny Vietnamese address lines and preserves their OCR evidence', () => {
    const lines = [
      line('CĂN CƯỚC CÔNG DÂN', 0),
      line('Họ và tên', 30),
      line('NGUYỄN VĂN A', 53),
      line('Ngày sinh 01/01/1991', 80),
      line('Quê quán', 110),
      { ...line('Hoa Lu, Ninh Binh', 133), boundingBox: { x: 10, y: 133, width: 160, height: 13 } },
      line('Nơi thường trú', 160),
      {
        ...line('Khánh Xun, TP Bun Ma Thut', 183),
        boundingBox: { x: 10, y: 183, width: 180, height: 13 },
      },
    ];
    const parsed = identityCardAdapter.extract(
      lines,
      identityCardAdapter.detect(lines, { detected: false }),
    );
    expect(parsed.fields.placeOfOrigin).toBeNull();
    expect(parsed.fields.placeOfResidence).toBeNull();
    expect(parsed.evidence.placeOfOrigin?.rawText).toBe('Hoa Lu, Ninh Binh');
    expect(parsed.evidence.placeOfResidence?.rawText).toBe('Khánh Xun, TP Bun Ma Thut');
  });
  it('does not fabricate fields for unknown images', () => {
    const lines = [line('Coffee menu', 0), line('Price 100000', 30)];
    expect(classifyIdentity(lines, { detected: false }).type).toBe('unknown');
  });
});
describe('QR', () => {
  it('parses the common seven-part format', () => {
    expect(
      parseVietnamIdQr('079091001234|123456789|NGUYEN VAN A|01/01/1991|Nam|Ha Noi|01/01/2021'),
    ).toMatchObject({ idNumber: '079091001234', dateOfBirth: '1991-01-01', sex: 'M' });
  });
  it('leaves uncertain formats unparsed', () => {
    expect(parseVietnamIdQr('some other payload')).toBeNull();
  });
});
