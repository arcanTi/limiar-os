import { resolveAttackCheck } from './combatAttackEngine.ts';
import { spendAmmo } from './combatAmmoEngine.ts';
import { resolveAutofireDamage } from './combatAutofireEngine.ts';
import { resolveDamage } from './combatDamageEngine.ts';
import { combatIssue } from './combatTypes.ts';
import type { AttackContext, AttackMode, CombatActor, DamageResult, WeaponCombatProfile } from './combatTypes.ts';

function hasInstalledCyberware(actor: CombatActor = {}, code: string): boolean {
  return (actor.installedCyberware || []).some(instance => String(instance.code || '').toUpperCase() === code);
}

function weaponFromProfile(weapon: WeaponCombatProfile = {}, context: AttackContext = {}): WeaponCombatProfile {
  const profile = weapon.weaponProfile && weapon.weaponProfile.container !== true ? weapon.weaponProfile as WeaponCombatProfile : null;
  const resolved: WeaponCombatProfile = profile ? {
    ...weapon,
    weaponType: profile.weaponType ?? weapon.weaponType ?? weapon.weaponClass,
    weaponSkill: profile.weaponSkill ?? weapon.weaponSkill ?? weapon.skill,
    damage: profile.damage ?? weapon.damage,
    rof: profile.rof ?? weapon.rof,
    magazine: profile.magazine ?? weapon.magazine,
    ammoType: profile.ammoType ?? weapon.ammoType,
    handsRequired: profile.handsRequired ?? weapon.handsRequired ?? weapon.hands,
    concealable: profile.concealable ?? weapon.concealable,
    quality: profile.quality ?? weapon.quality,
    exotic: profile.exotic ?? weapon.exotic,
    reachMeters: profile.reachMeters ?? weapon.reachMeters,
    damageScale: profile.damageScale ?? weapon.damageScale,
    specialRules: profile.specialRules ?? weapon.specialRules,
  } : { ...weapon };
  const code = String(resolved.code || '').toUpperCase();
  const selectedMode = context.selectedMode || weapon.selectedMode;
  if (code === 'MONOWIRE' && selectedMode === 'electroLine' && hasInstalledCyberware(context.attacker, 'ENH-ELECTRO')) {
    return { ...resolved, selectedMode, damage: '3d6', rof: 1, nonLethal: true, doesNotCauseCriticalInjury: true };
  }
  if (code === 'GORILLA-ARMS' && selectedMode === 'reinforcedFast' && hasInstalledCyberware(context.attacker, 'ENH-TUNG-REIN')) {
    return { ...resolved, selectedMode, damage: '3d6', rof: 2 };
  }
  if (code === 'GORILLA-ARMS' && selectedMode === 'reinforcedHeavy' && hasInstalledCyberware(context.attacker, 'ENH-TUNG-REIN')) {
    return { ...resolved, selectedMode, damage: '4d6', rof: 1 };
  }
  return selectedMode ? { ...resolved, selectedMode } : resolved;
}

export interface CombatAttackResult extends DamageResult {
  weapon: WeaponCombatProfile;
  statusPending: { type: string; sourceCode: string | null }[];
  quality: string;
  attack: ReturnType<typeof resolveAttackCheck>;
  ammo: ReturnType<typeof spendAmmo>;
}

export function resolveCombatAttack(context: AttackContext = {}, rng: () => number = Math.random): CombatAttackResult {
  const weapon = weaponFromProfile(context.weapon || {}, context);
  const contextWithWeapon = { ...context, weapon };
  const attack = resolveAttackCheck(contextWithWeapon, rng);
  const attackMode: AttackMode = context.attackMode || (context.autofire ? 'autofire' : context.meleeAttack ? 'melee' : 'singleShot');
  const ammo = spendAmmo(weapon, context.ammoState || null, attackMode);
  const damageContext: AttackContext = {
    ...contextWithWeapon,
    attackMode,
    hit: attack.hit && ammo.canFire,
    attackTotal: attack.attackTotal,
    defenseDV: attack.defenseDV,
    margin: attack.margin,
  };
  const damage = attackMode === 'autofire'
    ? resolveAutofireDamage(damageContext, rng)
    : resolveDamage(damageContext, rng);
  const statusPending: { type: string; sourceCode: string | null }[] = [];
  if (damage.hit && (weapon.code === 'THERMAL-DAGGER' || (weapon.effects || []).some(effect => /Strongly On Fire/i.test(String(effect.value || ''))))) {
    statusPending.push({ type: 'Strongly On Fire', sourceCode: weapon.code || null });
  }
  return {
    ...damage,
    weapon,
    statusPending,
    quality: weapon.quality || 'standard',
    attack,
    ammo,
    issues: [
      ...(attack.issues || []),
      ...(ammo.issues || []),
      ...(damage.issues || []),
    ],
  };
}

export function resolveAreaAttack(contexts: AttackContext[] = [], rng: () => number = Math.random): CombatAttackResult[] {
  const sharedRoll = contexts.find(context => context.sharedDamageRoll)?.damageRoll || null;
  return contexts.map((context, index) => {
    const targetId = context.target?.id;
    const criticalRoll = context.criticalRollsByTarget
      ? (context.criticalRollsByTarget[targetId || ''] ?? context.criticalRollsByTarget[index])
      : context.criticalRoll;
    const areaContext: AttackContext = {
      ...context,
      attackMode: 'area',
      areaAttack: true,
      aimedShot: false,
      targetLocation: 'body',
      damageRoll: context.sharedDamageRoll && sharedRoll ? sharedRoll : context.damageRoll,
      criticalRoll,
    };
    if (context.targetLocation === 'head') {
      areaContext.notes = [...(context.notes || []), 'area_attack_head_target_ignored'];
    }
    const result = resolveCombatAttack(areaContext, rng);
    if (result.criticalTriggered) result.location = 'body';
    return {
      ...result,
      issues: [
        ...(result.issues || []),
        ...(context.targetLocation === 'head' ? [combatIssue('info', 'area_attack_head_target_ignored', 'Area attacks cannot target head; body location used.')] : []),
      ],
    };
  });
}
