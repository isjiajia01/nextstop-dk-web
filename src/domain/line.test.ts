import { describe, expect, it } from 'vitest';
import { foldLoose, formatDistance, lineCategory, splitStopName } from './line';

describe('line and search helpers', () => {
  it('categorises by suffix', () => {
    expect(['5C', '6A', '150S', '30E', '81N', '14', '400R'].map(lineCategory)).toEqual(['c', 'a', 's', 'e', 'n', 'regular', 's']);
  });
  it('folds Danish letters', () => {
    for (const q of ['norre', 'noerre', 'nørre', 'NØRRE']) expect(foldLoose('Nørreport')).toContain(foldLoose(q));
    expect(foldLoose('Rådhuspladsen')).toContain(foldLoose('raadhus'));
    expect(foldLoose('Rådhuspladsen')).toContain(foldLoose('radhus'));
    expect(foldLoose('Ørstedsparken')).toContain(foldLoose('oerst'));
  });
  it('splits Rejseplanen-style names', () => {
    expect(splitStopName('Nørreport St. (Nørre Voldgade)')).toEqual({ name: 'Nørreport St.', road: 'Nørre Voldgade' });
    expect(splitStopName('Søtorvet')).toEqual({ name: 'Søtorvet', road: '' });
  });
  it('formats distances with a decimal comma', () => {
    expect(formatDistance(60)).toBe('60\u00a0m');
    expect(formatDistance(1100)).toBe('1,1\u00a0km');
  });
});
