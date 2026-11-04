import { describe, expect, it } from 'vitest';
import { buildViews, countdown, delayMinutes, isVisible, type Departure } from './departure';
import { formatTime } from './time';

const NOW = Date.UTC(2026, 10, 4, 7, 14, 0); // 08.14 Copenhagen (CET)
const dep = (over: Partial<Departure> & { inS?: number }): Departure => {
  const t = NOW + (over.inS ?? 0) * 1000;
  const { inS: _unused, ...rest } = over;
  return { id: 'x', line: '5C', destination: 'Lufthavnen', journeyId: 'j', scheduled: t, predicted: t, ...rest };
};

describe('minutes to arrival', () => {
  it('rounds up whole minutes: 61 s is 2 min, 120 s is 2 min, 121 s is 3 min', () => {
    expect(countdown(dep({ inS: 61 }), NOW)).toEqual({ kind: 'minutes', minutes: 2 });
    expect(countdown(dep({ inS: 120 }), NOW)).toEqual({ kind: 'minutes', minutes: 2 });
    expect(countdown(dep({ inS: 121 }), NOW)).toEqual({ kind: 'minutes', minutes: 3 });
  });

  it('uses the predicted time, not the planned time, when both exist', () => {
    const d = dep({ inS: 180, predicted: NOW + 420_000 });
    expect(countdown(d, NOW)).toEqual({ kind: 'minutes', minutes: 7 });
  });

  it('recomputes from absolute instants across the spring-forward gap', () => {
    const before = Date.UTC(2026, 2, 29, 0, 50); // 01.50 CET
    const d = dep({ scheduled: Date.UTC(2026, 2, 29, 1, 10), predicted: Date.UTC(2026, 2, 29, 1, 10) }); // 03.10 CEST
    expect(countdown(d, before)).toEqual({ kind: 'minutes', minutes: 20 });
    expect(formatTime(before)).toBe('01.50');
    expect(formatTime(d.scheduled)).toBe('03.10');
  });
});

describe("'Nu' threshold", () => {
  it('0 s and 60 s are Nu, 61 s is not', () => {
    expect(countdown(dep({ inS: 0 }), NOW)).toEqual({ kind: 'now', scheduledOnly: false });
    expect(countdown(dep({ inS: 60 }), NOW)).toEqual({ kind: 'now', scheduledOnly: false });
    expect(countdown(dep({ inS: 61 }), NOW).kind).toBe('minutes');
  });

  it('a timetable-only departure is "scheduled now", not a live Nu', () => {
    expect(countdown(dep({ inS: 30, predicted: undefined }), NOW)).toEqual({ kind: 'now', scheduledOnly: true });
  });

  it('negative time is expired and drops off the list', () => {
    const d = dep({ inS: -1 });
    expect(countdown(d, NOW).kind).toBe('expired');
    expect(isVisible(d, NOW)).toBe(false);
  });
});

describe('cancellation precedence', () => {
  it('cancelled wins over a fresh prediction and over a Nu time', () => {
    expect(countdown(dep({ inS: 30, cancelled: true }), NOW)).toEqual({ kind: 'cancelled' });
    expect(countdown(dep({ inS: 300, cancelled: true }), NOW)).toEqual({ kind: 'cancelled' });
  });

  it('cancelled wins even after the time has passed, and stays visible until planned + 2 min', () => {
    const d = dep({ inS: -90, cancelled: true });
    expect(countdown(d, NOW)).toEqual({ kind: 'cancelled' });
    expect(isVisible(d, NOW)).toBe(true);
    expect(isVisible(dep({ inS: -121, cancelled: true }), NOW)).toBe(false);
  });

  it('a cancelled departure never makes a line "Nu" and is excluded from later times', () => {
    const views = buildViews([
      dep({ id: 'a', inS: 30, cancelled: true }),
      dep({ id: 'b', inS: 600 }),
    ], NOW);
    expect(views).toHaveLength(1);
    expect(views[0]?.status).toBe('cancelled');
    expect(views[0]?.count.kind).toBe('cancelled');
    expect(views[0]?.next).toEqual([10]);
  });
});

describe('delay and timetable', () => {
  it('shows a delay only from 2 min', () => {
    expect(delayMinutes(dep({ inS: 300, predicted: NOW + 300_000 + 119_000 }))).toBe(1 - 1);
    expect(delayMinutes(dep({ inS: 300, predicted: NOW + 300_000 + 120_000 }))).toBe(2);
    expect(delayMinutes(dep({ inS: 300, predicted: undefined }))).toBe(0);
  });

  it('classifies status: realtime, delayed, timetable-only', () => {
    const v = buildViews([
      dep({ id: '1', line: '6A', inS: 240, predicted: NOW + 240_000 + 240_000 }),
      dep({ id: '2', line: '37', inS: 600, predicted: undefined }),
      dep({ id: '3', line: '14', inS: 200 }),
    ], NOW);
    const by = Object.fromEntries(v.map((x) => [x.line, x.status]));
    expect(by).toEqual({ '6A': 'delayed', '37': 'planned', '14': 'rt' });
    expect(v.find((x) => x.line === '6A')?.m).toBe(8);
    expect(v.find((x) => x.line === '6A')?.delay).toBe(4);
  });
});
