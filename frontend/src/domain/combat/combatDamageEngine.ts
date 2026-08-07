import { rollDiceExpression, sumRolls } from './combatDice.ts';
import { resolveCriticalInjuryForDamage, resolveHeadshotDamageMultiplier } from './combatCriticalEngine.ts';
import { ablateArmor, resolveArmorForLocation } from './combatArmorEngine.ts';
import { combatIssue } from './combatTypes.ts';
import type { AttackContext, CombatActor, CombatIssue, DamageResult } from './combatTypes.ts';

function bodyValue(actor: CombatActor = {}): number {
  return Number((actor.stats || actor.base || {}).BODY || 0) || 0;
}

function installedCodes(actor: CombatActor = {}): Set<string> {
  return new Set((actor.installedCyberware || []).map(instance => String(instance.code || '').toUpperCase()));
}

interface DamageScaleRow {
  minEffectiveBody?: number;
  minBody?: number;
  maxEffectiveBody?: number;
  maxBody?: number;
  damage?: string;
  count?: number;
  sides?: number;
  mod?: number;
}

function parseDamageScaleDamage(row: DamageScaleRow = {}): string | null {
  if (row.damage) return String(row.damage);
  const count = Number(row.count || 0);
  const sides = Number(row.sides || 0);
  const mod = Number(row.mod || 0);
  if (!count || !sides) return null;
  return `${count}d${sides}${mod ? (mod > 0 ? `+${mod}` : String(mod)) : ''}`;
}

function damageFromScale(scale: DamageScaleRow[] = [], body = 0): string | null {
  const match = scale.find(row => {
    const min = Number(row.minEffectiveBody ?? row.minBody ?? 0) || 0;
    const maxRaw = row.maxEffectiveBody ?? row.maxBody;
    const max = maxRaw === undefined ? Infinity : Number(maxRaw);
    return body >= min && body <= max;
  });
  return match ? parseDamageScaleDamage(match) : null;
}

function weaponOnlyBodyModifier(context: AttackContext = {}): number {
  const effects = Array.isArray(context.weapon?.effects) ? context.weapon!.effects! : [];
  const effect = effects.find(row => row.type === 'cyberweapon' && row.value && typeof (row.value as { bodyModifierForThisWeaponOnly?: unknown }).bodyModifierForThisWeaponOnly === 'number');
  if (effect) return Number((effect.value as { bodyModifierForThisWeaponOnly: number }).bodyModifierForThisWeaponOnly) || 0;
  return String(context.weapon?.code || '').toUpperCase() === 'GORILLA-ARMS' ? 2 : 0;
}

export function getBrawlingDamage(actor: CombatActor = {}, combatRules: { brawling?: { damageByBody?: { minBody?: number; maxBody?: number; damage?: string }[] } } = {}): string {
  const body = bodyValue(actor);
  const rows = combatRules.brawling?.damageByBody || [];
  const match = rows.find(row => (row.minBody === undefined || body >= row.minBody) && (row.maxBody === undefined || body <= row.maxBody));
  return match?.damage || '1d6';
}

export function determineDamageDice(context: AttackContext = {}): string | null {
  const selectedMode = context.selectedMode || context.weapon?.selectedMode;
  const mode = (context.weapon?.weaponModes || []).find(row => row.mode === selectedMode);
  if (mode?.damage) return mode.damage;
  if (context.weapon?.damage && context.weapon.damage !== 'dynamic') return context.weapon.damage;
  if (Array.isArray(context.weapon?.damageScale) && context.weapon!.damageScale!.length) {
    const effectiveBody = bodyValue(context.attacker) + weaponOnlyBodyModifier(context);
    const scaled = damageFromScale(context.weapon!.damageScale as DamageScaleRow[], effectiveBody);
    if (scaled) return scaled;
  }
  if (context.brawlingAttack || context.attackMode === 'brawling') {
    return getBrawlingDamage(context.attacker, context.canonicalRules?.combatRules || {});
  }
  return context.weapon?.damage || null;
}

function providedDamageRoll(context: AttackContext, damageDice: string | null, rng: () => number) {
  if (context.damageRoll?.rolls) {
    return { rolls: context.damageRoll.rolls, total: context.damageRoll.total ?? sumRolls(context.damageRoll.rolls), expression: damageDice || '', issues: [] as CombatIssue[] };
  }
  if (context.damageRoll?.total !== undefined) return { rolls: [] as number[], total: Number(context.damageRoll.total) || 0, expression: damageDice || '', issues: [] as CombatIssue[] };
  return rollDiceExpression(damageDice, rng);
}

function locationForContext(context: AttackContext = {}): 'head' | 'body' {
  if (context.areaAttack || context.attackMode === 'area') return 'body';
  if ((context.aimedShot || context.attackMode === 'aimedShot') && context.targetLocation === 'head') return 'head';
  return context.targetLocation === 'head' ? 'head' : 'body';
}

function ignoresHalfArmor(context: AttackContext = {}): boolean {
  if (context.brawlingAttack || context.attackMode === 'brawling') return false;
  if (!(context.meleeAttack || context.attackMode === 'melee')) return false;
  const type = String(context.weapon?.weaponType || '').toLowerCase();
  return type.includes('melee');
}

export function resolveDamage(context: AttackContext = {}, rng: () => number = Math.random): DamageResult {
  const issues: CombatIssue[] = [];
  const hit = context.hit !== false;
  const damageDice = context.autofire || context.attackMode === 'autofire' ? '2d6' : determineDamageDice(context);
  if (!hit) {
    return {
      hit: false,
      attackTotal: context.attackTotal ?? null,
      defenseDV: context.defenseDV ?? null,
      margin: context.margin ?? null,
      rawDamage: 0,
      damageDice,
      sixesRolled: 0,
      criticalTriggered: false,
      criticalBonusDamage: 0,
      armorSPBefore: 0,
      effectiveArmorSP: 0,
      armorAblated: false,
      armorSPAfter: 0,
      hpDamage: 0,
      location: locationForContext(context),
      notes: ['miss'],
      issues,
    };
  }
  if (!damageDice) issues.push(combatIssue('error', 'missing_damage_dice', 'Weapon damage dice are missing.'));
  const damageRoll = providedDamageRoll(context, damageDice, rng);
  issues.push(...(damageRoll.issues || []));
  const location = locationForContext(context);
  const codes = installedCodes(context.attacker);
  const weaponCode = String(context.weapon?.code || '').toUpperCase();
  const suppressCritical = context.weapon?.doesNotCauseCriticalInjury === true || context.weapon?.nonLethal === true;
  const criticalContext = { ...context, targetLocation: location };
  if (weaponCode === 'MANTIS-BLADE' && codes.has('ENH-DBL-EDGE')) {
    criticalContext.criticalRollAdvantage = { rollCount: 2, choose: 1, sourceCode: 'ENH-DBL-EDGE' };
  } else if (weaponCode === 'MONOWIRE' && codes.has('ENH-BARB-LIN')) {
    criticalContext.criticalRollAdvantage = { rollCount: 3, choose: 1, sourceCode: 'ENH-BARB-LIN' };
  }
  const critical = suppressCritical
    ? { triggered: false, sixes: 0, injury: null, applied: false, blocked: false, bonusDamage: 0, rollOptions: [] as { roll: number | null; injury: unknown }[], issues: [] as CombatIssue[], suppressed: true }
    : resolveCriticalInjuryForDamage(damageRoll, criticalContext, rng);
  issues.push(...(critical.issues || []));
  let rawDamage = damageRoll.total + (Number(context.spotWeaknessDamage || 0) || 0);
  let damageVsCoverBonus = null;
  const skill = String(context.attackSkill || context.weapon?.weaponSkill || '').toLowerCase();
  if (
    weaponCode === 'GORILLA-ARMS'
    && codes.has('ENH-HYD-RAM')
    && (context.targetType === 'cover' || context.targetType === 'object')
    && (skill === 'brawling' || skill === 'martial arts')
  ) {
    damageVsCoverBonus = rollDiceExpression('3d6', rng);
    rawDamage += damageVsCoverBonus.total;
  }
  if (
    context.targetType === 'cover'
    && context.userMovedAtLeast4m === true
    && context.attackUsesLegs === true
    && (skill === 'brawling' || skill === 'martial arts')
  ) {
    const skydriver = (context.attacker?.installedCyberware || []).some(instance => instance.code === 'SKYDRIVERS');
    if (skydriver) {
      damageVsCoverBonus = rollDiceExpression('3d6', rng);
      rawDamage += damageVsCoverBonus.total;
    }
  }
  const armor = resolveArmorForLocation(context.target, location, context);
  const effectiveArmorSP = ignoresHalfArmor(context) ? Math.ceil(armor.armorSPBefore / 2) : armor.armorSPBefore;
  let penetratingDamage = Math.max(0, rawDamage - effectiveArmorSP);
  const armorPenetrated = penetratingDamage > 0;
  const headshotMultiplier = resolveHeadshotDamageMultiplier(context.target?.criticalInjuries || context.target?.activeCriticalInjuries || [], context.canonicalRules || {});
  if (armorPenetrated && location === 'head' && (context.aimedShot || context.attackMode === 'aimedShot')) {
    penetratingDamage *= headshotMultiplier;
  }
  const criticalBonusDamage = critical.bonusDamage || 0;
  const homebrewDirectDamage = weaponCode === 'GORILLA-ARMS' && codes.has('ENH-PNEU-ACT') && critical.triggered ? 5 : 0;
  const hpDamage = penetratingDamage + criticalBonusDamage + homebrewDirectDamage;
  const additionalAblation = armorPenetrated && (
    (weaponCode === 'MANTIS-BLADE' && codes.has('ENH-MONO-EDG'))
    || (weaponCode === 'MONOWIRE' && codes.has('ENH-THERMAL'))
  ) ? 1 : 0;
  const ablationAmount = (context.canonicalRules?.combatRules?.damage?.ablationAmount || 1) + additionalAblation;
  const ablation = armorPenetrated ? ablateArmor(armor, ablationAmount) : { armorAblated: false, armorSPAfter: armor.armorSPBefore };
  return {
    hit: true,
    attackTotal: context.attackTotal ?? null,
    defenseDV: context.defenseDV ?? null,
    margin: context.margin ?? null,
    rawDamage,
    damageVsCoverBonus,
    damageDice,
    damageRoll,
    sixesRolled: critical.sixes,
    criticalTriggered: critical.triggered,
    criticalPending: critical.triggered,
    criticalInjury: critical.injury || null,
    criticalInjuryApplied: critical.applied || false,
    criticalInjuryBlocked: critical.blocked || false,
    criticalRollOptions: critical.rollOptions || [],
    criticalSuppressed: !!critical.suppressed,
    criticalBonusDamage,
    homebrewDirectDamage,
    headshotMultiplier: location === 'head' && (context.aimedShot || context.attackMode === 'aimedShot') ? headshotMultiplier : 1,
    armorSPBefore: armor.armorSPBefore,
    effectiveArmorSP,
    armorAblated: ablation.armorAblated,
    additionalAblation,
    armorSPAfter: ablation.armorSPAfter,
    hpDamage,
    location,
    armorSource: armor.source,
    notes: [],
    issues,
  };
}
