import { describe, expect, it } from 'vitest';
import { copenhagenWall, formatTime, parseCopenhagenLocal } from './time';

describe('Europe/Copenhagen time', () => {
  it('formats with a period, in winter (CET) and summer (CEST)', () => {
    expect(formatTime(Date.UTC(2026, 0, 15, 7, 14))).toBe('08.14'); // UTC+1
    expect(formatTime(Date.UTC(2026, 6, 15, 6, 14))).toBe('08.14'); // UTC+2
  });

  it('is independent of the process time zone: 23:30Z crosses midnight in Copenhagen', () => {
    const w = copenhagenWall(Date.UTC(2026, 0, 15, 23, 30));
    expect([w.d, w.h, w.mi]).toEqual([16, 0, 30]);
  });

  it('spring forward (2026-03-29): 01:00Z is 03:00 local, and 00:59Z is 01:59 local', () => {
    expect(formatTime(Date.UTC(2026, 2, 29, 0, 59))).toBe('01.59');
    expect(formatTime(Date.UTC(2026, 2, 29, 1, 0))).toBe('03.00');
  });

  it('fall back (2026-10-25): 00:30Z and 01:30Z both read 02.30 locally', () => {
    expect(formatTime(Date.UTC(2026, 9, 25, 0, 30))).toBe('02.30'); // CEST
    expect(formatTime(Date.UTC(2026, 9, 25, 1, 30))).toBe('02.30'); // CET
  });

  it('parses an ordinary local time to the right instant', () => {
    const r = parseCopenhagenLocal('2026-01-15', '08:14');
    expect(r).toEqual({ ok: true, ms: Date.UTC(2026, 0, 15, 7, 14) });
    const s = parseCopenhagenLocal('2026-07-15', '08.14');
    expect(s).toEqual({ ok: true, ms: Date.UTC(2026, 6, 15, 6, 14) });
  });

  it('rejects a time skipped by spring-forward and a repeated autumn time instead of guessing', () => {
    expect(parseCopenhagenLocal('2026-03-29', '02:30')).toEqual({ ok: false, reason: 'nonexistent' });
    expect(parseCopenhagenLocal('2026-10-25', '02:30')).toEqual({ ok: false, reason: 'ambiguous' });
    expect(parseCopenhagenLocal('2026-10-25', '03:30')).toEqual({ ok: true, ms: Date.UTC(2026, 9, 25, 2, 30) });
  });

  it('rejects malformed input', () => {
    expect(parseCopenhagenLocal('29/03/2026', '08:14')).toEqual({ ok: false, reason: 'invalid' });
    expect(parseCopenhagenLocal('2026-03-29', '25:00')).toEqual({ ok: false, reason: 'invalid' });
  });
});
