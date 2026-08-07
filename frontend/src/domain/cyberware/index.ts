// Cyberware domain: pure computation of bonuses, stat mods, immunities, and
// weapon-enhancement effects. Functions take an already-resolved `installed`
// list (normalized cyberware items) — catalog lookup / state access stays in the
// UI layer, which passes the resolved list in.

import { skillCanonicalName, normalizeStats } from '../character/index.ts';
import type { Stats } from '../character/index.ts';
import { CPRED_STAT_ORDER } from '../character/constants.ts';
import { CYBER_BONUS_TYPES } from './constants.ts';
import type { CyberBonusCategory } from './constants.ts';

export interface InstalledCyberwareItem {
  code?: string;
  name?: string;
  bonus?: unknown;
  statMod?: Record<string, unknown>;
  skillBonus?: Record<string, unknown>;
  hcost?: unknown;
  flags?: Record<string, unknown>;
  attachesTo?: string[];
  enhancements?: unknown;
}

export interface NormalizedCyberBonus {
  type: string;
  desc: string;
  [attr: string]: unknown;
}

// Validate + shape a cyberware item's raw bonus array against CYBER_BONUS_TYPES.
export function normalizeBonus(bonus: unknown): NormalizedCyberBonus[] {
  const rows: unknown[] = Array.isArray(bonus) ? bonus : [];
  return rows.map(raw => {
    if (!raw || typeof raw !== 'object') return null;
    const effect = raw as Record<string, unknown>;
    const type = String(effect.type || '').trim();
    const spec = CYBER_BONUS_TYPES[type];
    if (!spec) return null;
    const normalized: NormalizedCyberBonus = { type, desc: '' };
    const valid = spec.attrs.every(attr => Object.prototype.hasOwnProperty.call(effect, attr));
    if (!valid) return null;
    spec.attrs.forEach(attr => {
      normalized[attr] = Array.isArray(effect[attr]) ? [...(effect[attr] as unknown[])] : effect[attr];
    });
    normalized.desc = String(effect.desc || type).trim();
    return normalized;
  }).filter((x): x is NormalizedCyberBonus => x !== null);
}

// Coerce a {skill/stat: value} map into canonical keys with numeric values.
export function effectMap(map: unknown): Record<string, number> {
  const out: Record<string, number> = {};
  if (!map || typeof map !== 'object') return out;
  Object.entries(map as Record<string, unknown>).forEach(([key, raw]) => {
    const value = Number(raw) || 0;
    if (key && value) out[skillCanonicalName(key)] = value;
  });
  return out;
}

export function normalizeEnhancementCodes(codes: unknown): string[] {
  const seen = new Set<string>();
  return (Array.isArray(codes) ? codes : []).map(code => String(code || '').trim()).filter(code => {
    if (!code || seen.has(code)) return false;
    seen.add(code);
    return true;
  });
}

export function enhancementEffectLabel(effect: (NormalizedCyberBonus & { from?: string; sourceCode?: string }) | null | undefined): string {
  const source = effect && (effect.from || effect.sourceCode);
  const prefix = source ? source + ': ' : '';
  if (!effect) return '';
  if (effect.type === 'critDamage') return prefix + 'crit +' + (Number(effect.value) || 0);
  if (effect.type === 'critRoll') return prefix + 'crit roll x' + (Number(effect.rolls) || 1);
  if (effect.type === 'ignoreArmor') return prefix + 'SP<7 => SP 0';
  if (effect.type === 'armorAblation') return prefix + 'ablate +' + (Number(effect.value) || 0);
  if (effect.type === 'weaponMode') return prefix + 'modes ' + (Array.isArray(effect.modes) ? (effect.modes as string[]).join('/') : '');
  if (effect.type === 'damageVsCover') return prefix + 'cover +' + (effect.dice || '');
  if (effect.type === 'nonLethalOption') return prefix + 'nonlethal';
  return prefix + (effect.desc || effect.type);
}

export interface EnhanceableWeapon {
  modes?: string[];
  rof?: number | string | null;
  [key: string]: unknown;
}

export function applyCyberweaponEnhancements(weapon: EnhanceableWeapon, effects: unknown) {
  const rows = (Array.isArray(effects) ? effects : []) as (NormalizedCyberBonus & { from?: string; sourceCode?: string })[];
  const modeEffects = rows.filter(effect => effect.type === 'weaponMode');
  const modes = [...(Array.isArray(weapon.modes) ? weapon.modes : [])];
  modeEffects.forEach(effect => (Array.isArray(effect.modes) ? (effect.modes as string[]) : []).forEach(mode => {
    if (mode && !modes.includes(mode)) modes.push(mode);
  }));
  const rofBoost = modeEffects.reduce((max, effect) => Math.max(max, Number(effect.rof) || 0), 0);
  const labels = rows.map(effect => enhancementEffectLabel(effect)).filter(Boolean);
  return {
    ...weapon,
    modes,
    rof: weapon.rof ?? (rofBoost || null),
    enhancementEffects: rows,
    enhancementLabels: labels,
    enhancementSummary: labels.join(' // '),
    hasEnhancements: rows.length > 0,
  };
}

// Enhancement bonus effects attached to `parent`, drawn from the installed list.
export function cyberweaponEnhancementEffects(installed: InstalledCyberwareItem[] | null | undefined, parent: { enhancements?: unknown; code?: string } | null | undefined) {
  const attached = new Set(normalizeEnhancementCodes(parent && parent.enhancements));
  if (!attached.size) return [];
  return (installed || []).filter(it => it.code && attached.has(it.code)).flatMap(it => (
    normalizeBonus(it && it.bonus).map(effect => ({
      ...effect,
      from: it.name || it.code,
      sourceCode: it.code,
      parentCode: parent && parent.code,
      category: (CYBER_BONUS_TYPES[effect.type] || {}).category || '',
    }))
  ));
}

export function compatibleEnhancements(installed: InstalledCyberwareItem[] | null | undefined, parent: { code?: string } | null | undefined) {
  const parentCode = parent && parent.code;
  if (!parentCode) return [];
  return (installed || []).filter(it => Array.isArray(it.attachesTo) && it.attachesTo.includes(parentCode));
}

export function cyberwareStatMods(installed: InstalledCyberwareItem[] | null | undefined): Record<string, number> {
  const mods: Record<string, number> = {};
  (installed || []).forEach(it => {
    const statMod = effectMap(it && it.statMod);
    Object.keys(statMod).forEach(k => {
      if ((CPRED_STAT_ORDER as string[]).includes(k)) mods[k] = (mods[k] || 0) + statMod[k];
    });
  });
  return mods;
}

export interface StatModBonusResult {
  total: number;
  sources: string[];
}

export function cyberwareStatModBonus(installed: InstalledCyberwareItem[] | null | undefined, statName: unknown): StatModBonusResult {
  const stat = String(statName || '').trim().toUpperCase();
  const sources: string[] = [];
  let total = 0;
  (installed || []).forEach(it => {
    const statMod = effectMap(it && it.statMod);
    Object.keys(statMod).forEach(key => {
      if (String(key || '').trim().toUpperCase() !== stat) return;
      total += statMod[key];
      sources.push('+' + statMod[key] + ' ' + (it.name || it.code));
    });
  });
  return { total, sources };
}

export function cyberwareFlagSources(installed: InstalledCyberwareItem[] | null | undefined, flagName: unknown): string[] {
  const flag = String(flagName || '').trim();
  if (!flag) return [];
  return (installed || []).filter(it => it && it.flags && it.flags[flag]).map(it => it.name || it.code || '');
}

export function applyCyberwareStatMods(stats: Partial<Record<string, unknown>> | null | undefined, installed: InstalledCyberwareItem[] | null | undefined): Stats {
  const base = normalizeStats(stats);
  const mods = cyberwareStatMods(installed);
  Object.keys(mods).forEach(k => { (base as Record<string, number>)[k] = ((base as Record<string, number>)[k] || 0) + mods[k]; });
  return base;
}

export function skillCyberwareBonus(installed: InstalledCyberwareItem[] | null | undefined, skillName: unknown): StatModBonusResult {
  const name = skillCanonicalName(skillName);
  const sources: string[] = [];
  let total = 0;
  (installed || []).forEach(it => {
    const map = effectMap(it && it.skillBonus);
    Object.keys(map).forEach(key => {
      if (skillCanonicalName(key) !== name) return;
      total += map[key];
      sources.push('+' + map[key] + ' ' + (it.name || it.code));
    });
  });
  return { total, sources };
}

export interface CyberwareBonusGroup {
  category: CyberBonusCategory;
  label: string;
  effects: (NormalizedCyberBonus & { from?: string; sourceCode?: string; category: CyberBonusCategory })[];
}

export interface CyberwareBonuses {
  flat: (NormalizedCyberBonus & { from?: string; sourceCode?: string; category: CyberBonusCategory })[];
  groups: CyberwareBonusGroup[];
  byType: Record<string, (NormalizedCyberBonus & { from?: string; sourceCode?: string; category: CyberBonusCategory })[]>;
  byCategory: Record<string, (NormalizedCyberBonus & { from?: string; sourceCode?: string; category: CyberBonusCategory })[]>;
  immunities: {
    flash: unknown[];
    deafen: unknown[];
    emp: unknown[];
    spinalInjury: unknown[];
  };
  damageVsCover: unknown[];
  critDamage: unknown[];
  critRoll: unknown[];
  ignoreArmor: unknown[];
  armorAblation: unknown[];
  weaponMode: unknown[];
  rangedBonus: unknown[];
  healingRate: unknown[];
  nonLethalOption: unknown[];
}

export function cyberwareBonuses(installed: InstalledCyberwareItem[] | null | undefined): CyberwareBonuses {
  const byType: CyberwareBonuses['byType'] = {};
  const byCategory: CyberwareBonuses['byCategory'] = {};
  const flat: CyberwareBonuses['flat'] = [];
  (installed || []).forEach(it => {
    normalizeBonus(it && it.bonus).forEach(effect => {
      const spec = CYBER_BONUS_TYPES[effect.type];
      if (!spec) return;
      const entry = {
        ...effect,
        from: it.name || it.code,
        sourceCode: it.code,
        category: spec.category,
      };
      flat.push(entry);
      if (!byType[effect.type]) byType[effect.type] = [];
      byType[effect.type].push(entry);
      if (!byCategory[spec.category]) byCategory[spec.category] = [];
      byCategory[spec.category].push(entry);
    });
  });
  const groupLabels: Record<string, string> = { passive: 'PASSIVE', toHit: 'TO HIT', damage: 'DAMAGE', weapon: 'WEAPON' };
  const groups: CyberwareBonusGroup[] = (['passive', 'toHit', 'damage', 'weapon'] as CyberBonusCategory[]).map(category => ({
    category,
    label: groupLabels[category] || category.toUpperCase(),
    effects: byCategory[category] || [],
  })).filter(group => group.effects.length > 0);
  return {
    flat,
    groups,
    byType,
    byCategory,
    immunities: {
      flash: byType.flashImmunity || [],
      deafen: byType.deafenImmunity || [],
      emp: byType.empImmunity || [],
      spinalInjury: byType.spinalInjuryImmunity || [],
    },
    damageVsCover: byType.damageVsCover || [],
    critDamage: byType.critDamage || [],
    critRoll: byType.critRoll || [],
    ignoreArmor: byType.ignoreArmor || [],
    armorAblation: byType.armorAblation || [],
    weaponMode: byType.weaponMode || [],
    rangedBonus: byType.rangedBonus || [],
    healingRate: byType.healingRate || [],
    nonLethalOption: byType.nonLethalOption || [],
  };
}

export function healingRateBonus(installed: InstalledCyberwareItem[] | null | undefined) {
  const rows = (cyberwareBonuses(installed).healingRate || []) as (NormalizedCyberBonus & { from?: string; sourceCode?: string })[];
  const multiplier = rows.reduce((max, effect) => Math.max(max, Number(effect.multiplier) || 1), 1);
  return { multiplier, sources: rows.map(effect => effect.from || effect.sourceCode).filter(Boolean) as string[] };
}

// `body` is the cyberware-adjusted BODY value (computed by the caller).
export function naturalHealingPerRest(installed: InstalledCyberwareItem[] | null | undefined, body: number) {
  const healing = healingRateBonus(installed);
  const amount = Math.max(1, body) * Math.max(1, healing.multiplier || 1);
  const sources = healing.sources.map(source => 'x' + healing.multiplier + ' ' + source);
  return { amount, base: Math.max(1, body), multiplier: healing.multiplier || 1, sources };
}

export function immunityBadges(installed: InstalledCyberwareItem[] | null | undefined) {
  const immunities = cyberwareBonuses(installed).immunities || {};
  const rows: [keyof CyberwareBonuses['immunities'], string][] = [
    ['flash', 'FLASH IMMUNE'],
    ['deafen', 'DEAFEN IMMUNE'],
    ['emp', 'EMP IMMUNE'],
    ['spinalInjury', 'SPINAL INJURY IMMUNE'],
  ];
  return rows.flatMap(([key, label]) => (immunities[key] || []).map((raw) => {
    const effect = raw as { from?: string; sourceCode?: string };
    return {
      key,
      label,
      source: effect.from || effect.sourceCode || 'CHROME',
      title: label + ' // ' + (effect.from || effect.sourceCode || 'CHROME'),
    };
  }));
}

export function spinalInjuryImmunitySources(installed: InstalledCyberwareItem[] | null | undefined): string[] {
  return (cyberwareBonuses(installed).immunities.spinalInjury || []).map((raw) => {
    const effect = raw as { from?: string; sourceCode?: string };
    return effect.from || effect.sourceCode;
  }).filter(Boolean) as string[];
}

export function empImmunitySources(installed: InstalledCyberwareItem[] | null | undefined): string[] {
  return (cyberwareBonuses(installed).immunities.emp || []).map((raw) => {
    const effect = raw as { from?: string; sourceCode?: string };
    return effect.from || effect.sourceCode;
  }).filter(Boolean) as string[];
}

export function criticalInjuryImmunity(installed: InstalledCyberwareItem[] | null | undefined, injuryId: string) {
  if (injuryId !== 'spinal_injury') return null;
  const sources = spinalInjuryImmunitySources(installed);
  return sources.length ? { blocked: true, label: 'Spinal Injury immunity', sources } : null;
}

export function cyberwareHumanityLoss(installed: InstalledCyberwareItem[] | null | undefined): number {
  let loss = 0;
  (installed || []).forEach(it => { if (it) loss += Number(it.hcost) || 0; });
  return loss;
}
