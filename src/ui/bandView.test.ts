import { expect, it } from 'vitest';
import { bandPosition } from '../domain/band';
import { TICKS } from './bandView';

it('labels 5, 10, 15 and 20 minutes on the compressed axis', () => {
  expect(TICKS).toEqual([5, 10, 15, 20]);
  expect(TICKS.map((minute) => bandPosition(minute * 60, 100))).toEqual([
    100 * Math.pow(0.25, 0.75), 100 * Math.pow(0.5, 0.75), 100 * Math.pow(0.75, 0.75), 100,
  ]);
});
