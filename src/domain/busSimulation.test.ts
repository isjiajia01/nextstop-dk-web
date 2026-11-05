import { describe, expect, it } from 'vitest';
import { simulateBuses } from './busSimulation';
import { cumulativeLengths } from './routeGeometry';

const east = [{ lat: 55, lng: 12 }, { lat: 55, lng: 12.1 }];
const west = [...east].reverse();
const total = cumulativeLengths(east).at(-1) as number;

describe('simulateBuses', () => {
  it('spaces vehicles evenly on both directions and respects the cap', () => {
    const buses = simulateBuses([east, west], 0);
    expect(buses).toHaveLength(8);
    expect(buses.filter((b) => b.direction === 0).map((b) => b.distance)).toEqual([0, total / 4, total / 2, total * 3 / 4]);
    expect(simulateBuses([east, west], 0, 3)).toHaveLength(3);
    expect(simulateBuses([east, west], 0, 100)).toHaveLength(8);
  });
  it('wraps at the terminus and derives direction from the route', () => {
    const buses = simulateBuses([east, west], total / 9 * 1000, 2);
    expect(buses[0]?.distance).toBeCloseTo(0, 6);
    expect(buses[0]?.bearing).toBeCloseTo(90, 0);
    expect(buses[1]?.bearing).toBeCloseTo(270, 0);
  });
  it('moves from the supplied starting distances and wraps negative offsets', () => {
    const initial = simulateBuses([east, west], 0, 2, [100, -100]);
    const later = simulateBuses([east, west], 5000, 2, [100, -100]);
    expect(initial[0]?.distance).toBeCloseTo(100);
    expect(initial[1]?.distance).toBeCloseTo(total - 100);
    expect(later[0]?.distance).toBeCloseTo(145);
    expect(later[1]?.distance).toBeCloseTo(total - 55);
  });
  it('is deterministic and handles invalid routes', () => {
    expect(simulateBuses([east, west], 1234567)).toEqual(simulateBuses([east, west], 1234567));
    expect(simulateBuses([[], [east[0]!, east[0]!]], 0)).toEqual([]);
  });
});
