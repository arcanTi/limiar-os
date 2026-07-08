import { countSixes } from './combatDice.ts';
import { combatIssue } from './combatTypes.ts';
import type { AttackContext, CombatActor, CombatIssue } from './combatTypes.ts';
import {
  getCriticalInjuryById,
  getCriticalInjuryByRoll,
  rollCriticalInjury,
  rollCriticalInjuryAvoidingDuplicates,
} from './criticalInjuryTables.ts';
import type { CriticalInjuryTableRow } from './criticalInjuryTables.ts';

export {
  getCriticalInjuryTable,
  getCriticalInjuryByRoll,
  getCriticalInjuryById,
  normalizeCriticalInjuryId,
  rollCriticalInjury,
  rollCriticalInjuryAvoidingDuplicates,
} from './criticalInjuryTables.ts';
export {
  calculateBaseDeathSavePenalty,
  resolveCriticalInjuryEffects,
  resolveHeadshotDamageMultiplier,
} from './criticalInjuryEffects.ts';

export interface DamageRollForDetection {
  rolls?: number[];
}

export interface DetectedCriticalInjuryTrigger {
  triggered: boolean;
  sixes: number;
  locationHint: 'head' | 'body';
  bonusDamage: number;
  rollTableRequired: boolean;
}

export function detectCriticalInjuryFromDamageRoll(damageRoll: DamageRollForDetection = {}, context: AttackContext = {}): DetectedCriticalInjuryTrigger {
  const rolls = Array.isArray(damageRoll.rolls) ? damageRoll.rolls : [];
  const sixes = countSixes(rolls);
  const area = context.areaAttack || context.attackMode === 'area';
  const locationHint = area ? 'body' : ((context.aimedShot || context.attackMode === 'aimedShot') && context.targetLocation === 'head' ? 'head' : 'body');
  return {
    triggered: sixes >= 2,
    sixes,
    locationHint,
    bonusDamage: sixes >= 2 ? (context.canonicalRules?.criticalInjuryRules as { trigger?: { bonusDamage?: number } })?.trigger?.bonusDamage ?? 5 : 0,
    rollTableRequired: sixes >= 2,
  };
}

function activeInjuriesFor(target: CombatActor = {}): { id: string }[] {
  return target.criticalInjuries || target.activeCriticalInjuries || [];
}

function activeCyberspine(target: CombatActor = {}) {
  return (target.installedCyberware || []).find(instance => (
    instance.code === 'CYBERSPINE'
    && instance.enabled !== false
    && instance.damageState !== 'disabled'
    && instance.damageState !== 'destroyed'
  ));
}

export function isCriticalInjuryBlockedByImmunity(injury: CriticalInjuryTableRow | null, target: CombatActor = {}): { blocked: boolean; blocksBonusDamage?: boolean; issues: CombatIssue[] } {
  if (!injury) return { blocked: false, issues: [] };
  const hasCyberspine = !!activeCyberspine(target);
  if (injury.id === 'BODY-10-SPINAL-INJURY' && hasCyberspine) {
    return {
      blocked: true,
      blocksBonusDamage: true,
      issues: [combatIssue('info', 'critical_injury_blocked_by_cyberspine', 'CYBERSPINE blocks Spinal Injury and its bonus damage.', { injuryId: injury.id })],
    };
  }
  return { blocked: false, issues: [] };
}

export interface CriticalInjuryImmunityResolution {
  injury: CriticalInjuryTableRow | null;
  applied: boolean;
  blocked: boolean;
  bonusDamage: number;
  issues: CombatIssue[];
}

export function resolveCriticalInjuryWithImmunity(target: CombatActor = {}, injury: CriticalInjuryTableRow | null, context: AttackContext = {}): CriticalInjuryImmunityResolution {
  const immunity = isCriticalInjuryBlockedByImmunity(injury, target);
  if (immunity.blocked) {
    return { injury, applied: false, blocked: true, bonusDamage: 0, issues: immunity.issues };
  }
  return {
    injury,
    applied: !!injury,
    blocked: false,
    bonusDamage: injury ? (context.canonicalRules?.criticalInjuryRules as { trigger?: { bonusDamage?: number } })?.trigger?.bonusDamage ?? 5 : 0,
    issues: immunity.issues,
  };
}

export function applyCriticalInjuryToTarget(target: CombatActor = {}, injury: CriticalInjuryTableRow | null, context: AttackContext = {}) {
  const resolved = resolveCriticalInjuryWithImmunity(target, injury, context);
  if (!resolved.applied) return { target, injury, applied: false, blocked: resolved.blocked, issues: resolved.issues };
  return {
    target: {
      ...target,
      criticalInjuries: [...activeInjuriesFor(target), injury as CriticalInjuryTableRow],
    },
    injury,
    applied: true,
    blocked: false,
    issues: resolved.issues,
  };
}

export function selectCriticalInjuryTable(context: AttackContext = {}): 'head' | 'body' {
  if (context.areaAttack || context.attackMode === 'area') return 'body';
  if ((context.aimedShot || context.attackMode === 'aimedShot') && context.targetLocation === 'head') return 'head';
  return 'body';
}

export interface CriticalInjuryForDamageResult extends DetectedCriticalInjuryTrigger {
  table?: string;
  roll?: number | null;
  rollOptions?: { roll: number | null; injury: unknown }[];
  injury: CriticalInjuryTableRow | null;
  applied: boolean;
  blocked: boolean;
  bonusDamage: number;
  suppressed?: boolean;
  issues: CombatIssue[];
}

export function resolveCriticalInjuryForDamage(damageRoll: DamageRollForDetection = {}, context: AttackContext = {}, rng: () => number = Math.random): CriticalInjuryForDamageResult {
  const trigger = detectCriticalInjuryFromDamageRoll(damageRoll, context);
  if (!trigger.triggered) return { ...trigger, injury: null, applied: false, blocked: false, bonusDamage: 0, issues: [] };
  const canonicalRules = context.canonicalRules || {};
  const table = selectCriticalInjuryTable(context);
  let injury: (CriticalInjuryTableRow & { issues?: CombatIssue[] }) | null = null;
  let roll: number | null = null;
  const issues: CombatIssue[] = [];
  let rollOptions: { roll: number | null; injury: unknown }[] = [];
  if (context.criticalInjuryId) {
    injury = getCriticalInjuryById(context.criticalInjuryId, canonicalRules);
    issues.push(...(injury?.issues || []));
    roll = (injury as { roll?: number } | null)?.roll ?? null;
  } else if (context.criticalRoll !== undefined) {
    roll = Number(context.criticalRoll);
    injury = getCriticalInjuryByRoll(table, roll, canonicalRules);
  } else if (Number(context.criticalRollAdvantage?.rollCount || 0) > 1) {
    const rollCount = Math.max(1, Number(context.criticalRollAdvantage!.rollCount) || 1);
    const options: { roll: number | null; injury: unknown }[] = [];
    for (let index = 0; index < rollCount; index += 1) {
      const rolled = rollCriticalInjuryAvoidingDuplicates(table, activeInjuriesFor(context.target), rng, canonicalRules);
      options.push({ roll: rolled.roll, injury: rolled.injury });
      issues.push(...rolled.issues);
    }
    const selectedIndex = Math.max(0, Math.min(options.length - 1, Number(context.selectedCriticalRollIndex || 0) || 0));
    const selected = options[selectedIndex] || options[0] || {};
    injury = (selected.injury as CriticalInjuryTableRow) || null;
    roll = selected.roll ?? null;
    rollOptions = options;
  } else {
    const rolled = rollCriticalInjuryAvoidingDuplicates(table, activeInjuriesFor(context.target), rng, canonicalRules);
    injury = rolled.injury;
    roll = rolled.roll;
    issues.push(...rolled.issues);
  }
  if (!injury) {
    issues.push(combatIssue('error', 'critical_injury_unknown_id', 'Critical Injury could not be resolved.', { table, roll, criticalInjuryId: context.criticalInjuryId || null }));
    return { ...trigger, table, roll, injury: null, applied: false, blocked: false, bonusDamage: 0, issues };
  }
  const immunity = resolveCriticalInjuryWithImmunity(context.target || {}, injury, context);
  return {
    ...trigger,
    table,
    roll,
    rollOptions,
    injury,
    applied: immunity.applied,
    blocked: immunity.blocked,
    bonusDamage: immunity.bonusDamage,
    issues: [...issues, ...immunity.issues],
  };
}
