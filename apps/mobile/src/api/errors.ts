export type ApiErrorCode =
  | 'CONFIG_MISSING'
  | 'NETWORK_UNAVAILABLE'
  | 'TIMEOUT'
  | 'ABORTED'
  | 'UNEXPECTED_RESPONSE'
  | 'AUTH_REQUIRED'
  | 'AUTH_TOKEN_EXPIRED'
  | 'AUTH_INVALID_TOKEN'
  | 'AUTH_SERVICE_UNAVAILABLE'
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

const VIETNAMESE_CODE_MESSAGES: Record<string, string> = {
  AUTH_REQUIRED: 'Vui lòng đăng nhập để tiếp tục.',
  AUTH_TOKEN_EXPIRED: 'Phiên đăng nhập đã hết hạn, vui lòng đăng nhập lại.',
  AUTH_INVALID_TOKEN: 'Phiên đăng nhập không hợp lệ, vui lòng đăng nhập lại.',
  AUTH_SERVICE_UNAVAILABLE: 'Dịch vụ xác thực tạm thời gián đoạn, vui lòng thử lại.',
  FORBIDDEN: 'Bạn không có quyền thực hiện thao tác này.',
  NOT_FOUND: 'Không tìm thấy dữ liệu yêu cầu.',
  BAD_REQUEST: 'Yêu cầu không hợp lệ.',
  CONFLICT: 'Dữ liệu xung đột với trạng thái hiện tại.',
  VALIDATION_ERROR: 'Dữ liệu nhập chưa hợp lệ, vui lòng kiểm tra lại.',
  RATE_LIMITED: 'Bạn thao tác quá nhanh, vui lòng thử lại sau ít phút.',
  INTERNAL_ERROR: 'Máy chủ đang gặp sự cố, vui lòng thử lại sau.',
  SERVER_ERROR: 'Máy chủ đang bận, vui lòng thử lại sau.',
};

function defaultCodeForStatus(status: number): ApiErrorCode {
  if (status === 400) return 'BAD_REQUEST';
  if (status === 401) return 'AUTH_REQUIRED';
  if (status === 403) return 'FORBIDDEN';
  if (status === 404) return 'NOT_FOUND';
  if (status === 409) return 'CONFLICT';
  if (status === 422) return 'VALIDATION_ERROR';
  if (status === 429) return 'RATE_LIMITED';
  if (status === 503) return 'SERVER_ERROR';
  if (status >= 500) return 'SERVER_ERROR';
  return 'HTTP_ERROR';
}

function localizedUserMessage(code: string, status: number, fields?: string): string {
  if (code === 'VALIDATION_ERROR' && fields) {
    return `Dữ liệu không hợp lệ (${fields}). Vui lòng kiểm tra lại.`;
  }
  return (
    VIETNAMESE_CODE_MESSAGES[code] ??
    (status >= 500 || status === 429
      ? 'Máy chủ đang bận, vui lòng thử lại sau.'
      : 'Không thể hoàn tất yêu cầu.')
  );
}

function parseValidationDetails(items: unknown[]): { message: string; fields?: string } {
  const fieldsList = items
    .map((item) => {
      if (!item || typeof item !== 'object') return '';
      const loc = 'loc' in item && Array.isArray(item.loc)
        ? item.loc.filter((part) => part !== 'body').join('.')
        : '';
      return loc;
    })
    .filter(Boolean);

  const first = items[0];
  let message = 'Request validation failed';
  if (first && typeof first === 'object' && 'msg' in first && typeof first.msg === 'string') {
    const firstField = fieldsList[0] ?? '';
    message = firstField ? `${firstField}: ${first.msg}` : first.msg;
  }
  return {
    message,
    fields: fieldsList.length > 0 ? fieldsList.slice(0, 3).join(', ') : undefined,
  };
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
        userMessage: localizedUserMessage(code, status),
      });
    }

    if ('detail' in body) {
      const detail = (body as { detail: unknown }).detail;
      if (typeof detail === 'string' && detail) {
        const code = defaultCodeForStatus(status);
        return new ApiError({
          code,
          message: detail,
          status,
          requestId: headerRequestId,
          retryable,
          userMessage: localizedUserMessage(code, status),
        });
      }
      if (Array.isArray(detail)) {
        const parsed = parseValidationDetails(detail);
        const code = status === 422 ? 'VALIDATION_ERROR' : defaultCodeForStatus(status);
        return new ApiError({
          code,
          message: parsed.message,
          status,
          requestId: headerRequestId,
          retryable,
          userMessage: localizedUserMessage(code, status, parsed.fields),
        });
      }
    }
  }

  const code = defaultCodeForStatus(status);
  return new ApiError({
    code,
    message: `Request failed (${status})`,
    status,
    requestId: headerRequestId,
    retryable,
    userMessage: localizedUserMessage(code, status),
  });
}
