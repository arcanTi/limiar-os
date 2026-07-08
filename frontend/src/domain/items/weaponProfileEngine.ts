import { asNumber } from '../shared/num.ts';
import { parseGearDamage, skillCanonicalName } from '../character/index.ts';
import { CYBERWEAPON_PROFILE_OVERRIDES } from './constants.ts';
import type { LegacyCatalogItem } from './legacyCatalogTypes.ts';

export interface WeaponProfileDeps {
  resolveProduct?: (code: string) => LegacyCatalogItem | null | undefined;
}

export interface RuntimeWeaponProfile {
  kind: unknown;
  weaponClass: string;
  skill: string;
  dmg: string;
  sides: number;
  count: number;
  mod: number;
  damageScale: Record<string, unknown>[];
  attackMod: number;
  quality: string;
  riders: Record<string, unknown>[];
  container: boolean;
  instantDraw: boolean;
  heldWeapon: unknown;
  heldWeaponName: string;
  rof: number | string | null;
  selectedMode: string;
  mag: number | null;
  concealable: boolean;
  hands: number | null;
  melee: boolean;
  ignoresHalfArmor: boolean;
  reqBody: number | null;
  reqRef: number | null;
  modes: string[];
  special: string | string[];
  tier: string;
  attachesTo: string | string[] | null;
}

export function weaponProfile(item: LegacyCatalogItem | null | undefined, { resolveProduct }: WeaponProfileDeps = {}): RuntimeWeaponProfile {
  const src = item || {};
  const fallback = CYBERWEAPON_PROFILE_OVERRIDES[src.code || ''] || {};
  const parsed = parseGearDamage(src.dmg);
  const hasOwn = (key: string) => Object.prototype.hasOwnProperty.call(src, key);
  const heldWeapon = src.heldWeapon || src.installedWeapon || src.weapon;
  const heldSource: LegacyCatalogItem | null = typeof heldWeapon === 'string' ? (resolveProduct ? resolveProduct(heldWeapon) ?? null : null) : (heldWeapon as LegacyCatalogItem | null);
  const heldProfile = src.container && heldSource && heldSource !== src ? weaponProfile(heldSource, { resolveProduct }) : null;
  const count = asNumber(src.container && heldProfile ? heldProfile.count : hasOwn('count') ? src.count : fallback.count, parsed ? parsed.count : 0, 0, 20);
  const sides = asNumber(src.container && heldProfile ? heldProfile.sides : hasOwn('sides') ? src.sides : fallback.sides, parsed ? parsed.sides : 0, 0, 100);
  const mod = asNumber(src.container && heldProfile ? heldProfile.mod : hasOwn('mod') ? (src as { mod?: unknown }).mod : fallback.mod, parsed ? parsed.mod : 0, -99, 99);
  const riders = Array.isArray(src.riders) ? src.riders : Array.isArray(fallback.riders) ? fallback.riders : (heldProfile && Array.isArray(heldProfile.riders)) ? heldProfile.riders : [];
  const damageScale = Array.isArray(src.damageScale) ? src.damageScale : Array.isArray(fallback.damageScale) ? fallback.damageScale : [];
  return {
    kind: src.kind || (count && sides ? 'weapon' : src.kind),
    weaponClass: src.weaponClass || fallback.weaponClass || src.cat || src.category || '',
    skill: (src.container && heldProfile ? heldProfile.skill : src.skill || fallback.skill) || '',
    dmg: src.dmg || (count && sides ? count + 'd' + sides + (mod ? (mod > 0 ? '+' + mod : String(mod)) : '') : ''),
    sides,
    count,
    mod,
    damageScale: (damageScale as Record<string, unknown>[]).map(row => ({ ...row })),
    attackMod: asNumber(src.attackMod ?? fallback.attackMod ?? (heldProfile && heldProfile.attackMod) ?? 0, 0, -99, 99),
    quality: src.quality || fallback.quality || (heldProfile && heldProfile.quality) || '',
    riders: (riders as Record<string, unknown>[]).map(rider => ({ ...rider })),
    container: !!(src.container ?? fallback.container),
    instantDraw: !!(src.instantDraw ?? fallback.instantDraw),
    heldWeapon: heldWeapon || null,
    heldWeaponName: (heldSource && heldSource.name) || '',
    rof: src.rof ?? fallback.rof ?? null,
    selectedMode: src.selectedMode || src.activeMode || src.mode || src.weaponMode || '',
    mag: src.mag ?? null,
    concealable: !!(src.concealable ?? fallback.concealable),
    hands: src.hands ?? fallback.hands ?? null,
    melee: !!(src.melee ?? fallback.melee),
    ignoresHalfArmor: !!(src.container && heldProfile ? heldProfile.ignoresHalfArmor : src.ignoresHalfArmor ?? fallback.ignoresHalfArmor),
    reqBody: src.reqBody ?? null,
    reqRef: src.reqRef ?? null,
    modes: Array.isArray(src.modes) ? src.modes : Array.isArray(fallback.modes) ? fallback.modes : [],
    special: src.special || '',
    tier: src.tier || '',
    attachesTo: src.attachesTo || null,
  };
}

export function hasDamageProfile(item: LegacyCatalogItem | null | undefined): boolean {
  return !!(item && ((item.sides && item.count) || (Array.isArray(item.damageScale) && item.damageScale.length)));
}

export interface EffectiveBodyDeps {
  normalizeCharacter?: (actor: unknown) => { derived?: { effectiveStats?: Record<string, unknown> }; base?: unknown };
  derivedStats?: (base: unknown, character: unknown) => { effectiveStats?: Record<string, unknown> };
}

export function effectiveBodyForDamage(actor: unknown, { normalizeCharacter, derivedStats }: EffectiveBodyDeps = {}): number {
  const a = actor as { derived?: { effectiveStats?: Record<string, unknown> } } | null | undefined;
  if (a && a.derived && a.derived.effectiveStats && a.derived.effectiveStats.BODY != null) return Number(a.derived.effectiveStats.BODY) || 0;
  const character = normalizeCharacter ? normalizeCharacter(actor || {}) : ((actor || {}) as { derived?: { effectiveStats?: Record<string, unknown> }; base?: unknown });
  const effective = character.derived && character.derived.effectiveStats
    ? character.derived.effectiveStats
    : (derivedStats ? derivedStats(character.base, character).effectiveStats : null);
  return Number(effective && effective.BODY) || 0;
}

export interface DamageScaleProfileResult {
  count: number;
  sides: number;
  mod: number;
  source: string;
  reason: string;
  rof: null;
}

export function damageScaleProfile(weapon: LegacyCatalogItem | null | undefined, actor: unknown, deps: EffectiveBodyDeps = {}): DamageScaleProfileResult | null {
  const scale = Array.isArray(weapon && weapon.damageScale) ? weapon!.damageScale! : [];
  if (!scale.length) return null;
  const body = effectiveBodyForDamage(actor, deps);
  const row = scale.find(entry => (entry.minBody == null || body >= Number(entry.minBody)) && (entry.maxBody == null || body <= Number(entry.maxBody))) || scale[0];
  return {
    count: asNumber(row && row.count, 2, 1, 20),
    sides: asNumber(row && row.sides, 6, 2, 100),
    mod: asNumber(row && row.mod, 0, -99, 99),
    source: 'Gorilla Arms (BODY)',
    reason: 'BODY ' + body,
    rof: null,
  };
}

export function selectedWeaponMode(weapon: LegacyCatalogItem | null | undefined): string {
  const raw = String((weapon && (weapon.selectedMode || weapon.activeMode || weapon.mode || weapon.weaponMode)) || '').trim();
  if (!raw) return '';
  const compact = raw.toLowerCase().replace(/[^a-z]/g, '');
  if (compact === 'heavy') return 'Heavy';
  if (compact === 'veryheavy') return 'Very Heavy';
  return raw;
}

export interface GorillaTungstenProfile {
  count: number;
  sides: number;
  mod: number;
  rof: number;
  mode: string;
  source: string;
}

export function gorillaTungstenProfile(weapon: (LegacyCatalogItem & { enhancementEffects?: { type?: string; sourceCode?: string }[] }) | null | undefined): GorillaTungstenProfile | null {
  if (!weapon || weapon.code !== 'GORILLA-ARMS') return null;
  const hasTungsten = (Array.isArray(weapon.enhancementEffects) ? weapon.enhancementEffects : []).some(effect => effect.type === 'weaponMode' && effect.sourceCode === 'ENH-TUNG-REIN');
  if (!hasTungsten) return null;
  const mode = selectedWeaponMode(weapon);
  if (mode === 'Heavy') return { count: 3, sides: 6, mod: 0, rof: 2, mode, source: 'Gorilla Arms (Tungsten — Heavy)' };
  if (mode === 'Very Heavy') return { count: 4, sides: 6, mod: 0, rof: 1, mode, source: 'Gorilla Arms (Tungsten — Very Heavy)' };
  return null;
}

export function weaponRuntimeAttackMod(weapon: LegacyCatalogItem | null | undefined): number {
  const base = asNumber(weapon && weapon.attackMod, 0, -99, 99);
  return base + (gorillaTungstenProfile(weapon) ? 1 : 0);
}

export function weaponRuntimeQuality(weapon: LegacyCatalogItem | null | undefined): string {
  return gorillaTungstenProfile(weapon) ? 'excellent' : ((weapon && weapon.quality) || '');
}

export function ignoresHalfSpBadge(item: LegacyCatalogItem | null | undefined): boolean {
  // Melee Weapon and Martial Arts ignore half SP (rounded up). Brawling does not.
  return !!(item && item.ignoresHalfArmor && ['Melee Weapon', 'Martial Arts'].includes(skillCanonicalName(item.skill)));
}
