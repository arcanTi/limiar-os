// Toxin exposure: one Resist Torture/Drugs check, and on a failure the full
// effect lands. Kept out of the combat damage engine on purpose — poison
// damage neither is reduced by armor nor ablates it, so routing it through
// resolveDamage would apply exactly the rules it must ignore.

import {
  BODY_TYPES,
  CPR_BASE_TOXINS,
  CPR_TOXIN_AMMUNITION,
  NASAL_FILTER_CODES,
  TEARGAS_TOXIN,
  TOXIN_BINDER_BONUS,
  TOXIN_BINDER_CODES,
  TOXIN_DELIVERIES,
  TOXIN_INTENSITIES,
  TOXIN_RESIST_SKILL,
} from './constants.ts';
import type {
  BodyType,
  ToxinAmmunitionRow,
  ToxinDefinition,
  ToxinDelivery,
  ToxinIntensity,
  ToxinKind,
} from './constants.ts';

export {
  BODY_TYPES,
  CPR_BASE_TOXINS,
  CPR_TOXIN_AMMUNITION,
  TEARGAS_TOXIN,
  TOXIN_DELIVERIES,
  TOXIN_INTENSITIES,
  TOXIN_RESIST_SKILL,
  TOXIN_BINDER_BONUS,
};
export type {
  BodyType,
  ToxinAmmunitionRow,
  ToxinDefinition,
  ToxinDelivery,
  ToxinIntensity,
  ToxinKind,
};

function text(value: unknown, max = 120): string {
  return String(value == null ? '' : value).trim().slice(0, max);
}

function slug(value: string): string {
  return value.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

export function intensityRow(intensity: unknown) {
  return TOXIN_INTENSITIES.find(row => row.id === intensity) || TOXIN_INTENSITIES[0];
}

/**
 * Coerce anything the GM authored into a usable toxin.
 *
 * The intensity supplies the book defaults, and an explicit `resistDV` or
 * `damage` overrides them — that is the whole point of custom toxins: the same
 * three rungs, tuned up or down. A DV outside 5..30 or dice beyond 10d10 are
 * clamped rather than rejected, so a typo degrades to a playable toxin.
 */
export function normalizeToxin(raw: unknown, index = 0): ToxinDefinition {
  const input = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const kind: ToxinKind = input.kind === 'drug' ? 'drug' : 'poison';
  const intensity = (TOXIN_INTENSITIES.some(row => row.id === input.intensity)
    ? input.intensity
    : 'mild') as ToxinIntensity;
  const row = intensityRow(intensity);
  const name = text(input.name) || `Toxina ${index + 1}`;
  const delivery = (TOXIN_DELIVERIES.some(d => d.id === input.delivery)
    ? input.delivery
    : 'injected') as ToxinDelivery;
  const dvRaw = Number(input.resistDV);
  const resistDV = Number.isFinite(dvRaw) ? Math.max(5, Math.min(30, Math.round(dvRaw))) : row.resistDV;
  const damage = normalizeToxinDamage(input.damage, kind === 'drug' ? '' : row.damage);
  return {
    id: text(input.id) || slug(name) || `toxin-${index + 1}`,
    name,
    kind,
    intensity,
    resistDV,
    damage,
    delivery,
    effect_pt: text(input.effect_pt ?? input.effect, 400)
      || (damage ? `${damage} de dano direto ao HP.` : 'Efeito descrito pelo mestre.'),
    ...(text(input.statusPresetId) ? { statusPresetId: text(input.statusPresetId) } : {}),
    custom: input.custom === undefined ? true : !!input.custom,
    ...(text(input.source) ? { source: text(input.source) } : {}),
  };
}

/** Accepts `3d6`, `2d6+2`, or an empty string for effect-only toxins. */
export function normalizeToxinDamage(value: unknown, fallback = ''): string {
  const raw = String(value == null ? '' : value).trim().toLowerCase().replace(/\s+/g, '');
  if (!raw) return fallback;
  const match = /^(\d{1,2})d(\d{1,2})([+-]\d{1,3})?$/.exec(raw);
  if (!match) return fallback;
  const count = Math.max(1, Math.min(10, Number(match[1])));
  const sides = Math.max(2, Math.min(10, Number(match[2])));
  const mod = match[3] ? Number(match[3]) : 0;
  const bounded = Math.max(-20, Math.min(20, mod));
  return `${count}d${sides}${bounded ? (bounded > 0 ? `+${bounded}` : String(bounded)) : ''}`;
}

export function normalizeToxinList(list: unknown): ToxinDefinition[] {
  const rows = Array.isArray(list) ? list : [];
  const seen = new Set<string>();
  return rows.map((row, index) => normalizeToxin(row, index)).map(toxin => {
    let id = toxin.id;
    while (seen.has(id)) id = `${id}-${seen.size}`;
    seen.add(id);
    return { ...toxin, id };
  });
}

/**
 * The book's toxins plus whatever this campaign authored.
 *
 * A custom toxin sharing an id with a book one replaces it, which is how a GM
 * re-tunes Arsenic for their table without losing the name everyone knows.
 */
export function toxinCatalog(customToxins: unknown): ToxinDefinition[] {
  const custom = normalizeToxinList(customToxins);
  const overridden = new Set(custom.map(toxin => toxin.id));
  const base = [...CPR_BASE_TOXINS, TEARGAS_TOXIN]
    .map(toxin => ({ ...toxin, custom: false }))
    .filter(toxin => !overridden.has(toxin.id));
  return [...base, ...custom];
}

export function findToxin(customToxins: unknown, toxinId: unknown): ToxinDefinition | null {
  const id = text(toxinId);
  if (!id) return null;
  return toxinCatalog(customToxins).find(toxin => toxin.id === id) || null;
}

// ------------------------------------------------------------------ immunity

export function normalizeBodyType(value: unknown): BodyType {
  return BODY_TYPES.some(row => row.id === value) ? (value as BodyType) : 'meat';
}

function installedCodes(target: { installedCyberware?: { code?: unknown }[] } | null | undefined): Set<string> {
  return new Set((target?.installedCyberware || [])
    .map(instance => String(instance?.code || '').toUpperCase())
    .filter(Boolean));
}

export interface ToxinImmunity {
  immune: boolean;
  reason_pt: string;
}

/**
 * Poison needs meat. Drones and Full Body Conversions have none, and Nasal
 * Filters block anything that has to be breathed in — but only that: a filter
 * does nothing against an injected or ingested toxin.
 */
export function toxinImmunity(
  target: { bodyType?: unknown; installedCyberware?: { code?: unknown }[] } | null | undefined,
  toxin: ToxinDefinition | null | undefined,
): ToxinImmunity {
  const bodyType = normalizeBodyType(target?.bodyType);
  if (bodyType !== 'meat') {
    const label = BODY_TYPES.find(row => row.id === bodyType)?.label_pt || bodyType;
    return { immune: true, reason_pt: `Alvo inorganico (${label}) — sem carne para envenenar` };
  }
  if (toxin?.delivery === 'inhaled') {
    const codes = installedCodes(target);
    if (NASAL_FILTER_CODES.some(code => codes.has(code))) {
      return { immune: true, reason_pt: 'Filtros Nasais bloqueiam toxinas inaladas' };
    }
  }
  return { immune: false, reason_pt: '' };
}

/** Toxin Binders add a flat +2 to the check (CPR RED). */
export function toxinBinderBonus(
  target: { installedCyberware?: { code?: unknown }[] } | null | undefined,
): number {
  const codes = installedCodes(target);
  return TOXIN_BINDER_CODES.some(code => codes.has(code)) ? TOXIN_BINDER_BONUS : 0;
}

/**
 * The target's Resist Torture/Drugs total.
 *
 * `skills` already carries `total` (STAT + level + item bonuses), so the
 * Toxin Binders bonus is only added here when the skill list did not already
 * account for it — otherwise the implant would count twice.
 */
export function resistCheckTotal(
  target: {
    skills?: { name?: unknown; total?: unknown; level?: unknown; bonus?: unknown }[];
    installedCyberware?: { code?: unknown }[];
  } | null | undefined,
): { total: number; skillTotal: number; binderBonus: number } {
  const skills = Array.isArray(target?.skills) ? target!.skills! : [];
  const row = skills.find(skill => String(skill?.name || '') === TOXIN_RESIST_SKILL);
  const skillTotal = Number(row?.total) || 0;
  const alreadyCounted = Number(row?.bonus) >= TOXIN_BINDER_BONUS;
  const binderBonus = alreadyCounted ? 0 : toxinBinderBonus(target);
  return { total: skillTotal + binderBonus, skillTotal, binderBonus };
}

// ------------------------------------------------------------------ exposure

export interface ToxinExposureResult {
  targetId: string;
  targetName: string;
  toxinId: string;
  toxinName: string;
  immune: boolean;
  immunityReason_pt: string;
  dv: number;
  die: number | null;
  modifier: number;
  total: number | null;
  success: boolean;
  hpDamage: number;
  damageDice: string;
  damageRolls: number[];
  statusPresetId: string | null;
  inflictedInjury: string | null;
  summary_pt: string;
}

function rollDie(sides: number, rng: () => number): number {
  return 1 + Math.floor(rng() * sides);
}

function rollDamage(expression: string, rng: () => number): { rolls: number[]; total: number } {
  const match = /^(\d{1,2})d(\d{1,2})([+-]\d{1,3})?$/.exec(expression);
  if (!match) return { rolls: [], total: 0 };
  const count = Number(match[1]);
  const sides = Number(match[2]);
  const mod = match[3] ? Number(match[3]) : 0;
  const rolls: number[] = [];
  for (let index = 0; index < count; index += 1) rolls.push(rollDie(sides, rng));
  return { rolls, total: Math.max(0, rolls.reduce((sum, value) => sum + value, 0) + mod) };
}

export interface ResolveToxinExposureInput {
  toxin: ToxinDefinition;
  target: {
    id?: unknown;
    name?: unknown;
    bodyType?: unknown;
    skills?: { name?: unknown; total?: unknown; bonus?: unknown }[];
    installedCyberware?: { code?: unknown }[];
  };
  /** Pre-rolled d10 for the resist check; omitted means roll one here. */
  die?: number;
  /** Situational modifier the GM dialed in (cover, dose, improvised antidote). */
  situationalModifier?: number;
  inflictedInjury?: string | null;
}

/**
 * Resolve one exposure. A success costs nothing at all — CPR has no
 * half-effect on a passed check.
 */
export function resolveToxinExposure(
  input: ResolveToxinExposureInput,
  rng: () => number = Math.random,
): ToxinExposureResult {
  const { toxin, target } = input;
  const targetId = text(target?.id) || '';
  const targetName = (text(target?.name) || targetId || 'ALVO').toUpperCase();
  const base: ToxinExposureResult = {
    targetId,
    targetName,
    toxinId: toxin.id,
    toxinName: toxin.name,
    immune: false,
    immunityReason_pt: '',
    dv: toxin.resistDV,
    die: null,
    modifier: 0,
    total: null,
    success: true,
    hpDamage: 0,
    damageDice: toxin.damage,
    damageRolls: [],
    statusPresetId: null,
    inflictedInjury: null,
    summary_pt: '',
  };

  const immunity = toxinImmunity(target, toxin);
  if (immunity.immune) {
    return {
      ...base,
      immune: true,
      immunityReason_pt: immunity.reason_pt,
      summary_pt: `${targetName} :: IMUNE :: ${immunity.reason_pt}`,
    };
  }

  const resist = resistCheckTotal(target);
  const situational = Math.max(-10, Math.min(10, Number(input.situationalModifier) || 0));
  const modifier = resist.total + situational;
  const die = Number.isFinite(Number(input.die)) ? Number(input.die) : rollDie(10, rng);
  const total = die + modifier;
  const success = total >= toxin.resistDV;
  if (success) {
    return {
      ...base,
      die,
      modifier,
      total,
      success: true,
      summary_pt: `${targetName} :: ${die}+${modifier}=${total} vs DV${toxin.resistDV} :: RESISTIU`,
    };
  }

  const damage = toxin.damage ? rollDamage(toxin.damage, rng) : { rolls: [], total: 0 };
  const injury = text(input.inflictedInjury) || null;
  const effectText = damage.total
    ? `HP -${damage.total} (${toxin.damage}: ${damage.rolls.join('+')}) direto, sem armadura`
    : toxin.effect_pt;
  return {
    ...base,
    die,
    modifier,
    total,
    success: false,
    hpDamage: damage.total,
    damageRolls: damage.rolls,
    statusPresetId: toxin.statusPresetId || null,
    inflictedInjury: injury,
    summary_pt: `${targetName} :: ${die}+${modifier}=${total} vs DV${toxin.resistDV} :: FALHOU :: ${effectText}`,
  };
}

/** Ammunition profile for a weapon loaded with a toxin round, if any. */
export function toxinAmmunitionFor(ammoCode: unknown): ToxinAmmunitionRow | null {
  const code = text(ammoCode).toUpperCase();
  if (!code) return null;
  return CPR_TOXIN_AMMUNITION.find(row => row.code === code) || null;
}

/**
 * Turn a toxin round into the toxin it delivers, honouring the round's own DV
 * and dice when they differ from the base toxin.
 */
export function toxinFromAmmunition(
  ammo: ToxinAmmunitionRow,
  customToxins: unknown = null,
): ToxinDefinition {
  const base = findToxin(customToxins, ammo.toxinId)
    || { ...TEARGAS_TOXIN, id: ammo.toxinId, name: ammo.name };
  return {
    ...base,
    resistDV: ammo.resistDV,
    damage: ammo.damage,
    delivery: ammo.delivery,
  };
}

/**
 * Which toxin rounds a weapon can actually be loaded with.
 *
 * The book restricts these to arrows and grenades, so the match is made on the
 * weapon's own type/name rather than on a curated code list — a homebrew bow
 * still counts as a bow.
 */
export function eligibleToxinAmmoFor(
  weapon: { weaponType?: unknown; name?: unknown; ammoType?: unknown; cat?: unknown } | null | undefined,
): ToxinAmmunitionRow[] {
  const haystack = [weapon?.weaponType, weapon?.name, weapon?.ammoType, weapon?.cat]
    .map(value => String(value || '').toLowerCase())
    .join(' ');
  if (!haystack.trim()) return [];
  const isArrow = /(bow|arrow|crossbow|flecha|arco|besta)/.test(haystack);
  const isGrenade = /(grenade|granada|launcher|lancador)/.test(haystack);
  return CPR_TOXIN_AMMUNITION.filter(row => row.eligibleWeapons.some(kind => {
    if (kind === 'Arrows') return isArrow;
    if (kind === 'Grenades') return isGrenade;
    return false;
  }));
}
