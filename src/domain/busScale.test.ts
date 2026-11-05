import { describe, expect, it } from 'vitest';
import { MAX_BUS_SCALE, MIN_BUS_PIXELS, busDisplayScale, lightenColor, metersPerPixel } from './busScale';

const BUS_LENGTH_METRES = 11.16;
const COPENHAGEN_LAT = 55.68357;

describe('metersPerPixel', () => {
  it('matches the mercator resolution and halves per zoom level', () => {
    expect(metersPerPixel(0, 0)).toBeCloseTo(78271.5, 1);
    expect(metersPerPixel(0, 1)).toBeCloseTo(metersPerPixel(0, 0) / 2, 6);
    expect(metersPerPixel(60, 0)).toBeCloseTo(metersPerPixel(0, 0) / 2, 6);
  });
});

describe('busDisplayScale', () => {
  it('keeps city-zoom buses at the minimum on-screen length', () => {
    const scale = busDisplayScale(BUS_LENGTH_METRES, COPENHAGEN_LAT, 15.5);
    expect(scale).toBeGreaterThan(1);
    expect(BUS_LENGTH_METRES / metersPerPixel(COPENHAGEN_LAT, 15.5) * scale).toBeCloseTo(MIN_BUS_PIXELS, 6);
  });

  it('never shrinks a bus and never over-exaggerates it', () => {
    expect(busDisplayScale(BUS_LENGTH_METRES, COPENHAGEN_LAT, 19)).toBe(1);
    expect(busDisplayScale(BUS_LENGTH_METRES, COPENHAGEN_LAT, 8)).toBe(MAX_BUS_SCALE);
    expect(busDisplayScale(BUS_LENGTH_METRES, COPENHAGEN_LAT, Number.NaN)).toBe(MAX_BUS_SCALE);
  });
});

describe('lightenColor', () => {
  it('mixes toward white and ignores invalid input', () => {
    expect(lightenColor('#000000', 0.5)).toBe('#808080');
    expect(lightenColor('#00788a', 0)).toBe('#00788a');
    expect(lightenColor('red', 0.5)).toBe('red');
  });
});
