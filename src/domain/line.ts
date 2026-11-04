export type LineCategory = 'regular' | 'a' | 's' | 'c' | 'e' | 'n';

/** Movia convention: the suffix decides the colour (DESIGN.md rule 5). */
export function lineCategory(line: string): LineCategory {
  if (/N$/i.test(line)) return 'n';
  if (/A$/i.test(line)) return 'a';
  if (/[SR]$/i.test(line)) return 's';
  if (/C$/i.test(line)) return 'c';
  if (/E$/i.test(line)) return 'e';
  return 'regular';
}

/** Danish folding for search: æ↔ae, ø↔oe/o, å↔aa/a, diacritics ignored (DESIGN.md rule 11). */
export function foldLoose(value: string): string {
  return value
    .toLowerCase()
    .replace(/æ/g, 'ae').replace(/ø/g, 'oe').replace(/å/g, 'aa')
    .normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .replace(/ae/g, 'a').replace(/oe/g, 'o').replace(/aa/g, 'a');
}

/** Split "Nørreport St. (Nørre Voldgade)" into title and road. */
export function splitStopName(raw: string): { name: string; road: string } {
  const m = /^(.*?)\s*\(([^)]+)\)\s*$/.exec(raw);
  return m ? { name: (m[1] ?? raw).trim(), road: (m[2] ?? '').trim() } : { name: raw, road: '' };
}

/** "1,1 km" / "60 m" with a decimal comma and a non-breaking space. */
export function formatDistance(meters: number): string {
  if (meters < 1000) return `${Math.round(meters)}\u00a0m`;
  return `${(meters / 1000).toFixed(1).replace('.', ',')}\u00a0km`;
}
