import { describe, expect, it } from 'vitest';
import { journeyRouteCoordinates, loadRouteShape, selectRouteDirection } from './routeShape';

describe('loadRouteShape', () => {
  it('returns null when generated output is unavailable', async () => {
    const result = await loadRouteShape(async () => new Response('', { status: 404 }));
    expect(result).toBeNull();
  });

  it('keeps the original journey coordinates when shape data is unavailable', () => {
    const stops = [{ name: 'Fixture', lat: 55.6, lng: 12.5, scheduled: 0 }];
    const result = journeyRouteCoordinates(null, { journeyId: 'test', cancelled: false, line: '5C', destination: 'Test', stops });
    expect(result.realShape).toBe(false);
    expect(result.coords).toBe(stops);
  });

  it('returns null for an HTML SPA fallback with status 200', async () => {
    const result = await loadRouteShape(async () => new Response('<!doctype html><html><body>app</body></html>', {
      status: 200,
      headers: { 'content-type': 'text/html' },
    }));
    expect(result).toBeNull();
  });

  it('returns a typed collection for valid generated output', async () => {
    const result = await loadRouteShape(async () => new Response(JSON.stringify({
      type: 'FeatureCollection',
      features: [{
        type: 'Feature',
        properties: { line: '5C', directionId: '0', headsign: 'Sundbyvester Plads', shapeId: '3711' },
        geometry: { type: 'LineString', coordinates: [[12.5, 55.6], [12.6, 55.7]] },
      }, {
        type: 'Feature',
        properties: { directionId: '0', stop_id: 'stop-1', name: 'Test', sequence: 1 },
        geometry: { type: 'Point', coordinates: [12.5, 55.6] },
      }],
    }), { status: 200, headers: { 'content-type': 'application/json' } }));
    expect(result?.features).toHaveLength(2);
    expect(result?.features[0]?.properties).toMatchObject({ line: '5C' });
  });

  it('chooses the headsign matching the journey destination', () => {
    const shape = {
      type: 'FeatureCollection' as const,
      features: [
        { type: 'Feature' as const, properties: { line: '5C', directionId: '0', headsign: 'Lufthavnen', shapeId: 'a' }, geometry: { type: 'LineString' as const, coordinates: [[12.5, 55.6], [12.6, 55.7]] } },
        { type: 'Feature' as const, properties: { line: '5C', directionId: '1', headsign: 'Husum Torv', shapeId: 'b' }, geometry: { type: 'LineString' as const, coordinates: [[12.6, 55.7], [12.5, 55.6]] } },
      ],
    };
    const result = selectRouteDirection(shape, {
      journeyId: 'test', cancelled: false, line: '5C', destination: 'Lufthavnen', stops: [{ name: 'Nørreport', lat: 55.6, lng: 12.5, scheduled: 0 }],
    });
    expect(result?.directionId).toBe('0');
  });

  it('uses stop order to distinguish directions serving the same stops', () => {
    const line = (directionId: string) => ({ type: 'Feature' as const, properties: { line: '5C', directionId, headsign: '', shapeId: directionId }, geometry: { type: 'LineString' as const, coordinates: [[12, 55], [13, 56]] } });
    const stop = (directionId: string, name: string, sequence: number) => ({ type: 'Feature' as const, properties: { directionId, stop_id: name, name, sequence }, geometry: { type: 'Point' as const, coordinates: [12, 55] } });
    const shape = { type: 'FeatureCollection' as const, features: [line('reverse'), stop('reverse', 'B', 0), stop('reverse', 'A', 1), line('forward'), stop('forward', 'A', 0), stop('forward', 'B', 1)] };
    const journey = { journeyId: 'test', cancelled: false, line: '5C', destination: 'Elsewhere', stops: [
      { name: 'A', lat: 55, lng: 12, scheduled: 0 }, { name: 'B', lat: 56, lng: 13, scheduled: 1 },
    ] };
    expect(selectRouteDirection(shape, journey)?.directionId).toBe('forward');
  });

  it('falls back to the direction with the best matching stops', () => {
    const shape = {
      type: 'FeatureCollection' as const,
      features: [
        { type: 'Feature' as const, properties: { line: '5C', directionId: '0', headsign: 'Unknown A', shapeId: 'a' }, geometry: { type: 'LineString' as const, coordinates: [[12.5, 55.6], [12.6, 55.7]] } },
        { type: 'Feature' as const, properties: { line: '5C', directionId: '1', headsign: 'Unknown B', shapeId: 'b' }, geometry: { type: 'LineString' as const, coordinates: [[12.6, 55.7], [12.5, 55.6]] } },
        { type: 'Feature' as const, properties: { directionId: '0', stop_id: 'a', name: 'Other', sequence: 1 }, geometry: { type: 'Point' as const, coordinates: [12.5, 55.6] } },
        { type: 'Feature' as const, properties: { directionId: '1', stop_id: 'b', name: 'Nørreport', sequence: 1 }, geometry: { type: 'Point' as const, coordinates: [12.5, 55.6] } },
        { type: 'Feature' as const, properties: { directionId: '1', stop_id: 'c', name: 'Husum', sequence: 2 }, geometry: { type: 'Point' as const, coordinates: [12.6, 55.7] } },
      ],
    };
    const result = selectRouteDirection(shape, {
      journeyId: 'test', cancelled: false, line: '5C', destination: 'Unknown destination', stops: [
        { name: 'Nørreport', lat: 55.6, lng: 12.5, scheduled: 0 },
        { name: 'Husum', lat: 55.7, lng: 12.6, scheduled: 1 },
      ],
    });
    expect(result?.directionId).toBe('1');
  });
});
