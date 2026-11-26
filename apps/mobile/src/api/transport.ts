import { ApiError, createAbortedError } from './errors';

export type HttpMethod = 'GET' | 'POST' | 'PATCH' | 'DELETE';

export interface HttpRequest {
  readonly url: string;
  readonly method: HttpMethod;
  readonly headers?: Readonly<Record<string, string>>;
  readonly body?: unknown;
  readonly timeoutMs: number;
  readonly signal?: AbortSignal;
  readonly parseJson?: boolean;
}

export interface HttpResponse {
  readonly ok: boolean;
  readonly status: number;
  readonly requestId?: string;
  readonly body:
    | { readonly ok: true; readonly data: unknown }
    | { readonly ok: false };
}

export interface HttpTransport {
  send: (request: HttpRequest) => Promise<HttpResponse>;
}

export interface FetchTransportOptions {
  readonly fetchImpl?: typeof fetch;
}

export function createFetchTransport(options: FetchTransportOptions = {}): HttpTransport {
  return {
    async send(request: HttpRequest): Promise<HttpResponse> {
      if (request.signal?.aborted) {
        throw createAbortedError();
      }

      // Resolve globalThis.fetch lazily so Jest spies attach even after runtime creation.
      const fetchFn = options.fetchImpl ?? globalThis.fetch;
      const controller = new AbortController();
      let timedOut = false;
      const timer = setTimeout(() => {
        timedOut = true;
        controller.abort();
      }, request.timeoutMs);

      const onCallerAbort = () => controller.abort();
      request.signal?.addEventListener('abort', onCallerAbort, { once: true });

      try {
        let response: Response;
        try {
          response = await fetchFn(request.url, {
            method: request.method,
            headers: request.headers ? { ...request.headers } : undefined,
            body: request.body !== undefined ? JSON.stringify(request.body) : undefined,
            signal: controller.signal,
          });
        } catch (err) {
          if (timedOut) {
            throw new ApiError({
              code: 'TIMEOUT',
              message: 'Request timed out.',
              retryable: true,
            });
          }
          if (request.signal?.aborted) {
            throw createAbortedError();
          }
          throw new ApiError({
            code: 'NETWORK_UNAVAILABLE',
            message: err instanceof Error ? err.message : 'Network unavailable.',
            retryable: true,
          });
        }

        const requestId = response.headers?.get?.('X-Request-ID') ?? undefined;
        if (request.parseJson === false) {
          return {
            ok: response.ok,
            status: response.status,
            requestId,
            body: { ok: false },
          };
        }

        let body: { readonly ok: true; readonly data: unknown } | { readonly ok: false };
        try {
          body = { ok: true, data: await response.json() };
        } catch {
          if (timedOut) {
            throw new ApiError({
              code: 'TIMEOUT',
              message: 'Request timed out.',
              retryable: true,
            });
          }
          if (request.signal?.aborted) {
            throw createAbortedError();
          }
          body = { ok: false };
        }

        if (request.signal?.aborted) {
          throw createAbortedError();
        }

        return {
          ok: response.ok,
          status: response.status,
          requestId,
          body,
        };
      } finally {
        clearTimeout(timer);
        request.signal?.removeEventListener('abort', onCallerAbort);
      }
    },
  };
}
