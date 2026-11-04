import type { Departure } from '../src/domain/departure';
import { parseCopenhagenLocal } from '../src/domain/time';
import type { Board, Journey, LatLng, ServiceAlert, Stop, StopWithDistance } from '../src/data/types';
import { RepositoryError, type TransitRepository } from '../src/data/types';
import { type BackendConfig } from './config';
import { UpstreamGateway, UpstreamUnavailableError, type FetchLike } from './upstream';
import { PersistentCache } from './cache';

interface LocationPayload {
  LocationList?: { StopLocation?: unknown; CoordLocation?: unknown };
  stopLocationOrCoordLocation?: unknown;
}

interface DepartureBoardPayload {
  DepartureBoard?: Record<string, unknown>;
  Departure?: unknown;
}

export interface RejseplanLocation {
  id: string;
  name: string;
  lat: number;
  lng: number;
  type: 'StopLocation' | 'CoordLocation';
}

/** Adapter for the legacy Rejseplanen API shape used by the local reference project. */
export class RejseplanenClient {
  readonly gateway: UpstreamGateway;

  constructor(config: BackendConfig, fetcher?: FetchLike, cache = new PersistentCache(config.cachePath)) {
    this.gateway = new UpstreamGateway(config, cache, fetcher);
  }

  async locations(query: string): Promise<RejseplanLocation[]> {
    const result = await this.gateway.requestJson<LocationPayload>('location.name', { input: query.trim() });
    return locationCandidates(result.value);
  }

  async nearby(origin: LatLng, radiusM: number): Promise<RejseplanLocation[]> {
    const result = await this.gateway.requestJson<LocationPayload>('location.nearbystops', {
      originCoordLat: origin.lat,
      originCoordLong: origin.lng,
      r: Math.max(1, Math.round(radiusM)),
    });
    return locationCandidates(result.value);
  }

  async board(stopId: string, now = Date.now()): Promise<Board> {
    const result = await this.gateway.requestJson<DepartureBoardPayload>('departureBoard', { id: stopId });
    return parseBoard(result.value, stopId, now, result.fetchedAt);
  }

  async budgetSnapshot(): Promise<{ month: string; calls: number }> {
    return this.gateway.budgetSnapshot();
  }
}

/** Implements the browser data seam while keeping credentials inside this server process. */
export class LiveTransitRepository implements TransitRepository {
  readonly source = 'live' as const;

  constructor(private readonly client: RejseplanenClient) {}

  async searchStops(query: string, origin: LatLng): Promise<StopWithDistance[]> {
    if (!query.trim()) return [];
    return (await this.client.locations(query)).map((location) => withDistance(location, origin));
  }

  async stopById(_id: string, _origin: LatLng): Promise<StopWithDistance | null> {
    throw new RepositoryError('upstream', 'Stop-ID lookup is unavailable because the local API reference only documents text search for locations.');
  }

  async board(stopId: string, now: number): Promise<Board> {
    return this.client.board(stopId, now);
  }

  async nearbyStops(origin: LatLng, radiusM: number): Promise<StopWithDistance[]> {
    return (await this.client.nearby(origin, radiusM))
      .map((location) => withDistance(location, origin))
      .filter((stop) => stop.distance <= radiusM)
      .sort((a, b) => a.distance - b.distance)
      .slice(0, 8);
  }

  async nearestStop(origin: LatLng): Promise<StopWithDistance | null> {
    return (await this.nearbyStops(origin, 1000))[0] ?? null;
  }

  async journey(_journeyId: string, _stopId: string, _now: number): Promise<Journey> {
    throw new RepositoryError('upstream', 'Journey details are unavailable because the local API reference does not document a journey-detail response.');
  }

  async alerts(_stopId: string): Promise<ServiceAlert[]> {
    throw new RepositoryError('upstream', 'Service alerts are unavailable because the local API reference does not document an alerts endpoint.');
  }
}

function parseBoard(payload: DepartureBoardPayload, stopId: string, now: number, fetchedAt: number): Board {
  if (!payload || typeof payload !== 'object' || (!('DepartureBoard' in payload) && !('Departure' in payload))) {
    throw new UpstreamUnavailableError('rejected', 'Rejseplanen returned an unrecognized departure board.');
  }
  const board = record(payload.DepartureBoard ?? payload);
  const raw = asArray(board.Departure ?? payload.Departure);
  const name = stringValue(board.name) ?? stopId;
  const stop: Stop = {
    id: stopId,
    name,
    road: '',
    lat: numberValue(board.lat) ?? 0,
    lng: numberValue(board.lon ?? board.lng) ?? 0,
    lines: [...new Set(raw.map((item) => stringValue(record(item).line ?? record(item).name)).filter((line): line is string => !!line))],
  };
  const departures = raw.flatMap((item, index) => parseDeparture(item, stopId, index, now));
  return { stop, departures, fetchedAt };
}

function parseDeparture(value: unknown, stopId: string, index: number, now: number): Departure[] {
  const item = record(value);
  const scheduledDate = stringValue(item.date) ?? localDate(now);
  const scheduledTime = stringValue(item.time);
  const predictedDate = stringValue(item.rtDate);
  const predictedTime = stringValue(item.rtTime);
  if (!scheduledTime && !predictedTime) return [];
  const scheduled = scheduledTime ? parseCopenhagen(scheduledDate, scheduledTime) : parseCopenhagen(predictedDate ?? scheduledDate, predictedTime ?? '');
  const predicted = predictedTime ? parseCopenhagen(predictedDate ?? scheduledDate, predictedTime) : undefined;
  if (scheduled === undefined || (predictedTime && predicted === undefined)) return [];
  const line = stringValue(item.line ?? item.name) ?? 'Ukendt linje';
  const destination = stringValue(item.direction ?? item.destination) ?? 'Ukendt destination';
  return [{
    id: `${stopId}:${index}`,
    journeyId: `${stopId}:${line}:${scheduledDate}:${scheduledTime ?? predictedTime}:${destination}`,
    line,
    destination,
    scheduled,
    predicted,
  }];
}

function locationCandidates(payload: LocationPayload): RejseplanLocation[] {
  if (!payload || typeof payload !== 'object' || (!('LocationList' in payload) && !('stopLocationOrCoordLocation' in payload))) {
    throw new UpstreamUnavailableError('rejected', 'Rejseplanen returned an unrecognized location response.');
  }
  const candidates: Array<{ type: 'StopLocation' | 'CoordLocation'; value: unknown }> = [];
  for (const type of ['StopLocation', 'CoordLocation'] as const) {
    for (const value of asArray(payload.LocationList?.[type])) candidates.push({ type, value });
  }
  for (const wrapped of asArray(payload.stopLocationOrCoordLocation)) {
    const item = record(wrapped);
    for (const type of ['StopLocation', 'CoordLocation'] as const) {
      if (item[type] !== undefined) candidates.push({ type, value: item[type] });
    }
  }
  return candidates.flatMap(({ type, value }) => {
    const item = record(value);
    const id = stringValue(item.id);
    const name = stringValue(item.name);
    const lat = numberValue(item.lat);
    const lng = numberValue(item.lon ?? item.lng);
    return id && name && lat !== undefined && lng !== undefined ? [{ id, name, lat, lng, type }] : [];
  });
}

const withDistance = (location: RejseplanLocation, origin: LatLng): StopWithDistance => {
  const match = /^([^()]+?)(?:\s*\(([^)]+)\))?$/.exec(location.name);
  const name = match?.[1]?.trim() || location.name;
  const road = match?.[2]?.trim() || '';
  return { id: location.id, name, road, lat: location.lat, lng: location.lng, lines: [], distance: haversine(origin, location) };
};

const haversine = (a: LatLng, b: LatLng): number => {
  const radians = (degrees: number): number => degrees * Math.PI / 180;
  const dLat = radians(b.lat - a.lat);
  const dLng = radians(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(radians(a.lat)) * Math.cos(radians(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 6_371_000 * 2 * Math.asin(Math.sqrt(h));
};

const parseCopenhagen = (date: string, time: string): number | undefined => {
  const result = parseCopenhagenLocal(date, time);
  return result.ok ? result.ms : undefined;
};

const localDate = (now: number): string => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Copenhagen', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(now));
const asArray = (value: unknown): unknown[] => Array.isArray(value) ? value : value === undefined ? [] : [value];
const record = (value: unknown): Record<string, unknown> => value && typeof value === 'object' ? value as Record<string, unknown> : {};
const stringValue = (value: unknown): string | undefined => typeof value === 'string' && value.trim() ? value.trim() : typeof value === 'number' ? String(value) : undefined;
const numberValue = (value: unknown): number | undefined => {
  if (value === null || value === undefined || typeof value === 'string' && !value.trim()) return undefined;
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
};

