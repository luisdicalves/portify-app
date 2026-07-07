import { describe, it, expect } from 'vitest';
import { classifyHoldingType } from './classification';

describe('classifyHoldingType', () => {
  it('classifies broad-market index trackers as core', () => {
    expect(classifyHoldingType('VWCE')).toBe('core');
    expect(classifyHoldingType('VWCE.DE')).toBe('core');
    expect(classifyHoldingType('CSPX.L')).toBe('core');
  });

  it('classifies individual stocks as satellite', () => {
    expect(classifyHoldingType('NVDA', 'stock')).toBe('satellite');
    expect(classifyHoldingType('TSLA', 'stock')).toBe('satellite');
  });

  it('classifies thematic/sector ETFs not in the core list as satellite', () => {
    expect(classifyHoldingType('ARKK', 'etf')).toBe('satellite');
  });

  it('classifies bond ETFs as core even outside the curated list', () => {
    expect(classifyHoldingType('SOME_BOND_ETF', 'bond_etf')).toBe('core');
  });

  it('is case-insensitive on ticker matching', () => {
    expect(classifyHoldingType('vwce')).toBe('core');
  });
});
