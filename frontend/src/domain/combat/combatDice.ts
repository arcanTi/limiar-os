import type { CombatIssue } from './combatTypes.ts';

const SUPPORTED_DAMAGE_DICE = new Set(['1d6', '2d6', '3d6', '4d6', '5d6', '6d6', '8d6']);

export interface ParsedDiceExpression {
  count: number;
  sides: number;
  text: string;
}

export function parseDiceExpression(expr: unknown): ParsedDiceExpression | null {
  const raw = String(expr || '').trim();
  const match = raw.match(/^(\d+)d(\d+)$/i);
  if (!match) return null;
  const parsed = { count: Number(match[1]), sides: Number(match[2]), text: `${Number(match[1])}d${Number(match[2])}` };
  if (!SUPPORTED_DAMAGE_DICE.has(parsed.text) && !(parsed.count === 1 && parsed.sides === 10)) return null;
  return parsed;
}

export function sumRolls(rolls: number[] = []): number {
  return rolls.reduce((sum, value) => sum + (Number(value) || 0), 0);
}

export function countSixes(rolls: number[] = []): number {
  return rolls.filter(value => Number(value) === 6).length;
}

export function rollD10(rng: () => number = Math.random): number {
  return Math.floor(rng() * 10) + 1;
}

export interface CheckDieResult {
  die: number;
  /** Second d10 rolled on a natural 10 (added) or natural 1 (subtracted); 0 otherwise. */
  extra: number;
  total: number;
  crit: boolean;
  fumble: boolean;
}

// CPR RAW check die: a natural 10 rolls again and adds, a natural 1 rolls
// again and subtracts. Same math Component.commitRoll applies to animated
// checks, exposed here for the silent batch rolls (suppressive fire saves).
export function rollCheckD10(rng: () => number = Math.random): CheckDieResult {
  const die = rollD10(rng);
  if (die === 10) {
    const extra = rollD10(rng);
    return { die, extra, total: die + extra, crit: true, fumble: false };
  }
  if (die === 1) {
    const extra = rollD10(rng);
    return { die, extra, total: die - extra, crit: false, fumble: true };
  }
  return { die, extra: 0, total: die, crit: false, fumble: false };
}

export interface DiceExpressionResult {
  rolls: number[];
  total: number;
  expression: string;
  issues: CombatIssue[];
}

export function rollDiceExpression(expr: unknown, rng: () => number = Math.random): DiceExpressionResult {
  const parsed = parseDiceExpression(expr);
  if (!parsed) return { rolls: [], total: 0, expression: String(expr), issues: [{ severity: 'error', type: 'invalid_dice_expression', message: 'Dice expression is not supported.', evidence: { expr } }] };
  const rolls = Array.from({ length: parsed.count }, () => Math.floor(rng() * parsed.sides) + 1);
  return { rolls, total: sumRolls(rolls), expression: parsed.text, issues: [] };
}
