// Conditions domain: critical injuries and status effects — the runtime
// "what's currently wrong with this character" system. Pure functions only;
// callers own persistence and can pass cyberware-derived immunity seams in.

import { slug } from '../shared/text.ts';
import { asNumber } from '../shared/num.ts';
import { CPRED_CRITICAL_INJURIES, CPRED_STAT_ORDER } from '../character/constants.ts';
import { CPRED_STATUS_PRESETS } from './constants.ts';
import type { ConditionDuration, StatusPreset } from './constants.ts';

export { CPRED_STATUS_PRESETS };
export type { ConditionDuration };

export interface RngClockDeps {
  rng?: () => number;
  clock?: () => Date;
}

export function normalizeConditionDuration(duration: unknown): ConditionDuration | null {
  if (!duration || typeof duration !== 'object') return null;
  const d = duration as Partial<ConditionDuration>;
  const unit = (['round', 'min', 'hour'] as const).includes(d.unit as 'round' | 'min' | 'hour') ? (d.unit as ConditionDuration['unit']) : 'round';
  return { value: asNumber(d.value, 1, 0, 999), unit };
}

// rng/clock are injectable so callers (e.g. the application layer) get
// deterministic ids/timestamps in tests; both default to the real thing.
export function conditionInstanceId(prefix: string, { rng = Math.random, clock = () => new Date() }: RngClockDeps = {}): string {
  return prefix + '-' + clock().getTime().toString(36) + '-' + rng().toString(36).slice(2, 7);
}

export interface CriticalInjuryInstance {
  instanceId: string;
  injury: string;
  name_pt: string;
  location: 'head' | 'body';
  treated: boolean;
  source: string;
  stackPenalty: boolean;
  appliedAt: string;
}

interface RawCriticalInjuryInput {
  instanceId?: string;
  injury?: string;
  name_pt?: string;
  location?: string;
  treated?: unknown;
  source?: string;
  stackPenalty?: unknown;
  appliedAt?: string;
}

export function normalizeCriticalInjuries(injuries: unknown): CriticalInjuryInstance[] {
  const rows: RawCriticalInjuryInput[] = Array.isArray(injuries) ? injuries : [];
  return rows.map((entry, idx) => {
    const catalog = CPRED_CRITICAL_INJURIES[entry && entry.injury || ''] || ({} as { id?: string; name_pt?: string; location?: string });
    const injury = catalog.id || (entry && entry.injury) || '';
    const location = (entry && ['head', 'body'].includes(entry.location as string)) ? (entry.location as 'head' | 'body') : ((catalog.location as 'head' | 'body') || 'body');
    return {
      instanceId: (entry && entry.instanceId) || ('ci-' + idx + '-' + slug(injury || 'injury')),
      injury,
      name_pt: (entry && entry.name_pt) || catalog.name_pt || injury || 'Lesao critica',
      location,
      treated: !!(entry && entry.treated),
      source: (entry && entry.source) || 'manual',
      stackPenalty: !(entry && entry.stackPenalty === false),
      appliedAt: (entry && entry.appliedAt) || '',
    };
  }).filter(entry => entry.injury);
}

export interface StatusEffectInstance {
  instanceId: string;
  id: string;
  label_pt: string;
  source: string;
  scope: 'self';
  duration: ConditionDuration | null;
  remaining: ConditionDuration | null;
  modifiers: Record<string, unknown>;
  appliedAt: string;
}

interface RawStatusEffectInput {
  instanceId?: string;
  id?: string;
  label_pt?: string;
  label?: string;
  source?: string;
  duration?: unknown;
  remaining?: unknown;
  modifiers?: unknown;
  appliedAt?: string;
}

export function normalizeStatusEffects(statuses: unknown): StatusEffectInstance[] {
  const rows: RawStatusEffectInput[] = Array.isArray(statuses) ? statuses : [];
  return rows.map((entry, idx) => {
    const duration = normalizeConditionDuration(entry && entry.duration);
    const remaining = normalizeConditionDuration((entry && entry.remaining) || duration);
    return {
      instanceId: (entry && entry.instanceId) || ('se-' + idx + '-' + slug((entry && entry.id) || 'status')),
      id: (entry && entry.id) || 'status',
      label_pt: (entry && entry.label_pt) || (entry && entry.label) || 'Status',
      source: (entry && entry.source) || 'manual',
      scope: 'self',
      duration,
      remaining,
      modifiers: (entry && entry.modifiers && typeof entry.modifiers === 'object') ? { ...(entry.modifiers as Record<string, unknown>) } : {},
      appliedAt: (entry && entry.appliedAt) || '',
    };
  });
}

export interface AggregatedConditions {
  actionPenalty: number;
  deathSavePenalty: number;
  movePenalty: number;
  statPenalties: Record<string, number>;
  evasionMod: number;
  spAblation: { head: number; body: number };
  ignoreSeriouslyWounded: boolean;
  ignoreWoundState: boolean;
  skipDeathSave: boolean;
  bypassArmorInjuries: number;
}

interface Penalty {
  scope?: string;
  stat?: string;
  value?: number;
}

type CriticalInjuryImmunityMatcher =
  | readonly string[]
  | ReadonlySet<string>
  | Record<string, boolean>
  | ((injuryId: string, entry: CriticalInjuryInstance) => boolean);

export interface AggregateConditionsOptions {
  criticalInjuryImmunities?: CriticalInjuryImmunityMatcher;
}

function isCriticalInjuryImmune(
  injuryId: string,
  entry: CriticalInjuryInstance,
  immunities: CriticalInjuryImmunityMatcher | undefined,
): boolean {
  if (!immunities || !injuryId) return false;
  if (typeof immunities === 'function') return !!immunities(injuryId, entry);
  if (Array.isArray(immunities)) return immunities.includes(injuryId);
  if (typeof (immunities as ReadonlySet<string>).has === 'function') return (immunities as ReadonlySet<string>).has(injuryId);
  const record = immunities as Record<string, boolean>;
  return !!record[injuryId];
}

// Sum every active penalty/modifier a character is currently carrying
// (untreated critical injuries + status effects + flagged gear) into one
// ready-to-apply delta. Called on every derived-stat computation.
export function aggregateConditions(character: {
  criticalInjuries?: CriticalInjuryInstance[];
  statusEffects?: StatusEffectInstance[];
  spDamage?: { head?: unknown; body?: unknown };
  equipped?: unknown[] | Record<string, unknown>;
} | null | undefined, options: AggregateConditionsOptions = {}): AggregatedConditions {
  const c = character || {};
  const out: AggregatedConditions = {
    actionPenalty: 0,
    deathSavePenalty: 0,
    movePenalty: 0,
    statPenalties: {},
    evasionMod: 0,
    spAblation: { head: 0, body: 0 },
    ignoreSeriouslyWounded: false,
    ignoreWoundState: false,
    skipDeathSave: false,
    bypassArmorInjuries: 0,
  };
  const addStatPenalty = (stat: string | undefined, value: unknown) => {
    if (!stat || !(CPRED_STAT_ORDER as string[]).includes(stat)) return;
    out.statPenalties[stat] = (out.statPenalties[stat] || 0) + Math.max(0, Number(value) || 0);
  };
  const applyPenalty = (penalty: Penalty) => {
    if (!penalty) return;
    const value = Math.max(0, Number(penalty.value) || 0);
    if (!value) return;
    if (penalty.scope === 'action') out.actionPenalty += value;
    else if (penalty.scope === 'deathSave') out.deathSavePenalty += value;
    else if (penalty.scope === 'move') {
      out.movePenalty += value;
      addStatPenalty('MOVE', value);
    } else if (penalty.scope === 'stat') addStatPenalty(penalty.stat, value);
  };
  const nonStackingInjuries = new Set<string>();
  (Array.isArray(c.criticalInjuries) ? c.criticalInjuries : []).forEach(entry => {
    if (!entry || entry.treated) return;
    if (isCriticalInjuryImmune(entry.injury, entry, options.criticalInjuryImmunities)) return;
    const injury = CPRED_CRITICAL_INJURIES[entry.injury] || ({} as { mechanics?: { penalties?: Penalty[]; autoBypassesArmor?: boolean; flags?: Record<string, boolean> }; autoBypassesArmor?: boolean });
    const mechanics = injury.mechanics || {};
    const stackKey = entry.injury + '|' + (entry.source || '');
    const skipPenalty = entry.stackPenalty === false && nonStackingInjuries.has(stackKey);
    if (!skipPenalty) (Array.isArray(mechanics.penalties) ? mechanics.penalties : []).forEach(applyPenalty);
    if (entry.stackPenalty === false) nonStackingInjuries.add(stackKey);
    if (injury.autoBypassesArmor || mechanics.autoBypassesArmor) out.bypassArmorInjuries += 1;
    if (mechanics.flags && mechanics.flags.ignoreSeriouslyWounded) out.ignoreSeriouslyWounded = true;
  });
  const spDamage = c.spDamage || {};
  out.spAblation.head += Math.max(0, Number(spDamage.head) || 0);
  out.spAblation.body += Math.max(0, Number(spDamage.body) || 0);
  (Array.isArray(c.statusEffects) ? c.statusEffects : []).forEach(status => {
    const modifiers = (status && status.modifiers) || {};
    out.actionPenalty -= (Number(modifiers.actionBonus) || Number(modifiers.checkBonus) || 0);
    out.evasionMod += Number(modifiers.evasionMod) || Number(modifiers.evasionVsMelee) || 0;
    if (modifiers.ignoreSeriouslyWounded) out.ignoreSeriouslyWounded = true;
    if (modifiers.ignoreWoundState) out.ignoreWoundState = true;
    if (modifiers.skipDeathSave) out.skipDeathSave = true;
    if (modifiers.spAblation) {
      const spMod = modifiers.spAblation as { head?: unknown; body?: unknown };
      out.spAblation.head += Math.max(0, Number(spMod.head) || 0);
      out.spAblation.body += Math.max(0, Number(spMod.body) || 0);
    }
  });
  (Array.isArray(c.equipped) ? c.equipped : Object.values(c.equipped || {})).forEach((item: unknown) => {
    const flags = ((item as { flags?: Record<string, boolean> })?.flags) || {};
    if (flags.ignoreSeriouslyWounded) out.ignoreSeriouslyWounded = true;
    if (flags.ignoreWoundState) out.ignoreWoundState = true;
  });
  return out;
}

// Build a new critical-injury instance from a catalog entry. Immunity checks
// (cyberware-dependent) and HP-on-apply are the caller's job — this only
// shapes the record that goes into character.criticalInjuries.
export function criticalInjuryEntry(
  catalog: { id: string; name_pt: string; location?: string },
  { clock = () => new Date(), ...opts }: RngClockDeps & { location?: string; source?: string; stackPenalty?: boolean } = {},
): CriticalInjuryInstance {
  return {
    instanceId: conditionInstanceId('ci', { ...opts, clock }),
    injury: catalog.id,
    name_pt: catalog.name_pt,
    location: (opts.location || catalog.location || 'body') as 'head' | 'body',
    treated: false,
    source: opts.source || 'manual',
    stackPenalty: opts.stackPenalty !== false,
    appliedAt: clock().toISOString(),
  };
}

export function removeCriticalInjury(injuries: CriticalInjuryInstance[] | null | undefined, instanceId: string): CriticalInjuryInstance[] {
  return (injuries || []).filter(entry => entry.instanceId !== instanceId);
}

export function toggleCriticalInjuryTreated(injuries: CriticalInjuryInstance[] | null | undefined, instanceId: string): CriticalInjuryInstance[] {
  return (injuries || []).map(entry => entry.instanceId === instanceId ? { ...entry, treated: !entry.treated } : entry);
}

export function statusEffectEntry(preset: StatusPreset, { clock = () => new Date(), ...opts }: RngClockDeps & { source?: string } = {}): StatusEffectInstance {
  const duration = normalizeConditionDuration(preset.duration);
  return {
    instanceId: conditionInstanceId('se', { ...opts, clock }),
    id: preset.id,
    label_pt: preset.label_pt,
    source: opts.source || 'manual',
    scope: 'self',
    duration,
    remaining: duration ? { ...duration } : null,
    modifiers: preset.modifiers || {},
    appliedAt: clock().toISOString(),
  };
}

export function removeStatusEffect(statuses: StatusEffectInstance[] | null | undefined, instanceId: string): StatusEffectInstance[] {
  return (statuses || []).filter(entry => entry.instanceId !== instanceId);
}

export function statusChargeKey(status: { modifiers?: Record<string, unknown> } | null | undefined): string {
  const modifiers = (status && status.modifiers) || {};
  if (Number(modifiers.guaranteedCrit) > 0) return 'guaranteedCrit';
  if (Number(modifiers.charges) > 0) return 'charges';
  return '';
}

export function useStatusCharge(statuses: StatusEffectInstance[] | null | undefined, instanceId: string): StatusEffectInstance[] {
  return (statuses || []).map(status => {
    if (!status || status.instanceId !== instanceId) return status;
    const key = statusChargeKey(status);
    if (!key) return status;
    const modifiers = { ...(status.modifiers || {}) };
    const next = Math.max(0, (Number(modifiers[key]) || 0) - 1);
    if (next <= 0) return null;
    modifiers[key] = next;
    return { ...status, modifiers };
  }).filter(Boolean) as StatusEffectInstance[];
}

export function durationToRounds(duration: ConditionDuration | null | undefined): number | null {
  if (!duration) return null;
  const value = Math.max(0, Number(duration.value) || 0);
  if (duration.unit === 'hour') return value * 1200;
  if (duration.unit === 'min') return value * 20;
  return value;
}

export function roundsToDuration(rounds: number | null | undefined, preferredUnit: unknown): ConditionDuration | null {
  if (rounds == null) return null;
  const unit = (['hour', 'min', 'round'] as const).includes(preferredUnit as 'hour' | 'min' | 'round') ? (preferredUnit as ConditionDuration['unit']) : 'round';
  const size = unit === 'hour' ? 1200 : unit === 'min' ? 20 : 1;
  return { value: Math.max(0, Math.ceil(rounds / size)), unit };
}

export function advanceConditionTime(statuses: StatusEffectInstance[] | null | undefined, unit: string): StatusEffectInstance[] {
  const delta = unit === 'hour' ? 1200 : unit === 'min' ? 20 : 1;
  return (statuses || []).map(status => {
    if (!status.remaining) return status;
    const left = (durationToRounds(status.remaining) || 0) - delta;
    if (left <= 0) return null;
    return { ...status, remaining: roundsToDuration(left, status.remaining.unit) };
  }).filter(Boolean) as StatusEffectInstance[];
}
