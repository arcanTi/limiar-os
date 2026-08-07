import { describe, expect, it, vi } from 'vitest';

import {
  advanceConditionTime,
  aggregateConditions,
  criticalInjuryEntry,
  durationToRounds,
  normalizeConditionDuration,
  normalizeCriticalInjuries,
  normalizeStatusEffects,
  removeCriticalInjury,
  removeStatusEffect,
  roundsToDuration,
  statusChargeKey,
  statusEffectEntry,
  toggleCriticalInjuryTreated,
  useStatusCharge,
} from '../../../src/domain/conditions/index.ts';
import { CPRED_CRITICAL_INJURIES } from '../../../src/domain/character/constants.ts';

describe('domain/conditions', () => {
  it('normalizes durations, critical injuries and status effects', () => {
    expect(normalizeConditionDuration({ value: '3', unit: 'min' })).toEqual({ value: 3, unit: 'min' });
    expect(normalizeConditionDuration({ value: -1, unit: 'day' })).toEqual({ value: 0, unit: 'round' });
    expect(normalizeConditionDuration(null)).toBeNull();

    expect(normalizeCriticalInjuries([{ injury: 'crit_head_3' }])).toEqual([
      expect.objectContaining({ injury: 'crit_head_3', location: 'head', treated: false }),
    ]);
    expect(normalizeStatusEffects([{ id: 'boost', duration: { value: 1, unit: 'round' }, modifiers: { actionBonus: 2 } }])).toEqual([
      expect.objectContaining({
        id: 'boost',
        label_pt: 'Status',
        remaining: { value: 1, unit: 'round' },
        modifiers: { actionBonus: 2 },
      }),
    ]);
  });

  it('aggregates untreated injuries, status modifiers, SP ablation and flags', () => {
    const aggregate = aggregateConditions({
      criticalInjuries: [
        { injury: 'crit_head_3', source: 'roll' },
        { injury: 'crit_head_3', source: 'roll', stackPenalty: false },
        { injury: 'crit_head_3', source: 'roll', stackPenalty: false },
        { injury: 'crit_body_8', treated: true },
      ],
      spDamage: { head: 1, body: 2 },
      statusEffects: [
        { modifiers: { actionBonus: 2, evasionMod: -1, spAblation: { body: 3 }, ignoreWoundState: true } },
      ],
      equipped: [{ flags: { ignoreSeriouslyWounded: true } }],
    });

    expect(aggregate.actionPenalty).toBe(2);
    expect(aggregate.deathSavePenalty).toBe(2);
    expect(aggregate.spAblation).toEqual({ head: 1, body: 5 });
    expect(aggregate.evasionMod).toBe(-1);
    expect(aggregate.ignoreWoundState).toBe(true);
    expect(aggregate.ignoreSeriouslyWounded).toBe(true);
  });

  it('creates and mutates critical injury/status records', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-06T13:00:00.000Z'));
    vi.spyOn(Math, 'random').mockReturnValue(0.5);

    const critical = criticalInjuryEntry(CPRED_CRITICAL_INJURIES.crit_body_11, { source: 'test' });
    expect(critical).toMatchObject({
      injury: 'crit_body_11',
      location: 'body',
      source: 'test',
      treated: false,
      appliedAt: '2026-07-06T13:00:00.000Z',
    });

    const toggled = toggleCriticalInjuryTreated([critical], critical.instanceId);
    expect(toggled[0].treated).toBe(true);
    expect(removeCriticalInjury(toggled, critical.instanceId)).toEqual([]);

    const status = statusEffectEntry({
      id: 'charge',
      label_pt: 'Charge',
      duration: { value: 1, unit: 'round' },
      modifiers: { charges: 2 },
    });
    expect(statusChargeKey(status)).toBe('charges');
    expect(useStatusCharge([status], status.instanceId)[0].modifiers.charges).toBe(1);
    expect(useStatusCharge([{ ...status, modifiers: { charges: 1 } }], status.instanceId)).toEqual([]);
    expect(removeStatusEffect([status], status.instanceId)).toEqual([]);

    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('converts and advances condition time', () => {
    expect(durationToRounds({ value: 2, unit: 'hour' })).toBe(2400);
    expect(durationToRounds({ value: 3, unit: 'min' })).toBe(60);
    expect(roundsToDuration(21, 'min')).toEqual({ value: 2, unit: 'min' });

    expect(advanceConditionTime([
      { id: 'short', remaining: { value: 1, unit: 'round' } },
      { id: 'long', remaining: { value: 2, unit: 'round' } },
      { id: 'forever', remaining: null },
    ], 'round')).toEqual([
      { id: 'long', remaining: { value: 1, unit: 'round' } },
      { id: 'forever', remaining: null },
    ]);
  });
});
