import { mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { parseCsvLine, parseCsvRow, selectMostCommonShapes, type TripRecord } from './gtfs/csv';
import { simplifyLine, validateStopOrder, type Coordinate, type OrderedStop } from './gtfs/geometry';

const ROUTE_SHORT_NAME = '5C';
const DEFAULT_GTFS_ZIP = `${process.env.HOME ?? ''}/.cache/agent-runtime/gtfs/raw/GTFS.zip`;
const GTFS_ZIP = process.env.GTFS_ZIP || DEFAULT_GTFS_ZIP;
const OUTPUT_PATH = 'public/generated/route-5c.geojson';
const SIMPLIFICATION_TOLERANCE_METERS = 4;

type RouteRow = { route_id: string; route_short_name: string };
type TripRow = { route_id: string; trip_id: string; direction_id: string; trip_headsign: string; shape_id: string };
type StopTimeRow = { trip_id: string; stop_id: string; stop_sequence: string };
type StopTime = { stopId: string; sequence: number };
type StopRow = { stop_id: string; stop_name: string; stop_lat: string; stop_lon: string };
type ShapeRow = { shape_id: string; shape_pt_lat: string; shape_pt_lon: string; shape_pt_sequence: string };

type GeoJsonFeature = {
  type: 'Feature';
  properties: Record<string, string | number>;
  geometry: { type: 'LineString' | 'Point'; coordinates: number[] | number[][] };
};

type GeoJsonCollection = { type: 'FeatureCollection'; features: GeoJsonFeature[] };

async function* unzipLines(zipPath: string, entry: string): AsyncGenerator<string> {
  const child = spawn('unzip', ['-p', zipPath, entry], { stdio: ['ignore', 'pipe', 'pipe'] });
  if (!child.stdout || !child.stderr) throw new Error('Could not open unzip output');
  let stderr = '';
  child.stderr.setEncoding('utf8');
  child.stderr.on('data', (chunk: string) => { stderr += chunk; });
  const closed = new Promise<number>((resolve, reject) => {
    child.once('error', reject);
    child.once('close', (code) => resolve(code ?? 1));
  });
  const lines = createInterface({ input: child.stdout, crlfDelay: Infinity });
  try {
    for await (const line of lines) yield line;
  } finally {
    lines.close();
  }
  const code = await closed;
  if (code !== 0) throw new Error(`Could not read ${entry} from ${zipPath}: ${stderr.trim() || `unzip exited ${code}`}`);
}

async function forEachCsvRow<T>(zipPath: string, entry: string, callback: (row: T) => void): Promise<void> {
  let headers: string[] | undefined;
  let lineNumber = 0;
  for await (const line of unzipLines(zipPath, entry)) {
    lineNumber += 1;
    if (!line.trim()) continue;
    if (!headers) {
      headers = parseCsvLine(line).map((header) => header.replace(/^\uFEFF/, ''));
      continue;
    }
    try {
      callback(parseCsvRow(headers, line) as T);
    } catch (error) {
      throw new Error(`${entry}:${lineNumber}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  if (!headers) throw new Error(`${entry} is empty`);
}

function numberField(value: string, field: string): number {
  const number = Number(value);
  if (!value?.trim() || !Number.isFinite(number)) throw new Error(`Invalid ${field}: ${value}`);
  return number;
}

function rounded(value: number): number {
  return Number(value.toFixed(5));
}

function coordinateArray(points: Coordinate[]): number[][] {
  return points.map((point) => [rounded(point.lon), rounded(point.lat)]);
}

async function build(): Promise<void> {
  if (!existsSync(GTFS_ZIP)) {
    console.warn(`GTFS archive not found at ${GTFS_ZIP}; skipping route-shape generation. The app will use its existing fixture.`);
    return;
  }

  const routeIds = new Set<string>();
  await forEachCsvRow<RouteRow>(GTFS_ZIP, 'routes.txt', (row) => {
    if (row.route_short_name === ROUTE_SHORT_NAME && row.route_id) routeIds.add(row.route_id);
  });
  if (!routeIds.size) throw new Error(`No route_id found for route_short_name ${ROUTE_SHORT_NAME}`);

  const trips: TripRecord[] = [];
  await forEachCsvRow<TripRow>(GTFS_ZIP, 'trips.txt', (row) => {
    if (routeIds.has(row.route_id)) {
      trips.push({
        routeId: row.route_id,
        tripId: row.trip_id,
        directionId: row.direction_id,
        headsign: row.trip_headsign,
        shapeId: row.shape_id,
      });
    }
  });
  const selections = selectMostCommonShapes(trips);
  if (!selections.length) throw new Error(`No trips with direction and shape found for route ${[...routeIds].join(', ')}`);
  const selectedShapeIds = new Set(selections.map((selection) => selection.shapeId));
  const representativeTrips = new Map(selections.map((selection) => {
    const trip = trips.find((candidate) => candidate.tripId === selection.tripId);
    if (!trip) throw new Error(`Representative trip ${selection.tripId} disappeared`);
    return [selection.directionId, trip] as const;
  }));

  const shapePoints = new Map<string, { point: Coordinate; sequence: number }[]>();
  const shapeSequences = new Map<string, Set<number>>();
  await forEachCsvRow<ShapeRow>(GTFS_ZIP, 'shapes.txt', (row) => {
    if (!selectedShapeIds.has(row.shape_id)) return;
    const sequence = numberField(row.shape_pt_sequence, 'shape_pt_sequence');
    const sequences = shapeSequences.get(row.shape_id) ?? new Set<number>();
    if (sequences.has(sequence)) throw new Error(`Duplicate shape sequence ${row.shape_id}/${sequence}`);
    sequences.add(sequence);
    shapeSequences.set(row.shape_id, sequences);
    const points = shapePoints.get(row.shape_id) ?? [];
    points.push({ point: { lat: numberField(row.shape_pt_lat, 'shape_pt_lat'), lon: numberField(row.shape_pt_lon, 'shape_pt_lon') }, sequence });
    shapePoints.set(row.shape_id, points);
  });
  for (const selection of selections) {
    const points = shapePoints.get(selection.shapeId);
    if (!points?.length) throw new Error(`No points found for selected shape ${selection.shapeId}`);
  }
  for (const points of shapePoints.values()) points.sort((left, right) => left.sequence - right.sequence);

  const stopTimesByTrip = new Map<string, StopTime[]>();
  const representativeTripIds = new Set([...representativeTrips.values()].map((trip) => trip.tripId));
  await forEachCsvRow<StopTimeRow>(GTFS_ZIP, 'stop_times.txt', (row) => {
    if (!representativeTripIds.has(row.trip_id)) return;
    const sequence = numberField(row.stop_sequence, 'stop_sequence');
    const times = stopTimesByTrip.get(row.trip_id) ?? [];
    times.push({ stopId: row.stop_id, sequence });
    stopTimesByTrip.set(row.trip_id, times);
  });

  const neededStopIds = new Set([...stopTimesByTrip.values()].flat().map((stop) => stop.stopId));
  const stops = new Map<string, StopRow>();
  await forEachCsvRow<StopRow>(GTFS_ZIP, 'stops.txt', (row) => {
    if (neededStopIds.has(row.stop_id)) stops.set(row.stop_id, row);
  });

  const rawFeatures: GeoJsonFeature[] = [];
  const outputFeatures: GeoJsonFeature[] = [];
  let shapePointsBefore = 0;
  let shapePointsAfter = 0;
  const validationReports: string[] = [];
  for (const selection of selections) {
    const trip = representativeTrips.get(selection.directionId);
    const shape = shapePoints.get(selection.shapeId)?.map(({ point }) => point);
    const stopTimes = trip ? stopTimesByTrip.get(trip.tripId) : undefined;
    if (!trip || !shape || !stopTimes) throw new Error(`Incomplete data for direction ${selection.directionId}`);
    stopTimes.sort((left, right) => left.sequence - right.sequence);
    const orderedStops: OrderedStop[] = stopTimes.map((stop) => {
      const row = stops.get(stop.stopId);
      if (!row) throw new Error(`Stop ${stop.stopId} for trip ${trip.tripId} is missing from stops.txt`);
      return {
        stopId: stop.stopId,
        sequence: stop.sequence,
        lat: numberField(row.stop_lat, `stop_lat for ${stop.stopId}`),
        lon: numberField(row.stop_lon, `stop_lon for ${stop.stopId}`),
      };
    });
    const validation = validateStopOrder(shape, orderedStops);
    const simplified = simplifyLine(shape, SIMPLIFICATION_TOLERANCE_METERS);
    shapePointsBefore += shape.length;
    shapePointsAfter += simplified.length;
    validationReports.push(
      `direction ${selection.directionId}: ${shape.length} shape points -> ${simplified.length}; `
      + `shape ${validation.shapeLengthMeters.toFixed(0)} m, stop path ${validation.stopPathMeters.toFixed(0)} m, `
      + `ratio ${validation.shapeToStopRatio.toFixed(2)}x`,
    );

    const lineProperties = { line: ROUTE_SHORT_NAME, directionId: selection.directionId, headsign: trip.headsign, shapeId: selection.shapeId };
    rawFeatures.push({ type: 'Feature', properties: lineProperties, geometry: { type: 'LineString', coordinates: shape.map((point) => [point.lon, point.lat]) } });
    outputFeatures.push({ type: 'Feature', properties: lineProperties, geometry: { type: 'LineString', coordinates: coordinateArray(simplified) } });
    for (const stop of orderedStops) {
      const row = stops.get(stop.stopId);
      if (!row) throw new Error(`Stop ${stop.stopId} disappeared`);
      const properties = { directionId: selection.directionId, stop_id: stop.stopId, name: row.stop_name, sequence: stop.sequence };
      const coordinates = [stop.lon, stop.lat];
      rawFeatures.push({ type: 'Feature', properties, geometry: { type: 'Point', coordinates } });
      outputFeatures.push({ type: 'Feature', properties, geometry: { type: 'Point', coordinates: [rounded(stop.lon), rounded(stop.lat)] } });
    }
  }

  const beforeBytes = Buffer.byteLength(JSON.stringify({ type: 'FeatureCollection', features: rawFeatures }));
  const output: GeoJsonCollection = { type: 'FeatureCollection', features: outputFeatures };
  const outputJson = `${JSON.stringify(output)}\n`;
  const afterBytes = Buffer.byteLength(outputJson);
  await mkdir('public/generated', { recursive: true });
  await writeFile(OUTPUT_PATH, outputJson, 'utf8');
  console.log(`Generated ${OUTPUT_PATH}`);
  console.log(`GTFS route_ids: ${[...routeIds].join(', ')}; directions: ${selections.map((selection) => selection.directionId).join(', ')}`);
  console.log(`Shape points: ${shapePointsBefore} before simplification, ${shapePointsAfter} after simplification`);
  console.log(`GeoJSON size: ${beforeBytes} bytes before simplification/rounding, ${afterBytes} bytes after`);
  for (const report of validationReports) console.log(`Validated ${report}`);
}

build().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
