import { ApiError } from '../src/api/errors';
import { createFetchTransport } from '../src/api/transport';

function makeResponse(
  body: unknown,
  status = 200,
  headers: Record<string, string> = {},
  jsonThrows = false
) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: {
      get: (name: string) => {
        const lower = name.toLowerCase();
        for (const [k, v] of Object.entries(headers)) {
          if (k.toLowerCase() === lower) return v;
        }
        return null;
      },
    },
    json: async () => {
      if (jsonThrows) throw new SyntaxError('Invalid JSON');
      return body;
    },
  } as unknown as Response;
}

describe('createFetchTransport', () => {
  afterEach(() => {
    jest.restoreAllMocks();
    jest.useRealTimers();
  });

  it('sends requests, parses JSON, and extracts X-Request-ID', async () => {
    const fetchMock = jest.fn(async () =>
      makeResponse({ ok: true }, 200, { 'x-request-id': 'req-42' })
    );
    const transport = createFetchTransport({ fetchImpl: fetchMock as unknown as typeof fetch });

    const res = await transport.send({
      url: 'http://example.test/health',
      method: 'GET',
      headers: { Accept: 'application/json' },
      timeoutMs: 5000,
    });

    expect(res).toEqual({
      ok: true,
      status: 200,
      requestId: 'req-42',
      body: { ok: true, data: { ok: true } },
    });
  });

  it('skips JSON parsing when parseJson is false and handles malformed JSON gracefully', async () => {
    const jsonSpy = jest.fn(async () => ({ ignored: true }));
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 204,
        headers: { get: () => null },
        json: jsonSpy,
      } as unknown as Response)
      .mockResolvedValueOnce(makeResponse(null, 200, {}, true));

    const transport = createFetchTransport({ fetchImpl: fetchMock as unknown as typeof fetch });

    const empty = await transport.send({
      url: 'http://example.test/logout',
      method: 'POST',
      timeoutMs: 5000,
      parseJson: false,
    });
    expect(empty.body).toEqual({ ok: false });
    expect(jsonSpy).not.toHaveBeenCalled();

    const invalid = await transport.send({
      url: 'http://example.test/bad',
      method: 'GET',
      timeoutMs: 5000,
    });
    expect(invalid.body).toEqual({ ok: false });
  });

  it('resolves globalThis.fetch lazily so Jest spies attach after creation', async () => {
    const transport = createFetchTransport();
    const spy = jest.spyOn(globalThis, 'fetch').mockResolvedValueOnce(makeResponse({ lazy: true }));

    const res = await transport.send({
      url: 'http://example.test/lazy',
      method: 'GET',
      timeoutMs: 5000,
    });

    expect(spy).toHaveBeenCalledTimes(1);
    expect(res.body).toEqual({ ok: true, data: { lazy: true } });
  });

  it('maps pre-aborted signals, mid-flight aborts, timeouts, and network drops cleanly', async () => {
    const transport = createFetchTransport({
      fetchImpl: (async () => {
        throw new TypeError('Network dropped');
      }) as unknown as typeof fetch,
    });

    await expect(
      transport.send({ url: 'http://example.test', method: 'GET', timeoutMs: 1000 })
    ).rejects.toMatchObject({
      code: 'NETWORK_UNAVAILABLE',
      retryable: true,
    });

    const preAborted = new AbortController();
    preAborted.abort();
    await expect(
      transport.send({
        url: 'http://example.test',
        method: 'GET',
        timeoutMs: 1000,
        signal: preAborted.signal,
      })
    ).rejects.toMatchObject({
      code: 'ABORTED',
      retryable: false,
    });

    jest.useFakeTimers();
    const hangingTransport = createFetchTransport({
      fetchImpl: ((_url: RequestInfo | URL, init?: RequestInit) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(new Error('Aborted')), {
            once: true,
          });
        })) as unknown as typeof fetch,
    });

    const slow = hangingTransport.send({
      url: 'http://example.test/slow',
      method: 'GET',
      timeoutMs: 500,
    });
    jest.advanceTimersByTime(500);
    await expect(slow).rejects.toBeInstanceOf(ApiError);
    await expect(slow).rejects.toMatchObject({ code: 'TIMEOUT', retryable: true });

    jest.useRealTimers();
    const midController = new AbortController();
    const mid = hangingTransport.send({
      url: 'http://example.test/cancel',
      method: 'GET',
      timeoutMs: 5000,
      signal: midController.signal,
    });
    midController.abort();
    await expect(mid).rejects.toMatchObject({ code: 'ABORTED', retryable: false });
  });

  it('throws TIMEOUT instead of { ok: false } when timeout fires during response.json()', async () => {
    jest.useFakeTimers();
    let resolveJsonStarted!: () => void;
    const jsonStarted = new Promise<void>((resolve) => {
      resolveJsonStarted = resolve;
    });

    const jsonHangTransport = createFetchTransport({
      fetchImpl: (async (_url: RequestInfo | URL, init?: RequestInit) => ({
        ok: true,
        status: 200,
        headers: { get: () => null },
        json: () => {
          resolveJsonStarted();
          if (init?.signal?.aborted) {
            return Promise.reject(new Error('Aborted'));
          }
          return new Promise((_resolve, reject) => {
            init?.signal?.addEventListener('abort', () => reject(new Error('Aborted')), {
              once: true,
            });
          });
        },
      })) as unknown as typeof fetch,
    });

    const slowJson = jsonHangTransport.send({
      url: 'http://example.test/slow-json',
      method: 'GET',
      timeoutMs: 500,
    });
    await jsonStarted;
    jest.advanceTimersByTime(500);
    await expect(slowJson).rejects.toMatchObject({ code: 'TIMEOUT', retryable: true });
  });
});
