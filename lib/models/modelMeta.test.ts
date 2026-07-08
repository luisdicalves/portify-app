import { describe, it, expect } from 'vitest';
import { createModelRunMeta, createInputHash, MODEL_VERSIONS } from './modelMeta';

describe('createModelRunMeta', () => {
  const FIXED_NOW = () => new Date('2026-01-15T10:00:00.000Z');

  it('fills modelName, modelVersion, generatedAt and dataAsOf', () => {
    const meta = createModelRunMeta({ modelName: 'riskScore', input: { ticker: 'AAPL' }, now: FIXED_NOW });

    expect(meta.modelName).toBe('riskScore');
    expect(meta.modelVersion).toBe(MODEL_VERSIONS.riskScore);
    expect(meta.generatedAt).toBe('2026-01-15T10:00:00.000Z');
    expect(meta.dataAsOf).toBe('2026-01-15T10:00:00.000Z');
  });

  it('lets dataAsOf be overridden independently of generatedAt', () => {
    const meta = createModelRunMeta({
      modelName: 'portfolioState',
      input: {},
      now: FIXED_NOW,
      dataAsOf: '2026-01-01T00:00:00.000Z',
    });

    expect(meta.generatedAt).toBe('2026-01-15T10:00:00.000Z');
    expect(meta.dataAsOf).toBe('2026-01-01T00:00:00.000Z');
  });

  it('defaults assumptions and warnings to empty arrays', () => {
    const meta = createModelRunMeta({ modelName: 'qualityScore', input: {}, now: FIXED_NOW });
    expect(meta.assumptions).toEqual([]);
    expect(meta.warnings).toEqual([]);
  });

  it('is JSON-serializable', () => {
    const meta = createModelRunMeta({ modelName: 'planCalculator', input: { a: 1 }, now: FIXED_NOW });
    expect(() => JSON.stringify(meta)).not.toThrow();
    expect(JSON.parse(JSON.stringify(meta))).toEqual(meta);
  });
});

describe('createInputHash', () => {
  it('is deterministic for the same input', () => {
    const input = { ticker: 'AAPL', lang: 'pt' };
    expect(createInputHash(input)).toBe(createInputHash({ ticker: 'AAPL', lang: 'pt' }));
  });

  it('is independent of object key order', () => {
    expect(createInputHash({ a: 1, b: 2 })).toBe(createInputHash({ b: 2, a: 1 }));
  });

  it('changes when the input changes', () => {
    expect(createInputHash({ ticker: 'AAPL' })).not.toBe(createInputHash({ ticker: 'MSFT' }));
  });

  it('handles arrays, nested objects, and primitives', () => {
    const a = createInputHash({ list: [1, 2, { x: 'y' }], n: null, s: 'hello' });
    const b = createInputHash({ list: [1, 2, { x: 'y' }], n: null, s: 'hello' });
    expect(a).toBe(b);
  });
});
