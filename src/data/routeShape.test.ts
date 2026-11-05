import { describe, expect, it } from 'vitest';
import { loadRouteShape } from './routeShape';

describe('loadRouteShape', () => {
  it('returns null when generated output is unavailable', async () => {
    const result = await loadRouteShape(async () => new Response('', { status: 404 }));
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
});
