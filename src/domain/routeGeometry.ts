import type { LatLng, JourneyStop } from '../data/types';

const EARTH_RADIUS_M = 6_371_000;
const toRadians = (degrees: number): number => (degrees * Math.PI) / 180;

/** Great-circle distance between two WGS84 latitude/longitude points. */
export function distanceMeters(a: LatLng, b: LatLng): number {
  const dLat = toRadians(b.lat - a.lat);
  const dLng = toRadians(b.lng - a.lng);
  const lat1 = toRadians(a.lat);
  const lat2 = toRadians(b.lat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(Math.min(1, h)));
}

/** Distances from the first line point to every point, including the zero origin. */
export function cumulativeLengths(points: readonly LatLng[]): number[] {
  const lengths = [0];
  for (let i = 1; i < points.length; i += 1) {
    lengths.push((lengths[i - 1] ?? 0) + distanceMeters(points[i - 1] as LatLng, points[i] as LatLng));
  }
  return lengths;
}

/** Interpolates a point on a line at a distance in metres, clamping at either end. */
export function pointAtDistance(points: readonly LatLng[], distance: number): LatLng | null {
  const first = points[0];
  if (!first) return null;
  if (points.length === 1) return { lat: first.lat, lng: first.lng };
  const lengths = cumulativeLengths(points);
  const total = lengths[lengths.length - 1] ?? 0;
  if (distance <= 0) return { lat: first.lat, lng: first.lng };
  const last = points[points.length - 1];
  if (distance >= total && last) return { lat: last.lat, lng: last.lng };
  const segment = lengths.findIndex((length) => length >= distance);
  const i = Math.max(1, segment) - 1;
  const startDistance = lengths[i] ?? 0;
  const segmentLength = (lengths[i + 1] ?? startDistance) - startDistance;
  const ratio = segmentLength > 0 ? (distance - startDistance) / segmentLength : 0;
  const start = points[i] as LatLng;
  const end = points[i + 1] as LatLng;
  return { lat: start.lat + (end.lat - start.lat) * ratio, lng: start.lng + (end.lng - start.lng) * ratio };
}

/** Initial compass bearing of the line segment at a distance in metres. */
export function bearingAtDistance(points: readonly LatLng[], distance: number): number | null {
  if (points.length < 2) return null;
  const lengths = cumulativeLengths(points);
  const total = lengths[lengths.length - 1] ?? 0;
  const target = Math.max(0, Math.min(total, distance));
  let i = lengths.findIndex((length) => length > target);
  if (i < 0) i = points.length - 1;
  if (i < 1) i = 1;
  const from = points[i - 1] as LatLng;
  const to = points[i] as LatLng;
  const lat1 = toRadians(from.lat);
  const lat2 = toRadians(to.lat);
  const dLng = toRadians(to.lng - from.lng);
  const bearing = Math.atan2(Math.sin(dLng) * Math.cos(lat2), Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng));
  return (((bearing * 180) / Math.PI) + 360) % 360;
}

/** Fractional journey progress between the first and last stop at an absolute time. */
export function journeyProgress(stops: readonly JourneyStop[], now: number): number {
  if (stops.length < 2) return 0;
  const times = stops.map((stop) => stop.predicted ?? stop.scheduled);
  if (now <= (times[0] as number)) return 0;
  for (let i = 0; i < times.length - 1; i += 1) {
    const start = times[i] as number;
    const end = times[i + 1] as number;
    if (now <= end) {
      const ratio = end > start ? (now - start) / (end - start) : 0;
      return (i + Math.max(0, Math.min(1, ratio))) / (times.length - 1);
    }
  }
  return 1;
}
