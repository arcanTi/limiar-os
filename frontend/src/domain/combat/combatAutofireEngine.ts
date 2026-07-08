import { rollDiceExpression, sumRolls } from './combatDice.ts';
import { resolveCriticalInjuryForDamage } from './combatCriticalEngine.ts';
import { ablateArmor, resolveArmorForLocation } from './combatArmorEngine.ts';
import { combatIssue } from './combatTypes.ts';
import type { AttackContext, DamageResult } from './combatTypes.ts';

function providedDamageRoll(context: AttackContext = {}, rng: () => number) {
  if (context.damageRoll?.rolls) return { rolls: context.damageRoll.rolls, total: context.damageRoll.total ?? sumRolls(context.damageRoll.rolls), expression: '2d6', issues: [] };
  if (context.damageRoll?.total !== undefined) return { rolls: [], total: Number(context.damageRoll.total) || 0, expression: '2d6', issues: [] };
  return rollDiceExpression('2d6', rng);
}

export function resolveAutofireDamage(context: AttackContext = {}, rng: () => number = Math.random): DamageResult {
  const issues = [];
  const weapon = context.weapon || {};
  if (!weapon.autofire?.enabled) {
    issues.push(combatIssue('error', 'autofire_not_supported', 'Weapon does not support Autofire.', { weaponCode: weapon.code }));
  }
  if (context.hit === false || Number(context.margin || 0) <= 0) {
    return {
      hit: false,
      attackTotal: context.attackTotal ?? null,
      defenseDV: context.defenseDV ?? null,
      margin: context.margin ?? null,
      rawDamage: 0,
      damageDice: '2d6',
      sixesRolled: 0,
      criticalTriggered: false,
      criticalBonusDamage: 0,
      armorSPBefore: 0,
      effectiveArmorSP: 0,
      armorAblated: false,
      armorSPAfter: 0,
      hpDamage: 0,
      location: 'body',
      notes: ['miss'],
      issues,
    };
  }
  const multiplierCap = Number(weapon.autofire?.multiplier || 0) || 0;
  const multiplier = Math.max(0, Math.min(Number(context.margin || 0), multiplierCap));
  const damageRoll = providedDamageRoll(context, rng);
  const critical = resolveCriticalInjuryForDamage(damageRoll, { ...context, targetLocation: 'body' }, rng);
  issues.push(...(critical.issues || []));
  const multipliedDamage = damageRoll.total * multiplier;
  const rawDamage = multipliedDamage + (Number(context.spotWeaknessDamage || 0) || 0);
  const armor = resolveArmorForLocation(context.target, 'body', { ...context, areaAttack: false });
  const effectiveArmorSP = armor.armorSPBefore;
  const penetratingDamage = Math.max(0, rawDamage - effectiveArmorSP);
  const armorPenetrated = penetratingDamage > 0;
  const criticalBonusDamage = critical.bonusDamage || 0;
  const ablation = armorPenetrated ? ablateArmor(armor, context.canonicalRules?.combatRules?.damage?.ablationAmount || 1) : { armorAblated: false, armorSPAfter: armor.armorSPBefore };
  return {
    hit: true,
    attackTotal: context.attackTotal ?? null,
    defenseDV: context.defenseDV ?? null,
    margin: context.margin ?? null,
    rawDamage,
    multipliedDamage,
    autofireMultiplier: multiplier,
    damageDice: '2d6',
    damageRoll,
    sixesRolled: critical.sixes,
    criticalTriggered: critical.triggered,
    criticalPending: critical.triggered,
    criticalInjury: critical.injury || null,
    criticalInjuryApplied: critical.applied || false,
    criticalInjuryBlocked: critical.blocked || false,
    criticalBonusDamage,
    armorSPBefore: armor.armorSPBefore,
    effectiveArmorSP,
    armorAblated: ablation.armorAblated,
    armorSPAfter: ablation.armorSPAfter,
    hpDamage: penetratingDamage + criticalBonusDamage,
    location: 'body',
    armorSource: armor.source,
    notes: [],
    issues,
  };
}
