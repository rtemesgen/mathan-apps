export type NativeStoreErrorCode =
  | 'SCHEMA_INVALID'
  | 'RECORD_INVALID'
  | 'NATIVE_READ_FAILED'
  | 'NATIVE_WRITE_FAILED'
  | 'INITIALIZATION_FAILED';

export class NativeStoreError extends Error {
  readonly code: NativeStoreErrorCode;
  readonly cause?: unknown;

  constructor(code: NativeStoreErrorCode, message: string, cause?: unknown) {
    super(message);
    this.name = 'NativeStoreError';
    this.code = code;
    this.cause = cause;
  }
}

export function isNativeStoreError(error: unknown): error is NativeStoreError {
  return error instanceof NativeStoreError;
}
