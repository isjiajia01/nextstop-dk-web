import type { LatLng } from '../data/types';
import { bearingAtDistance, cumulativeLengths, pointAtDistance } from './routeGeometry';

export interface SimulatedBus { position: LatLng; bearing: number; distance: number; direction: number }

/** A clock-based demo fleet, evenly spaced within each supplied direction. */
export function simulateBuses(routes: readonly (readonly LatLng[])[], timeMs: number, cap = 8, startDistances: readonly number[] = []): SimulatedBus[] {
  const usable = routes.slice(0, 2).filter((route) => route.length > 1);
  const limit = Math.max(0, Math.min(8, Math.floor(cap)));
  if (!usable.length || !Number.isFinite(timeMs)) return [];
  const buses: SimulatedBus[] = [];
  usable.forEach((route, direction) => {
    const lengths = cumulativeLengths(route);
    const total = lengths[lengths.length - 1] ?? 0;
    const count = Math.floor(limit / usable.length) + (direction < limit % usable.length ? 1 : 0);
    if (total <= 0) return;
    for (let i = 0; i < count; i++) {
      const distance = (((startDistances[direction] ?? 0) + timeMs / 1000 * 9 + i * total / count) % total + total) % total;
      const position = pointAtDistance(route, distance);
      const bearing = bearingAtDistance(route, distance);
      if (position && bearing !== null) buses.push({ position, bearing, distance, direction });
    }
  });
  return buses;
}
