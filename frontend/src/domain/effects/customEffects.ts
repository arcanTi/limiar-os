// GM-authored status effects.
//
// The hard rule here: a custom effect may only carry modifier keys the
// conditions engine actually consumes. Anything else would render as a badge
// on the sheet and change no roll at the table — an effect that lies. So the
// vocabulary below is closed, and normalizeCustomEffect drops everything else.
//
// Statuses express modifiers as **signed bonuses**: positive helps the
// character, negative hurts them. (Critical injuries use the opposite
// convention — a positive magnitude that is always a penalty — which is why
// the two are normalized separately.)

import { CPRED_STAT_ORDER } from '../character/constants.ts';
import type { ConditionDuration, StatusPreset } from '../conditions/constants.ts';

export type EffectModifierKind =
  | 'actionBonus' | 'evasionMod' | 'moveBonus' | 'deathSaveBonus'
  | 'statBonus' | 'spAblation' | 'flag' | 'charges';

export interface EffectModifierSpec {
  key: string;
  label_pt: string;
  hint_pt: string;
  kind: EffectModifierKind;
  signed: boolean;
}

/** Every modifier the engine reads from a status, and nothing else. */
export const EFFECT_MODIFIER_SPECS: EffectModifierSpec[] = [
  { key: 'actionBonus', label_pt: 'Acoes', hint_pt: 'Somado a toda rolagem de acao', kind: 'actionBonus', signed: true },
  { key: 'evasionMod', label_pt: 'Evasao', hint_pt: 'Somado a evasao', kind: 'evasionMod', signed: true },
  { key: 'moveBonus', label_pt: 'MOVE', hint_pt: 'Somado ao MOVE efetivo', kind: 'moveBonus', signed: true },
  { key: 'deathSaveBonus', label_pt: 'Death Save', hint_pt: 'Somado ao Death Save', kind: 'deathSaveBonus', signed: true },
  { key: 'statBonus', label_pt: 'Atributo', hint_pt: 'Somado a um atributo (INT, REF, DEX...)', kind: 'statBonus', signed: true },
  { key: 'spAblation', label_pt: 'SP perdido', hint_pt: 'Armadura perdida em cabeca e corpo', kind: 'spAblation', signed: false },
];

export interface EffectFlagSpec {
  key: 'ignoreSeriouslyWounded' | 'ignoreWoundState' | 'skipDeathSave';
  label_pt: string;
}

export const EFFECT_FLAG_SPECS: EffectFlagSpec[] = [
  { key: 'ignoreSeriouslyWounded', label_pt: 'Ignora Ferido Grave' },
  { key: 'ignoreWoundState', label_pt: 'Ignora estado de ferimento' },
  { key: 'skipDeathSave', label_pt: 'Dispensa Death Save' },
];

export const EFFECT_DURATION_UNITS: { id: ConditionDuration['unit']; label_pt: string }[] = [
  { id: 'round', label_pt: 'rodadas' },
  { id: 'min', label_pt: 'minutos' },
  { id: 'hour', label_pt: 'horas' },
];

export interface CustomEffect extends StatusPreset {
  custom: true;
  note_pt: string;
}

function text(value: unknown, max = 120): string {
  return String(value == null ? '' : value).trim().slice(0, max);
}

function slug(value: string): string {
  return value.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

/** Signed modifiers are clamped to a range a CPR table can actually play. */
function signedValue(raw: unknown): number {
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(-10, Math.min(10, Math.round(parsed)));
}

function positiveValue(raw: unknown, max = 20): number {
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(0, Math.min(max, Math.round(parsed)));
}

export function normalizeEffectDuration(raw: unknown): ConditionDuration | null {
  const input = (raw && typeof raw === 'object' ? raw : {}) as { value?: unknown; unit?: unknown };
  const value = Number(input.value);
  if (!Number.isFinite(value) || value <= 0) return null;
  const unit = EFFECT_DURATION_UNITS.some(row => row.id === input.unit)
    ? (input.unit as ConditionDuration['unit'])
    : 'round';
  return { value: Math.max(1, Math.min(999, Math.round(value))), unit };
}

/**
 * Build the modifier bag the engine reads.
 *
 * Only non-zero entries are emitted, so an effect the GM left blank stays a
 * pure narrative badge instead of shipping a pile of zeroes that read as
 * "modifies something" in the effects panel.
 */
export function normalizeEffectModifiers(raw: unknown): Record<string, unknown> {
  const input = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const modifiers: Record<string, unknown> = {};

  (['actionBonus', 'evasionMod', 'moveBonus', 'deathSaveBonus'] as const).forEach(key => {
    const value = signedValue(input[key]);
    if (value) modifiers[key] = value;
  });

  const statBonus = input.statBonus as Record<string, unknown> | undefined;
  if (statBonus && typeof statBonus === 'object') {
    const bag: Record<string, number> = {};
    Object.entries(statBonus).forEach(([stat, value]) => {
      const key = String(stat).toUpperCase();
      if (!(CPRED_STAT_ORDER as string[]).includes(key)) return;
      const bonus = signedValue(value);
      if (bonus) bag[key] = bonus;
    });
    if (Object.keys(bag).length) modifiers.statBonus = bag;
  }

  const ablation = input.spAblation as { head?: unknown; body?: unknown } | undefined;
  if (ablation && typeof ablation === 'object') {
    const head = positiveValue(ablation.head);
    const body = positiveValue(ablation.body);
    if (head || body) modifiers.spAblation = { head, body };
  }

  EFFECT_FLAG_SPECS.forEach(spec => {
    if (input[spec.key]) modifiers[spec.key] = true;
  });

  const charges = positiveValue(input.charges, 99);
  if (charges) modifiers.charges = charges;

  return modifiers;
}

export function normalizeCustomEffect(raw: unknown, index = 0): CustomEffect {
  const input = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const name = text(input.label_pt ?? input.name) || `Efeito ${index + 1}`;
  return {
    id: text(input.id) || slug(name) || `effect-${index + 1}`,
    label_pt: name,
    duration: normalizeEffectDuration(input.duration),
    modifiers: normalizeEffectModifiers(input.modifiers ?? input),
    custom: true,
    note_pt: text(input.note_pt, 300),
  };
}

export function normalizeCustomEffects(list: unknown): CustomEffect[] {
  const rows = Array.isArray(list) ? list : [];
  const seen = new Set<string>();
  return rows.map((row, index) => normalizeCustomEffect(row, index)).map(effect => {
    let id = effect.id;
    while (seen.has(id)) id = `${id}-${seen.size}`;
    seen.add(id);
    return { ...effect, id };
  });
}

/**
 * Book presets plus this campaign's own. A custom effect reusing a preset id
 * replaces it for that table, the same way custom toxins override book ones.
 */
export function effectPresetCatalog(
  presets: StatusPreset[],
  customEffects: unknown,
): (StatusPreset & { custom?: boolean; note_pt?: string })[] {
  const custom = normalizeCustomEffects(customEffects);
  const overridden = new Set(custom.map(effect => effect.id));
  const base = presets
    .filter(preset => !overridden.has(preset.id))
    .map(preset => ({ ...preset, custom: false }));
  return [...base, ...custom];
}

/** Human summary of what an effect will actually do, for review before saving. */
export function describeEffectModifiers(modifiers: Record<string, unknown> | null | undefined): string {
  const bag = modifiers || {};
  const parts: string[] = [];
  const signedLabel = (value: number) => (value > 0 ? `+${value}` : String(value));
  if (bag.actionBonus) parts.push(`${signedLabel(Number(bag.actionBonus))} acoes`);
  if (bag.evasionMod) parts.push(`${signedLabel(Number(bag.evasionMod))} evasao`);
  if (bag.moveBonus) parts.push(`${signedLabel(Number(bag.moveBonus))} MOVE`);
  if (bag.deathSaveBonus) parts.push(`${signedLabel(Number(bag.deathSaveBonus))} Death Save`);
  const statBonus = bag.statBonus as Record<string, unknown> | undefined;
  if (statBonus) {
    Object.entries(statBonus).forEach(([stat, value]) => {
      parts.push(`${signedLabel(Number(value))} ${stat}`);
    });
  }
  const ablation = bag.spAblation as { head?: unknown; body?: unknown } | undefined;
  if (ablation && (Number(ablation.head) || Number(ablation.body))) {
    parts.push(`-${Number(ablation.head) || 0}/-${Number(ablation.body) || 0} SP cabeca/corpo`);
  }
  EFFECT_FLAG_SPECS.forEach(spec => { if (bag[spec.key]) parts.push(spec.label_pt.toLowerCase()); });
  if (bag.charges) parts.push(`${Number(bag.charges)} carga(s)`);
  return parts.length ? parts.join(' :: ') : 'sem modificador numerico';
}
