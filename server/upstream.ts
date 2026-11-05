import { MonthlyBudgetExceededError, type CacheRead, PersistentCache } from './cache';
import { requireAccessId, type BackendConfig } from './config';

export interface FetchResponseLike {
  readonly ok: boolean;
  readonly status: number;
  json(): Promise<unknown>;
}

export type FetchLike = (input: string, init?: { signal?: AbortSignal }) => Promise<FetchResponseLike>;

export type UpstreamFailure = 'timeout' | 'network' | 'http' | 'rejected';

export class UpstreamUnavailableError extends Error {
  readonly code = 'REJSEPLANEN_UNAVAILABLE';

  constructor(readonly failure: UpstreamFailure = 'network', message = 'Rejseplanen is unavailable.') {
    super(message);
    this.name = 'UpstreamUnavailableError';
  }
}

/** Serializes calls in this process and backs off transient upstream failures. */
export class UpstreamGateway {
  private readonly inFlight = new Map<string, Promise<CacheRead<unknown>>>();
  private rateTail: Promise<void> = Promise.resolve();
  private nextCallAt = 0;

  constructor(
    private readonly config: BackendConfig,
    private readonly cache: PersistentCache,
    private readonly fetcher: FetchLike = fetch,
    private readonly now: () => number = Date.now,
    private readonly sleep: (ms: number) => Promise<void> = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  ) {}

  async budgetSnapshot(): Promise<{ month: string; calls: number }> {
    return this.cache.snapshot();
  }

  /**
   * Returns fresh data within half the normal fallback lifetime, then refreshes. Identical concurrent
   * requests share one upstream attempt. On failure a bounded stale entry is returned.
   */
  async requestJson<T>(endpoint: string, params: Record<string, string | number | undefined>): Promise<CacheRead<T>> {
    requireAccessId(this.config);
    const key = cacheKey(endpoint, params);
    const fresh = await this.cache.get<T>(key, this.freshAgeMs());
    if (fresh) return fresh;

    const existing = this.inFlight.get(key) as Promise<CacheRead<T>> | undefined;
    if (existing) return existing;

    const request = this.fetchAndCache<T>(key, endpoint, params);
    this.inFlight.set(key, request as Promise<CacheRead<unknown>>);
    try {
      return await request;
    } finally {
      this.inFlight.delete(key);
    }
  }

  private freshAgeMs(): number {
    return Math.min(this.config.freshMs ?? 120_000, Math.max(1, Math.floor(this.config.staleMaxAgeMs / 2)));
  }

  private async fetchAndCache<T>(key: string, endpoint: string, params: Record<string, string | number | undefined>): Promise<CacheRead<T>> {
    const stale = await this.cache.getForFallback<T>(key, this.config.staleMaxAgeMs);
    try {
      const payload = await this.fetchWithRetry<T>(endpoint, params);
      const fetchedAt = this.now();
      await this.cache.put(key, payload, fetchedAt);
      return { value: payload, fetchedAt, age: 0 };
    } catch (error) {
      if (stale) return stale;
      if (error instanceof MonthlyBudgetExceededError) throw error;
      throw toUnavailable(error);
    }
  }

  private async fetchWithRetry<T>(endpoint: string, params: Record<string, string | number | undefined>): Promise<T> {
    const accessId = requireAccessId(this.config);
    let lastError: unknown;
    for (let attempt = 0; attempt <= this.config.maxRetries; attempt += 1) {
      try {
        await this.waitForRateLimit();
        await this.cache.reserveCall(this.config.monthlyCallLimit);
        return await this.fetchOnce<T>(endpoint, params, accessId);
      } catch (error) {
        lastError = error;
        if (error instanceof MonthlyBudgetExceededError) throw error;
        if (!isRetryable(error)) throw error;
        if (attempt >= this.config.maxRetries) break;
        await this.sleep(Math.min(2000, 100 * 2 ** attempt));
      }
    }
    throw toUnavailable(lastError);
  }

  private async fetchOnce<T>(endpoint: string, params: Record<string, string | number | undefined>, accessId: string): Promise<T> {
    const search = new URLSearchParams({ accessId, format: 'json' });
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== '') search.set(key, String(value));
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.config.timeoutMs);
    try {
      const response = await this.fetcher(`${this.config.baseUrl}/${endpoint}?${search.toString()}`, { signal: controller.signal });
      if (response.status === 429 || response.status >= 500) throw new UpstreamUnavailableError('http', `Rejseplanen returned HTTP ${response.status}.`);
      if (!response.ok) throw new UpstreamUnavailableError('rejected', `Rejseplanen returned HTTP ${response.status}.`);
      const payload = await response.json();
      if (isApiError(payload)) throw new UpstreamUnavailableError('rejected', 'Rejseplanen rejected the request.');
      return stripCredential(payload, accessId) as T;
    } catch (error) {
      if (error instanceof UpstreamUnavailableError) throw error;
      throw new UpstreamUnavailableError(controller.signal.aborted ? 'timeout' : 'network');
    } finally {
      clearTimeout(timer);
    }
  }

  private async waitForRateLimit(): Promise<void> {
    const previous = this.rateTail;
    let release!: () => void;
    this.rateTail = new Promise<void>((resolve) => { release = resolve; });
    await previous;
    try {
      const wait = Math.max(0, this.nextCallAt - this.now());
      if (wait > 0) await this.sleep(wait);
      this.nextCallAt = this.now() + this.config.minIntervalMs;
    } finally {
      release();
    }
  }
}

function stripCredential(value: unknown, accessId: string): unknown {
  if (typeof value === 'string') return value.split(accessId).join('[redacted]');
  if (Array.isArray(value)) return value.map((item) => stripCredential(item, accessId));
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).filter(([key]) => key.toLowerCase() !== 'accessid')
      .map(([key, item]) => [key, stripCredential(item, accessId)]));
  }
  return value;
}

const isRetryable = (error: unknown): boolean =>
  error instanceof UpstreamUnavailableError && (error.failure === 'timeout' || error.failure === 'network' || error.failure === 'http');
const toUnavailable = (error: unknown): UpstreamUnavailableError =>
  error instanceof UpstreamUnavailableError ? error : new UpstreamUnavailableError('network');
const isApiError = (value: unknown): boolean => {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Record<string, unknown>;
  return candidate.errorCode !== undefined || candidate.error !== undefined;
};

const cacheKey = (endpoint: string, params: Record<string, string | number | undefined>): string => {
  const sorted = Object.entries(params)
    .filter((entry): entry is [string, string | number] => entry[1] !== undefined && entry[1] !== '')
    .sort(([a], [b]) => a.localeCompare(b));
  return `${endpoint}?${new URLSearchParams(sorted.map(([key, value]) => [key, String(value)]))}`;
};
