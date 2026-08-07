import { combatIssue } from './combatTypes.ts';
import type { AttackContext, CombatIssue } from './combatTypes.ts';

const ALIASES: Record<string, string> = {
  spinal_injury: 'BODY-10-SPINAL-INJURY',
  'SPINAL-INJURY': 'BODY-10-SPINAL-INJURY',
  crit_body_10: 'BODY-10-SPINAL-INJURY',
  crit_body_7: 'BODY-10-SPINAL-INJURY',
};

export interface CriticalInjuryTableRow {
  roll: number;
  id: string;
  name?: string;
  baseDeathSavePenaltyDelta?: number;
  [extra: string]: unknown;
}

type CanonicalRulesLike = AttackContext['canonicalRules'];

function tables(canonicalRules: CanonicalRulesLike = {}): Record<string, CriticalInjuryTableRow[]> {
  return (canonicalRules as { criticalInjuryTables?: Record<string, CriticalInjuryTableRow[]> }).criticalInjuryTables || {};
}

function tableRows(tableName: unknown, canonicalRules: CanonicalRulesLike = {}): CriticalInjuryTableRow[] {
  return tables(canonicalRules)[String(tableName || '').toLowerCase()] || [];
}

export function normalizeCriticalInjuryId(id: unknown, options: { canonicalRules?: CanonicalRulesLike } = {}): { id: string; issues: CombatIssue[] } {
  const raw = String(id || '').trim();
  const issues: CombatIssue[] = [];
  const aliases = { ...ALIASES, ...(options.canonicalRules?.criticalInjuryAliases || {}) };
  if (raw === 'crit_body_7') {
    issues.push(combatIssue('warning', 'legacy_wrong_spinal_alias', 'Legacy crit_body_7 alias maps to Spinal Injury for compatibility.', { id: raw }));
  }
  return { id: aliases[raw] || raw, issues };
}

export function getCriticalInjuryTable(tableName: unknown, canonicalRules: CanonicalRulesLike = {}): CriticalInjuryTableRow[] {
  return tableRows(tableName, canonicalRules);
}

export function getCriticalInjuryByRoll(tableName: unknown, roll: unknown, canonicalRules: CanonicalRulesLike = {}): CriticalInjuryTableRow | null {
  return tableRows(tableName, canonicalRules).find(row => Number(row.roll) === Number(roll)) || null;
}

export function getCriticalInjuryById(id: unknown, canonicalRules: CanonicalRulesLike = {}): (CriticalInjuryTableRow & { issues: CombatIssue[] }) | null {
  const normalized = normalizeCriticalInjuryId(id, { canonicalRules });
  const found = Object.values(tables(canonicalRules))
    .flat()
    .find(row => row.id === normalized.id) || null;
  return found ? { ...found, issues: normalized.issues } : null;
}

function rollTableValue(rng: () => number = Math.random): number {
  const first = rng();
  if (Number(first) >= 2 && Number(first) <= 12) return Math.round(Number(first));
  return Math.floor(Number(first) * 6) + 1 + Math.floor(rng() * 6) + 1;
}

export interface RollCriticalInjuryResult {
  roll: number | null;
  injury: CriticalInjuryTableRow | null;
  issues: CombatIssue[];
}

export function rollCriticalInjury(tableName: unknown, rng: () => number = Math.random, canonicalRules: CanonicalRulesLike = {}): RollCriticalInjuryResult {
  const roll = rollTableValue(rng);
  const injury = getCriticalInjuryByRoll(tableName, roll, canonicalRules);
  return {
    roll,
    injury,
    issues: injury ? [] : [combatIssue('error', 'critical_injury_unknown_roll', 'Critical Injury roll does not exist in table.', { tableName, roll })],
  };
}

export function rollCriticalInjuryAvoidingDuplicates(
  tableName: unknown,
  activeInjuries: (string | { id?: string })[] = [],
  rng: () => number = Math.random,
  canonicalRules: CanonicalRulesLike = {},
): RollCriticalInjuryResult {
  const activeIds = new Set((activeInjuries || []).map(row => normalizeCriticalInjuryId((typeof row === 'string' ? row : row.id) || row, { canonicalRules }).id));
  const rows = tableRows(tableName, canonicalRules);
  if (rows.length && rows.every(row => activeIds.has(row.id))) {
    return {
      roll: null,
      injury: null,
      issues: [combatIssue('warning', 'all_critical_injuries_already_active', 'All Critical Injuries in this table are already active.', { tableName })],
    };
  }
  const issues: CombatIssue[] = [];
  for (let attempts = 0; attempts < 64; attempts += 1) {
    const result = rollCriticalInjury(tableName, rng, canonicalRules);
    issues.push(...result.issues);
    if (result.injury && !activeIds.has(result.injury.id)) return { ...result, issues };
  }
  return {
    roll: null,
    injury: null,
    issues: [...issues, combatIssue('warning', 'critical_injury_duplicate_reroll_limit', 'Critical Injury duplicate reroll limit reached.', { tableName })],
  };
}
