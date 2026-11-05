import { describe, expect, it } from 'vitest';
import { parseCsvLine, selectMostCommonShapes, type TripRecord } from './csv';
import { simplifyLine, validateStopOrder, type Coordinate, type OrderedStop } from './geometry';

const point = (lon: number, lat = 55): Coordinate => ({ lon, lat });

const trip = (tripId: string, directionId: string, shapeId: string): TripRecord => ({
  routeId: '23318_3', tripId, directionId, headsign: 'Test', shapeId,
});

describe('GTFS CSV parsing', () => {
  it('parses quoted commas and escaped quotes', () => {
    expect(parseCsvLine('"stop_id","stop_name","note"')).toEqual(['stop_id', 'stop_name', 'note']);
    expect(parseCsvLine('"a","Nørreport, St.","say ""hi"""')).toEqual(['a', 'Nørreport, St.', 'say "hi"']);
  });
});

describe('GTFS shape selection', () => {
  it('selects the most common shape independently for each direction', () => {
    const selected = selectMostCommonShapes([
      trip('a', '0', 'shape-b'), trip('b', '0', 'shape-a'), trip('c', '0', 'shape-b'),
      trip('d', '1', 'shape-z'), trip('e', '1', 'shape-z'), trip('f', '1', 'shape-y'),
    ]);
    expect(selected).toEqual([
      { directionId: '0', shapeId: 'shape-b', tripId: 'a' },
      { directionId: '1', shapeId: 'shape-z', tripId: 'd' },
    ]);
  });
});

describe('GTFS geometry', () => {
  it('simplifies a line while preserving endpoints and a meaningful bend', () => {
    const input = [point(0), point(0.00001, 0.000002), point(0.00002, 0.0001), point(0.00003, 0.000102), point(0.00004)];
    const simplified = simplifyLine(input, 4);
    expect(simplified[0]).toEqual(input[0]);
    expect(simplified.at(-1)).toEqual(input.at(-1));
    expect(simplified.length).toBeLessThan(input.length);
    expect(simplified.length).toBeGreaterThan(2);
  });

  it('accepts ordered stops and rejects a stop that travels backward along the shape', () => {
    const shape = [point(0), point(0.001), point(0.002), point(0.003)];
    const stops: OrderedStop[] = [
      { ...point(0), stopId: 'a', sequence: 1 },
      { ...point(0.001), stopId: 'b', sequence: 2 },
      { ...point(0.002), stopId: 'c', sequence: 3 },
    ];
    const result = validateStopOrder(shape, stops);
    expect(result.shapeToStopRatio).toBeCloseTo(1.5, 2);
    expect(() => validateStopOrder(shape, [stops[0]!, stops[2]!, { ...stops[1]!, sequence: 3 }])).toThrow(/sequence/);
    expect(() => validateStopOrder(shape, [stops[0]!, stops[2]!, { ...stops[1]!, sequence: 4 }])).toThrow(/shape order/);
    expect(() => validateStopOrder([point(0), point(0.02)], stops)).toThrow(/implausible/);
  });
});
