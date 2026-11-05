import { describe, expect, it } from 'vitest';
import { bearingAtDistance, cumulativeLengths, journeyProgress, pointAtDistance } from './routeGeometry';

const eastLine = [{ lat: 55, lng: 12 }, { lat: 55, lng: 12.001 }, { lat: 55, lng: 12.002 }];

describe('route geometry', () => {
  it('calculates cumulative line lengths from zero', () => {
    const lengths = cumulativeLengths(eastLine);
    expect(lengths).toHaveLength(3);
    expect(lengths[0]).toBe(0);
    expect(lengths[2]).toBeGreaterThan(lengths[1] as number);
  });

  it('returns the point at a distance along the line', () => {
    const lengths = cumulativeLengths(eastLine);
    const midpoint = pointAtDistance(eastLine, (lengths[2] as number) / 2);
    expect(midpoint?.lat).toBeCloseTo(55, 8);
    expect(midpoint?.lng).toBeCloseTo(12.001, 5);
  });

  it('returns the compass bearing of the active segment', () => {
    expect(bearingAtDistance(eastLine, 10)).toBeCloseTo(90, 0);
  });

  it('interpolates progress between scheduled or predicted stops', () => {
    const stops = [
      { name: 'A', lat: 55, lng: 12, scheduled: 0 },
      { name: 'B', lat: 55, lng: 12.1, scheduled: 1000 },
      { name: 'C', lat: 55, lng: 12.2, scheduled: 3000 },
    ];
    expect(journeyProgress(stops, 500)).toBeCloseTo(0.25);
    expect(journeyProgress(stops, 2000)).toBeCloseTo(0.75);
  });
});
