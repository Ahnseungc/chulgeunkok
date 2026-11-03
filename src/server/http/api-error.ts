import { ERROR_CODES, type ErrorCode } from './error-codes';

/** 라우트 핸들러에서 throw 하면 `defineRoute`가 공통 포맷 응답으로 바꾼다. */
export class ApiError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly details?: unknown;

  constructor(code: ErrorCode, options: { message?: string; details?: unknown } = {}) {
    super(options.message ?? ERROR_CODES[code].message);
    this.name = 'ApiError';
    this.code = code;
    this.status = ERROR_CODES[code].status;
    this.details = options.details;
  }
}

export interface ApiErrorBody {
  error: { code: ErrorCode; message: string; details?: unknown };
}

/** 스캐폴드 단계 라우트의 자리표시자. 구현 시 지운다. */
export function notImplemented(): never {
  throw new ApiError('NOT_IMPLEMENTED');
}
