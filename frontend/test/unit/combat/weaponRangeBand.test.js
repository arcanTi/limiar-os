import { describe, expect, it } from 'vitest';

import { resolveAttackCheck, weaponRangeBand } from '../../../src/domain/combat/combatAttackEngine.ts';

const weapon = {
  rangeTable: {
    custom: true,
    rows: [
      { range: '0-6m/yds', dv: 13 },
      { range: '7-12m/yds', dv: 15 },
    ],
  },
};

describe('combat weaponRangeBand', () => {
  it('uses inclusive CPR range-band boundaries and rejects gaps', () => {
    expect(weaponRangeBand(weapon, 0)).toEqual({ range: '0-6m/yds', dv: 13 });
    expect(weaponRangeBand(weapon, 6)).toEqual({ range: '0-6m/yds', dv: 13 });
    expect(weaponRangeBand(weapon, 7)).toEqual({ range: '7-12m/yds', dv: 15 });
    expect(weaponRangeBand(weapon, 13)).toBeNull();
  });

  it('shares the same DV with the combat resolver', () => {
    const beat = resolveAttackCheck({ weapon, rangeMeters: 7, useWeaponRangeTable: true, attackRoll: { total: 16 } });
    expect(beat).toMatchObject({ defenseDV: 15, hit: true, margin: 1 });
    // CPR RAW: meeting the range DV is not enough, the defender wins a tie.
    const tie = resolveAttackCheck({ weapon, rangeMeters: 7, useWeaponRangeTable: true, attackRoll: { total: 15 } });
    expect(tie).toMatchObject({ defenseDV: 15, hit: false, margin: 0 });
  });
});
