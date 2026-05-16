import { describe, expect, it } from 'vitest';
import { decimalToUnits, normalizeDecimalInput } from '../miniprogram/utils/money';

describe('money input normalization', () => {
  it('normalizes positive decimal input to four decimal places', () => {
    expect(normalizeDecimalInput('123.45')).toBe('123.4500');
    expect(normalizeDecimalInput('.5')).toBe('0.5000');
  });

  it('rejects invalid, negative, and zero input by default', () => {
    expect(normalizeDecimalInput('abc')).toBeUndefined();
    expect(normalizeDecimalInput('-1')).toBeUndefined();
    expect(normalizeDecimalInput('0')).toBeUndefined();
  });

  it('allows zero when explicitly requested', () => {
    expect(normalizeDecimalInput('0', { allowZero: true })).toBe('0.0000');
  });

  it('does not throw for corrupted decimal strings', () => {
    expect(decimalToUnits('not-a-number')).toBe(0n);
  });
});
