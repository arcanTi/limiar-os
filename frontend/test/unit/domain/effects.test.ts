import { describe, it, expect } from 'vitest';
import { characterEffectDigest } from '../../../src/domain/effects/index.ts';

function digest(overrides: { character?: Record<string, unknown>; derived?: Record<string, unknown>; installedCyberware?: unknown[] } = {}) {
  return characterEffectDigest({
    character: { health: { cur: 30, max: 40 }, ...(overrides.character || {}) },
    derived: { seriouslyWounded: 20, headSp: 11, bodySp: 11, currentHeadSp: 11, currentBodySp: 11, ...(overrides.derived || {}) },
    installedCyberware: (overrides.installedCyberware || []) as never,
  });
}

describe('characterEffectDigest', () => {
  it('says so plainly when nothing is acting on the character', () => {
    const result = digest();
    expect(result.clean).toBe(true);
    expect(result.headline_pt).toBe('Sem modificadores ativos');
  });

  it('attributes each slice of the action penalty to its own source', () => {
    // deriveStats would only report actionPenalty: 4 — this is the "why".
    const result = digest({
      character: {
        health: { cur: 15, max: 40 },
        criticalInjuries: [{ instanceId: 'ci-1', injury: 'crit_head_4', treated: false, location: 'head' }],
      },
      derived: { actionPenalty: 4, woundActionPenalty: 2, seriouslyWounded: 20 },
    });

    const action = result.rows.filter(row => row.scope === 'action');
    expect(action.map(row => [row.source, row.value])).toEqual([
      ['Olho Danificado', -2],
      ['Ferido Grave', -2],
    ]);
    expect(result.totals.action).toBe(-4);
    expect(result.headline_pt).toContain('-4 acoes');
  });

  it('keeps totals from the derived stats rather than re-summing the rows', () => {
    // Rows explain the number; they must never be able to contradict it.
    const result = digest({ derived: { actionPenalty: 7, movePenalty: 2, deathSaveModifier: -1, evasionMod: 3 } });
    expect(result.totals).toMatchObject({ action: -7, move: -2, deathSave: -1, evasion: 3 });
  });

  it('splits positive from negative so the GM reads one column each', () => {
    const result = digest({
      character: {
        statusEffects: [
          { instanceId: 's1', id: 'world_extra_turn', label_pt: 'Turno extra', modifiers: { actionBonus: 5, skipDeathSave: true } },
          { instanceId: 's2', id: 'toxin_inebriated', label_pt: 'Embriagado', modifiers: { actionBonus: -2 } },
        ],
      },
    });
    expect(result.positives.map(r => r.value)).toEqual([5, 0]);
    expect(result.negatives.map(r => r.value)).toEqual([-2]);
  });

  it('shows a treated injury as carried, not as an active penalty', () => {
    const result = digest({
      character: { criticalInjuries: [{ instanceId: 'ci-1', injury: 'crit_head_4', treated: true, location: 'head' }] },
    });
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]).toMatchObject({ sign: 'neutral', treated: true, value: 0 });
    expect(result.rows[0].label_pt).toContain('sem penalidade ativa');
  });

  it('keeps a status with no numbers visible, because the table still plays it', () => {
    const result = digest({
      character: { statusEffects: [{ instanceId: 's1', id: 'suppressed', label_pt: 'Suprimido', modifiers: {} }] },
    });
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]).toMatchObject({ scope: 'state', sign: 'neutral', removable: true, instanceId: 's1' });
  });

  it('marks what the GM can lift and what is structural', () => {
    const result = digest({
      character: {
        health: { cur: 15, max: 40 },
        statusEffects: [{ instanceId: 's1', id: 'suppressed', label_pt: 'Suprimido', modifiers: {} }],
      },
      derived: { woundActionPenalty: 2, armorPenalty: 2, seriouslyWounded: 20 },
    });
    const removable = result.rows.filter(row => row.removable).map(row => row.sourceKind);
    const fixed = result.rows.filter(row => !row.removable).map(row => row.sourceKind);
    expect(removable).toEqual(['status']);
    expect(fixed).toEqual(expect.arrayContaining(['wound', 'armor']));
  });

  it('reports armor ablation with the current and original SP', () => {
    const result = digest({ derived: { currentHeadSp: 8, currentBodySp: 11, headSp: 11, bodySp: 11 } });
    const row = result.rows.find(r => r.id === 'armor:ablation')!;
    expect(row).toMatchObject({ value: -3, sign: 'negative' });
    expect(row.detail).toContain('8/11');
  });

  it('credits cyberware bonuses to the implant that grants them', () => {
    const result = digest({
      installedCyberware: [
        { code: 'TOX-BIND', name: 'Toxin Binders', skillBonus: { 'Resist Torture/Drugs': 2 }, hcost: 3 },
        { code: 'MUSCLE-LACE', name: 'Grafted Muscle', statMod: { BODY: 2 } },
      ],
    });
    const skill = result.rows.find(r => r.scope === 'skill')!;
    expect(skill).toMatchObject({ source: 'Toxin Binders', value: 2, sign: 'positive' });
    const stat = result.rows.find(r => r.scope === 'stat' && r.stat === 'BODY')!;
    expect(stat).toMatchObject({ source: 'Grafted Muscle', value: 2 });
    // Chrome is not free: the humanity it costs shows as a live negative.
    expect(result.rows.find(r => r.id === 'cyber:humanity')).toMatchObject({ value: -3, sign: 'negative' });
  });

  it('surfaces poison immunity for an inorganic body', () => {
    const result = digest({ character: { bodyType: 'drone' } });
    expect(result.rows.find(r => r.id === 'body:inorganic')).toMatchObject({ sign: 'positive', scope: 'immunity' });
  });

  it('reports an ignored wound state as a benefit, not silence', () => {
    const result = digest({ derived: { ignoreWoundState: true } });
    expect(result.rows.find(r => r.id === 'wound:ignored')).toMatchObject({ sign: 'positive' });
  });

  it('carries the status duration so the GM knows what expires', () => {
    const result = digest({
      character: {
        statusEffects: [{ instanceId: 's1', id: 'toxin_inebriated', label_pt: 'Embriagado', modifiers: { actionBonus: -2 }, remaining: { value: 1, unit: 'hour' }, source: 'toxina:alcohol' }],
      },
    });
    expect(result.rows[0].detail).toBe('1 h :: origem: toxina:alcohol');
  });
});

describe('mortally wounded rows', () => {
  it('lists -4 actions, MOVE -6 and the death save streak, all non-removable', () => {
    const result = characterEffectDigest({
      character: { health: { cur: 0, max: 40 }, statusEffects: [], criticalInjuries: [] },
      derived: { actionPenalty: 4, woundActionPenalty: 4, woundMovePenalty: 6, movePenalty: 6, woundState: 'mortallyWounded', deathSavesPassed: 2, deathSaveModifier: -2, seriouslyWounded: 20 },
    });
    const ids = result.rows.filter((r) => r.sourceKind === 'wound').map((r) => r.id);
    expect(ids).toEqual(['wound:mortally', 'wound:mortally:move', 'wound:mortally:deathSave']);
    expect(result.rows.find((r) => r.id === 'wound:mortally')).toMatchObject({ value: -4, scope: 'action', removable: false });
    expect(result.rows.find((r) => r.id === 'wound:mortally:move')).toMatchObject({ value: -6, scope: 'move' });
    expect(result.rows.find((r) => r.id === 'wound:mortally:deathSave')).toMatchObject({ value: -2, scope: 'deathSave' });
    expect(result.totals.move).toBe(-6);
    expect(result.totals.deathSave).toBe(-2);
  });
});
