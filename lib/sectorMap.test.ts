import { describe, it, expect } from 'vitest';
import { mapSector, sectorMatchScore, isSectorMatch } from './sectorMap';

describe('mapSector', () => {
  it('maps known Finnhub industry strings (exact lowercase keys used in sectorMap)', () => {
    expect(mapSector('software')).toBe('tech');
    expect(mapSector('biotechnology')).toBe('health');
    expect(mapSector('financial services')).toBe('finance');
    expect(mapSector('oil & gas e&p')).toBe('energy');
    expect(mapSector('real estate')).toBe('realestate');
    expect(mapSector('communication services')).toBe('comms');
  });

  it('is case-insensitive', () => {
    expect(mapSector('Software')).toBe('tech');
    expect(mapSector('SOFTWARE')).toBe('tech');
    expect(mapSector('Biotechnology')).toBe('health');
  });

  it('returns "other" for unknown or null input', () => {
    expect(mapSector('Underwater Basketweaving')).toBe('other');
    expect(mapSector(null)).toBe('other');
    expect(mapSector(undefined)).toBe('other');
  });
});

describe('sectorMatchScore', () => {
  it('returns 100 when sector is in preferred list', () => {
    expect(sectorMatchScore('tech', ['tech', 'health'])).toBe(100);
  });

  it('returns 35 when sector is not in preferred list (but is a valid sector)', () => {
    // sectorMatchScore returns 35 (not 0) for a non-preferred, non-other sector
    expect(sectorMatchScore('energy', ['tech', 'health'])).toBe(35);
  });

  it('returns 0 for "other" sector regardless of preferences', () => {
    expect(sectorMatchScore('other', ['tech', 'health'])).toBe(0);
    expect(sectorMatchScore('other', [])).toBe(0);
  });
});

describe('isSectorMatch', () => {
  it('returns true when sector is preferred', () => {
    expect(isSectorMatch('finance', ['finance', 'energy'])).toBe(true);
  });

  it('returns false when sector is not in the preferred list', () => {
    expect(isSectorMatch('comms', ['tech'])).toBe(false);
  });

  it('returns false when "other" sector even if included in list', () => {
    // "other" is always false — it has no real sector to match
    expect(isSectorMatch('other', ['other'])).toBe(false);
  });

  it('returns false when preferred list is empty', () => {
    // empty list → no preferences set, no sector matches
    expect(isSectorMatch('tech', [])).toBe(false);
  });
});
