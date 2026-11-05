import { describe, expect, it } from 'vitest';
import { locationCopy, locationTransition } from './locationState';

describe('location state', () => {
  it('requests only when activated and handles each browser outcome', () => {
    expect(locationTransition('prompt', 'request')).toBe('asking');
    expect(locationTransition('asking', 'grant')).toBe('granted');
    expect(locationTransition('asking', 'deny')).toBe('denied');
    expect(locationTransition('asking', 'unavailable')).toBe('unavailable');
    expect(locationTransition('denied', 'request')).toBe('asking');
    expect(locationTransition('closed', 'grant')).toBe('closed');
    expect(locationTransition('asking', 'dismiss')).toBe('closed');
  });
  it('uses device-specific blocked and prompt instructions', () => {
    expect(locationCopy('denied', true)?.sub).toContain('telefonens indstillinger');
    expect(locationCopy('denied', false)?.sub).toContain('adressen');
    expect(locationCopy('prompt', false)?.sub).toContain('Browseren spørger');
    expect(locationCopy('prompt', true)?.sub).toBe('Indtil da viser vi Nørreport St.');
    expect(locationCopy('granted', true)).toBeNull();
    expect(locationCopy('closed', false)).toBeNull();
  });
});
