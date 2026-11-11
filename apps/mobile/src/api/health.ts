export type HealthResponse = { status: 'ok'; service: 'carenta-api' };

export async function checkHealth(baseUrl: string, signal?: AbortSignal): Promise<HealthResponse> {
  const response = await fetch(`${baseUrl.replace(/\/+$/, '')}/health`, { signal });
  if (!response.ok) throw new Error(`Health request failed (${response.status})`);

  const body: unknown = await response.json();
  if (signal?.aborted) throw new Error('Aborted');
  if (
    !body || typeof body !== 'object' ||
    !('status' in body) || body.status !== 'ok' ||
    !('service' in body) || body.service !== 'carenta-api'
  ) {
    throw new Error('Unexpected health response');
  }
  return { status: 'ok', service: 'carenta-api' };
}
