import { describe, expect, it, vi } from 'vitest';

import ApplyCombatDamage from '../../../src/application/ApplyCombatDamage.ts';

const sequence = (values) => {
  let i = 0;
  return () => values[i++ % values.length];
};

function fakeApi() {
  return { characters: { upsert: vi.fn() } };
}

const weapon = { name: 'Test Blade', count: 3, sides: 6, mod: 0 };

function target(overrides = {}) {
  return { id: 't1', health: { cur: 30, max: 35 }, spDamage: { head: 0, body: 0 }, criticalInjuries: [], equipped: [], ...overrides };
}

describe('application/ApplyCombatDamage', () => {
  it('rolls damage deterministically and reports the total/faces', () => {
    const useCase = new ApplyCombatDamage({ api: fakeApi(), rng: sequence([0.99, 0.99, 0.1]) });
    const result = useCase.execute({ weapon });
    expect(result.faces).toEqual([6, 6, 1]);
    expect(result.total).toBe(13);
  });

  it('engages armor (damage - SP) and ablates 1 SP on a target, persisting the patch', () => {
    const api = fakeApi();
    const useCase = new ApplyCombatDamage({ api, rng: sequence([0.99, 0.99, 0.1]) });
    const t = target();
    const result = useCase.execute({ weapon, target: t, currentSp: 5, location: 'body' });

    expect(result.hpLoss).toBe(8); // 13 - 5 SP
    expect(result.spAblated).toBe(1);
    expect(result.characterPatch.health).toEqual({ cur: 22, max: 35 });
    expect(result.characterPatch.spDamage).toEqual({ head: 0, body: 1 });
    expect(api.characters.upsert).toHaveBeenCalledTimes(1);
    expect(api.characters.upsert.mock.calls[0][0]).toMatchObject({ id: 't1', health: { cur: 22, max: 35 } });
  });

  it('halves (rounding up) the target SP for a weapon that ignores half armor', () => {
    const meleeWeapon = { ...weapon, ignoresHalfArmor: true };
    const useCase = new ApplyCombatDamage({ api: fakeApi(), rng: sequence([0.99, 0.99, 0.1]) });
    const result = useCase.execute({ weapon: meleeWeapon, target: target(), currentSp: 11, location: 'body' });
    expect(result.hpLoss).toBe(7); // 13 - ceil(11/2)=6
  });

  it('detects the Critical Injury trigger (2+ sixes) without auto-resolving by default', () => {
    const useCase = new ApplyCombatDamage({ api: fakeApi(), rng: sequence([0.99, 0.99, 0.1]) });
    const result = useCase.execute({ weapon, target: target(), currentSp: 5 });
    expect(result.criticalInjuryTriggered).toBe(true);
    expect(result.criticalInjury).toBeNull();
    expect(result.hpLoss).toBe(8); // no +5 bonus since not auto-resolved
  });

  it('detects the Tarot draw trigger (3+ sixes) as a separate, independent marker', () => {
    const useCase = new ApplyCombatDamage({ api: fakeApi(), rng: sequence([0.99, 0.99, 0.99]) });
    const result = useCase.execute({ weapon, target: target(), currentSp: 5 });
    expect(result.criticalInjuryTriggered).toBe(true);
    expect(result.tarotTriggered).toBe(true);
  });

  it('does not trigger anything on a normal roll below threshold', () => {
    const useCase = new ApplyCombatDamage({ api: fakeApi(), rng: sequence([0.1, 0.1, 0.1]) });
    const result = useCase.execute({ weapon, target: target(), currentSp: 5 });
    expect(result.criticalInjuryTriggered).toBe(false);
    expect(result.tarotTriggered).toBe(false);
  });

  it('auto-resolves the critical injury table roll and applies +5 bonus damage when asked to', () => {
    const api = fakeApi();
    // 3 damage dice [6,6,1], then a 2d6 table roll of 4+4=8 -> crit_body_8.
    const useCase = new ApplyCombatDamage({ api, rng: sequence([0.99, 0.99, 0.1, 0.5, 0.5]) });
    const result = useCase.execute({ weapon, target: target(), currentSp: 5, location: 'body', autoResolveCriticalInjury: true });

    expect(result.criticalInjury.catalog.id).toBe('crit_body_8');
    expect(result.hpLoss).toBe(8 + 5);
    expect(result.characterPatch.criticalInjuries).toHaveLength(1);
    expect(result.characterPatch.criticalInjuries[0]).toMatchObject({ injury: 'crit_body_8', location: 'body' });
  });

  it('rerolls on a duplicate injury (book\'s "Multiplas Lesoes" rule) instead of stacking the same one twice', () => {
    const existing = target({ criticalInjuries: [{ injury: 'crit_body_8', location: 'body' }] });
    // First 2d6 pair (0.5,0.5) sums to 8 (duplicate) -> reroll; second pair (0,0) sums to 2 -> crit_body_2.
    const useCase = new ApplyCombatDamage({ api: fakeApi(), rng: sequence([0.99, 0.99, 0.1, 0.5, 0.5, 0, 0]) });
    const result = useCase.execute({ weapon, target: existing, currentSp: 5, location: 'body', autoResolveCriticalInjury: true });
    expect(result.criticalInjury.catalog.id).toBe('crit_body_2');
  });

  it('accepts an already-rolled result (live animated-roll wiring) instead of rolling itself', () => {
    const useCase = new ApplyCombatDamage({ api: fakeApi(), rng: () => { throw new Error('should not roll'); } });
    const preRolled = { total: 20, faces: [6, 6, 6], dice: [
      { value: 6, sides: 6, source: 'Weapon', kind: 'base', reason: '', contributionIndex: 0 },
      { value: 6, sides: 6, source: 'Weapon', kind: 'base', reason: '', contributionIndex: 0 },
      { value: 6, sides: 6, source: 'Weapon', kind: 'base', reason: '', contributionIndex: 0 },
    ] };
    const result = useCase.execute({ weapon, target: target(), currentSp: 5, result: preRolled });
    expect(result.total).toBe(20);
    expect(result.tarotTriggered).toBe(true);
    expect(result.hpLoss).toBe(15);
  });

  it('returns a preview (no persistence) when no target is given', () => {
    const api = fakeApi();
    const useCase = new ApplyCombatDamage({ api, rng: sequence([0.99, 0.99, 0.1]) });
    const result = useCase.execute({ weapon, currentSp: 5 });
    expect(result.hpLoss).toBe(8);
    expect(result.characterPatch).toBeUndefined();
    expect(api.characters.upsert).not.toHaveBeenCalled();
  });

  it('never calls Math.random when an rng is injected', () => {
    const randomSpy = vi.spyOn(Math, 'random');
    const useCase = new ApplyCombatDamage({ api: fakeApi(), rng: sequence([0.99, 0.99, 0.1, 0.5, 0.5]) });
    useCase.execute({ weapon, target: target(), currentSp: 5, autoResolveCriticalInjury: true });
    expect(randomSpy).not.toHaveBeenCalled();
    randomSpy.mockRestore();
  });
});
