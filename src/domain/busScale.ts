const EARTH_CIRCUMFERENCE_M = 40_075_016.686;
/** MapLibre builds its world from 512 px tiles, so 512 * 2^zoom pixels span the mercator world. */
const MERCATOR_WORLD_PIXELS = 512;

/** Shortest on-screen length of a bus in CSS pixels, so the fleet stays readable at city zoom. */
export const MIN_BUS_PIXELS = 38;
/** Upper bound for the exaggeration, so a bus close to the camera never grows into a landmark. */
export const MAX_BUS_SCALE = 4;

/** Web-mercator metres per CSS pixel at a latitude and zoom, using MapLibre's 512 px tile convention. */
export function metersPerPixel(lat: number, zoom: number): number {
  return (EARTH_CIRCUMFERENCE_M * Math.cos((lat * Math.PI) / 180)) / (MERCATOR_WORLD_PIXELS * 2 ** zoom);
}

/**
 * Uniform model scale that keeps a bus at least `MIN_BUS_PIXELS` long on screen and never more than
 * `MAX_BUS_SCALE` times life size. Derived from the zoom and latitude rather than from projected
 * screen distances, which collapse for vehicles behind the camera at high pitch.
 */
export function busDisplayScale(lengthMeters: number, lat: number, zoom: number): number {
  const pixels = lengthMeters / metersPerPixel(lat, zoom);
  if (!Number.isFinite(pixels) || pixels <= 0) return MAX_BUS_SCALE;
  return Math.min(MAX_BUS_SCALE, Math.max(1, MIN_BUS_PIXELS / pixels));
}

/** Mixes a #rrggbb colour toward white so a line colour stays readable on the dark basemap. */
export function lightenColor(hex: string, amount: number): string {
  if (!/^#[0-9a-f]{6}$/i.test(hex)) return hex;
  const a = Math.min(1, Math.max(0, amount));
  const ch = (i: number) => Math.round(parseInt(hex.slice(i, i + 2), 16) * (1 - a) + 255 * a).toString(16).padStart(2, '0');
  return `#${ch(1)}${ch(3)}${ch(5)}`;
}
