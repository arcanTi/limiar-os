import { asNumber } from '../shared/num.ts';
import { normalizeArmor, normalizeShield, normalizeStats } from './index.ts';
import type { CharacterShield } from './index.ts';
import type { CharacterArmor, CpredStat } from './constants.ts';
import { CPRED_ARMOR_PENALTY_STATS } from './constants.ts';
import {
  aggregateConditions,
} from '../conditions/index.ts';
import type {
  CriticalInjuryInstance,
  StatusEffectInstance,
} from '../conditions/index.ts';
import {
  applyCyberwareStatMods,
  cyberwareHumanityLoss,
  naturalHealingPerRest,
} from '../cyberware/index.ts';
import type { InstalledCyberwareItem } from '../cyberware/index.ts';

export type DerivedStatsInputStats = Partial<Record<CpredStat | string, unknown>> | null | undefined;

export interface DerivedStatsCharacter {
  base?: DerivedStatsInputStats;
  humanityLoss?: unknown;
  armor?: Partial<CharacterArmor> | null;
  shield?: Partial<CharacterShield> | null;
  equipped?: unknown[] | Record<string, unknown>;
  criticalInjuries?: CriticalInjuryInstance[];
  statusEffects?: StatusEffectInstance[];
  spDamage?: { head?: unknown; body?: unknown };
  health?: { cur?: unknown; max?: unknown };
}

export interface DeriveStatsInput {
  stats?: DerivedStatsInputStats;
  character?: DerivedStatsCharacter | null;
  installedCyberware?: InstalledCyberwareItem[];
}

export interface DerivedStats {
  hpMax: number;
  seriouslyWounded: number;
  deathSave: number;
  deathSaveModifier: number;
  humanityMax: number;
  humanityCurrent: number;
  cyberpsychosisActive: boolean;
  cyberpsychosisExtreme: boolean;
  effectiveEmp: number;
  armorPenalty: number;
  headSp: number;
  bodySp: number;
  currentHeadSp: number;
  currentBodySp: number;
  shieldArmOccupied: boolean;
  shieldHandUnavailable: boolean;
  actionPenalty: number;
  conditionActionPenalty: number;
  woundActionPenalty: number;
  movePenalty: number;
  statPenalties: Record<string, number>;
  evasionMod: number;
  spAblation: { head: number; body: number };
  ignoreSeriouslyWounded: boolean;
  ignoreWoundState: boolean;
  skipDeathSave: boolean;
  bypassArmorInjuries: number;
  naturalHealingPerRest: number;
  naturalHealingBase: number;
  naturalHealingMultiplier: number;
  naturalHealingSources: string[];
  effectiveStats: Record<CpredStat, number>;
}

export function deriveEffectiveEmp(humanityCurrent: unknown): number {
  return Math.max(0, Math.ceil((Number(humanityCurrent) || 0) / 10));
}

export function deriveStats({ stats, character, installedCyberware = [] }: DeriveStatsInput): DerivedStats {
  const c = character || {};
  const base = applyCyberwareStatMods(stats || c.base, installedCyberware);
  const humanityLoss = asNumber(c.humanityLoss, 0, 0, 100) + cyberwareHumanityLoss(installedCyberware);
  const humanityMax = Math.max(0, base.EMP * 10);
  // No floor here on purpose: Cyberpsychosis (Extreme, HUM<0) only exists as a
  // distinct state from plain Cyberpsychosis (HUM==0) if the number is allowed
  // to actually go negative. effectiveEmp below still floors at 0 independently
  // (EMP itself never goes negative per RAW; only the Humanity score does).
  const humanityCurrent = humanityMax - humanityLoss;
  const cyberpsychosisActive = humanityCurrent === 0;
  const cyberpsychosisExtreme = humanityCurrent < 0;
  const hpMax = 10 + (5 * Math.ceil(((base.BODY || 0) + (base.WILL || 0)) / 2));
  const armor = normalizeArmor(c.armor);
  const shield = normalizeShield(c.shield);
  const penalty = Math.max(armor.head.penalty || 0, armor.body.penalty || 0);
  const aggregate = aggregateConditions(c);
  const adjusted = { ...base };
  CPRED_ARMOR_PENALTY_STATS.forEach(k => { adjusted[k] = Math.max(0, (adjusted[k] || 0) - penalty); });
  Object.keys(aggregate.statPenalties).forEach(k => { adjusted[k as CpredStat] = Math.max(0, (adjusted[k as CpredStat] || 0) - aggregate.statPenalties[k]); });
  const seriouslyWounded = Math.ceil(hpMax / 2);
  const healthCur = c.health && c.health.cur != null ? asNumber(c.health.cur, hpMax, 0, hpMax) : hpMax;
  const woundStateActive = healthCur > 0 && healthCur <= seriouslyWounded;
  const ignoresWoundPenalty = aggregate.ignoreSeriouslyWounded || aggregate.ignoreWoundState;
  const woundActionPenalty = woundStateActive && !ignoresWoundPenalty ? 2 : 0;
  const actionPenalty = aggregate.actionPenalty + woundActionPenalty;
  const deathSaveModifier = -aggregate.deathSavePenalty;
  const healingBody = applyCyberwareStatMods(base, installedCyberware).BODY || 0;
  const naturalHealing = naturalHealingPerRest(installedCyberware, healingBody);
  return {
    hpMax,
    seriouslyWounded,
    deathSave: Math.max(0, (base.BODY || 0) + deathSaveModifier),
    deathSaveModifier,
    humanityMax,
    humanityCurrent,
    cyberpsychosisActive,
    cyberpsychosisExtreme,
    effectiveEmp: Math.max(0, Math.min(base.EMP || 0, deriveEffectiveEmp(humanityCurrent))),
    armorPenalty: penalty,
    headSp: armor.head.sp,
    bodySp: armor.body.sp,
    currentHeadSp: Math.max(0, (armor.head.sp || 0) - aggregate.spAblation.head),
    currentBodySp: Math.max(0, (armor.body.sp || 0) - aggregate.spAblation.body),
    shieldArmOccupied: !!shield,
    shieldHandUnavailable: !!shield,
    actionPenalty,
    conditionActionPenalty: aggregate.actionPenalty,
    woundActionPenalty,
    movePenalty: aggregate.movePenalty,
    statPenalties: aggregate.statPenalties,
    evasionMod: aggregate.evasionMod,
    spAblation: aggregate.spAblation,
    ignoreSeriouslyWounded: aggregate.ignoreSeriouslyWounded,
    ignoreWoundState: aggregate.ignoreWoundState,
    skipDeathSave: aggregate.skipDeathSave,
    bypassArmorInjuries: aggregate.bypassArmorInjuries,
    naturalHealingPerRest: naturalHealing.amount,
    naturalHealingBase: naturalHealing.base,
    naturalHealingMultiplier: naturalHealing.multiplier,
    naturalHealingSources: naturalHealing.sources,
    effectiveStats: adjusted,
  };
}

// Single point for "effective MOVE" outside a full deriveStats() call — used
// by the campaign map, which only has the raw character record (base/armor/
// conditions), not the equipped-catalog data deriveStats needs for cyberware
// mods. Same math as deriveStats' effectiveStats.MOVE for the RAW factors the
// tactical map cares about: base MOVE, armor penalty, condition movePenalty.
export function effectiveMoveStat(character: {
  base?: DerivedStatsInputStats;
  armor?: Partial<CharacterArmor> | null;
  criticalInjuries?: CriticalInjuryInstance[];
  statusEffects?: StatusEffectInstance[];
  spDamage?: { head?: unknown; body?: unknown };
  equipped?: unknown[] | Record<string, unknown>;
} | null | undefined): number {
  const c = character || {};
  const base = normalizeStats(c.base).MOVE || 0;
  const armor = normalizeArmor(c.armor);
  const armorPenalty = Math.max(armor.head.penalty || 0, armor.body.penalty || 0);
  const aggregate = aggregateConditions(c);
  const movePenalty = aggregate.statPenalties.MOVE || 0;
  return Math.max(0, base - armorPenalty - movePenalty);
}
