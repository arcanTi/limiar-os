import { describe, expect, it } from 'vitest';

import { advanceCombatTurn, applyArmorToDamage, normalizeCombatState } from '../../../src/domain/combat/index.ts';
import { ROLL_TRIGGERS, evaluateRollTriggers } from '../../../src/domain/combat/constants.ts';

function combatant(overrides = {}) {
  return { side: 'pc', initiative: 10, acted: false, defeated: false, ...overrides };
}

describe('domain/combat applyArmorToDamage', () => {
  it('subtracts full SP from rolled damage and ablates 1 SP when it penetrates', () => {
    expect(applyArmorToDamage(15, 11)).toEqual({ hpLoss: 4, spAblated: 1, effectiveSp: 11 });
  });

  it('does not ablate armor when the hit fails to penetrate', () => {
    expect(applyArmorToDamage(8, 11)).toEqual({ hpLoss: 0, spAblated: 0, effectiveSp: 11 });
  });

  it('halves (rounding up) the target SP for a weapon that ignores half armor (Melee Weapon / Martial Arts)', () => {
    expect(applyArmorToDamage(15, 11, { ignoresHalfArmor: true })).toEqual({ hpLoss: 9, spAblated: 1, effectiveSp: 6 });
  });

  it('treats a missing/negative SP as 0', () => {
    expect(applyArmorToDamage(10, -5)).toEqual({ hpLoss: 10, spAblated: 0, effectiveSp: 0 });
    expect(applyArmorToDamage(10, null)).toEqual({ hpLoss: 10, spAblated: 0, effectiveSp: 0 });
  });
});

describe('domain/combat/constants evaluateRollTriggers', () => {
  const diceOf = (values) => values.map(value => ({ sides: 6, value }));

  it('fires the Critical Injury trigger on 2+ sixes in a damage roll', () => {
    const result = { scope: 'damage', dice: diceOf([6, 6, 3]) };
    const matches = evaluateRollTriggers(result);
    expect(matches.map(m => m.rule.id)).toEqual(['criticalInjury']);
  });

  it('fires both Critical Injury and Tarot draw on 3+ sixes (deliberate stacking)', () => {
    const result = { scope: 'damage', dice: diceOf([6, 6, 6]) };
    const matches = evaluateRollTriggers(result);
    expect(matches.map(m => m.rule.id).sort()).toEqual(['criticalInjury', 'tarotDraw']);
  });

  it('does not fire on a non-damage scope roll, even with 3+ sixes', () => {
    const result = { scope: 'check', dice: diceOf([6, 6, 6]) };
    expect(evaluateRollTriggers(result)).toEqual([]);
  });

  it('does not fire below threshold', () => {
    const result = { scope: 'damage', dice: diceOf([6, 3, 2]) };
    expect(evaluateRollTriggers(result)).toEqual([]);
  });

  it('ROLL_TRIGGERS defines exactly the Critical Injury (2 sixes) and Tarot draw (3 sixes) rules', () => {
    expect(ROLL_TRIGGERS).toEqual([
      { id: 'criticalInjury', face: 6, sides: 6, threshold: 2, scope: 'damage', label: 'CRITICAL INJURY' },
      { id: 'tarotDraw', face: 6, sides: 6, threshold: 3, scope: 'damage', label: 'NIGHT CITY TAROT' },
    ]);
  });
});

describe('domain/combat advanceCombatTurn', () => {
  it('marks the current combatant as acted and moves to the next undefeated one in order', () => {
    const state = { round: 1, turnIndex: 0, order: ['a', 'b', 'c'], combatants: { a: combatant(), b: combatant(), c: combatant() } };
    const next = advanceCombatTurn(state, 'a');
    expect(next.turnIndex).toBe(1);
    expect(next.round).toBe(1);
    expect(next.combatants.a.acted).toBe(true);
  });

  it('skips defeated combatants', () => {
    const state = { round: 1, turnIndex: 0, order: ['a', 'b', 'c'], combatants: { a: combatant(), b: combatant({ defeated: true }), c: combatant() } };
    const next = advanceCombatTurn(state, 'a');
    expect(next.turnIndex).toBe(2);
  });

  it('wraps to a new round and resets every acted flag once the order is exhausted', () => {
    const state = { round: 1, turnIndex: 2, order: ['a', 'b', 'c'], combatants: { a: combatant({ acted: true }), b: combatant({ acted: true }), c: combatant() } };
    const next = advanceCombatTurn(state, 'c');
    expect(next.round).toBe(2);
    expect(next.turnIndex).toBe(0);
    expect(Object.values(next.combatants).every(c => c.acted === false)).toBe(true);
  });

  it('sets turnIndex to -1 when no combatant is active (all defeated)', () => {
    const state = { round: 1, turnIndex: 0, order: ['a', 'b'], combatants: { a: combatant({ defeated: true }), b: combatant({ defeated: true }) } };
    const next = advanceCombatTurn(state, 'a');
    expect(next.turnIndex).toBe(-1);
  });
});

describe('domain/combat normalizeCombatState', () => {
  it('uses the injected now value when updatedAt is missing', () => {
    expect(normalizeCombatState({}, [], '2026-07-07T12:00:00.000Z').updatedAt).toBe('2026-07-07T12:00:00.000Z');
  });

  it('preserves an existing updatedAt value', () => {
    expect(normalizeCombatState({ updatedAt: 'saved' }, [], 'now').updatedAt).toBe('saved');
  });
});
