export interface HttpResult<T> {
  ok: boolean;
  status: number;
  ms: number;
  data?: T;
  error?: string;
}

const DEFAULT_HEADERS = {
  'user-agent': 'FieldShift-NASA-SpaceApps/1.0 (+https://www.spaceappschallenge.org/)',
  accept: 'application/json, text/plain, */*',
};

export async function fetchJson<T>(
  url: string,
  init?: RequestInit,
  timeoutMs = 10000,
): Promise<HttpResult<T>> {
  const t0 = Date.now();
  try {
    const res = await fetch(url, {
      ...init,
      headers: {
        ...DEFAULT_HEADERS,
        ...(init?.headers ?? {}),
      },
      signal: AbortSignal.timeout(timeoutMs),
    });
    const ms = Date.now() - t0;
    if (!res.ok) {
      const txt = await res.text().catch(() => '');
      return {
        ok: false,
        status: res.status,
        ms,
        error: `HTTP ${res.status}${txt ? `: ${txt.slice(0, 140)}` : ''}`,
      };
    }
    const data = (await res.json()) as T;
    return { ok: true, status: res.status, ms, data };
  } catch (err) {
    return {
      ok: false,
      status: 0,
      ms: Date.now() - t0,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

export async function fetchText(
  url: string,
  init?: RequestInit,
  timeoutMs = 10000,
): Promise<HttpResult<string>> {
  const t0 = Date.now();
  try {
    const res = await fetch(url, {
      ...init,
      headers: {
        ...DEFAULT_HEADERS,
        ...(init?.headers ?? {}),
      },
      signal: AbortSignal.timeout(timeoutMs),
    });
    const ms = Date.now() - t0;
    const text = await res.text();
    if (!res.ok) {
      return {
        ok: false,
        status: res.status,
        ms,
        error: `HTTP ${res.status}: ${text.slice(0, 140)}`,
      };
    }
    return { ok: true, status: res.status, ms, data: text };
  } catch (err) {
    return {
      ok: false,
      status: 0,
      ms: Date.now() - t0,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
