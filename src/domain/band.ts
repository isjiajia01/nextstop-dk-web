/** Afgangsbåndet geometry: the compressed 0–20 min scale x = (m/20)^0.75 and greedy lane packing. */
export const SPAN_MIN = 20;
export const SPAN_S = SPAN_MIN * 60;
export const MAX_LANES = 3;
export const EXTRA_LANE_WITHIN_MIN = 10;
export const CHIP_GAP = 4;

/** 0…1 position on the band for a time distance in seconds (clamped to 0…20 min). */
export function bandFraction(secondsFromNow: number): number {
  const f = Math.max(0, Math.min(secondsFromNow, SPAN_S)) / SPAN_S;
  return Math.pow(f, 0.75);
}

/** x in px from the pole (x = 0) to the 20 min edge (x = width). */
export function bandPosition(secondsFromNow: number, width: number): number {
  if (width <= 0) return 0;
  return width * bandFraction(secondsFromNow);
}

export interface BandItem { id: string; seconds: number; width: number }
export interface Placed extends BandItem { x: number; left: number; flip: boolean; lane: number }
export interface BandLayout { placed: Placed[]; overflow: string[] }

/**
 * Greedy packing in time order. `x0..x1` is the axis in px. A chip that would overflow the right edge flips
 * its anchor. A 4th lane opens only for a departure due within 10 min; others overflow into "+n".
 */
export function layoutBand(items: BandItem[], x0: number, x1: number, maxLanes = MAX_LANES): BandLayout {
  const sorted = [...items].filter((i) => i.seconds <= SPAN_S).sort((a, b) => a.seconds - b.seconds);
  const lanes: Array<Array<[number, number]>> = Array.from({ length: maxLanes }, () => []);
  const placed: Placed[] = [];
  const overflow: string[] = [];
  for (const it of sorted) {
    const x = x0 + bandPosition(it.seconds, x1 - x0);
    let left = x;
    let flip = false;
    if (x + it.width > x1 + 2) { left = x - it.width; flip = true; }
    const fits = (iv: Array<[number, number]>) => iv.every(([a, b]) => left + it.width + CHIP_GAP <= a || left >= b + CHIP_GAP);
    let lane = lanes.findIndex(fits);
    if (lane < 0 && it.seconds <= EXTRA_LANE_WITHIN_MIN * 60 && lanes.length < maxLanes + 1) {
      lanes.push([]);
      lane = lanes.length - 1;
    }
    if (lane < 0) { overflow.push(it.id); continue; }
    (lanes[lane] as Array<[number, number]>).push([left, left + it.width]);
    placed.push({ ...it, x, left, flip, lane });
  }
  return { placed, overflow };
}
