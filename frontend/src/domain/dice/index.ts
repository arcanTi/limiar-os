// Dice domain: pure notation parsing, roll math, and breakdown formatting.
// No DOM, no 3D physics, no component state — the UI layer (Component) owns the
// animation/commit lifecycle and delegates these calculations here.

import { asNumber } from '../shared/num.ts';

export interface DiceContributionInput {
  count?: unknown;
  sides?: unknown;
  mod?: unknown;
  source?: unknown;
  reason?: unknown;
  kind?: unknown;
}

export interface RollOpts {
  contributions?: DiceContributionInput[];
  mod?: number;
  count?: number;
  sides?: number;
}

interface NormalizedContribution {
  count: number;
  sides: number;
  mod: number;
  source: string;
  reason: string;
  kind: 'bonus' | 'base';
  originalCount: number;
}

interface DieMeta {
  sides: number;
  source: string;
  kind: 'bonus' | 'base';
  reason: string;
  contributionIndex: number;
}

export interface RollResult {
  faces: number[];
  total: number;
  detail: string;
}

// Clamp the per-roll contribution rows (each a dice term + source/reason) into a
// normalized list, capping total dice at 20 (the 3D physics engine's limit).
export function normalizeRollContributions(opts: RollOpts): NormalizedContribution[] {
  const rows: DiceContributionInput[] = Array.isArray(opts?.contributions) ? opts.contributions : [];
  const normalized = rows.map((row) => ({
    count: asNumber(row && row.count, 0, 0, 20),
    sides: asNumber(row && row.sides, 0, 0, 100),
    mod: asNumber(row && row.mod, 0, -99, 99),
    source: String((row && row.source) || '').trim() || 'Unknown',
    reason: String((row && row.reason) || '').trim(),
    kind: (row && row.kind) === 'bonus' ? 'bonus' as const : 'base' as const,
  })).filter(row => row.count && row.sides);
  let remaining = 20;
  return normalized.map(row => {
    const count = Math.min(row.count, remaining);
    remaining = Math.max(0, remaining - count);
    return { ...row, originalCount: row.count, count };
  }).filter(row => row.count > 0);
}

// One metadata entry per physical die to be rolled (carries source/kind/reason).
export function rollDiceMeta(opts: RollOpts): DieMeta[] {
  const contributions = normalizeRollContributions(opts);
  if (!contributions.length) return [];
  return contributions.flatMap((row, contributionIndex) => Array.from({ length: row.count }, () => ({
    sides: row.sides,
    source: row.source,
    kind: row.kind,
    reason: row.reason,
    contributionIndex,
  })));
}

// Build the dice-notation string (e.g. "2d6+1d10+3") for a roll spec. d100 is
// expanded to the d100+d9 pair the 3D library expects.
export function rollNotation(opts: RollOpts): string {
  const contributions = normalizeRollContributions(opts);
  if (contributions.length) {
    const terms = contributions.map(row => row.count + 'd' + row.sides);
    const constant = contributions.reduce((sum, row) => sum + (Number(row.mod) || 0), 0) + (Number(opts.mod) || 0);
    if (constant && terms.length) terms[terms.length - 1] += constant > 0 ? '+' + constant : String(constant);
    return terms.join('+');
  }
  const count = opts.count || 1;
  const mod = opts.mod || 0;
  if (opts.sides === 100) {
    const terms: string[] = [];
    for (let i = 0; i < count; i++) { terms.push('1d100'); terms.push('1d9'); }
    const constant = count + mod;
    if (constant) terms[terms.length - 1] += constant > 0 ? '+' + constant : String(constant);
    return terms.join('+');
  }
  return count + 'd' + opts.sides + (mod ? (mod > 0 ? '+' + mod : String(mod)) : '');
}

// Human-readable breakdown of the rolled faces (per-source bracketing + mods).
export function rollDetail(opts: RollOpts, faces: number[]): string {
  const contributions = normalizeRollContributions(opts);
  if (contributions.length) {
    let offset = 0;
    const parts = contributions.map(row => {
      const rowFaces = faces.slice(offset, offset + row.count);
      offset += row.count;
      const modTxt = row.mod ? (row.mod > 0 ? ' + ' + row.mod : ' - ' + Math.abs(row.mod)) : '';
      return row.source + ' [' + rowFaces.join(' + ') + modTxt + ']';
    });
    const extraMod = Number(opts.mod) || 0;
    if (extraMod) parts.push(extraMod > 0 ? '+' + extraMod : String(extraMod));
    return parts.join(' + ');
  }
  const count = opts.count || 1, mod = opts.mod || 0;
  const modTxt = mod ? (mod > 0 ? ' + ' + mod : ' - ' + Math.abs(mod)) : '';
  return (count > 1 ? faces.slice(0, count).join(' + ') : String(faces[0])) + modTxt;
}

// Append extra breakdown rows (cyberware/critical context) to a detail string.
export function rollBreakdownDetail(detail: string, breakdown: unknown): string {
  const rows = (Array.isArray(breakdown) ? breakdown : []).map(row => String(row || '').trim()).filter(Boolean);
  return rows.length ? detail + ' // ' + rows.join(' // ') : detail;
}

// Reformat cyberware source strings like "+2 Reason" into "+2 (Reason)".
export function cyberSourceBreakdown(sources: unknown): string[] {
  return (Array.isArray(sources) ? sources : []).map(source => {
    const text = String(source || '').trim();
    const match = text.match(/^([+-]\d+)\s+(.+)$/);
    return match ? match[1] + ' (' + match[2] + ')' : text;
  }).filter(Boolean);
}

// Parse a "NdM" string into {count, sides}, or null when it doesn't match.
export function parseDiceText(value: unknown): { count: number; sides: number } | null {
  const match = String(value || '').trim().match(/^(\d*)d(\d+)$/i);
  if (!match) return null;
  return { count: asNumber(match[1] || 1, 1, 1, 20), sides: asNumber(match[2], 6, 2, 100) };
}

// Roll the faces for a roll spec (mirrors the UI's non-3D fallback path).
// rng is injectable so callers get deterministic results in tests; defaults
// to Math.random for the live app's existing behavior.
export function rollFaces(opts: RollOpts, rng: () => number = Math.random): RollResult {
  const meta = rollDiceMeta(opts);
  if (meta.length) {
    const faces = meta.map(die => 1 + Math.floor(rng() * die.sides));
    const mod = normalizeRollContributions(opts).reduce((sum, row) => sum + (Number(row.mod) || 0), 0) + (Number(opts.mod) || 0);
    const total = faces.reduce((sum, face) => sum + face, 0) + mod;
    return { faces, total, detail: rollDetail(opts, faces) };
  }
  const sides = opts.sides ?? 0, count = opts.count || 1, mod = opts.mod || 0;
  let sum = 0;
  const faces: number[] = [];
  for (let i = 0; i < count; i++) { const d = 1 + Math.floor(rng() * sides); faces.push(d); sum += d; }
  const total = sum + mod;
  return { faces, total, detail: rollDetail(opts, faces) };
}
