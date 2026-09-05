import { describe, it, expect } from 'vitest';
import {
  describeEffectModifiers,
  effectPresetCatalog,
  normalizeCustomEffect,
  normalizeCustomEffects,
  normalizeEffectModifiers,
} from '../../../src/domain/effects/customEffects.ts';
import { CPRED_STATUS_PRESETS } from '../../../src/domain/conditions/constants.ts';
import { aggregateConditions, statusEffectEntry } from '../../../src/domain/conditions/index.ts';
import { deriveStats } from '../../../src/domain/character/derivedStatsEngine.ts';

describe('normalizeEffectModifiers', () => {
  it('keeps only the keys the conditions engine actually reads', () => {
    const modifiers = normalizeEffectModifiers({
      actionBonus: 2,
      evasionMod: -1,
      moveBonus: 3,
      deathSaveBonus: 1,
      statBonus: { REF: -2, NONSENSE: 4 },
      spAblation: { head: 2, body: 0 },
      ignoreWoundState: true,
      charges: 3,
      // Not part of the engine's vocabulary — must not survive, or it would
      // render as an effect that changes nothing at the table.
      inventedBonus: 99,
      damage: '3d6',
    });
    expect(modifiers).toEqual({
      actionBonus: 2,
      evasionMod: -1,
      moveBonus: 3,
      deathSaveBonus: 1,
      statBonus: { REF: -2 },
      spAblation: { head: 2, body: 0 },
      ignoreWoundState: true,
      charges: 3,
    });
  });

  it('drops zeroes so a blank effect stays a pure narrative badge', () => {
    expect(normalizeEffectModifiers({ actionBonus: 0, evasionMod: '', statBonus: { REF: 0 } })).toEqual({});
  });

  it('clamps values to something a table can play', () => {
    const modifiers = normalizeEffectModifiers({ actionBonus: 999, moveBonus: -999, charges: -5 });
    expect(modifiers).toMatchObject({ actionBonus: 10, moveBonus: -10 });
    expect(modifiers.charges).toBeUndefined();
  });
});

describe('normalizeCustomEffect', () => {
  it('derives a stable id and a normalized duration', () => {
    const effect = normalizeCustomEffect({ name: 'Sobrecarga Neural', duration: { value: 3, unit: 'round' }, actionBonus: -2 });
    expect(effect).toMatchObject({
      id: 'sobrecarga-neural',
      label_pt: 'Sobrecarga Neural',
      duration: { value: 3, unit: 'round' },
      custom: true,
    });
    expect(effect.modifiers).toEqual({ actionBonus: -2 });
  });

  it('treats a missing or zero duration as indefinite', () => {
    expect(normalizeCustomEffect({ name: 'X' }).duration).toBeNull();
    expect(normalizeCustomEffect({ name: 'X', duration: { value: 0, unit: 'min' } }).duration).toBeNull();
  });

  it('keeps ids unique when two effects would collide', () => {
    const rows = normalizeCustomEffects([{ name: 'Choque' }, { name: 'Choque' }]);
    expect(rows.map(r => r.id)).toEqual(['choque', 'choque-1']);
  });
});

describe('effectPresetCatalog', () => {
  it('adds the campaign effects to the book presets', () => {
    const catalog = effectPresetCatalog(CPRED_STATUS_PRESETS, [{ name: 'Sobrecarga', actionBonus: -3 }]);
    expect(catalog).toHaveLength(CPRED_STATUS_PRESETS.length + 1);
    expect(catalog.at(-1)).toMatchObject({ id: 'sobrecarga', custom: true });
  });

  it('lets a campaign effect override a preset of the same id', () => {
    const catalog = effectPresetCatalog(CPRED_STATUS_PRESETS, [{ id: 'suppressed', name: 'Suprimido da casa', actionBonus: -4 }]);
    const rows = catalog.filter(row => row.id === 'suppressed');
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ label_pt: 'Suprimido da casa', custom: true });
  });
});

describe('a custom effect flows through the live rules engine', () => {
  const base = { INT: 6, REF: 7, DEX: 6, TECH: 5, COOL: 6, WILL: 6, LUCK: 6, MOVE: 6, BODY: 7, EMP: 5 };

  function withEffect(raw: Record<string, unknown>) {
    const effect = normalizeCustomEffect(raw);
    const instance = statusEffectEntry(effect, { source: 'gm', rng: () => 0.5, clock: () => new Date('2026-09-03T00:00:00Z') });
    return { base, statusEffects: [instance] };
  }

  it('applies a penalty exactly like a built-in preset does', () => {
    const character = withEffect({ name: 'Sobrecarga', actionBonus: -3 });
    expect(aggregateConditions(character).actionPenalty).toBe(3);
    expect(deriveStats({ stats: base, character }).actionPenalty).toBe(3);
  });

  it('applies a buff, which the injury path could never express', () => {
    const character = withEffect({ name: 'Estimulante', actionBonus: 2 });
    expect(deriveStats({ stats: base, character }).actionPenalty).toBe(-2);
  });

  it('moves MOVE and a single stat, in both directions', () => {
    const debuff = deriveStats({ stats: base, character: withEffect({ name: 'Pernas presas', moveBonus: -2, statBonus: { REF: -2 } }) });
    expect(debuff.effectiveStats.MOVE).toBe(4);
    expect(debuff.effectiveStats.REF).toBe(5);
    expect(debuff.movePenalty).toBe(2);

    const buff = deriveStats({ stats: base, character: withEffect({ name: 'Reflex boost', moveBonus: 2, statBonus: { REF: 2 } }) });
    expect(buff.effectiveStats.MOVE).toBe(8);
    expect(buff.effectiveStats.REF).toBe(9);
  });

  it('shifts the Death Save and ablates armor', () => {
    const character = {
      ...withEffect({ name: 'Corrosivo', deathSaveBonus: -2, spAblation: { head: 3, body: 1 } }),
      armor: { head: { sp: 11, name: 'Kevlar', penalty: 0 }, body: { sp: 11, name: 'Kevlar', penalty: 0 } },
    };
    const derived = deriveStats({ stats: base, character });
    expect(derived.deathSaveModifier).toBe(-2);
    expect(derived.deathSave).toBe(base.BODY - 2);
    expect(derived.currentHeadSp).toBe(8);
    expect(derived.currentBodySp).toBe(10);
  });

  it('carries the engine flags', () => {
    const derived = deriveStats({ stats: base, character: withEffect({ name: 'Adrenalina', ignoreWoundState: true, skipDeathSave: true }) });
    expect(derived.ignoreWoundState).toBe(true);
    expect(derived.skipDeathSave).toBe(true);
  });

  it('never lets an effective stat go below zero', () => {
    const derived = deriveStats({ stats: base, character: withEffect({ name: 'Colapso', statBonus: { REF: -10 } }) });
    expect(derived.effectiveStats.REF).toBe(0);
  });
});

describe('describeEffectModifiers', () => {
  it('summarizes what the effect will do before it is saved', () => {
    expect(describeEffectModifiers(normalizeEffectModifiers({ actionBonus: -2, moveBonus: 1, statBonus: { REF: -1 } })))
      .toBe('-2 acoes :: +1 MOVE :: -1 REF');
    expect(describeEffectModifiers({})).toBe('sem modificador numerico');
  });
});
