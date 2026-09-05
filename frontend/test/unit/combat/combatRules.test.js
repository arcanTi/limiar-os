import { describe, expect, it, vi } from 'vitest';

import { mortallyWoundedDamageEffects } from '../../../src/domain/combat/mortalWound.ts';
import { attackBudget } from '../../../src/domain/combat/attackBudget.ts';
import { resolveGrappleAction, CHOKE_KNOCKOUT_TURNS } from '../../../src/domain/combat/grapple.ts';
import { evasionBlockedReason, canEvade } from '../../../src/domain/combat/evasionRules.ts';
import { resolveTurnTick, applyStatDrain, VACUUM_DRAIN_STATUS_ID } from '../../../src/domain/conditions/turnTick.ts';
import { CPRED_STATUS_PRESETS } from '../../../src/domain/conditions/constants.ts';
import { aggregateConditions } from '../../../src/domain/conditions/index.ts';
import { damageShield, humanShieldFrom, normalizeShield } from '../../../src/domain/character/index.ts';
import { linearFrameBody } from '../../../src/domain/cyberware/index.ts';
import { deriveStats } from '../../../src/domain/character/derivedStatsEngine.ts';
import ApplyCombatDamage from '../../../src/application/ApplyCombatDamage.ts';

const preset = (id) => CPRED_STATUS_PRESETS.find(row => row.id === id);
const status = (id, extra = {}) => ({ instanceId: 'se-' + id, id, label_pt: preset(id).label_pt, source: 't', scope: 'self', duration: null, remaining: null, modifiers: { ...preset(id).modifiers, ...extra }, appliedAt: '' });
const queuedRng = (values) => { const queue = values.slice(); return () => (queue.length ? (queue.shift() - 1) / 6 : 0); };

describe('CPR RAW: Mortally Wounded aggravation (p.176)', () => {
  it('a hit that gets damage through while below 1 HP is an automatic critical and +1 Death Save penalty', () => {
    expect(mortallyWoundedDamageEffects({ hpBefore: 0, hpLoss: 3 })).toEqual({ wasMortallyWounded: true, autoCriticalInjury: true, deathSavePenaltyDelta: 1 });
  });

  it('a hit fully stopped by armor adds nothing; a hit that only just drops the target to 0 adds nothing either', () => {
    expect(mortallyWoundedDamageEffects({ hpBefore: 0, hpLoss: 0 })).toMatchObject({ autoCriticalInjury: false, deathSavePenaltyDelta: 0 });
    expect(mortallyWoundedDamageEffects({ hpBefore: 4, hpLoss: 9 })).toMatchObject({ wasMortallyWounded: false, autoCriticalInjury: false, deathSavePenaltyDelta: 0 });
  });

  it('area damage still raises the penalty but is not listed as an automatic-critical trigger', () => {
    expect(mortallyWoundedDamageEffects({ hpBefore: 0, hpLoss: 5, area: true })).toMatchObject({ autoCriticalInjury: false, deathSavePenaltyDelta: 1 });
  });

  it('ApplyCombatDamage folds the penalty into the patch and flags the automatic critical', () => {
    const upsert = vi.fn();
    const target = { id: 'rook', health: { cur: 0, max: 35 }, spDamage: { head: 0, body: 0 }, criticalInjuries: [], deathSaveWoundPenalty: 1 };
    const result = new ApplyCombatDamage({ api: { characters: { upsert } } }).execute({
      weapon: { name: 'Pistol' }, target, location: 'body', currentSp: 0,
      result: { dice: [{ value: 4, sides: 6 }], total: 4 },
    });
    expect(result.mortalWoundCritical).toBe(true);
    expect(result.mortalWoundPenaltyDelta).toBe(1);
    expect(result.characterPatch.deathSaveWoundPenalty).toBe(2);
  });

  it('deriveStats adds the wound penalty to the Death Save only while Mortally Wounded', () => {
    const base = { BODY: 7, WILL: 5 };
    const mortal = deriveStats({ stats: base, character: { base, health: { cur: 0 }, deathSaveWoundPenalty: 2, deathSavesPassed: 1 } });
    expect(mortal.deathSaveWoundPenalty).toBe(2);
    expect(mortal.deathSave).toBe(7 - 3);
    const healthy = deriveStats({ stats: base, character: { base, health: { cur: 20 }, deathSaveWoundPenalty: 2 } });
    expect(healthy.deathSaveWoundPenalty).toBe(0);
    expect(healthy.deathSave).toBe(7);
  });
});

describe('CPR RAW: ROF and the Attack Action (p.169)', () => {
  it('a ROF 2 weapon allows two attacks, split across weapons or interleaved with movement', () => {
    expect(attackBudget([], 2)).toMatchObject({ allowed: true, used: 0, max: 2 });
    expect(attackBudget([{ weaponId: 'pistol', rof: 2 }], 2)).toMatchObject({ allowed: true, used: 1 });
    expect(attackBudget([{ weaponId: 'pistol', rof: 2 }, { weaponId: 'knife', rof: 2 }], 2)).toMatchObject({ allowed: false, reason: 'two_attacks_used' });
  });

  it('a ROF 1 weapon needs the whole Attack Action: no second attack before or after it', () => {
    expect(attackBudget([], 1)).toMatchObject({ allowed: true, max: 1 });
    expect(attackBudget([{ rof: 1 }], 1)).toMatchObject({ allowed: false, reason: 'action_spent_by_rof1' });
    expect(attackBudget([{ rof: 1 }], 2)).toMatchObject({ allowed: false, reason: 'action_spent_by_rof1' });
    expect(attackBudget([{ rof: 2 }], 1)).toMatchObject({ allowed: false, reason: 'rof1_needs_full_action' });
  });
});

describe('CPR RAW: Grapple follow-ups (p.172-173)', () => {
  it('Choke and Throw succeed automatically for BODY direct damage', () => {
    const choke = resolveGrappleAction({ action: 'choke', attackerBody: 7, targetHp: 30, round: 2 });
    expect(choke).toMatchObject({ damage: 7, hpAfter: 23, unconscious: false, chokeTurns: 1, releasesGrapple: false });
    const thrown = resolveGrappleAction({ action: 'throw', attackerBody: 7, targetHp: 30 });
    expect(thrown).toMatchObject({ damage: 7, hpAfter: 23, unconscious: false, releasesGrapple: true });
  });

  it('a Choke that would drop a target with more than 1 HP below 0 locks them at 1 HP and Unconscious', () => {
    const result = resolveGrappleAction({ action: 'choke', attackerBody: 8, targetHp: 5, round: 3 });
    expect(result).toMatchObject({ hpAfter: 1, unconscious: true, unconsciousReason: 'hp' });
    // Exactly 0 is not "below 0": no knock-out clause, the target simply hits 0.
    expect(resolveGrappleAction({ action: 'choke', attackerBody: 5, targetHp: 5, round: 3 })).toMatchObject({ hpAfter: 0, unconscious: false });
  });

  it('three consecutive Choke turns knock the target out regardless of HP; a skipped round restarts the count', () => {
    const third = resolveGrappleAction({ action: 'choke', attackerBody: 3, targetHp: 40, chokeTurns: 2, lastChokeRound: 4, round: 5 });
    expect(third).toMatchObject({ chokeTurns: CHOKE_KNOCKOUT_TURNS, unconscious: true, unconsciousReason: 'chokeTurns' });
    const broken = resolveGrappleAction({ action: 'choke', attackerBody: 3, targetHp: 40, chokeTurns: 2, lastChokeRound: 3, round: 5 });
    expect(broken).toMatchObject({ chokeTurns: 1, unconscious: false });
  });
});

describe('CPR RAW: who may Evade (REF 8+, ambush, shields)', () => {
  const dodger = { base: { REF: 8 }, statusEffects: [], criticalInjuries: [] };

  it('melee is always dodgeable; ranged needs REF 8+', () => {
    expect(canEvade(dodger, { ranged: false })).toBe(true);
    expect(canEvade(dodger, { ranged: true })).toBe(true);
    expect(evasionBlockedReason({ base: { REF: 7 } }, { ranged: true })).toBe('ref_too_low');
    expect(evasionBlockedReason({ base: { REF: 7 } }, { ranged: false })).toBe('');
  });

  it('effective REF (derived) wins over base REF', () => {
    expect(evasionBlockedReason({ base: { REF: 8 }, derived: { effectiveStats: { REF: 6 } } }, { ranged: true })).toBe('ref_too_low');
  });

  it('a surprised defender cannot Evade anything during the ambush round', () => {
    expect(evasionBlockedReason({ ...dodger, statusEffects: [status('surprised')] }, { ranged: false })).toBe('surprised');
  });

  it('a Bulletproof Shield forbids dodging ranged attacks; a Human Shield only forbids dodging head shots', () => {
    const bullet = { ...dodger, shield: { itemId: 'BULLETPROOF-SHIELD', hp: 6, maxHp: 10 } };
    expect(evasionBlockedReason(bullet, { ranged: true })).toBe('shield_ranged');
    expect(evasionBlockedReason(bullet, { ranged: false })).toBe('');
    const human = { ...dodger, shield: { itemId: 'HUMAN-SHIELD:x', hp: 6, maxHp: 6, kind: 'human' } };
    expect(evasionBlockedReason(human, { ranged: true })).toBe('');
    expect(evasionBlockedReason(human, { ranged: true, aimedHead: true })).toBe('human_shield_head');
    const broken = { ...dodger, shield: { itemId: 'BULLETPROOF-SHIELD', hp: 0, maxHp: 10 } };
    expect(evasionBlockedReason(broken, { ranged: true })).toBe('');
  });

  it('a dismembered leg means no dodging', () => {
    expect(evasionBlockedReason({ ...dodger, criticalInjuries: [{ injury: 'crit_body_12', treated: false }] }, {})).toBe('cannot_dodge');
    expect(evasionBlockedReason({ ...dodger, criticalInjuries: [{ injury: 'crit_body_12', treated: true }] }, {})).toBe('');
  });
});

describe('CPR RAW: shields (p.179)', () => {
  it('a plain shield normalizes as bulletproof and simply loses HP', () => {
    expect(normalizeShield({ itemId: 'BULLETPROOF-SHIELD', hp: 10, maxHp: 10 })).toMatchObject({ kind: 'bulletproof', hp: 10 });
    expect(damageShield({ itemId: 'BULLETPROOF-SHIELD', hp: 10, maxHp: 10 }, 12)).toMatchObject({ kind: 'bulletproof', hp: 0 });
  });

  it('a Human Shield has HP = the victim BODY and becomes a Corpse Shield with the same HP when it dies', () => {
    const shield = humanShieldFrom({ id: 'ganger-1', name: 'Ganger', base: { BODY: 6 } });
    expect(shield).toMatchObject({ kind: 'human', hp: 6, maxHp: 6, sourceCharacterId: 'ganger-1' });
    const corpse = damageShield(shield, 6);
    expect(corpse).toMatchObject({ kind: 'corpse', hp: 6, maxHp: 6 });
    expect(damageShield(corpse, 6)).toMatchObject({ kind: 'corpse', hp: 0 });
  });
});

describe('CPR RAW: ongoing damage ticks (p.180-181)', () => {
  it('fire deals its fixed amount at the end of the turn and nothing at the start', () => {
    const burning = { base: { BODY: 5 }, statusEffects: [status('strong_on_fire')] };
    expect(resolveTurnTick(burning, 'end')).toMatchObject({ hpLoss: 4, lines: [{ statusId: 'strong_on_fire', amount: 4 }] });
    expect(resolveTurnTick(burning, 'start').hpLoss).toBe(0);
    expect(resolveTurnTick({ statusEffects: [status('mild_on_fire')] }, 'end').hpLoss).toBe(2);
    expect(resolveTurnTick({ statusEffects: [status('deadly_on_fire')] }, 'end').hpLoss).toBe(6);
  });

  it('asphyxiation deals BODY at the start of the turn, using effective BODY when available', () => {
    expect(resolveTurnTick({ base: { BODY: 7 }, statusEffects: [status('asphyxiating')] }, 'start').hpLoss).toBe(7);
    expect(resolveTurnTick({ base: { BODY: 7 }, derived: { effectiveStats: { BODY: 12 } }, statusEffects: [status('asphyxiating')] }, 'start').hpLoss).toBe(12);
  });

  it('vacuum drains 1d6 INT/REF/DEX at the end of the turn and is lethal once INT reaches 0', () => {
    const drained = resolveTurnTick({ base: { BODY: 5, INT: 4 }, statusEffects: [status('vacuum')] }, 'end', queuedRng([3, 2, 5]));
    expect(drained.statDrain).toEqual([{ stat: 'INT', roll: 3 }, { stat: 'REF', roll: 2 }, { stat: 'DEX', roll: 5 }]);
    expect(drained.lethal).toBe(false);
    expect(resolveTurnTick({ base: { INT: 2 }, statusEffects: [status('vacuum')] }, 'end', queuedRng([2, 1, 1])).lethal).toBe(true);
  });

  it('applyStatDrain accumulates into one status that the conditions aggregate turns into stat penalties', () => {
    const once = applyStatDrain([], [{ stat: 'INT', roll: 2 }, { stat: 'REF', roll: 1 }, { stat: 'DEX', roll: 4 }]);
    const twice = applyStatDrain(once, [{ stat: 'INT', roll: 1 }, { stat: 'REF', roll: 1 }, { stat: 'DEX', roll: 1 }]);
    expect(twice).toHaveLength(1);
    expect(twice[0].id).toBe(VACUUM_DRAIN_STATUS_ID);
    expect(twice[0].modifiers.statBonus).toEqual({ INT: -3, REF: -2, DEX: -5 });
    expect(aggregateConditions({ statusEffects: twice }).statPenalties).toMatchObject({ INT: 3, REF: 2, DEX: 5 });
  });
});

describe('CPR RAW: Implanted Linear Frames vs EMP', () => {
  const sigma = { code: 'LINEAR-SIGMA', name: 'Implanted Linear Frame Sigma', effects: [{ type: 'setEffectiveStat', value: { stat: 'BODY', value: 12 }, appliesTo: ['BODY'] }] };
  const base = { BODY: 6, WILL: 6 };

  it('a running frame sets effective BODY, the Death Save and the HP maximum', () => {
    expect(linearFrameBody([sigma])).toMatchObject({ installed: 12, active: 12 });
    const derived = deriveStats({ stats: base, character: { base }, installedCyberware: [sigma] });
    expect(derived.effectiveStats.BODY).toBe(12);
    expect(derived.deathSave).toBe(12);
    expect(derived.hpMax).toBe(10 + 5 * Math.ceil((12 + 6) / 2));
  });

  it('an EMP-disabled frame drops BODY and the Death Save back to organic but keeps the HP maximum', () => {
    const fried = { ...sigma, damageState: 'disabled' };
    expect(linearFrameBody([fried])).toMatchObject({ installed: 12, active: 0 });
    const derived = deriveStats({ stats: base, character: { base }, installedCyberware: [fried] });
    expect(derived.effectiveStats.BODY).toBe(6);
    expect(derived.deathSave).toBe(6);
    expect(derived.hpMax).toBe(10 + 5 * Math.ceil((12 + 6) / 2));
    expect(derived.hpBody).toBe(12);
    expect(derived.effectiveBody).toBe(6);
  });
});
