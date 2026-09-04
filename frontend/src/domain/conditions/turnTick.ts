// Per-turn damage from ongoing conditions (CPR RAW p.180-181). Fire deals a
// fixed amount at the END of the burning character's turn (Mild 2 / Strong 4 /
// Deadly 6); asphyxiation and vacuum deal BODY at the START of each turn;
// vacuum additionally drains 1d6 from INT, REF and DEX at the END of the turn
// and kills outright once INT reaches 0. All of it is direct HP damage: no
// armor SP subtracted, no ablation. Pure — callers persist the results.

import type { StatusEffectInstance } from './index.ts';

export type TurnTickPhase = 'start' | 'end';

export interface TurnTickCharacter {
  base?: Record<string, unknown> | null;
  derived?: { effectiveStats?: Record<string, number> } | null;
  health?: { cur?: unknown } | null;
  statusEffects?: StatusEffectInstance[] | { id?: string; label_pt?: string; modifiers?: Record<string, unknown> }[] | null;
}

export interface TurnTickLine {
  statusId: string;
  label: string;
  amount: number;
}

export interface TurnTickStatDrain {
  stat: 'INT' | 'REF' | 'DEX';
  roll: number;
}

export interface TurnTickResult {
  phase: TurnTickPhase;
  hpLoss: number;
  lines: TurnTickLine[];
  statDrain: TurnTickStatDrain[];
  /** Vacuum: effective INT hit 0 after this drain — the character dies. */
  lethal: boolean;
}

export const VACUUM_DRAIN_STATS: TurnTickStatDrain['stat'][] = ['INT', 'REF', 'DEX'];
export const VACUUM_DRAIN_STATUS_ID = 'vacuum_stat_drain';

function effectiveStat(character: TurnTickCharacter, stat: string): number {
  const derived = character.derived && character.derived.effectiveStats;
  if (derived && Number.isFinite(Number(derived[stat]))) return Number(derived[stat]);
  return Number(character.base && character.base[stat]) || 0;
}

function tickPhaseOf(modifiers: Record<string, unknown>): TurnTickPhase {
  return modifiers.tick === 'start' ? 'start' : 'end';
}

export function resolveTurnTick(character: TurnTickCharacter | null | undefined, phase: TurnTickPhase, rng: () => number = Math.random): TurnTickResult {
  const c = character || {};
  const statuses = Array.isArray(c.statusEffects) ? c.statusEffects : [];
  const result: TurnTickResult = { phase, hpLoss: 0, lines: [], statDrain: [], lethal: false };
  statuses.forEach(status => {
    if (!status) return;
    const modifiers = (status.modifiers || {}) as Record<string, unknown>;
    const label = String(status.label_pt || status.id || 'status');
    const statusId = String(status.id || 'status');
    if (tickPhaseOf(modifiers) === phase) {
      const flat = Math.max(0, Number(modifiers.directHpPerTurn) || 0);
      const stat = typeof modifiers.directHpPerTurnStat === 'string' ? String(modifiers.directHpPerTurnStat).toUpperCase() : '';
      const amount = flat + (stat ? Math.max(0, effectiveStat(c, stat)) : 0);
      if (amount > 0) {
        result.hpLoss += amount;
        result.lines.push({ statusId, label, amount });
      }
    }
    if (phase === 'end' && modifiers.vacuumStatDrain) {
      VACUUM_DRAIN_STATS.forEach(stat => {
        result.statDrain.push({ stat, roll: Math.floor(rng() * 6) + 1 });
      });
    }
  });
  if (result.statDrain.length) {
    const intDrain = result.statDrain.filter(row => row.stat === 'INT').reduce((sum, row) => sum + row.roll, 0);
    result.lethal = effectiveStat(c, 'INT') - intDrain <= 0;
  }
  return result;
}

// Fold a vacuum drain into the character's status list: one accumulating
// `vacuum_stat_drain` status carries the total as negative statBonus, which
// aggregateConditions already turns into effective-stat penalties.
export function applyStatDrain(
  statuses: StatusEffectInstance[] | null | undefined,
  drain: TurnTickStatDrain[],
  { clock = () => new Date() }: { clock?: () => Date } = {},
): StatusEffectInstance[] {
  const rows = Array.isArray(statuses) ? statuses.slice() : [];
  if (!drain.length) return rows;
  const idx = rows.findIndex(status => status && status.id === VACUUM_DRAIN_STATUS_ID);
  const existing = idx >= 0 ? rows[idx] : null;
  const statBonus: Record<string, number> = { ...((existing && (existing.modifiers.statBonus as Record<string, number>)) || {}) };
  drain.forEach(row => { statBonus[row.stat] = (Number(statBonus[row.stat]) || 0) - row.roll; });
  const label = 'Drenagem por vacuo: ' + VACUUM_DRAIN_STATS.map(stat => stat + ' ' + (statBonus[stat] || 0)).join(' / ');
  const next: StatusEffectInstance = existing
    ? { ...existing, label_pt: label, modifiers: { ...existing.modifiers, statBonus } }
    : {
      instanceId: 'se-' + VACUUM_DRAIN_STATUS_ID,
      id: VACUUM_DRAIN_STATUS_ID,
      label_pt: label,
      source: 'vacuum',
      scope: 'self',
      duration: null,
      remaining: null,
      modifiers: { statBonus },
      appliedAt: clock().toISOString(),
    };
  if (idx >= 0) rows[idx] = next; else rows.push(next);
  return rows;
}
