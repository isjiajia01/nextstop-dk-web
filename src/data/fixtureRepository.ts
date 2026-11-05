import { foldLoose } from '../domain/line';
import type { Departure } from '../domain/departure';
import { ALERTS, ROUTE_5C_TO_HUSUM, ROUTE_5C_TO_SUNDBY, STOPS, type StopSpec } from './fixtures';
import {
  RepositoryError, type Board, type Journey, type LatLng, type ServiceAlert, type Stop, type StopWithDistance,
  type TransitRepository,
} from './types';

export type DemoMode = 'normal' | 'now' | 'issues' | 'offline' | 'error';

export function haversine(a: LatLng, b: LatLng): number {
  const R = 6_371_000;
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

const toStop = (s: StopSpec): Stop => ({
  id: s.id, name: s.name, road: s.road, lat: s.lat, lng: s.lng, lines: [...new Set(s.lines.map((l) => l.line))],
});

/** Synthetic repository. `mode` is flipped by the demo panel to rehearse failure and status states. */
export class FixtureRepository implements TransitRepository {
  readonly source = 'demo' as const;
  mode: DemoMode = 'normal';
  /** Fixed reference instant: the synthetic timetable is anchored here so it stays stable between refreshes. */
  private anchor = Date.now();

  constructor(private readonly latencyMs = 0) {}

  /** Restart the synthetic timetable relative to `now` (used when a demo scenario is chosen). */
  reseed(now: number): void { this.anchor = now; }

  private async delay(): Promise<void> {
    if (this.latencyMs > 0) await new Promise((r) => setTimeout(r, this.latencyMs));
  }

  private withDistance(s: StopSpec, origin: LatLng): StopWithDistance {
    return { ...toStop(s), distance: haversine(origin, s) };
  }

  async nearbyStops(origin: LatLng, radiusM: number): Promise<StopWithDistance[]> {
    return STOPS.map((s) => this.withDistance(s, origin))
      .filter((s) => s.distance <= radiusM)
      .sort((a, b) => a.distance - b.distance)
      .slice(0, 8);
  }

  async nearestStop(origin: LatLng): Promise<StopWithDistance | null> {
    return STOPS.map((s) => this.withDistance(s, origin)).sort((a, b) => a.distance - b.distance)[0] ?? null;
  }

  async stopById(id: string, origin: LatLng): Promise<StopWithDistance | null> {
    const s = STOPS.find((x) => x.id === id);
    return s ? this.withDistance(s, origin) : null;
  }

  async searchStops(query: string, origin: LatLng): Promise<StopWithDistance[]> {
    const q = foldLoose(query.trim());
    if (!q) return [];
    return STOPS.filter((s) => foldLoose(`${s.name} ${s.road}`).includes(q))
      .map((s) => this.withDistance(s, origin))
      .sort((a, b) => a.distance - b.distance);
  }

  async board(stopId: string, now: number): Promise<Board> {
    await this.delay();
    if (this.mode === 'offline') throw new RepositoryError('offline', 'Ingen forbindelse');
    if (this.mode === 'error') throw new RepositoryError('upstream', 'Rejseplanen svarer ikke');
    const spec = STOPS.find((s) => s.id === stopId);
    if (!spec) throw new RepositoryError('upstream', `Ukendt stoppested ${stopId}`);
    return { stop: toStop(spec), departures: this.generate(spec, now), fetchedAt: now };
  }

  private generate(spec: StopSpec, now: number): Departure[] {
    const out: Departure[] = [];
    const minNow = (now - this.anchor) / 60_000;
    const lo = minNow - 3; // keep recent departures so cancellation grace and expiry are exercised
    const hi = minNow + 75;
    spec.lines.forEach((l, li) => {
      let first = l.first;
      if (this.mode === 'now' && spec.id === 'nv' && l.line === '5C') first = 0.4;
      for (let k = Math.max(0, Math.floor((lo - first) / l.headway)); first + k * l.headway <= hi; k++) {
        const m = first + k * l.headway;
        if (m < lo) continue;
        const scheduled = this.anchor + Math.round(m * 60_000);
        let predicted: number | undefined = scheduled + (l.rtOffsetS ?? 0) * 1000;
        let cancelled = false;
        if (this.mode === 'issues' && k === 0) {
          if (l.line === '150S') cancelled = true;
          if (l.line === '6A') predicted = scheduled + 4 * 60_000;
          if (l.line === '37') predicted = undefined;
        }
        out.push({
          id: `${spec.id}-${li}-${k}`, journeyId: `${spec.id}|${li}|${k}`, line: l.line, destination: l.dest,
          via: l.via || undefined, scheduled, predicted, cancelled: cancelled || undefined,
        });
      }
    });
    return out;
  }

  async journey(journeyId: string, stopId: string, now: number): Promise<Journey> {
    const board = await this.board(stopId, now);
    const dep = board.departures.find((d) => d.journeyId === journeyId);
    if (!dep) throw new RepositoryError('upstream', 'Turen findes ikke længere');
    const base = dep.destination === 'Husum Torv' ? ROUTE_5C_TO_HUSUM : ROUTE_5C_TO_SUNDBY;
    const mineIdx = Math.max(0, base.findIndex((r) => r.name === 'Nørreport St.'));
    const route = base.map((r, i) => (i === base.length - 1 && dep.destination !== r.name ? { ...r, name: dep.destination } : r));
    const delay = dep.predicted !== undefined ? dep.predicted - dep.scheduled : 0;
    return {
      journeyId, line: dep.line, destination: dep.destination, cancelled: !!dep.cancelled,
      stops: route.map((r, i) => ({
        name: i === mineIdx ? board.stop.name : r.name, lat: r.lat, lng: r.lng,
        scheduled: dep.scheduled + r.off * 60_000,
        predicted: dep.predicted === undefined ? undefined : dep.scheduled + r.off * 60_000 + delay,
        mine: i === mineIdx, last: i === route.length - 1,
      })),
    };
  }

  async alerts(stopId: string): Promise<ServiceAlert[]> {
    const spec = STOPS.find((s) => s.id === stopId);
    if (!spec) return [];
    const lines = new Set(spec.lines.map((l) => l.line));
    return ALERTS.filter((a) => a.lines.some((l) => lines.has(l)));
  }
}
