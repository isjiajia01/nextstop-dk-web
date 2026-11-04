import { describe, expect, it } from 'vitest';
import { bandPosition, layoutBand } from './band';

describe('band position x = (m/20)^0.75', () => {
  const W = 300;
  it('0 s is the pole', () => expect(bandPosition(0, W)).toBe(0));
  it('20 min is exactly the edge, later is clamped to the edge', () => {
    expect(bandPosition(1200, W)).toBe(W);
    expect(bandPosition(5000, W)).toBe(W);
  });
  it('60 s and 61 s use seconds, not the rounded minute', () => {
    const p60 = bandPosition(60, W);
    const p61 = bandPosition(61, W);
    expect(p60).toBeCloseTo(W * Math.pow(60 / 1200, 0.75), 6);
    expect(p61).toBeGreaterThan(p60);
    expect(p61 - p60).toBeLessThan(1); // one second moves the chip by well under 1 px
  });
  it('compression: the first 5 minutes take ~35% of the width', () => {
    expect(bandPosition(300, 100)).toBeCloseTo(35.36, 1);
  });
  it('negative or zero width is safe', () => {
    expect(bandPosition(-30, W)).toBe(0);
    expect(bandPosition(60, 0)).toBe(0);
  });
});

describe('lane packing', () => {
  it('puts colliding chips in different lanes and a flipped chip stays inside the edge', () => {
    const r = layoutBand([
      { id: 'a', seconds: 120, width: 60 },
      { id: 'b', seconds: 150, width: 60 },
      { id: 'c', seconds: 1190, width: 60 },
    ], 14, 300);
    const lane = (id: string) => r.placed.find((p) => p.id === id)?.lane;
    expect(lane('a')).toBe(0);
    expect(lane('b')).toBe(1);
    const c = r.placed.find((p) => p.id === 'c');
    expect(c?.flip).toBe(true);
    expect((c?.left ?? 0) + 60).toBeLessThanOrEqual(302);
  });

  it('opens a 4th lane only for a departure within 10 min; later ones overflow', () => {
    const mk = (id: string, seconds: number) => ({ id, seconds, width: 200 });
    const near = layoutBand([mk('1', 100), mk('2', 110), mk('3', 120), mk('4', 130)], 14, 300);
    expect(near.placed.map((p) => p.lane)).toEqual([0, 1, 2, 3]);
    const far = layoutBand([mk('1', 800), mk('2', 810), mk('3', 820), mk('4', 830)], 14, 300);
    expect(far.placed).toHaveLength(3);
    expect(far.overflow).toEqual(['4']);
  });
});
