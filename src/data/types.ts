import type { Departure } from '../domain/departure';

export interface LatLng { lat: number; lng: number }

export interface Stop extends LatLng {
  id: string;
  name: string;
  road: string;
  /** Lines that serve the stop (for chips in lists and the map callout). */
  lines: string[];
}

export interface StopWithDistance extends Stop { distance: number }

export interface Board { stop: Stop; departures: Departure[]; fetchedAt: number }

export interface JourneyStop extends LatLng {
  name: string;
  scheduled: number;
  predicted?: number;
  /** The stop the rider is looking at. */
  mine?: boolean;
  last?: boolean;
}
export interface Journey { journeyId: string; line: string; destination: string; stops: JourneyStop[]; cancelled: boolean }

export interface ServiceAlert {
  id: string;
  lines: string[];
  title: string;
  short: string;
  body: string;
  source: string;
}

export type RepoErrorKind = 'offline' | 'upstream';
export class RepositoryError extends Error {
  constructor(readonly kind: RepoErrorKind, message: string) {
    super(message);
    this.name = 'RepositoryError';
  }
}

/**
 * The only data seam of the app. The fixture implementation is synthetic ("demo"). A real implementation
 * talks to our own proxy (never to Rejseplanen from the browser: the API key must stay on the server).
 */
export interface TransitRepository {
  /** Shown in the UI so synthetic data is never mistaken for live data. */
  readonly source: 'demo' | 'live';
  nearbyStops(origin: LatLng, radiusM: number): Promise<StopWithDistance[]>;
  nearestStop(origin: LatLng): Promise<StopWithDistance | null>;
  searchStops(query: string, origin: LatLng): Promise<StopWithDistance[]>;
  stopById(id: string, origin: LatLng): Promise<StopWithDistance | null>;
  board(stopId: string, now: number): Promise<Board>;
  journey(journeyId: string, stopId: string, now: number): Promise<Journey>;
  alerts(stopId: string): Promise<ServiceAlert[]>;
}
