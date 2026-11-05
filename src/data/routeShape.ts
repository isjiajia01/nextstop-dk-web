import { foldLoose } from '../domain/line';
import type { Journey } from './types';

export interface RouteShapeLineProperties {
  line: string;
  directionId: string;
  headsign: string;
  shapeId: string;
}

export interface RouteShapeStopProperties {
  directionId: string;
  stop_id: string;
  name: string;
  sequence: number;
}

export type RouteShapeFeature =
  | {
      type: 'Feature';
      properties: RouteShapeLineProperties;
      geometry: { type: 'LineString'; coordinates: number[][] };
    }
  | {
      type: 'Feature';
      properties: RouteShapeStopProperties;
      geometry: { type: 'Point'; coordinates: number[] };
    };

export interface RouteShapeCollection {
  type: 'FeatureCollection';
  features: RouteShapeFeature[];
}

export interface SelectedRouteShape {
  directionId: string;
  headsign: string;
  coordinates: Array<{ lat: number; lng: number }>;
  stops: Array<{ name: string; lat: number; lng: number; sequence: number }>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isFiniteCoordinate(coordinate: unknown, length: number): coordinate is number[] {
  return Array.isArray(coordinate)
    && coordinate.length >= length
    && coordinate.slice(0, length).every((value) => typeof value === 'number' && Number.isFinite(value));
}

function isRouteShape(value: unknown): value is RouteShapeCollection {
  if (!isRecord(value) || value.type !== 'FeatureCollection' || !Array.isArray(value.features) || value.features.length === 0) return false;
  return value.features.every((feature) => {
    if (!isRecord(feature) || feature.type !== 'Feature' || !isRecord(feature.geometry) || !isRecord(feature.properties)) return false;
    if (feature.geometry.type === 'LineString') {
      return Array.isArray(feature.geometry.coordinates)
        && feature.geometry.coordinates.length >= 2
        && feature.geometry.coordinates.every((coordinate) => isFiniteCoordinate(coordinate, 2))
        && typeof feature.properties.line === 'string'
        && typeof feature.properties.directionId === 'string'
        && typeof feature.properties.headsign === 'string'
        && typeof feature.properties.shapeId === 'string';
    }
    return feature.geometry.type === 'Point'
      && isFiniteCoordinate(feature.geometry.coordinates, 2)
      && typeof feature.properties.directionId === 'string'
      && typeof feature.properties.stop_id === 'string'
      && typeof feature.properties.name === 'string'
      && typeof feature.properties.sequence === 'number'
      && Number.isFinite(feature.properties.sequence);
  }) && value.features.some((feature) => feature.geometry.type === 'LineString');
}

function destinationScore(headsign: string, destination: string): number {
  const head = foldLoose(headsign.trim());
  const dest = foldLoose(destination.trim());
  if (!head || !dest) return 0;
  if (head === dest) return 2;
  return head.includes(dest) || dest.includes(head) ? 1 : 0;
}

function stopMatchScore(candidate: SelectedRouteShape, journey: Journey): number {
  // Longest ordered match distinguishes opposite directions that serve the same stops.
  let scores = Array<number>(candidate.stops.length + 1).fill(0);
  for (const journeyStop of journey.stops) {
    const name = foldLoose(journeyStop.name.trim());
    const next = [0];
    candidate.stops.forEach((stop, i) => {
      const candidateName = foldLoose(stop.name.trim());
      const matches = !!name && !!candidateName && (candidateName.includes(name) || name.includes(candidateName));
      next.push(matches ? (scores[i] ?? 0) + 1 : Math.max(scores[i + 1] ?? 0, next[i] ?? 0));
    });
    scores = next;
  }
  return scores[candidate.stops.length] ?? 0;
}

/**
 * Selects the line whose headsign matches the journey destination. If no headsign matches, the line with the
 * greatest number of journey stop names matching in order is used. The latter rule keeps direction selection deterministic
 * when a feed uses headsigns that differ from the application's destination text.
 */
export function selectRouteDirection(shape: RouteShapeCollection, journey: Journey): SelectedRouteShape | null {
  const candidates: SelectedRouteShape[] = shape.features
    .filter((feature): feature is Extract<RouteShapeFeature, { geometry: { type: 'LineString' } }> => feature.geometry.type === 'LineString')
    .filter((feature) => feature.properties.line === journey.line)
    .map((line) => ({
      directionId: line.properties.directionId,
      headsign: line.properties.headsign,
      coordinates: line.geometry.coordinates.map(([lng, lat]) => ({ lng: lng as number, lat: lat as number })),
      stops: shape.features
        .filter((feature): feature is Extract<RouteShapeFeature, { geometry: { type: 'Point' } }> => feature.geometry.type === 'Point')
        .filter((feature) => feature.properties.directionId === line.properties.directionId)
        .sort((a, b) => a.properties.sequence - b.properties.sequence)
        .map((feature) => ({
          name: feature.properties.name,
          lng: feature.geometry.coordinates[0] as number,
          lat: feature.geometry.coordinates[1] as number,
          sequence: feature.properties.sequence,
        })),
    }));
  if (!candidates.length) return null;
  const scored = candidates.map((candidate, index) => ({
    candidate,
    index,
    destination: destinationScore(candidate.headsign, journey.destination),
    stops: stopMatchScore(candidate, journey),
  }));
  const hasDestinationMatch = scored.some((score) => score.destination > 0);
  scored.sort((a, b) => (hasDestinationMatch
    ? b.destination - a.destination || b.stops - a.stops || a.index - b.index
    : b.stops - a.stops || a.index - b.index));
  return scored[0]?.candidate ?? null;
}

/** Keep the journey's original coordinates when generated geometry cannot be used. */
export function journeyRouteCoordinates(shape: RouteShapeCollection | null, journey: Journey): { coords: Journey['stops'] | SelectedRouteShape['coordinates']; realShape: boolean } {
  const selected = shape ? selectRouteDirection(shape, journey) : null;
  return selected ? { coords: selected.coordinates, realShape: true } : { coords: journey.stops, realShape: false };
}

/** Load generated route geometry; a missing archive/output leaves the fixture path available. */
export async function loadRouteShape(fetcher: typeof fetch = fetch): Promise<RouteShapeCollection | null> {
  try {
    const response = await fetcher('generated/route-5c.geojson');
    if (!response.ok) return null;
    const data: unknown = await response.json();
    return isRouteShape(data) ? data : null;
  } catch {
    return null;
  }
}
