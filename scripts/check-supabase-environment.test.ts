import { describe, it, expect } from 'vitest';
import { evaluateEnvironment, maskRef, parseArgs, VALID_ENVIRONMENTS } from './check-supabase-environment-lib.mjs';

const base = {
  supabaseEnvironment: undefined,
  projectRefEnv: undefined,
  supabaseUrl: undefined,
  target: undefined,
  confirmProduction: false,
  linkedProject: null,
};

describe('maskRef', () => {
  it('masks a long ref to first/last 4 characters', () => {
    expect(maskRef('abcdefghijklmnop')).toBe('abcd****mnop');
  });

  it('fully masks a short ref (8 chars or fewer)', () => {
    expect(maskRef('abcd1234')).toBe('****');
    expect(maskRef('abc')).toBe('****');
  });

  it('returns undefined for empty/undefined input', () => {
    expect(maskRef(undefined)).toBeUndefined();
    expect(maskRef('')).toBeUndefined();
  });
});

describe('parseArgs', () => {
  it('parses --target=<value>', () => {
    expect(parseArgs(['--target=staging'])).toEqual({ target: 'staging', confirmProduction: false });
  });

  it('parses --confirm-production', () => {
    expect(parseArgs(['--target=production', '--confirm-production'])).toEqual({
      target: 'production',
      confirmProduction: true,
    });
  });

  it('defaults to no target and confirmProduction false when no args given', () => {
    expect(parseArgs([])).toEqual({ target: undefined, confirmProduction: false });
  });

  it('ignores unknown flags', () => {
    expect(parseArgs(['--verbose', '--target=local'])).toEqual({ target: 'local', confirmProduction: false });
  });
});

describe('evaluateEnvironment', () => {
  it('fails when SUPABASE_ENVIRONMENT is missing', () => {
    const result = evaluateEnvironment(base);
    expect(result.ok).toBe(false);
    expect(result.errors[0]).toMatch(/SUPABASE_ENVIRONMENT is not set/);
  });

  it('fails when SUPABASE_ENVIRONMENT has an invalid value', () => {
    const result = evaluateEnvironment({ ...base, supabaseEnvironment: 'dev' });
    expect(result.ok).toBe(false);
    expect(result.errors[0]).toMatch(/invalid value/);
  });

  it.each(VALID_ENVIRONMENTS)('accepts %s as a valid SUPABASE_ENVIRONMENT value on its own', (env) => {
    const result = evaluateEnvironment({
      ...base,
      supabaseEnvironment: env,
      confirmProduction: env === 'production',
    });
    expect(result.ok).toBe(true);
  });

  it('passes for local with no target', () => {
    const result = evaluateEnvironment({ ...base, supabaseEnvironment: 'local' });
    expect(result.ok).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it('passes for staging when --target=staging matches', () => {
    const result = evaluateEnvironment({ ...base, supabaseEnvironment: 'staging', target: 'staging' });
    expect(result.ok).toBe(true);
  });

  it('fails when --target does not match SUPABASE_ENVIRONMENT', () => {
    const result = evaluateEnvironment({ ...base, supabaseEnvironment: 'staging', target: 'production' });
    expect(result.ok).toBe(false);
    expect(result.errors.some(e => e.includes('does not match SUPABASE_ENVIRONMENT'))).toBe(true);
  });

  it('fails when --target itself is an invalid value', () => {
    const result = evaluateEnvironment({ ...base, supabaseEnvironment: 'staging', target: 'preprod' });
    expect(result.ok).toBe(false);
    expect(result.errors.some(e => e.includes('--target has an invalid value'))).toBe(true);
  });

  it('fails for production without --confirm-production', () => {
    const result = evaluateEnvironment({ ...base, supabaseEnvironment: 'production', target: 'production' });
    expect(result.ok).toBe(false);
    expect(result.errors.some(e => e.includes('--confirm-production'))).toBe(true);
  });

  it('passes for production with --confirm-production', () => {
    const result = evaluateEnvironment({
      ...base,
      supabaseEnvironment: 'production',
      target: 'production',
      confirmProduction: true,
    });
    expect(result.ok).toBe(true);
  });

  it('fails when SUPABASE_PROJECT_REF diverges from the linked project ref', () => {
    const result = evaluateEnvironment({
      ...base,
      supabaseEnvironment: 'staging',
      projectRefEnv: 'aaaa1111',
      linkedProject: { ref: 'bbbb2222', name: 'portify-staging' },
    });
    expect(result.ok).toBe(false);
    expect(result.errors.some(e => e.includes('does not match the project ref'))).toBe(true);
  });

  it('passes when SUPABASE_PROJECT_REF matches the linked project ref', () => {
    const result = evaluateEnvironment({
      ...base,
      supabaseEnvironment: 'staging',
      projectRefEnv: 'aaaa1111',
      linkedProject: { ref: 'aaaa1111', name: 'portify-staging' },
    });
    expect(result.ok).toBe(true);
  });

  it('fails when SUPABASE_ENVIRONMENT=staging but the linked project name looks like production', () => {
    const result = evaluateEnvironment({
      ...base,
      supabaseEnvironment: 'staging',
      linkedProject: { ref: 'aaaa1111', name: 'portify-production' },
    });
    expect(result.ok).toBe(false);
    expect(result.errors.some(e => e.includes('looks like production'))).toBe(true);
  });

  it('fails when SUPABASE_ENVIRONMENT=production but the linked project name looks like staging', () => {
    const result = evaluateEnvironment({
      ...base,
      supabaseEnvironment: 'production',
      confirmProduction: true,
      linkedProject: { ref: 'aaaa1111', name: 'portify-staging' },
    });
    expect(result.ok).toBe(false);
    expect(result.errors.some(e => e.includes('looks like staging'))).toBe(true);
  });

  it('warns (does not fail) when no linked project is found', () => {
    const result = evaluateEnvironment({ ...base, supabaseEnvironment: 'local', linkedProject: null });
    expect(result.ok).toBe(true);
    expect(result.warnings.some(w => w.includes('No linked project found'))).toBe(true);
  });

  it('warns (does not fail) when only NEXT_PUBLIC_SUPABASE_URL is set, no SUPABASE_PROJECT_REF', () => {
    const result = evaluateEnvironment({
      ...base,
      supabaseEnvironment: 'local',
      supabaseUrl: 'https://abcd1234.supabase.co',
    });
    expect(result.ok).toBe(true);
    expect(result.warnings.some(w => w.includes('SUPABASE_PROJECT_REF is not set'))).toBe(true);
  });

  it('masks project refs in the returned result, never exposing the raw value', () => {
    const result = evaluateEnvironment({
      ...base,
      supabaseEnvironment: 'staging',
      target: 'staging',
      projectRefEnv: 'abcdefghijkl',
      linkedProject: { ref: 'abcdefghijkl', name: 'portify-staging' },
    });
    expect(result.maskedProjectRefEnv).toBe('abcd****ijkl');
    expect(result.maskedLinkedRef).toBe('abcd****ijkl');
    expect(result.maskedProjectRefEnv).not.toContain('abcdefghijkl');
  });
});
