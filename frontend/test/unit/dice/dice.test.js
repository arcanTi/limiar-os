import { describe, expect, it, vi } from 'vitest';

import {
  cyberSourceBreakdown,
  normalizeRollContributions,
  parseDiceText,
  rollBreakdownDetail,
  rollDetail,
  rollDiceMeta,
  rollFaces,
  rollNotation,
} from '../../../src/domain/dice/index.ts';

const sequence = (values) => {
  let i = 0;
  return () => values[i++ % values.length];
};

describe('domain/dice', () => {
  it('parses NdM notation with implicit count and clamps physical dice', () => {
    expect(parseDiceText('d6')).toEqual({ count: 1, sides: 6 });
    expect(parseDiceText('99d1000')).toEqual({ count: 20, sides: 100 });
    expect(parseDiceText('flat +2')).toBeNull();
  });

  it('expands d100 notation for the 3D dice engine', () => {
    expect(rollNotation({ count: 2, sides: 100, mod: -1 })).toBe('1d100+1d9+1d100+1d9+1');
  });

  it('normalizes contribution rows and caps them at twenty rolled dice', () => {
    const rows = normalizeRollContributions({
      contributions: [
        { count: 18, sides: 6, source: 'Weapon' },
        { count: 8, sides: 6, source: 'Bonus', kind: 'bonus', mod: 3 },
      ],
    });

    expect(rows).toEqual([
      expect.objectContaining({ count: 18, originalCount: 18, source: 'Weapon', kind: 'base' }),
      expect.objectContaining({ count: 2, originalCount: 8, source: 'Bonus', kind: 'bonus', mod: 3 }),
    ]);
  });

  it('builds notation, metadata and readable detail from contribution rows', () => {
    const opts = {
      contributions: [
        { count: 2, sides: 6, source: 'Weapon', reason: 'base' },
        { count: 1, sides: 10, source: 'Cyberware', kind: 'bonus', mod: 2 },
      ],
      mod: -1,
    };

    expect(rollNotation(opts)).toBe('2d6+1d10+1');
    expect(rollDiceMeta(opts)).toEqual([
      { sides: 6, source: 'Weapon', kind: 'base', reason: 'base', contributionIndex: 0 },
      { sides: 6, source: 'Weapon', kind: 'base', reason: 'base', contributionIndex: 0 },
      { sides: 10, source: 'Cyberware', kind: 'bonus', reason: '', contributionIndex: 1 },
    ]);
    expect(rollDetail(opts, [4, 5, 7])).toBe('Weapon [4 + 5] + Cyberware [7 + 2] + -1');
  });

  it('appends breakdown rows and formats cyberware source snippets', () => {
    expect(rollBreakdownDetail('2 + 5', ['+2 optics', '', 'aimed shot'])).toBe('2 + 5 // +2 optics // aimed shot');
    expect(cyberSourceBreakdown(['+2 Kiroshi', '-1 smoke', 'manual'])).toEqual([
      '+2 (Kiroshi)',
      '-1 (smoke)',
      'manual',
    ]);
  });

  describe('rollFaces', () => {
    it('rolls a simple count/sides/mod spec using the injected rng, deterministically', () => {
      const rng = sequence([0, 0.999999]);
      const result = rollFaces({ sides: 10, count: 2, mod: 1 }, rng);
      expect(result.faces).toEqual([1, 10]);
      expect(result.total).toBe(12);
    });

    it('rolls a contribution-based spec, summing per-row mods plus the extra mod', () => {
      const opts = {
        contributions: [
          { count: 2, sides: 6, source: 'Weapon' },
          { count: 1, sides: 10, source: 'Cyberware', kind: 'bonus', mod: 2 },
        ],
        mod: -1,
      };
      const rng = sequence([0, 0.5, 0.999999]);
      const result = rollFaces(opts, rng);
      expect(result.faces).toEqual([1, 4, 10]);
      expect(result.total).toBe(1 + 4 + 10 + 2 - 1);
      expect(result.detail).toBe(rollDetail(opts, result.faces));
    });

    it('defaults rng to Math.random when not provided (same shape as the live app)', () => {
      const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0.5);
      const result = rollFaces({ sides: 6, count: 1 });
      expect(result.faces).toEqual([4]);
      randomSpy.mockRestore();
    });

    it('never calls Math.random when an rng is injected', () => {
      const randomSpy = vi.spyOn(Math, 'random');
      rollFaces({ sides: 6, count: 3 }, () => 0.1);
      expect(randomSpy).not.toHaveBeenCalled();
      randomSpy.mockRestore();
    });
  });
});
