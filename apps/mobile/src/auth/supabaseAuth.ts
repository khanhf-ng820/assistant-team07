import { ApiError } from '../api/errors';
import type { AuthGateway, AuthSession } from './types';

const AUTH_TIMEOUT_MS = 10_000;

export interface SupabaseAuthGatewayOptions {
  supabaseUrl: string;
  supabaseAnonKey: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

function parseSupabaseSession(body: unknown, fallbackNowSec: number): AuthSession {
  if (!body || typeof body !== 'object') {
    throw new ApiError({
      code: 'UNEXPECTED_RESPONSE',
      message: 'Unexpected Supabase auth response.',
      retryable: false,
      userMessage: 'Phản hồi xác thực không hợp lệ.',
    });
  }

  const obj = body as Record<string, unknown>;
  const accessToken = obj.access_token;
  const refreshToken = obj.refresh_token;
  const expiresAtRaw = obj.expires_at;
  const expiresInRaw = obj.expires_in;
  const userObj = obj.user;

  if (
    typeof accessToken !== 'string' || !accessToken ||
    typeof refreshToken !== 'string' || !refreshToken ||
    !userObj || typeof userObj !== 'object'
  ) {
    throw new ApiError({
      code: 'UNEXPECTED_RESPONSE',
      message: 'Missing tokens or user in Supabase response.',
      retryable: false,
      userMessage: 'Phản hồi xác thực thiếu thông tin phiên đăng nhập.',
    });
  }

  const user = userObj as Record<string, unknown>;
  if (typeof user.id !== 'string' || !user.id) {
    throw new ApiError({
      code: 'UNEXPECTED_RESPONSE',
      message: 'Missing user.id in Supabase response.',
      retryable: false,
      userMessage: 'Không xác định được danh tính sinh viên.',
    });
  }

  const expiresAt =
    typeof expiresAtRaw === 'number' && Number.isFinite(expiresAtRaw)
      ? expiresAtRaw
      : typeof expiresInRaw === 'number' && Number.isFinite(expiresInRaw)
        ? fallbackNowSec + expiresInRaw
        : fallbackNowSec + 3600;

  return {
    accessToken,
    refreshToken,
    expiresAt,
    user: {
      id: user.id,
      email: typeof user.email === 'string' ? user.email : null,
      role: typeof user.role === 'string' && user.role ? user.role : 'authenticated',
    },
  };
}

async function parseJsonSafe(response: Response): Promise<{ ok: true; data: unknown } | { ok: false }> {
  try {
    return { ok: true, data: await response.json() };
  } catch {
    return { ok: false };
  }
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

export function createSupabaseAuthGateway(
  options: SupabaseAuthGatewayOptions
): AuthGateway {
  const fetchFn = options.fetchImpl ?? globalThis.fetch;
  const cleanUrl = options.supabaseUrl.replace(/\/+$/, '');
  const timeoutMs = options.timeoutMs ?? AUTH_TIMEOUT_MS;

  function baseHeaders(extra?: Record<string, string>): Record<string, string> {
    return {
      apikey: options.supabaseAnonKey,
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...extra,
    };
  }

  async function postAuthJson(
    path: string,
    payload: unknown,
    mode: 'signin' | 'refresh'
  ): Promise<AuthSession> {
    const controller = new AbortController();
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, timeoutMs);

    let response: Response;
    try {
      response = await fetchFn(`${cleanUrl}${path}`, {
        method: 'POST',
        headers: baseHeaders(),
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
    } catch (err) {
      if (timedOut) {
        throw new ApiError({
          code: 'TIMEOUT',
          message: 'Authentication request timed out.',
          retryable: true,
          userMessage: 'Kết nối đăng nhập quá thời gian. Vui lòng thử lại.',
        });
      }
      throw new ApiError({
        code: 'NETWORK_UNAVAILABLE',
        message: err instanceof Error ? err.message : 'Network error.',
        retryable: true,
        userMessage: 'Không thể kết nối dịch vụ đăng nhập. Kiểm tra mạng và thử lại.',
      });
    } finally {
      clearTimeout(timer);
    }

    const parsed = await parseJsonSafe(response);
    if (!response.ok) {
      const message = extractAuthErrorMessage(parsed.ok ? parsed.data : undefined, response.status);
      const isTransient = response.status >= 500 || response.status === 429;
      if (mode === 'refresh') {
        throw new ApiError({
          code: isTransient ? 'SERVER_ERROR' : 'AUTH_TOKEN_EXPIRED',
          message,
          status: response.status,
          retryable: isTransient,
          userMessage: isTransient
            ? 'Dịch vụ xác thực đang bận, vui lòng thử lại sau.'
            : 'Phiên đăng nhập đã hết hạn, vui lòng đăng nhập lại.',
        });
      }
      const isCreds = response.status === 400 || response.status === 401;
      throw new ApiError({
        code: isCreds ? 'AUTH_INVALID_CREDENTIALS' : isTransient ? 'SERVER_ERROR' : 'HTTP_ERROR',
        message,
        status: response.status,
        retryable: isTransient,
        userMessage: isCreds
          ? 'Email hoặc mật khẩu chưa đúng.'
          : isTransient
            ? 'Dịch vụ xác thực đang bận, vui lòng thử lại sau.'
            : message,
      });
    }

    if (!parsed.ok) {
      throw new ApiError({
        code: 'UNEXPECTED_RESPONSE',
        message: 'Invalid JSON from authentication service.',
        status: response.status,
        retryable: false,
        userMessage: 'Phản hồi xác thực không hợp lệ.',
      });
    }

    return parseSupabaseSession(parsed.data, Math.floor(Date.now() / 1000));
  }

  return {
    signInWithPassword: (email, password) =>
      postAuthJson('/auth/v1/token?grant_type=password', { email, password }, 'signin'),

    refreshSession: (refreshToken) =>
      postAuthJson('/auth/v1/token?grant_type=refresh_token', { refresh_token: refreshToken }, 'refresh'),

    async signOut(accessToken: string): Promise<void> {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        await fetchFn(`${cleanUrl}/auth/v1/logout`, {
          method: 'POST',
          headers: baseHeaders({ Authorization: `Bearer ${accessToken}` }),
          signal: controller.signal,
        });
      } catch {
        // Local cleanup proceeds even when logout network call fails.
      } finally {
        clearTimeout(timer);
      }
    },
  };
}
