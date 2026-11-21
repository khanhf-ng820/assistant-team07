export type ApiErrorCode =
  | 'CONFIG_MISSING'
  | 'NETWORK_UNAVAILABLE'
  | 'TIMEOUT'
  | 'ABORTED'
  | 'UNEXPECTED_RESPONSE'
  | 'AUTH_REQUIRED'
  | 'AUTH_TOKEN_EXPIRED'
  | 'AUTH_INVALID_TOKEN'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'BAD_REQUEST'
  | 'CONFLICT'
  | 'VALIDATION_ERROR'
  | 'RATE_LIMITED'
  | 'INTERNAL_ERROR'
  | 'SERVER_ERROR'
  | 'HTTP_ERROR';

export interface ApiErrorOptions {
  code: ApiErrorCode | (string & {});
  message: string;
  status?: number;
  requestId?: string;
  retryable: boolean;
  userMessage?: string;
}

export class ApiError extends Error {
  readonly code: string;
  readonly status?: number;
  readonly requestId?: string;
  readonly retryable: boolean;
  readonly userMessage: string;

  constructor(options: ApiErrorOptions) {
    super(options.message);
    this.name = 'ApiError';
    this.code = options.code;
    this.status = options.status;
    this.requestId = options.requestId;
    this.retryable = options.retryable;
    this.userMessage = options.userMessage ?? options.message;
  }
}

function defaultCodeForStatus(status: number): ApiErrorCode {
  if (status === 400) return 'BAD_REQUEST';
  if (status === 401) return 'AUTH_REQUIRED';
  if (status === 403) return 'FORBIDDEN';
  if (status === 404) return 'NOT_FOUND';
  if (status === 409) return 'CONFLICT';
  if (status === 422) return 'VALIDATION_ERROR';
  if (status === 429) return 'RATE_LIMITED';
  if (status >= 500) return 'SERVER_ERROR';
  return 'HTTP_ERROR';
}

function formatFastApiValidationDetail(items: unknown[]): string {
  const first = items[0];
  if (first && typeof first === 'object' && 'msg' in first && typeof first.msg === 'string') {
    const loc = 'loc' in first && Array.isArray(first.loc)
      ? first.loc.filter((part) => part !== 'body').join('.')
      : '';
    return loc ? `${loc}: ${first.msg}` : first.msg;
  }
  return 'Dữ liệu gửi lên không hợp lệ.';
}

export function normalizeHttpError(
  status: number,
  body: unknown,
  headerRequestId?: string
): ApiError {
  const retryable = status >= 500 || status === 429;

  if (body && typeof body === 'object') {
    if ('error' in body && body.error && typeof body.error === 'object') {
      const errObj = body.error as Record<string, unknown>;
      const code =
        typeof errObj.code === 'string' && errObj.code ? errObj.code : defaultCodeForStatus(status);
      const message =
        typeof errObj.message === 'string' && errObj.message
          ? errObj.message
          : `Request failed (${status})`;
      const requestId =
        typeof errObj.request_id === 'string' && errObj.request_id
          ? errObj.request_id
          : headerRequestId;
      return new ApiError({
        code,
        message,
        status,
        requestId,
        retryable,
        userMessage: message,
      });
    }

    if ('detail' in body) {
      const detail = (body as { detail: unknown }).detail;
      if (typeof detail === 'string' && detail) {
        return new ApiError({
          code: defaultCodeForStatus(status),
          message: detail,
          status,
          requestId: headerRequestId,
          retryable,
          userMessage: detail,
        });
      }
      if (Array.isArray(detail)) {
        const message = formatFastApiValidationDetail(detail);
        return new ApiError({
          code: status === 422 ? 'VALIDATION_ERROR' : defaultCodeForStatus(status),
          message,
          status,
          requestId: headerRequestId,
          retryable,
          userMessage: message,
        });
      }
    }
  }

  return new ApiError({
    code: defaultCodeForStatus(status),
    message: `Request failed (${status})`,
    status,
    requestId: headerRequestId,
    retryable,
    userMessage: retryable
      ? 'Máy chủ đang bận, vui lòng thử lại sau.'
      : 'Không thể hoàn tất yêu cầu.',
  });
}
