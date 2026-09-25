export type VReadErrorCode =
  'UNSUPPORTED_INPUT' | 'OCR_INITIALIZATION_FAILED' | 'OCR_FAILED' | 'UNSUPPORTED_DOCUMENT';
export class VReadError extends Error {
  constructor(
    public readonly code: VReadErrorCode,
    message: string,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'VReadError';
  }
}
