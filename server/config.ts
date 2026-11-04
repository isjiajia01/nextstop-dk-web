import { resolve } from 'node:path';

export interface BackendConfig {
  accessId: string | undefined;
  baseUrl: string;
  cachePath: string;
  monthlyCallLimit: number;
  minIntervalMs: number;
  timeoutMs: number;
  maxRetries: number;
  staleMaxAgeMs: number;
}

const positiveInteger = (value: string | undefined, fallback: number): number => {
  if (value === undefined || value.trim() === '') return fallback;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) throw new Error('Invalid non-negative integer backend configuration.');
  return parsed;
};

const positiveDuration = (value: string | undefined, fallback: number): number => {
  const parsed = positiveInteger(value, fallback);
  if (parsed <= 0) throw new Error('Backend duration must be positive.');
  return parsed;
};

/** Credentials are intentionally read only from the process environment. */
export function configFromEnv(env: NodeJS.ProcessEnv = process.env): BackendConfig {
  return {
    accessId: env.REJSEPLANEN_ACCESS_ID?.trim() || undefined,
    baseUrl: (env.REJSEPLANEN_BASE_URL?.trim() || 'https://www.rejseplanen.dk/api').replace(/\/$/, ''),
    cachePath: resolve(env.REJSEPLANEN_CACHE_PATH?.trim() || '.data/rejseplanen-cache.json'),
    monthlyCallLimit: positiveInteger(env.REJSEPLANEN_MONTHLY_CALL_LIMIT, 1000),
    minIntervalMs: positiveInteger(env.REJSEPLANEN_MIN_INTERVAL_MS, 250),
    timeoutMs: positiveDuration(env.REJSEPLANEN_TIMEOUT_MS, 5000),
    maxRetries: positiveInteger(env.REJSEPLANEN_MAX_RETRIES, 2),
    staleMaxAgeMs: positiveDuration(env.REJSEPLANEN_STALE_MAX_AGE_MS, 6 * 60 * 60 * 1000),
  };
}

export function requireAccessId(config: BackendConfig): string {
  if (!config.accessId) {
    throw new Error('Rejseplanen is not configured. Set REJSEPLANEN_ACCESS_ID in the server environment.');
  }
  return config.accessId;
}
