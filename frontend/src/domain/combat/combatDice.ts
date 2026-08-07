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
