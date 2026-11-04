import { lineCategory, type LineCategory } from './line';

/** Our own contract, not Rejseplanen field names. All times are absolute epoch ms. */
export interface Departure {
  id: string;
  line: string;
  destination: string;
  via?: string;
  scheduled: number;
  /** undefined = the feed has no realtime time: timetable only. */
  predicted?: number;
  cancelled?: boolean;
  journeyId: string;
}

export type Countdown =
  | { kind: 'cancelled' }
  | { kind: 'expired' }
  | { kind: 'now'; scheduledOnly: boolean }
  | { kind: 'minutes'; minutes: number };

export const NOW_WINDOW_S = 60;
/** A delay is only shown from 2 minutes (smaller differences are noise). */
export const DELAY_THRESHOLD_MIN = 2;
/** A cancelled departure stays visible until planned + 2 min. */
export const CANCELLED_GRACE_MS = 2 * 60_000;

export const effectiveTime = (d: Departure): number => d.predicted ?? d.scheduled;
export const hasRealtime = (d: Departure): boolean => d.predicted !== undefined;

/** Whole minutes of delay, 0 when below the threshold or no realtime. */
export function delayMinutes(d: Departure): number {
  if (d.predicted === undefined) return 0;
  const m = Math.floor((d.predicted - d.scheduled) / 60_000);
  return m >= DELAY_THRESHOLD_MIN ? m : 0;
}

export function secondsUntil(d: Departure, now: number): number {
  return (effectiveTime(d) - now) / 1000;
}

/**
 * Cancellation wins over every time calculation. Otherwise delta = effective - now:
 * delta < 0 → expired; 0 ≤ delta ≤ 60 s → "Nu"; above that ceil(delta/60) so 61 s is 2 min.
 */
export function countdown(d: Departure, now: number): Countdown {
  if (d.cancelled) return { kind: 'cancelled' };
  const s = secondsUntil(d, now);
  if (s < 0) return { kind: 'expired' };
  if (s <= NOW_WINDOW_S) return { kind: 'now', scheduledOnly: !hasRealtime(d) };
  return { kind: 'minutes', minutes: Math.ceil(s / 60) };
}

/** Is the departure still shown at all? Cancelled ones remain until planned + 2 min; others until expired. */
export function isVisible(d: Departure, now: number): boolean {
  if (d.cancelled) return now <= d.scheduled + CANCELLED_GRACE_MS;
  return countdown(d, now).kind !== 'expired';
}

export type DepStatus = 'rt' | 'delayed' | 'planned' | 'cancelled';

export interface DepView {
  dep: Departure;
  key: string; // line|destination
  line: string;
  cat: LineCategory;
  dest: string;
  via: string;
  status: DepStatus;
  count: Countdown;
  /** Minutes shown (0 = Nu). For cancelled this is the planned minute. */
  m: number;
  /** Seconds used for the band position (planned time for cancelled). */
  posSeconds: number;
  delay: number;
  plannedSeconds: number;
  /** Later departures of the same line and destination, in minutes. */
  next: number[];
  disrupted: boolean;
}

export const depKey = (d: Departure): string => `${d.line}|${d.destination}`;

export function minutesOf(c: Countdown, fallbackSeconds: number): number {
  if (c.kind === 'minutes') return c.minutes;
  if (c.kind === 'now') return 0;
  return Math.max(0, Math.ceil(fallbackSeconds / 60));
}

/** One view per line+destination: its next visible departure, plus up to two later times. */
export function buildViews(all: Departure[], now: number, disruptedLines: string[] = []): DepView[] {
  const groups = new Map<string, Departure[]>();
  for (const d of all) {
    if (!isVisible(d, now)) continue;
    const list = groups.get(depKey(d)) ?? [];
    list.push(d);
    groups.set(depKey(d), list);
  }
  const views: DepView[] = [];
  for (const [key, list] of groups) {
    list.sort((a, b) => effectiveTime(a) - effectiveTime(b));
    const head = list[0] as Departure;
    const count = countdown(head, now);
    const plannedSeconds = (head.scheduled - now) / 1000;
    const status: DepStatus = head.cancelled ? 'cancelled'
      : !hasRealtime(head) ? 'planned'
      : delayMinutes(head) > 0 ? 'delayed' : 'rt';
    const headSeconds = status === 'cancelled' ? plannedSeconds : secondsUntil(head, now);
    const m = minutesOf(count, headSeconds);
    const next = list.slice(1)
      .filter((d) => !d.cancelled)
      .map((d) => minutesOf(countdown(d, now), secondsUntil(d, now)))
      .filter((n) => n > m)
      .slice(0, 2);
    views.push({
      dep: head, key, line: head.line, cat: lineCategory(head.line), dest: head.destination, via: head.via ?? '',
      status, count, m, posSeconds: Math.max(0, headSeconds), delay: delayMinutes(head), plannedSeconds,
      next, disrupted: disruptedLines.includes(head.line),
    });
  }
  return views.sort((a, b) => a.posSeconds - b.posSeconds);
}
