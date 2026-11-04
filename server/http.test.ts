import { mkdtemp, rm } from 'node:fs/promises';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { BackendConfig } from './config';
import { createBackendServer, createDependencies } from './http';
import type { FetchLike } from './upstream';

const cleanups: Array<string | (() => Promise<void>)> = [];
afterEach(async () => {
  await Promise.all(cleanups.splice(0).map((cleanup) => typeof cleanup === 'string' ? rm(cleanup, { recursive: true, force: true }) : cleanup()));
});

async function start(overrides: Partial<BackendConfig> = {}, fetcher: FetchLike = async () => ({ ok: true, status: 200, json: async () => ({}) })): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'nextstop-http-'));
  cleanups.push(directory);
  const config: BackendConfig = {
    accessId: 'test-access-id', baseUrl: 'https://example.invalid/api', cachePath: join(directory, 'cache.json'),
    monthlyCallLimit: 10, minIntervalMs: 0, timeoutMs: 100, maxRetries: 0, staleMaxAgeMs: 1000, ...overrides,
  };
  const server = createBackendServer(createDependencies(config, fetcher));
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  cleanups.push(async () => new Promise<void>((resolve) => server.close(() => resolve())));
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}

describe('backend HTTP surface', () => {
  it('reports unconfigured health without making an upstream call', async () => {
    let calls = 0;
    const base = await start({ accessId: undefined }, async () => { calls += 1; return { ok: true, status: 200, json: async () => ({}) }; });
    const response = await fetch(`${base}/health`);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ status: 'unconfigured', configured: false, upstreamCalls: 0 });
    expect(calls).toBe(0);
  });

  it('rejects a data request clearly when credentials are absent', async () => {
    const base = await start({ accessId: undefined });
    const response = await fetch(`${base}/api/board?stopId=stop-1`);
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ error: { code: 'REJSEPLANEN_UNAVAILABLE' } });
  });

  it('returns a normalized board from the adapter', async () => {
    const base = await start({}, async () => ({
      ok: true, status: 200,
      json: async () => ({ DepartureBoard: { name: 'Nørreport St.', Departure: [{ line: '5C', direction: 'Lufthavnen', date: '2026-11-04', time: '12:00' }] } }),
    }));
    const response = await fetch(`${base}/api/board?stopId=stop-1`);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ stop: { id: 'stop-1', name: 'Nørreport St.' }, departures: [{ line: '5C', destination: 'Lufthavnen' }] });
  });

  it('validates search coordinates before reaching upstream', async () => {
    let calls = 0;
    const base = await start({}, async () => { calls += 1; return { ok: true, status: 200, json: async () => ({}) }; });
    const response = await fetch(`${base}/api/stops/search?q=N%C3%B8rreport`);
    expect(response.status).toBe(400);
    expect(calls).toBe(0);
  });

  it('returns budget exhaustion as a non-retryable client error', async () => {
    const base = await start({ monthlyCallLimit: 0 });
    const response = await fetch(`${base}/api/board?stopId=stop-1`);
    expect(response.status).toBe(429);
    expect(await response.json()).toMatchObject({ error: { code: 'MONTHLY_UPSTREAM_BUDGET_EXCEEDED' } });
  });
});
