import {
  ApiError,
  isApiError,
  localizeTransportError,
  normalizeSupabaseAuthError,
} from '../api/errors';
import { type HttpResponse, type HttpTransport, createFetchTransport } from '../api/transport';
import type { AuthGateway, AuthSession } from './types';

const AUTH_TIMEOUT_MS = 10_000;

export interface SupabaseAuthGatewayOptions {
  supabaseUrl: string;
  supabaseAnonKey: string;
  httpTransport?: HttpTransport;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  now?: () => number;
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

export function createSupabaseAuthGateway(
  options: SupabaseAuthGatewayOptions
): AuthGateway {
  const transport = options.httpTransport ?? createFetchTransport({ fetchImpl: options.fetchImpl });
  const cleanUrl = options.supabaseUrl.replace(/\/+$/, '');
  const timeoutMs = options.timeoutMs ?? AUTH_TIMEOUT_MS;
  const nowMs = options.now ?? Date.now;

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
    let response: HttpResponse;
    try {
      response = await transport.send({
        url: `${cleanUrl}${path}`,
        method: 'POST',
        headers: baseHeaders(),
        body: payload,
        timeoutMs,
      });
    } catch (err) {
      throw isApiError(err) ? localizeTransportError(err, 'auth') : err;
    }

    if (!response.ok) {
      throw normalizeSupabaseAuthError(
        response.status,
        response.body.ok ? response.body.data : undefined,
        mode
      );
    }

    if (!response.body.ok) {
      throw new ApiError({
        code: 'UNEXPECTED_RESPONSE',
        message: 'Invalid JSON from authentication service.',
        status: response.status,
        retryable: false,
        userMessage: 'Phản hồi xác thực không hợp lệ.',
      });
    }

    return parseSupabaseSession(response.body.data, Math.floor(nowMs() / 1000));
  }

  return {
    signInWithPassword: (email, password) =>
      postAuthJson('/auth/v1/token?grant_type=password', { email, password }, 'signin'),

    refreshSession: (refreshToken) =>
      postAuthJson('/auth/v1/token?grant_type=refresh_token', { refresh_token: refreshToken }, 'refresh'),

    async signOut(accessToken: string): Promise<void> {
      try {
        await transport.send({
          url: `${cleanUrl}/auth/v1/logout`,
          method: 'POST',
          headers: baseHeaders({ Authorization: `Bearer ${accessToken}` }),
          timeoutMs,
          parseJson: false,
        });
      } catch {
        // Local cleanup proceeds even when logout network call fails.
      }
    },
  };
}
