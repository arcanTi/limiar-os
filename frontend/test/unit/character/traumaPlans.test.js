import { describe, expect, it } from 'vitest';

import { LIMIAR_TRAUMA_PLANS, setTraumaPlans, traumaPlanByKey, traumaPlanKey } from '../../../src/domain/character/traumaPlans.ts';

describe('domain/character/traumaPlans', () => {
  it('recognizes an explicit valid plan key regardless of case', () => {
    expect(traumaPlanKey({ traumaPlan: 'GOLD' })).toBe('gold');
    expect(traumaPlanKey({ traumaPlan: 'platinum' })).toBe('platinum');
  });

  it('falls back to a deterministic hash of id/name when the plan is missing or invalid', () => {
    const character = { id: 'char-1', name: 'Rook' };
    const key = traumaPlanKey(character);
    expect(LIMIAR_TRAUMA_PLANS.some(p => p.key === key)).toBe(true);
    // Same input always resolves to the same plan.
    expect(traumaPlanKey(character)).toBe(key);
  });

  it('prefers id over name for the fallback hash', () => {
    const byId = traumaPlanKey({ id: 'abc', name: 'zzz' });
    const byIdAgain = traumaPlanKey({ id: 'abc', name: 'different name' });
    expect(byId).toBe(byIdAgain);
  });

  it('uses "operative" as the hash source when both id and name are missing', () => {
    expect(traumaPlanKey({})).toBe(traumaPlanKey(null));
  });

  it('looks a plan up by key, defaulting to the first plan for an unknown key', () => {
    expect(traumaPlanByKey('gold')).toMatchObject({ key: 'gold', label: 'GOLD' });
    expect(traumaPlanByKey('not-a-real-plan')).toEqual(LIMIAR_TRAUMA_PLANS[0]);
  });

  it('setTraumaPlans swaps the live-binding table used by both lookups', () => {
    const original = LIMIAR_TRAUMA_PLANS;
    try {
      setTraumaPlans([{ key: 'custom', label: 'CUSTOM' }]);
      expect(traumaPlanByKey('custom')).toMatchObject({ key: 'custom' });
      expect(traumaPlanKey({ traumaPlan: 'custom' })).toBe('custom');
    } finally {
      setTraumaPlans(original);
    }
  });
});
