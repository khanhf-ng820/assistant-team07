export type ApiErrorCode =
  | 'CONFIG_MISSING'
  | 'NETWORK_UNAVAILABLE'
  | 'TIMEOUT'
  | 'ABORTED'
  | 'UNEXPECTED_RESPONSE'
  | 'AUTH_REQUIRED'
  | 'AUTH_INVALID_CREDENTIALS'
  | 'AUTH_TOKEN_EXPIRED'
  | 'AUTH_INVALID_TOKEN'
  | 'AUTH_SERVICE_UNAVAILABLE'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'BAD_REQUEST'
  | 'CONFLICT'
  | 'PAYLOAD_TOO_LARGE'
  | 'VALIDATION_ERROR'
  | 'RATE_LIMITED'
  | 'GATEWAY_TIMEOUT'
  | 'INTERNAL_ERROR'
  | 'SERVER_ERROR'
  | 'HTTP_ERROR'
  | 'VOICE_AUDIO_TOO_LARGE'
  | 'VOICE_UNSUPPORTED_MEDIA_TYPE'
  | 'VOICE_INVALID_AUDIO'
  | 'VOICE_DURATION_EXCEEDED'
  | 'VOICE_RATE_LIMITED'
  | 'VOICE_PARSER_UNAVAILABLE'
  | 'VOICE_PROVIDER_UNAVAILABLE'
  | 'VOICE_PROVIDER_ERROR'
  | 'VOICE_TIMEOUT'
  | 'STORAGE_READ_FAILED'
  | 'STORAGE_WRITE_FAILED'
  | 'STORAGE_CLEAR_FAILED';

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

export function isApiError(value: unknown): value is ApiError {
  return value instanceof ApiError;
}

export function isOfflineFallbackError(value: unknown): value is ApiError {
  return isApiError(value) && (value.code === 'NETWORK_UNAVAILABLE' || value.code === 'TIMEOUT');
}

export function createAbortedError(): ApiError {
  return new ApiError({
    code: 'ABORTED',
    message: 'Request cancelled.',
    retryable: false,
  });
}

const VIETNAMESE_CODE_MESSAGES: Record<string, string> = {
  AUTH_REQUIRED: 'Vui lòng đăng nhập để tiếp tục.',
  AUTH_INVALID_CREDENTIALS: 'Email hoặc mật khẩu chưa đúng.',
  AUTH_TOKEN_EXPIRED: 'Phiên đăng nhập đã hết hạn, vui lòng đăng nhập lại.',
  AUTH_INVALID_TOKEN: 'Phiên đăng nhập không hợp lệ, vui lòng đăng nhập lại.',
  AUTH_SERVICE_UNAVAILABLE: 'Dịch vụ xác thực tạm thời gián đoạn, vui lòng thử lại.',
  FORBIDDEN: 'Bạn không có quyền thực hiện thao tác này.',
  NOT_FOUND: 'Không tìm thấy dữ liệu yêu cầu.',
  BAD_REQUEST: 'Yêu cầu không hợp lệ.',
  CONFLICT: 'Dữ liệu xung đột với trạng thái hiện tại.',
  PAYLOAD_TOO_LARGE: 'Tệp âm thanh vượt quá giới hạn 2 MB.',
  VALIDATION_ERROR: 'Dữ liệu nhập chưa hợp lệ, vui lòng kiểm tra lại.',
  RATE_LIMITED: 'Bạn thao tác quá nhanh, vui lòng thử lại sau ít phút.',
  GATEWAY_TIMEOUT: 'Xử lý yêu cầu quá thời gian, vui lòng thử lại.',
  INTERNAL_ERROR: 'Máy chủ đang gặp sự cố, vui lòng thử lại sau.',
  SERVER_ERROR: 'Máy chủ đang bận, vui lòng thử lại sau.',
  VOICE_AUDIO_TOO_LARGE: 'Đoạn ghi âm vượt quá giới hạn 2 MB, vui lòng ghi ngắn hơn.',
  VOICE_UNSUPPORTED_MEDIA_TYPE: 'Định dạng âm thanh không được hỗ trợ.',
  VOICE_INVALID_AUDIO: 'Tệp ghi âm không hợp lệ hoặc bị hỏng, vui lòng thử lại.',
  VOICE_DURATION_EXCEEDED: 'Đoạn ghi âm vượt quá giới hạn 30 giây.',
  VOICE_RATE_LIMITED:
    'Bạn đã dùng hết lượt ghi âm hôm nay, vui lòng thử lại vào ngày mai hoặc nhập tay.',
  VOICE_PARSER_UNAVAILABLE:
    'Dịch vụ nhận diện giọng nói tạm thời chưa sẵn sàng, vui lòng thử lại hoặc nhập tay.',
  VOICE_PROVIDER_UNAVAILABLE:
    'Dịch vụ nhận diện giọng nói tạm thời gián đoạn, vui lòng thử lại hoặc nhập tay.',
  VOICE_PROVIDER_ERROR:
    'Dịch vụ nhận diện giọng nói gặp sự cố, vui lòng thử lại hoặc nhập tay.',
  VOICE_TIMEOUT: 'Xử lý giọng nói quá thời gian, vui lòng thử lại.',
  STORAGE_READ_FAILED: 'Không thể đọc phiên đăng nhập từ bộ nhớ bảo mật. Vui lòng thử lại.',
  STORAGE_WRITE_FAILED: 'Không thể lưu phiên đăng nhập vào bộ nhớ bảo mật. Vui lòng thử lại.',
  STORAGE_CLEAR_FAILED: 'Không thể xóa phiên đăng nhập khỏi bộ nhớ bảo mật. Vui lòng thử đăng xuất lại.',
};

const STORAGE_FALLBACK_MESSAGES: Record<
  'STORAGE_READ_FAILED' | 'STORAGE_WRITE_FAILED' | 'STORAGE_CLEAR_FAILED',
  string
> = {
  STORAGE_READ_FAILED: 'Failed to read persisted Auth Session.',
  STORAGE_WRITE_FAILED: 'Failed to persist Auth Session.',
  STORAGE_CLEAR_FAILED: 'Failed to clear persisted Auth Session.',
};

export function createStorageError(
  code: 'STORAGE_READ_FAILED' | 'STORAGE_WRITE_FAILED' | 'STORAGE_CLEAR_FAILED',
  cause?: unknown
): ApiError {
  return new ApiError({
    code,
    message: cause instanceof Error && cause.message ? cause.message : STORAGE_FALLBACK_MESSAGES[code],
    retryable: true,
    userMessage: VIETNAMESE_CODE_MESSAGES[code],
  });
}

function defaultCodeForStatus(status: number): ApiErrorCode {
  if (status === 400) return 'BAD_REQUEST';
  if (status === 401) return 'AUTH_REQUIRED';
  if (status === 403) return 'FORBIDDEN';
  if (status === 404) return 'NOT_FOUND';
  if (status === 409) return 'CONFLICT';
  if (status === 413) return 'PAYLOAD_TOO_LARGE';
  if (status === 422) return 'VALIDATION_ERROR';
  if (status === 429) return 'RATE_LIMITED';
  if (status === 504) return 'GATEWAY_TIMEOUT';
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

function extractAuthErrorMessage(body: unknown, status: number): string {
  if (body && typeof body === 'object') {
    const rec = body as Record<string, unknown>;
    if (typeof rec.error_description === 'string' && rec.error_description) {
      return rec.error_description;
    }
    if (typeof rec.msg === 'string' && rec.msg) return rec.msg;
    if (typeof rec.message === 'string' && rec.message) return rec.message;
  }
  return `Authentication failed (${status}).`;
}

export function normalizeSupabaseAuthError(
  status: number,
  body: unknown,
  operation: 'signin' | 'refresh'
): ApiError {
  const message = extractAuthErrorMessage(body, status);
  const isTransient = status >= 500 || status === 429;

  if (operation === 'refresh') {
    return new ApiError({
      code: isTransient ? 'SERVER_ERROR' : 'AUTH_TOKEN_EXPIRED',
      message,
      status,
      retryable: isTransient,
      userMessage: isTransient
        ? 'Dịch vụ xác thực đang bận, vui lòng thử lại sau.'
        : VIETNAMESE_CODE_MESSAGES.AUTH_TOKEN_EXPIRED,
    });
  }

  const isCreds = status === 400 || status === 401;
  return new ApiError({
    code: isCreds ? 'AUTH_INVALID_CREDENTIALS' : isTransient ? 'SERVER_ERROR' : 'HTTP_ERROR',
    message,
    status,
    retryable: isTransient,
    userMessage: isCreds
      ? VIETNAMESE_CODE_MESSAGES.AUTH_INVALID_CREDENTIALS
      : isTransient
        ? 'Dịch vụ xác thực đang bận, vui lòng thử lại sau.'
        : message,
  });
}

const TRANSPORT_SCOPE_MESSAGES: Record<'backend' | 'auth', Partial<Record<'TIMEOUT' | 'NETWORK_UNAVAILABLE', string>>> = {
  backend: {
    TIMEOUT: 'Kết nối quá thời gian. Vui lòng thử lại.',
    NETWORK_UNAVAILABLE: 'Không thể kết nối máy chủ. Kiểm tra mạng LAN và thử lại.',
  },
  auth: {
    TIMEOUT: 'Kết nối đăng nhập quá thời gian. Vui lòng thử lại.',
    NETWORK_UNAVAILABLE: 'Không thể kết nối dịch vụ đăng nhập. Kiểm tra mạng và thử lại.',
  },
};

export function localizeTransportError(error: ApiError, scope: 'backend' | 'auth'): ApiError {
  if (error.code !== 'TIMEOUT' && error.code !== 'NETWORK_UNAVAILABLE') {
    return error;
  }
  const userMessage = TRANSPORT_SCOPE_MESSAGES[scope][error.code];
  if (!userMessage) return error;
  return new ApiError({
    code: error.code,
    message: error.message,
    status: error.status,
    requestId: error.requestId,
    retryable: error.retryable,
    userMessage,
  });
}
