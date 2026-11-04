import {
  RepositoryError, type Board, type Journey, type LatLng, type ServiceAlert, type StopWithDistance, type TransitRepository,
} from './types';

/** Live repository: talks only to our own backend (server/), never to Rejseplanen, so the access ID stays server-side. */
export class HttpRepository implements TransitRepository {
  readonly source = 'live' as const;
  private readonly known = new Map<string, StopWithDistance>();

  constructor(private readonly baseUrl: string, private readonly fetcher: typeof fetch = (...a) => fetch(...a)) {}

  private async get<T>(path: string, params: Record<string, string | number>): Promise<T> {
    const url = new URL(path, this.baseUrl.endsWith('/') ? this.baseUrl : `${this.baseUrl}/`);
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v));
    let res: Response;
    try { res = await this.fetcher(url); } catch { throw new RepositoryError('offline', 'Ingen forbindelse'); }
    if (!res.ok) throw new RepositoryError('upstream', `Rejseplanen svarer ikke (${res.status})`);
    return (await res.json()) as T;
  }

  private remember(stops: StopWithDistance[]): StopWithDistance[] {
    for (const s of stops) this.known.set(s.id, s);
    return stops;
  }

  async nearbyStops(origin: LatLng, radiusM: number): Promise<StopWithDistance[]> {
    return this.remember(await this.get<StopWithDistance[]>('api/stops/nearby', { lat: origin.lat, lng: origin.lng, radiusM }));
  }

  async nearestStop(origin: LatLng): Promise<StopWithDistance | null> {
    const s = await this.get<StopWithDistance | null>('api/stops/nearest', { lat: origin.lat, lng: origin.lng });
    if (s) this.known.set(s.id, s);
    return s;
  }

  async searchStops(query: string, origin: LatLng): Promise<StopWithDistance[]> {
    if (!query.trim()) return [];
    return this.remember(await this.get<StopWithDistance[]>('api/stops/search', { q: query, lat: origin.lat, lng: origin.lng }));
  }

  async stopById(id: string, _origin: LatLng): Promise<StopWithDistance | null> {
    return this.known.get(id) ?? null;
  }

  async board(stopId: string, _now: number): Promise<Board> {
    const b = await this.get<Board>('api/board', { stopId });
    const known = this.known.get(stopId);
    // The departure board has no coordinates; reuse what a previous stop lookup returned.
    if (known) b.stop = { ...b.stop, name: known.name, lat: known.lat, lng: known.lng, road: known.road };
    return b;
  }

  async journey(): Promise<Journey> {
    throw new RepositoryError('upstream', 'Turdetaljer er ikke tilgængelige endnu');
  }

  async alerts(): Promise<ServiceAlert[]> { return []; }
}
