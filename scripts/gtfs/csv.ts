export interface TripRecord {
  routeId: string;
  tripId: string;
  directionId: string;
  headsign: string;
  shapeId: string;
}

export interface DirectionShapeSelection {
  directionId: string;
  shapeId: string;
  tripId: string;
}

/** Parse one RFC 4180 style CSV record, including quoted commas and escaped quotes. */
export function parseCsvLine(line: string): string[] {
  const fields: string[] = [];
  let field = '';
  let quoted = false;

  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (character === '"') {
      if (quoted && line[index + 1] === '"') {
        field += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (character === ',' && !quoted) {
      fields.push(field);
      field = '';
    } else {
      field += character;
    }
  }
  if (quoted) throw new Error(`Unclosed quoted CSV field: ${line.slice(0, 120)}`);
  fields.push(field);
  return fields;
}

export function parseCsvRow(headers: string[], line: string): Record<string, string> {
  const values = parseCsvLine(line);
  if (values.length !== headers.length) {
    throw new Error(`CSV row has ${values.length} fields; expected ${headers.length}`);
  }
  return Object.fromEntries(headers.map((header, index) => [header, values[index]!]));
}

/** Pick the most frequent shape for each direction, with stable tie-breaking. */
export function selectMostCommonShapes(trips: TripRecord[]): DirectionShapeSelection[] {
  const byDirection = new Map<string, Map<string, { count: number; firstTripId: string }>>();
  for (const trip of trips) {
    if (!trip.directionId || !trip.shapeId) continue;
    const shapes = byDirection.get(trip.directionId) ?? new Map<string, { count: number; firstTripId: string }>();
    const current = shapes.get(trip.shapeId);
    if (current) current.count += 1;
    else shapes.set(trip.shapeId, { count: 1, firstTripId: trip.tripId });
    byDirection.set(trip.directionId, shapes);
  }

  return [...byDirection.entries()]
    .sort(([left], [right]) => left.localeCompare(right, undefined, { numeric: true }))
    .map(([directionId, shapes]) => {
      const selected = [...shapes.entries()].sort(([leftId, left], [rightId, right]) =>
        right.count - left.count || leftId.localeCompare(rightId, undefined, { numeric: true }))[0];
      if (!selected) throw new Error(`No shape found for direction ${directionId}`);
      return { directionId, shapeId: selected[0], tripId: selected[1].firstTripId };
    });
}
