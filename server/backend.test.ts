import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PersistentCache } from './cache';
import { configFromEnv, type BackendConfig } from './config';
import { LiveTransitRepository, RejseplanenClient } from './rejseplanen';
import { UpstreamGateway, type FetchLike } from './upstream';

const cleanups: string[] = [];
afterEach(async () => {
  await Promise.all(cleanups.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

const config = (cachePath: string, overrides: Partial<BackendConfig> = {}): BackendConfig => ({
  accessId: 'test-access-id',
  baseUrl: 'https://example.invalid/api',
  cachePath,
  monthlyCallLimit: 10,
  minIntervalMs: 0,
  timeoutMs: 100,
  maxRetries: 0,
  staleMaxAgeMs: 1000,
  ...overrides,
});

const response = (body: unknown, status = 200): Awaited<ReturnType<FetchLike>> => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => body,
});

async function tempCache(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'nextstop-backend-'));
  cleanups.push(directory);
  return join(directory, 'cache.json');
}

describe('backend configuration', () => {
  it('uses quota defaults and validates configured ratios', () => {
    expect(configFromEnv({})).toMatchObject({ monthlyCallLimit: 50_000, freshMs: 120_000, warnRatio: 0.8, reserveRatio: 0.1 });
    expect(configFromEnv({ REJSEPLANEN_WARN_RATIO: '0.7', REJSEPLANEN_RESERVE_RATIO: '0.2' })).toMatchObject({ warnRatio: 0.7, reserveRatio: 0.2 });
    for (const value of ['-0.1', '1.1', 'NaN', 'Infinity']) {
      expect(() => configFromEnv({ REJSEPLANEN_WARN_RATIO: value })).toThrow();
      expect(() => configFromEnv({ REJSEPLANEN_RESERVE_RATIO: value })).toThrow();
    }
  });
});

describe('persistent upstream gateway', () => {
  it('logs each crossed level once per process and month without credentials or URLs', async () => {
    const path = await tempCache();
    let now = Date.UTC(2042, 0, 1);
    const cache = new PersistentCache(path, () => now);
    const gateway = new UpstreamGateway(config(path, { monthlyCallLimit: 20 }), cache, async () => response({ ok: true }), () => now);
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    try {
      for (let i = 0; i < 20; i += 1) await gateway.requestJson('departureBoard', { id: String(i) });
      await gateway.budgetSnapshot();
      expect(log.mock.calls.map(([line]) => JSON.parse(String(line)).level)).toEqual(['warn', 'critical', 'exhausted']);
      expect(JSON.stringify(log.mock.calls)).not.toContain('test-access-id');
      expect(JSON.stringify(log.mock.calls)).not.toContain('https://');
      now = Date.UTC(2042, 1, 1);
      for (let i = 0; i < 16; i += 1) await gateway.requestJson('departureBoard', { id: `new-${i}` });
      expect(log.mock.calls.map(([line]) => JSON.parse(String(line)).level)).toEqual(['warn', 'critical', 'exhausted', 'warn']);
    } finally { log.mockRestore(); }
  });

  it('serves bounded stale boards and location lookups in reserve, but allows misses', async () => {
    const path = await tempCache();
    const cache = new PersistentCache(path);
    const fetchedAt = Date.now() - 500;
    const location = { LocationList: { StopLocation: [{ id: '1', name: 'Stop', lat: 55, lon: 12 }] } };
    await cache.put('departureBoard?id=1', { DepartureBoard: { name: 'Stop', Departure: [] } }, fetchedAt);
    await cache.put('location.name?input=Stop', location, fetchedAt);
    await cache.put('location.nearbystops?originCoordLat=55&originCoordLong=12&r=1000', location, fetchedAt);
    await cache.put('location.nearbystops?originCoordLat=55&originCoordLong=12&r=10000', location, fetchedAt);
    for (let i = 0; i < 9; i += 1) await cache.reserveCall(10);
    let calls = 0;
    const client = new RejseplanenClient(config(path, { freshMs: 100, staleMaxAgeMs: 10_000 }), async () => { calls += 1; return response({ DepartureBoard: { Departure: [] } }); }, cache);
    const repository = new LiveTransitRepository(client);
    expect((await repository.board('1', Date.now())).fetchedAt).toBe(fetchedAt);
    expect(await repository.searchStops('Stop', { lat: 55, lng: 12 })).toHaveLength(1);
    expect(await repository.nearbyStops({ lat: 55, lng: 12 }, 1000)).toHaveLength(1);
    expect(await repository.nearestStop({ lat: 55, lng: 12 })).not.toBeNull();
    expect(calls).toBe(0);
    await repository.board('miss', Date.now());
    expect(calls).toBe(1);
    await expect(repository.board('another-miss', Date.now())).rejects.toMatchObject({ code: 'MONTHLY_UPSTREAM_BUDGET_EXCEEDED' });
    expect((await repository.board('1', Date.now())).fetchedAt).toBe(fetchedAt);
  });

  it('checks the reserve atomically for concurrent refreshes from separate gateways', async () => {
    const path = await tempCache();
    const cache = new PersistentCache(path);
    const fetchedAt = Date.now() - 500;
    await cache.put('departureBoard?id=one', { version: 0 }, fetchedAt);
    await cache.put('departureBoard?id=two', { version: 0 }, fetchedAt);
    for (let i = 0; i < 8; i += 1) await cache.reserveCall(10);
    let calls = 0;
    const fetcher: FetchLike = async () => response({ version: ++calls });
    const settings = config(path, { freshMs: 100, staleMaxAgeMs: 10_000 });
    const gateways = [new UpstreamGateway(settings, new PersistentCache(path), fetcher), new UpstreamGateway(settings, new PersistentCache(path), fetcher)];
    const results = await Promise.all(gateways.map((gateway, index) => gateway.requestJson('departureBoard', { id: index ? 'two' : 'one' })));
    expect(calls).toBe(1);
    expect(results.filter((result) => result.fetchedAt === fetchedAt)).toHaveLength(1);
    expect((await cache.snapshot()).calls).toBe(9);
  });

  it('refreshes stale entries below reserve and treats expired entries as misses in reserve', async () => {
    const path = await tempCache();
    let now = Date.UTC(2043, 0, 1);
    const cache = new PersistentCache(path, () => now);
    let calls = 0;
    const gateway = new UpstreamGateway(config(path, { monthlyCallLimit: 2, reserveRatio: 0.5, freshMs: 100, staleMaxAgeMs: 1000 }), cache, async () => response({ version: ++calls }), () => now);
    await cache.put('departureBoard?id=stale', { version: 0 }, now - 500);
    expect((await gateway.requestJson<{ version: number }>('departureBoard', { id: 'stale' })).value.version).toBe(1);
    now += 1001;
    expect((await gateway.requestJson<{ version: number }>('departureBoard', { id: 'stale' })).value.version).toBe(2);
    expect(calls).toBe(2);
  });
  it('enforces the hard monthly budget across distinct calls', async () => {
    const path = await tempCache();
    let calls = 0;
    const gateway = new UpstreamGateway(config(path, { monthlyCallLimit: 1 }), new PersistentCache(path), async () => {
      calls += 1;
      return response({ ok: true });
    });

    await gateway.requestJson('departureBoard', { id: 'one' });
    await expect(gateway.requestJson('departureBoard', { id: 'two' })).rejects.toMatchObject({ code: 'MONTHLY_UPSTREAM_BUDGET_EXCEEDED' });
    expect(calls).toBe(1);
    await expect(gateway.budgetSnapshot()).resolves.toMatchObject({ calls: 1 });
  });

  it('coalesces concurrent identical requests into one upstream call', async () => {
    const path = await tempCache();
    let calls = 0;
    const gateway = new UpstreamGateway(config(path), new PersistentCache(path), async () => {
      calls += 1;
      await new Promise((resolve) => setTimeout(resolve, 10));
      return response({ value: 42 });
    });

    const results = await Promise.all(Array.from({ length: 12 }, () => gateway.requestJson<{ value: number }>('departureBoard', { id: 'same' })));
    expect(calls).toBe(1);
    expect(results.every((result) => result.value.value === 42)).toBe(true);
  });

  it('atomically reserves a shared budget across concurrent cache instances', async () => {
    const path = await tempCache();
    const results = await Promise.allSettled(Array.from({ length: 20 }, () => new PersistentCache(path).reserveCall(5)));
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(5);
    expect(results.filter((result) => result.status === 'rejected')).toHaveLength(15);
    await expect(new PersistentCache(path).snapshot()).resolves.toMatchObject({ calls: 5 });
  });

  it('creates a missing cache directory and carries entries into the next UTC month', async () => {
    const path = join(await tempCache(), 'nested', 'state.json');
    let now = Date.UTC(2026, 0, 31, 23, 59);
    const cache = new PersistentCache(path, () => now);
    await cache.put('board', { value: 1 });
    await cache.reserveCall(1);
    now = Date.UTC(2026, 1, 1);
    expect(await cache.get('board', 120_000)).toMatchObject({ value: { value: 1 } });
    await expect(cache.reserveCall(1)).resolves.toBe(1);
  });

  it('keeps the budget after a process restart', async () => {
    const path = await tempCache();
    const first = new UpstreamGateway(config(path, { monthlyCallLimit: 1 }), new PersistentCache(path), async () => response({ first: true }));
    await first.requestJson('departureBoard', { id: 'restart' });

    let restartedCalls = 0;
    const restarted = new UpstreamGateway(config(path, { monthlyCallLimit: 1 }), new PersistentCache(path), async () => {
      restartedCalls += 1;
      return response({ second: true });
    });
    await expect(restarted.requestJson('departureBoard', { id: 'after-restart' })).rejects.toMatchObject({ code: 'MONTHLY_UPSTREAM_BUDGET_EXCEEDED' });
    expect(restartedCalls).toBe(0);
  });

  it('returns a bounded stale value when refresh fails', async () => {
    const path = await tempCache();
    let now = 0;
    let calls = 0;
    const fetcher: FetchLike = async () => {
      calls += 1;
      if (calls === 1) return response({ version: 1 });
      throw new Error('simulated network failure');
    };
    const gateway = new UpstreamGateway(config(path, { timeoutMs: 10, staleMaxAgeMs: 1000 }), new PersistentCache(path, () => now), fetcher, () => now, async () => undefined);

    const fresh = await gateway.requestJson<{ version: number }>('departureBoard', { id: 'stale' });
    now = 600;
    const fallback = await gateway.requestJson<{ version: number }>('departureBoard', { id: 'stale' });
    expect(fresh.age).toBe(0);
    expect(fallback).toMatchObject({ value: { version: 1 }, fetchedAt: 0, age: 600 });
  });

  it('spaces upstream calls by the configured minimum interval', async () => {
    const path = await tempCache();
    let now = 0;
    const waits: number[] = [];
    const gateway = new UpstreamGateway(config(path, { minIntervalMs: 250 }), new PersistentCache(path), async () => response({ ok: true }), () => now, async (ms) => {
      waits.push(ms);
      now += ms;
      await Promise.resolve();
    });

    await Promise.all([
      gateway.requestJson('departureBoard', { id: 'first' }),
      gateway.requestJson('departureBoard', { id: 'second' }),
    ]);
    expect(waits).toEqual([250]);
  });

  it('does not serve stale data beyond the configured maximum age', async () => {
    const path = await tempCache();
    let now = 0;
    let calls = 0;
    const fetcher: FetchLike = async () => {
      calls += 1;
      if (calls === 1) return response({ version: 1 });
      throw new Error('simulated network failure');
    };
    const gateway = new UpstreamGateway(config(path, { staleMaxAgeMs: 100 }), new PersistentCache(path, () => now), fetcher, () => now, async () => undefined);

    await gateway.requestJson('departureBoard', { id: 'too-old' });
    now = 200;
    await expect(gateway.requestJson('departureBoard', { id: 'too-old' })).rejects.toMatchObject({ code: 'REJSEPLANEN_UNAVAILABLE' });
  });

  it('aborts an upstream request on timeout', async () => {
    const path = await tempCache();
    const gateway = new UpstreamGateway(config(path, { timeoutMs: 15 }), new PersistentCache(path), async (_url, init) =>
      new Promise((_resolve, reject) => init?.signal?.addEventListener('abort', () => reject(new Error('aborted')))));
    await expect(gateway.requestJson('departureBoard', { id: 'timeout' })).rejects.toMatchObject({ code: 'REJSEPLANEN_UNAVAILABLE', failure: 'timeout' });
  });

  it('retries a transient timeout and then succeeds', async () => {
    const path = await tempCache();
    let calls = 0;
    const gateway = new UpstreamGateway(config(path, { maxRetries: 1 }), new PersistentCache(path), async () => {
      calls += 1;
      if (calls === 1) throw new Error('timeout');
      return response({ ok: true });
    }, Date.now, async () => undefined);

    await expect(gateway.requestJson('departureBoard', { id: 'retry' })).resolves.toMatchObject({ value: { ok: true } });
    expect(calls).toBe(2);
    await expect(gateway.budgetSnapshot()).resolves.toMatchObject({ calls: 2 });
  });
});

describe('Rejseplanen adapter', () => {
  it('treats a TechnicalMessages-only location response as no stops', async () => {
    const fetcher: FetchLike = async () => response({ TechnicalMessages: { TechnicalMessage: [] } });
    const repository = new LiveTransitRepository(new RejseplanenClient(config(await tempCache()), fetcher));
    await expect(repository.nearbyStops({ lat: 48.85, lng: 2.35 }, 1000)).resolves.toEqual([]);
    await expect(repository.nearestStop({ lat: 48.85, lng: 2.35 })).resolves.toBeNull();
  });

  it('normalizes the documented location and departure-board shapes', async () => {
    const path = await tempCache();
    const urls: string[] = [];
    const fetcher: FetchLike = async (url) => {
      urls.push(url);
      if (url.includes('location.name') || url.includes('location.nearbystops')) {
        return response({ LocationList: { StopLocation: [{ id: 'stop-1', name: 'Nørreport St. (Nørre Voldgade)', lat: '55.6832', lon: '12.5718' }] } });
      }
      return response({ DepartureBoard: {
        name: 'Nørreport St.',
        Departure: [
          { line: '5C', direction: 'Lufthavnen', date: '2026-11-04', time: '12:00', rtTime: '12:02' },
          { name: '14', direction: 'Vigerslev', time: '12:05' },
        ],
      } });
    };
    const repository = new LiveTransitRepository(new RejseplanenClient(config(path), fetcher));

    const stops = await repository.searchStops('Nørreport', { lat: 55.68, lng: 12.57 });
    expect(stops[0]).toMatchObject({ id: 'stop-1', name: 'Nørreport St.', road: 'Nørre Voldgade', lines: [] });
    const nearby = await repository.nearbyStops({ lat: 55.68, lng: 12.57 }, 750);
    expect(nearby[0]).toMatchObject({ id: 'stop-1', distance: expect.any(Number) });
    expect(urls.some((url) => url.includes('location.nearbystops') && url.includes('originCoordLat=55.68') && url.includes('r=750'))).toBe(true);

    const board = await repository.board('stop-1', Date.UTC(2026, 10, 4, 11));
    expect(board.departures).toHaveLength(2);
    expect(board.departures[0]).toMatchObject({ line: '5C', destination: 'Lufthavnen', journeyId: 'stop-1:5C:2026-11-04:12:00:Lufthavnen' });
    expect(board.departures[0]?.predicted! - board.departures[0]!.scheduled).toBe(120_000);
    expect(board.departures[1]?.predicted).toBeUndefined();
  });

  it('fails explicitly for unsupported repository seams', async () => {
    const repository = new LiveTransitRepository(new RejseplanenClient(config(await tempCache())));
    await expect(repository.stopById('stop-1', { lat: 0, lng: 0 })).rejects.toMatchObject({ kind: 'upstream' });
    await expect(repository.journey('id', 'stop', 0)).rejects.toMatchObject({ kind: 'upstream' });
    await expect(repository.alerts('stop')).rejects.toMatchObject({ kind: 'upstream' });
  });
});
