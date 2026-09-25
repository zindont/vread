import type { OCRLine } from '../ocr/types';
import type {
  DocumentSide,
  DocumentVersion,
  IdentityFields,
  QrResult,
  FieldEvidence,
  FieldName,
} from '../core/types';
export interface DetectionResult {
  type: 'vn.identity_card' | 'unknown';
  version: DocumentVersion;
  side: DocumentSide;
  confidence: number;
}
export interface ExtractionResult {
  fields: IdentityFields;
  confidence: Partial<Record<FieldName, number>>;
  evidence: Partial<Record<FieldName, FieldEvidence>>;
}
export interface DocumentAdapter {
  id: string;
  detect(lines: OCRLine[], qr: QrResult): DetectionResult;
  extract(lines: OCRLine[], detection: DetectionResult): ExtractionResult;
}
export class DocumentRegistry {
  private adapters: DocumentAdapter[] = [];
  register(adapter: DocumentAdapter): void {
    this.adapters.push(adapter);
  }
  detect(
    lines: OCRLine[],
    qr: QrResult,
  ): { adapter: DocumentAdapter | null; detection: DetectionResult } {
    const ranked = this.adapters
      .map((adapter) => ({ adapter, detection: adapter.detect(lines, qr) }))
      .sort((a, b) => b.detection.confidence - a.detection.confidence);
    return ranked[0] && ranked[0].detection.type !== 'unknown'
      ? ranked[0]
      : {
          adapter: null,
          detection: { type: 'unknown', version: 'unknown', side: 'unknown', confidence: 0 },
        };
  }
}
