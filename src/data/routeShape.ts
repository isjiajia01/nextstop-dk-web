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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isRouteShape(value: unknown): value is RouteShapeCollection {
  if (!isRecord(value) || value.type !== 'FeatureCollection' || !Array.isArray(value.features)) return false;
  return value.features.every((feature) => {
    if (!isRecord(feature) || feature.type !== 'Feature' || !isRecord(feature.geometry) || !isRecord(feature.properties)) return false;
    if (feature.geometry.type === 'LineString') {
      return Array.isArray(feature.geometry.coordinates)
        && feature.geometry.coordinates.every((coordinate) => Array.isArray(coordinate) && coordinate.length >= 2)
        && typeof feature.properties.line === 'string'
        && typeof feature.properties.directionId === 'string'
        && typeof feature.properties.headsign === 'string'
        && typeof feature.properties.shapeId === 'string';
    }
    return feature.geometry.type === 'Point'
      && Array.isArray(feature.geometry.coordinates)
      && feature.geometry.coordinates.length >= 2
      && typeof feature.properties.directionId === 'string'
      && typeof feature.properties.stop_id === 'string'
      && typeof feature.properties.name === 'string'
      && typeof feature.properties.sequence === 'number';
  });
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
