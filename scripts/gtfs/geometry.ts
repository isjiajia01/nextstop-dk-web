export interface Coordinate {
  lat: number;
  lon: number;
}

export interface OrderedStop extends Coordinate {
  stopId: string;
  sequence: number;
}

export interface StopOrderValidation {
  shapeLengthMeters: number;
  stopPathMeters: number;
  shapeToStopRatio: number;
  projectedDistancesMeters: number[];
}

const EARTH_RADIUS_METERS = 6_371_000;
const METERS_PER_DEGREE = (Math.PI * EARTH_RADIUS_METERS) / 180;

function toLocalMeters(point: Coordinate, origin: Coordinate): { x: number; y: number } {
  const latitudeScale = Math.cos((origin.lat * Math.PI) / 180);
  return {
    x: (point.lon - origin.lon) * METERS_PER_DEGREE * latitudeScale,
    y: (point.lat - origin.lat) * METERS_PER_DEGREE,
  };
}

function distanceMeters(a: Coordinate, b: Coordinate): number {
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const dLat = lat2 - lat1;
  const dLon = ((b.lon - a.lon) * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_METERS * Math.asin(Math.sqrt(h));
}

function segmentDistanceMeters(point: Coordinate, start: Coordinate, end: Coordinate): number {
  const origin = start;
  const p = toLocalMeters(point, origin);
  const a = { x: 0, y: 0 };
  const b = toLocalMeters(end, origin);
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lengthSquared = dx * dx + dy * dy;
  const t = lengthSquared === 0 ? 0 : Math.max(0, Math.min(1, (p.x * dx + p.y * dy) / lengthSquared));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

function distanceAlongSegmentMeters(point: Coordinate, start: Coordinate, end: Coordinate): number {
  const origin = start;
  const p = toLocalMeters(point, origin);
  const b = toLocalMeters(end, origin);
  const lengthSquared = b.x * b.x + b.y * b.y;
  if (lengthSquared === 0) return 0;
  return Math.max(0, Math.min(1, (p.x * b.x + p.y * b.y) / lengthSquared)) * distanceMeters(start, end);
}

/** Simplify a geographic polyline with Douglas–Peucker in meters. */
export function simplifyLine(points: Coordinate[], toleranceMeters: number): Coordinate[] {
  if (points.length <= 2) return [...points];
  if (!Number.isFinite(toleranceMeters) || toleranceMeters < 0) throw new Error('Tolerance must be a non-negative number');

  const keep = new Set<number>([0, points.length - 1]);
  const visit = (startIndex: number, endIndex: number): void => {
    let farthestIndex = -1;
    let farthestDistance = toleranceMeters;
    for (let index = startIndex + 1; index < endIndex; index += 1) {
      const distance = segmentDistanceMeters(points[index]!, points[startIndex]!, points[endIndex]!);
      if (distance > farthestDistance) {
        farthestDistance = distance;
        farthestIndex = index;
      }
    }
    if (farthestIndex >= 0) {
      keep.add(farthestIndex);
      visit(startIndex, farthestIndex);
      visit(farthestIndex, endIndex);
    }
  };

  visit(0, points.length - 1);
  return points.filter((_point, index) => keep.has(index));
}

function cumulativeShapeDistances(shape: Coordinate[]): number[] {
  const cumulative = [0];
  for (let index = 1; index < shape.length; index += 1) {
    cumulative.push(cumulative[index - 1]! + distanceMeters(shape[index - 1]!, shape[index]!));
  }
  return cumulative;
}

function projectOntoShape(stop: Coordinate, shape: Coordinate[], cumulative: number[]): number {
  let bestDistance = Number.POSITIVE_INFINITY;
  let bestAlong = 0;
  for (let index = 1; index < shape.length; index += 1) {
    const distance = segmentDistanceMeters(stop, shape[index - 1]!, shape[index]!);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestAlong = cumulative[index - 1]! + distanceAlongSegmentMeters(stop, shape[index - 1]!, shape[index]!);
    }
  }
  return bestAlong;
}

/** Validate that ordered stops follow the shape and that the shape is plausibly close to the stops. */
export function validateStopOrder(
  shape: Coordinate[],
  stops: OrderedStop[],
  options: { maxBacktrackMeters?: number; minShapeToStopRatio?: number; maxShapeToStopRatio?: number } = {},
): StopOrderValidation {
  if (shape.length < 2) throw new Error('Shape must contain at least two points');
  if (stops.length < 2) throw new Error('At least two stops are required to validate a route');
  for (let index = 1; index < stops.length; index += 1) {
    if (stops[index]!.sequence <= stops[index - 1]!.sequence) {
      throw new Error(`Stop sequence is not strictly increasing at ${stops[index]!.stopId}`);
    }
  }

  const cumulative = cumulativeShapeDistances(shape);
  const shapeLengthMeters = cumulative[cumulative.length - 1]!;
  let stopPathMeters = 0;
  for (let index = 1; index < stops.length; index += 1) stopPathMeters += distanceMeters(stops[index - 1]!, stops[index]!);
  if (stopPathMeters === 0) throw new Error('Stop coordinates have no measurable spacing');

  const projectedDistancesMeters = stops.map((stop) => projectOntoShape(stop, shape, cumulative));
  const maxBacktrackMeters = options.maxBacktrackMeters ?? 0;
  for (let index = 1; index < projectedDistancesMeters.length; index += 1) {
    if (projectedDistancesMeters[index]! + maxBacktrackMeters < projectedDistancesMeters[index - 1]!) {
      throw new Error(
        `Stops leave the shape order between ${stops[index - 1]!.stopId} and ${stops[index]!.stopId}`,
      );
    }
  }

  const shapeToStopRatio = shapeLengthMeters / stopPathMeters;
  const minRatio = options.minShapeToStopRatio ?? 0.75;
  const maxRatio = options.maxShapeToStopRatio ?? 3;
  if (shapeToStopRatio < minRatio || shapeToStopRatio > maxRatio) {
    throw new Error(
      `Shape length is implausible versus stop spacing (${shapeToStopRatio.toFixed(2)}x; expected ${minRatio}–${maxRatio}x)`,
    );
  }

  return { shapeLengthMeters, stopPathMeters, shapeToStopRatio, projectedDistancesMeters };
}
