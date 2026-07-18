import { describe, expect, it } from 'vitest';

import { nextTokenName } from '../../../src/domain/map/tokenNaming.ts';

describe('map tokenNaming: nextTokenName', () => {
  it('numbers a fresh base starting at 1', () => {
    expect(nextTokenName([], 'Ganger')).toBe('Ganger 1');
  });

  it('increments across repeated adds of the same base', () => {
    expect(nextTokenName(['Ganger 1'], 'Ganger')).toBe('Ganger 2');
    expect(nextTokenName(['Ganger 1', 'Ganger 2'], 'Ganger')).toBe('Ganger 3');
  });

  it('is case-insensitive when matching the base', () => {
    expect(nextTokenName(['ganger 1', 'GANGER 2'], 'Ganger')).toBe('Ganger 3');
  });

  it('ignores siblings from a different base', () => {
    expect(nextTokenName(['Solo 1', 'Solo 2'], 'Ganger')).toBe('Ganger 1');
  });

  it('picks the max existing number, not the count, so a gap does not collide', () => {
    expect(nextTokenName(['Ganger 1', 'Ganger 5'], 'Ganger')).toBe('Ganger 6');
  });

  it('defaults an empty/whitespace name to "Token"', () => {
    expect(nextTokenName([], '')).toBe('Token 1');
    expect(nextTokenName([], '   ')).toBe('Token 1');
  });

  it('strips a hand-typed trailing number to find the base before renumbering', () => {
    expect(nextTokenName(['Ganger 1'], 'Ganger 7')).toBe('Ganger 2');
  });
});
