import { mkdir, open, readFile, rename, rm, unlink } from 'node:fs/promises';
import { dirname } from 'node:path';

export interface CacheEntry {
  value: unknown;
  fetchedAt: number;
}

interface CacheFile {
  version: 1;
  month: string;
  calls: number;
  entries: Record<string, CacheEntry>;
}

export interface CacheRead<T> {
  value: T;
  fetchedAt: number;
  /** Age in milliseconds, clamped to zero when the clock moved backwards. */
  age: number;
}

export class MonthlyBudgetExceededError extends Error {
  readonly code = 'MONTHLY_UPSTREAM_BUDGET_EXCEEDED';

  constructor(readonly limit: number) {
    super('The monthly Rejseplanen upstream-call budget has been exhausted.');
    this.name = 'MonthlyBudgetExceededError';
  }
}

/** A small JSON store. Mutations are lock-protected and committed with rename. */
export class PersistentCache {
  private readonly lockPath: string;
  private readonly lockWaitMs = 25;
  private readonly lockTimeoutMs = 5000;

  constructor(readonly path: string, private readonly now: () => number = Date.now) {
    this.lockPath = `${path}.lock`;
  }

  async get<T>(key: string, maxAgeMs: number): Promise<CacheRead<T> | undefined> {
    const entry = await this.entry(key);
    if (!entry) return undefined;
    const age = Math.max(0, this.now() - entry.fetchedAt);
    return age <= maxAgeMs ? { value: entry.value as T, fetchedAt: entry.fetchedAt, age } : undefined;
  }

  /** Returns a bounded entry regardless of freshness; callers decide whether it is an acceptable fallback. */
  async getForFallback<T>(key: string, maxAgeMs: number): Promise<CacheRead<T> | undefined> {
    return this.get<T>(key, maxAgeMs);
  }

  async put<T>(key: string, value: T, fetchedAt = this.now()): Promise<void> {
    await this.mutate((file) => {
      file.entries[key] = { value, fetchedAt };
    });
  }

  /** Reserve exactly one upstream call. This is the hard cross-restart budget boundary. */
  async reserveCall(limit: number): Promise<number> {
    let calls = 0;
    await this.mutate((file) => {
      if (file.calls >= limit) throw new MonthlyBudgetExceededError(limit);
      file.calls += 1;
      calls = file.calls;
    });
    return calls;
  }

  async snapshot(): Promise<{ month: string; calls: number }> {
    const file = await this.read();
    return { month: file.month, calls: file.calls };
  }

  private async entry(key: string): Promise<CacheEntry | undefined> {
    return (await this.read()).entries[key];
  }

  private async read(): Promise<CacheFile> {
    const month = currentMonth(this.now());
    let raw: string;
    try {
      raw = await readFile(this.path, 'utf8');
    } catch (error) {
      if (isMissingFile(error)) return emptyFile(month);
      throw new Error('Unable to read the persistent Rejseplanen cache.');
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw new Error('The persistent Rejseplanen cache is corrupt. Remove or repair the cache file.');
    }
    if (!isCacheFile(parsed)) {
      throw new Error('The persistent Rejseplanen cache has an unsupported shape. Remove or repair the cache file.');
    }
    if (parsed.month > month) throw new Error('The system clock is earlier than the recorded budget month.');
    return parsed.month === month ? parsed : { ...parsed, month, calls: 0 };
  }

  private async mutate(change: (file: CacheFile) => void): Promise<void> {
    await this.withLock(async () => {
      const file = await this.read();
      change(file);
      await mkdir(dirname(this.path), { recursive: true });
      const temporaryPath = `${this.path}.${process.pid}.${Math.random().toString(36).slice(2)}.tmp`;
      try {
        const handle = await open(temporaryPath, 'wx', 0o600);
        try {
          await handle.writeFile(JSON.stringify(file), 'utf8');
          await handle.sync();
        } finally {
          await handle.close();
        }
        await rename(temporaryPath, this.path);
        const directory = await open(dirname(this.path), 'r');
        try { await directory.sync(); } finally { await directory.close(); }
      } finally {
        await rm(temporaryPath, { force: true });
      }
    });
  }

  private async withLock<T>(operation: () => Promise<T>): Promise<T> {
    await mkdir(dirname(this.path), { recursive: true });
    const started = Date.now();
    while (true) {
      try {
        const handle = await open(this.lockPath, 'wx', 0o600);
        try {
          return await operation();
        } finally {
          await handle.close();
          await unlink(this.lockPath).catch(() => undefined);
        }
      } catch (error) {
        if (!isAlreadyExists(error)) throw error;
        if (Date.now() - started >= this.lockTimeoutMs) {
          throw new Error('Timed out waiting for the persistent Rejseplanen cache lock.');
        }
        await new Promise((resolve) => setTimeout(resolve, this.lockWaitMs));
      }
    }
  }
}

const currentMonth = (now: number): string => {
  const date = new Date(now);
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
};

const emptyFile = (month: string): CacheFile => ({ version: 1, month, calls: 0, entries: {} });

const isCacheFile = (value: unknown): value is CacheFile => {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<CacheFile>;
  return candidate.version === 1 && typeof candidate.month === 'string' && typeof candidate.calls === 'number'
    && Number.isSafeInteger(candidate.calls) && candidate.calls >= 0 && !!candidate.entries && typeof candidate.entries === 'object';
};

const isMissingFile = (error: unknown): boolean => (error as NodeJS.ErrnoException)?.code === 'ENOENT';
const isAlreadyExists = (error: unknown): boolean => (error as NodeJS.ErrnoException)?.code === 'EEXIST';
