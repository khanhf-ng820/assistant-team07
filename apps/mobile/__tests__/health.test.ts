import { checkHealth } from '../src/api/health';

describe('health response contract', () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  function respond(body: unknown, status = 200) {
    globalThis.fetch = jest.fn(async () => ({
      ok: status >= 200 && status < 300,
      status,
      json: async () => body,
    })) as unknown as typeof fetch;
  }

  it('requests the health path and validates the actual service identity', async () => {
    respond({ status: 'ok', service: 'carenta-api' });
    await expect(checkHealth('http://192.168.1.10:8000/')).resolves.toEqual({
      status: 'ok', service: 'carenta-api',
    });
    expect(globalThis.fetch).toHaveBeenCalledWith('http://192.168.1.10:8000/health', {
      signal: undefined,
    });
  });

  it('rejects a non-success HTTP status', async () => {
    respond({ status: 'ok', service: 'carenta-api' }, 503);
    await expect(checkHealth('http://example.test')).rejects.toThrow('Health request failed (503)');
  });

  it.each([
    null,
    [],
    {},
    { status: 'ok' },
    { status: 'error', service: 'carenta-api' },
    { status: 'ok', service: 'another-service' },
  ])('rejects an unexpected payload: %j', async (body) => {
    respond(body);
    await expect(checkHealth('http://example.test')).rejects.toThrow('Unexpected health response');
  });

  it('rejects malformed JSON', async () => {
    globalThis.fetch = jest.fn(async () => ({
      ok: true,
      json: async () => { throw new SyntaxError('Invalid JSON'); },
    })) as unknown as typeof fetch;
    await expect(checkHealth('http://example.test')).rejects.toThrow(SyntaxError);
  });

  it('passes cancellation to fetch and propagates rejection', async () => {
    const controller = new AbortController();
    controller.abort();
    globalThis.fetch = jest.fn(async (_url: RequestInfo | URL, options?: RequestInit) => {
      if (options?.signal?.aborted) throw new Error('Aborted');
      return { ok: true, json: async () => ({ status: 'ok', service: 'carenta-api' }) };
    }) as unknown as typeof fetch;
    await expect(checkHealth('http://example.test', controller.signal)).rejects.toThrow('Aborted');
  });
});
