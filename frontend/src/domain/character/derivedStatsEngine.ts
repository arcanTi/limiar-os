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
  linearFrameBody,
  naturalHealingPerRest,
} from '../cyberware/index.ts';
import type { InstalledCyberwareItem } from '../cyberware/index.ts';

export type DerivedStatsInputStats = Partial<Record<CpredStat | string, unknown>> | null | undefined;

export interface DerivedStatsCharacter {
  base?: DerivedStatsInputStats;
  humanityLoss?: unknown;
  deathSavesPassed?: unknown;
  /** Hits taken while Mortally Wounded; each adds +1 to the Death Save penalty. */
  deathSaveWoundPenalty?: unknown;
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

export type WoundState = 'healthy' | 'seriouslyWounded' | 'mortallyWounded';

/** RAW wound state (CPR wound states): HP < 1 is Mortally Wounded. */
export function woundStateFor(hpMax: number, healthCur: number): WoundState {
  if (healthCur < 1) return 'mortallyWounded';
  if (healthCur <= Math.ceil(hpMax / 2)) return 'seriouslyWounded';
  return 'healthy';
}

export const CPRED_MORTAL_ACTION_PENALTY = 4;
export const CPRED_SERIOUS_ACTION_PENALTY = 2;
export const CPRED_MORTAL_MOVE_PENALTY = 6;
export const CPRED_MORTAL_MOVE_MIN = 1;

export interface DerivedStats {
  hpMax: number;
  seriouslyWounded: number;
  woundState: WoundState;
  deathSave: number;
  deathSaveModifier: number;
  /** Death Saves passed while Mortally Wounded; each adds +1 to the penalty. */
  deathSavesPassed: number;
  /** Damage taken while Mortally Wounded; each hit adds +1 to the penalty. */
  deathSaveWoundPenalty: number;
  /** BODY the Death Save and effective stats use (organic, or the running Linear Frame's). */
  effectiveBody: number;
  /** BODY the HP maximum was computed from (keeps the frame's value even when the frame is EMP-disabled). */
  hpBody: number;
  linearFrameSources: string[];
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
  /** -6 MOVE (min 1) while Mortally Wounded. Included in `movePenalty`. */
  woundMovePenalty: number;
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

/** CPR p.80: EMP is the tens digit of Humanity — 44 gives 4, 39 gives 3. */
export function deriveEffectiveEmp(humanityCurrent: unknown): number {
  return Math.max(0, Math.floor((Number(humanityCurrent) || 0) / 10));
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
  // Implanted Linear Frame: BODY becomes the frame's value while it runs.
  // HP max follows the highest frame ever installed even if it is currently
  // EMP-disabled (RAW: the HP the frame granted stays; BODY and Death Save
  // fall back to organic at once).
  const frame = linearFrameBody(installedCyberware);
  const hpBody = Math.max(base.BODY || 0, frame.installed);
  const effectiveBody = Math.max(base.BODY || 0, frame.active);
  const hpMax = 10 + (5 * Math.ceil((hpBody + (base.WILL || 0)) / 2));
  const armor = normalizeArmor(c.armor);
  const shield = normalizeShield(c.shield);
  const penalty = Math.max(armor.head.penalty || 0, armor.body.penalty || 0);
  const aggregate = aggregateConditions(c);
  const adjusted = { ...base, BODY: effectiveBody };
  CPRED_ARMOR_PENALTY_STATS.forEach(k => { adjusted[k] = Math.max(0, (adjusted[k] || 0) - penalty); });
  Object.keys(aggregate.statPenalties).forEach(k => { adjusted[k as CpredStat] = Math.max(0, (adjusted[k as CpredStat] || 0) - aggregate.statPenalties[k]); });
  const seriouslyWounded = Math.ceil(hpMax / 2);
  const healthCur = c.health && c.health.cur != null ? asNumber(c.health.cur, hpMax, 0, hpMax) : hpMax;
  const woundState = woundStateFor(hpMax, healthCur);
  const mortal = woundState === 'mortallyWounded';
  // "Ignore Seriously Wounded" (Tower) only covers that state; Mortally
  // Wounded needs the broader ignoreWoundState.
  const ignoresWoundPenalty = aggregate.ignoreWoundState || (!mortal && aggregate.ignoreSeriouslyWounded);
  let woundActionPenalty = 0;
  if (!ignoresWoundPenalty && mortal) woundActionPenalty = CPRED_MORTAL_ACTION_PENALTY;
  else if (!ignoresWoundPenalty && woundState === 'seriouslyWounded') woundActionPenalty = CPRED_SERIOUS_ACTION_PENALTY;
  const woundMovePenalty = mortal && !aggregate.ignoreWoundState ? CPRED_MORTAL_MOVE_PENALTY : 0;
  if (woundMovePenalty) adjusted.MOVE = Math.max(CPRED_MORTAL_MOVE_MIN, (adjusted.MOVE || 0) - woundMovePenalty);
  const actionPenalty = aggregate.actionPenalty + woundActionPenalty;
  // Each Death Save passed adds +1 to the penalty until stabilized;
  // the counter lives on the record and only bites while Mortally Wounded.
  const deathSavesPassed = mortal ? asNumber(c.deathSavesPassed, 0, 0, 50) : 0;
  // Every hit that gets damage through while Mortally Wounded adds +1 as
  // well (CPR RAW p.176); like the streak above it only bites while mortal.
  const deathSaveWoundPenalty = mortal ? asNumber(c.deathSaveWoundPenalty, 0, 0, 50) : 0;
  const deathSaveModifier = -(aggregate.deathSavePenalty + deathSavesPassed + deathSaveWoundPenalty);
  const healingBody = applyCyberwareStatMods(base, installedCyberware).BODY || 0;
  const naturalHealing = naturalHealingPerRest(installedCyberware, healingBody);
  return {
    hpMax,
    seriouslyWounded,
    woundState,
    deathSave: Math.max(0, effectiveBody + deathSaveModifier),
    deathSaveModifier,
    deathSavesPassed,
    deathSaveWoundPenalty,
    effectiveBody,
    hpBody,
    linearFrameSources: frame.sources,
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
    woundMovePenalty,
    movePenalty: aggregate.movePenalty + woundMovePenalty,
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
  health?: { cur?: unknown; max?: unknown } | null;
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
  const move = Math.max(0, base - armorPenalty - movePenalty);
  const stats = normalizeStats(c.base);
  const hpMax = 10 + (5 * Math.ceil(((stats.BODY || 0) + (stats.WILL || 0)) / 2));
  const healthCur = c.health && c.health.cur != null ? asNumber(c.health.cur, hpMax, 0, hpMax) : hpMax;
  if (woundStateFor(hpMax, healthCur) === 'mortallyWounded' && !aggregate.ignoreWoundState) {
    return Math.max(CPRED_MORTAL_MOVE_MIN, move - CPRED_MORTAL_MOVE_PENALTY);
  }
  return move;
}
