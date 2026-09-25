import type { OCRLine } from '../ocr/types';
export type DocumentVersion = '2021' | '2024' | 'unknown';
export type DocumentSide = 'front' | 'back' | 'unknown';
export type DocumentType = 'vn.identity_card' | 'vn.driver_license' | 'unknown';
export type DocumentChoice = 'auto' | 'identity-card' | 'driver-license';
export type FieldName = keyof DocumentFields;
export interface IdentityFields {
  idNumber: string | null;
  fullName: string | null;
  dateOfBirth: string | null;
  sex: 'M' | 'F' | null;
  nationality: string | null;
  placeOfOrigin: string | null;
  placeOfResidence: string | null;
  dateOfIssue: string | null;
  dateOfExpiry: string | null;
}
export interface DocumentFields extends IdentityFields {
  licenseNumber: string | null;
  licenseClass: string | null;
  expiryStatus: 'indefinite' | null;
}
export interface FieldEvidence {
  source: 'ocr' | 'qr' | 'derived';
  rawText?: string;
  confidence?: number;
  box?: OCRLine['boundingBox'];
}
export interface QrResult {
  detected: boolean;
  raw?: string;
  parsed?: Partial<IdentityFields> | null;
}
export interface VReadResult {
  document: {
    type: DocumentType;
    version: DocumentVersion;
    side: DocumentSide;
    confidence: number;
  };
  fields: DocumentFields;
  confidence: Partial<Record<FieldName, number>>;
  evidence: Partial<Record<FieldName, FieldEvidence>>;
  qr: QrResult;
  ocrLines: OCRLine[];
  meta: {
    backend: 'wasm' | 'webgpu';
    imagePreprocessMs: number;
    qrMs: number;
    ocrMs: number;
    parseMs: number;
    totalMs: number;
  };
}
export type ImageInput = Blob | ImageData | HTMLImageElement | HTMLCanvasElement | ImageBitmap;
export interface ReaderOptions {
  backend?: 'wasm' | 'webgpu';
  documentType?: DocumentChoice;
  debug?: boolean;
  maxImageSide?: number;
}
export interface ReadOptions {
  documentType?: DocumentChoice;
  onProgress?: (stage: ReadProgressStage) => void;
}
export type ReadProgressStage =
  'preprocess' | 'qr' | 'ocr' | 'rotation' | 'parse' | 'vietnamese' | 'done';
export const EMPTY_FIELDS: DocumentFields = {
  idNumber: null,
  fullName: null,
  dateOfBirth: null,
  sex: null,
  nationality: null,
  placeOfOrigin: null,
  placeOfResidence: null,
  dateOfIssue: null,
  dateOfExpiry: null,
  licenseNumber: null,
  licenseClass: null,
  expiryStatus: null,
};
