import type { DocumentChoice, DocumentFields, DocumentType, FieldName, IdentityFields } from '../src/core/types';
import { normalizeDate } from '../src/utils/date';

export const IDENTITY_FIELD_NAMES: FieldName[] = [
  'idNumber',
  'fullName',
  'dateOfBirth',
  'sex',
  'nationality',
  'placeOfOrigin',
  'placeOfResidence',
  'dateOfIssue',
  'dateOfExpiry',
];
export const LICENSE_FIELD_NAMES: FieldName[] = [
  'licenseNumber', 'fullName', 'dateOfBirth', 'nationality', 'placeOfResidence',
  'dateOfIssue', 'licenseClass', 'dateOfExpiry', 'expiryStatus',
];
export function fieldsFor(type: DocumentType): FieldName[] {
  return type === 'vn.driver_license' ? LICENSE_FIELD_NAMES : IDENTITY_FIELD_NAMES;
}

export interface SavedSample {
  id: string;
  fileName: string;
  image: Blob;
  expected: DocumentFields;
  baseline: DocumentFields;
  documentType?: DocumentChoice;
  detectedType?: DocumentType;
  savedAt: string;
}

export function compareFields(actual: IdentityFields | DocumentFields, expected: IdentityFields | DocumentFields, type: DocumentType = 'vn.identity_card'): FieldName[] {
  return fieldsFor(type).filter((field) =>
    (actual as unknown as Record<string, string | null>)[field] !== (expected as unknown as Record<string, string | null>)[field]);
}

export function normalizeCorrectionDate(raw: string): string | null {
  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!iso) return normalizeDate(raw);
  const year = Number(iso[1]);
  const month = Number(iso[2]);
  const day = Number(iso[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  return year >= 1900 && year <= 2150 &&
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
    ? raw
    : null;
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function openFeedbackDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('vread-private-feedback', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('samples', { keyPath: 'id' });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function saveSample(sample: SavedSample): Promise<void> {
  const db = await openFeedbackDb();
  try {
    await requestResult(db.transaction('samples', 'readwrite').objectStore('samples').put(sample));
  } finally {
    db.close();
  }
}

export async function listSamples(): Promise<SavedSample[]> {
  const db = await openFeedbackDb();
  try {
    return await requestResult<SavedSample[]>(
      db.transaction('samples', 'readonly').objectStore('samples').getAll(),
    );
  } finally {
    db.close();
  }
}

export async function clearSamples(): Promise<void> {
  const db = await openFeedbackDb();
  try {
    await requestResult(db.transaction('samples', 'readwrite').objectStore('samples').clear());
  } finally {
    db.close();
  }
}
