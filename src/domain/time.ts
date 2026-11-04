/** All Danish local time handling. Instants are epoch milliseconds (absolute); display is Europe/Copenhagen. */
export const TZ = 'Europe/Copenhagen';

const partsFmt = new Intl.DateTimeFormat('en-GB', {
  timeZone: TZ, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', second: '2-digit',
});

interface Wall { y: number; mo: number; d: number; h: number; mi: number; s: number }

export function copenhagenWall(ms: number): Wall {
  const p: Record<string, number> = {};
  for (const part of partsFmt.formatToParts(new Date(ms))) {
    if (part.type !== 'literal') p[part.type] = Number(part.value);
  }
  return { y: p.year ?? 0, mo: p.month ?? 0, d: p.day ?? 0, h: p.hour ?? 0, mi: p.minute ?? 0, s: p.second ?? 0 };
}

/** da-DK clock time with a period: "08.14". Built from parts so it does not depend on the ICU version. */
export function formatTime(ms: number): string {
  const w = copenhagenWall(ms);
  return `${String(w.h).padStart(2, '0')}.${String(w.mi).padStart(2, '0')}`;
}

/** "08.14.05" for the footer. */
export function formatTimeSeconds(ms: number): string {
  const w = copenhagenWall(ms);
  return `${formatTime(ms)}.${String(w.s).padStart(2, '0')}`;
}

export type LocalParse =
  | { ok: true; ms: number }
  | { ok: false; reason: 'nonexistent' | 'ambiguous' | 'invalid' };

/**
 * Parse a Copenhagen wall-clock date + time ("2026-03-29", "03:10"). The offset is not guessed:
 * a time skipped by spring-forward is "nonexistent", a time that occurs twice in autumn is "ambiguous".
 * A feed that supplies an explicit offset should be parsed with Date.parse instead.
 */
export function parseCopenhagenLocal(date: string, time: string): LocalParse {
  const dm = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  const tm = /^(\d{2})[:.](\d{2})(?:[:.](\d{2}))?$/.exec(time);
  if (!dm || !tm) return { ok: false, reason: 'invalid' };
  const [y, mo, d] = [Number(dm[1]), Number(dm[2]), Number(dm[3])];
  const [h, mi, s] = [Number(tm[1]), Number(tm[2]), Number(tm[3] ?? 0)];
  if (mo < 1 || mo > 12 || d < 1 || d > 31 || h > 23 || mi > 59 || s > 59) return { ok: false, reason: 'invalid' };
  const asUtc = Date.UTC(y, mo - 1, d, h, mi, s);
  const hits = new Set<number>();
  for (const offsetH of [1, 2]) {
    const cand = asUtc - offsetH * 3_600_000;
    const w = copenhagenWall(cand);
    if (w.y === y && w.mo === mo && w.d === d && w.h === h && w.mi === mi && w.s === s) hits.add(cand);
  }
  if (hits.size === 0) return { ok: false, reason: 'nonexistent' };
  if (hits.size > 1) return { ok: false, reason: 'ambiguous' };
  return { ok: true, ms: [...hits][0] as number };
}
