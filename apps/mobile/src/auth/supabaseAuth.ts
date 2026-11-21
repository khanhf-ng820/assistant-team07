import { ApiError } from '../api/errors';
import type { AuthGateway, AuthSession } from './types';

export interface SupabaseAuthGatewayOptions {
  supabaseUrl: string;
  supabaseAnonKey: string;
  fetchImpl?: typeof fetch;
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

async function parseErrorMessage(response: Response): Promise<string> {
  try {
    const body: unknown = await response.json();
    if (body && typeof body === 'object') {
      const rec = body as Record<string, unknown>;
      if (typeof rec.error_description === 'string' && rec.error_description) {
        return rec.error_description;
      }
      if (typeof rec.msg === 'string' && rec.msg) return rec.msg;
      if (typeof rec.message === 'string' && rec.message) return rec.message;
    }
  } catch {
    // Ignore non-JSON auth errors.
  }
  return `Authentication failed (${response.status}).`;
}

export function createSupabaseAuthGateway(
  options: SupabaseAuthGatewayOptions
): AuthGateway {
  const fetchFn = options.fetchImpl ?? globalThis.fetch;
  const cleanUrl = options.supabaseUrl.replace(/\/+$/, '');

  function baseHeaders(): Record<string, string> {
    return {
      apikey: options.supabaseAnonKey,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    };
  }

  return {
    async signInWithPassword(email: string, password: string): Promise<AuthSession> {
      let response: Response;
      try {
        response = await fetchFn(`${cleanUrl}/auth/v1/token?grant_type=password`, {
          method: 'POST',
          headers: baseHeaders(),
          body: JSON.stringify({ email, password }),
        });
      } catch (err) {
        throw new ApiError({
          code: 'NETWORK_UNAVAILABLE',
          message: err instanceof Error ? err.message : 'Network error.',
          retryable: true,
          userMessage: 'Không thể kết nối dịch vụ đăng nhập. Kiểm tra mạng và thử lại.',
        });
      }

      if (!response.ok) {
        const message = await parseErrorMessage(response);
        throw new ApiError({
          code: response.status === 400 || response.status === 401 ? 'AUTH_INVALID_CREDENTIALS' : 'HTTP_ERROR',
          message,
          status: response.status,
          retryable: response.status >= 500,
          userMessage:
            response.status === 400 || response.status === 401
              ? 'Email hoặc mật khẩu chưa đúng.'
              : message,
        });
      }

      return parseSupabaseSession(await response.json(), Math.floor(Date.now() / 1000));
    },

    async refreshSession(refreshToken: string): Promise<AuthSession> {
      let response: Response;
      try {
        response = await fetchFn(`${cleanUrl}/auth/v1/token?grant_type=refresh_token`, {
          method: 'POST',
          headers: baseHeaders(),
          body: JSON.stringify({ refresh_token: refreshToken }),
        });
      } catch (err) {
        throw new ApiError({
          code: 'NETWORK_UNAVAILABLE',
          message: err instanceof Error ? err.message : 'Network error.',
          retryable: true,
        });
      }

      if (!response.ok) {
        const message = await parseErrorMessage(response);
        throw new ApiError({
          code: 'AUTH_TOKEN_EXPIRED',
          message,
          status: response.status,
          retryable: response.status >= 500,
          userMessage: 'Phiên đăng nhập đã hết hạn, vui lòng đăng nhập lại.',
        });
      }

      return parseSupabaseSession(await response.json(), Math.floor(Date.now() / 1000));
    },

    async signOut(accessToken: string): Promise<void> {
      try {
        await fetchFn(`${cleanUrl}/auth/v1/logout`, {
          method: 'POST',
          headers: {
            ...baseHeaders(),
            Authorization: `Bearer ${accessToken}`,
          },
        });
      } catch {
        // Local cleanup proceeds even when logout network call fails.
      }
    },
  };
}
