import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { configFromEnv, requireAccessId, type BackendConfig } from './config';
import { MonthlyBudgetExceededError } from './cache';
import { LiveTransitRepository, RejseplanenClient } from './rejseplanen';
import { UpstreamUnavailableError, type FetchLike } from './upstream';

export interface BackendDependencies {
  readonly config: BackendConfig;
  readonly repository: LiveTransitRepository;
  readonly client: RejseplanenClient;
}

export function createBackendServer(dependencies: BackendDependencies): ReturnType<typeof createServer> {
  return createServer(async (request, response) => {
    try {
      await route(request, response, dependencies);
    } catch (error) {
      writeError(response, error);
    }
  });
}

export function createDependencies(config = configFromEnv(), fetcher?: FetchLike): BackendDependencies {
  const client = new RejseplanenClient(config, fetcher);
  return { config, client, repository: new LiveTransitRepository(client) };
}

async function route(request: IncomingMessage, response: ServerResponse, dependencies: BackendDependencies): Promise<void> {
  const url = new URL(request.url ?? '/', 'http://localhost');
  if (request.method !== 'GET') {
    response.writeHead(405, { 'content-type': 'application/json', allow: 'GET' });
    response.end(JSON.stringify({ error: { code: 'METHOD_NOT_ALLOWED', message: 'Only GET is supported.' } }));
    return;
  }
  if (url.pathname === '/health') {
    const configured = !!dependencies.config.accessId;
    const budget = await dependencies.client.budgetSnapshot();
    writeJson(response, 200, { status: configured ? 'ok' : 'unconfigured', configured, month: budget.month, upstreamCalls: budget.calls, monthlyCallLimit: dependencies.config.monthlyCallLimit });
    return;
  }
  requireAccessId(dependencies.config);
  if (url.pathname === '/api/stops/search') {
    const query = url.searchParams.get('q')?.trim() ?? '';
    if (!query) throw new HttpError(400, 'INVALID_REQUEST', 'q is required.');
    writeJson(response, 200, await dependencies.repository.searchStops(query, coordinates(url)));
    return;
  }
  if (url.pathname === '/api/stops/nearby') {
    const radiusM = Number(url.searchParams.get('radiusM') ?? 1000);
    if (!Number.isFinite(radiusM) || radiusM <= 0 || radiusM > 10_000) {
      throw new HttpError(400, 'INVALID_REQUEST', 'radiusM must be a number between 1 and 10000.');
    }
    const origin = coordinates(url);
    writeJson(response, 200, await dependencies.repository.nearbyStops(origin, radiusM));
    return;
  }
  if (url.pathname === '/api/stops/nearest') {
    writeJson(response, 200, await dependencies.repository.nearestStop(coordinates(url)));
    return;
  }
  if (url.pathname === '/api/board') {
    const stopId = url.searchParams.get('stopId');
    if (!stopId) throw new HttpError(400, 'INVALID_REQUEST', 'stopId is required.');
    const result = await dependencies.repository.board(stopId, Date.now());
    writeJson(response, 200, result);
    return;
  }
  throw new HttpError(404, 'NOT_FOUND', 'Route not found.');
}

function writeError(response: ServerResponse, error: unknown): void {
  if (response.headersSent) {
    response.destroy();
    return;
  }
  if (error instanceof MonthlyBudgetExceededError) {
    writeJson(response, 429, { error: { code: error.code, message: error.message } });
  } else if (error instanceof HttpError) {
    writeJson(response, error.status, { error: { code: error.code, message: error.message } });
  } else if (error instanceof UpstreamUnavailableError || error instanceof Error && error.message.includes('not configured')) {
    writeJson(response, 503, { error: { code: 'REJSEPLANEN_UNAVAILABLE', message: error.message } });
  } else {
    writeJson(response, 500, { error: { code: 'INTERNAL_ERROR', message: 'The backend could not complete the request.' } });
  }
}

function coordinates(url: URL): { lat: number; lng: number } {
  const latParam = url.searchParams.get('lat');
  const lngParam = url.searchParams.get('lng');
  const lat = Number(latParam);
  const lng = Number(lngParam);
  if (latParam === null || lngParam === null || latParam.trim() === '' || lngParam.trim() === '' || !Number.isFinite(lat) || !Number.isFinite(lng)
    || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    throw new HttpError(400, 'INVALID_REQUEST', 'lat and lng are required WGS84 numbers.');
  }
  return { lat, lng };
}

const writeJson = (response: ServerResponse, status: number, value: unknown): void => {
  response.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  response.end(JSON.stringify(value));
};

class HttpError extends Error {
  constructor(readonly status: number, readonly code: string, message: string) { super(message); }
}

export function startServer(): void {
  const config = configFromEnv();
  const server = createBackendServer(createDependencies(config));
  const port = Number(process.env.PORT ?? 8787);
  server.listen(port, '127.0.0.1');
}
