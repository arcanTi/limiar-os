// Character domain: pure normalization and derived calculations for stats,
// skills, armor, and conditions. No DOM, no component state, no cyberware
// coupling — cyberware-dependent derivations stay in the UI layer for now.

import { asNumber } from '../shared/num.ts';
import {
  CPRED_DEFAULT_ARMOR,
  CPRED_DEFAULT_SKILLS,
  CPRED_SKILL_ALIASES,
  CPRED_STAT_MAX,
  CPRED_STAT_ORDER,
} from './constants.ts';
import type { ArmorSlot, CharacterArmor, CpredStat } from './constants.ts';

export type Stats = Record<CpredStat, number>;

export function normalizeStats(base: Partial<Record<string, unknown>> | null | undefined): Stats {
  const src = base || {};
  const pick = (key: string, fallback: number) => asNumber(src[key], fallback, 0, 20);
  return {
    INT: pick('INT', 5),
    REF: pick('REF', 5),
    DEX: pick('DEX', (src.REF as number) ?? 5),
    TECH: pick('TECH', 5),
    COOL: pick('COOL', 5),
    WILL: pick('WILL', (src.COOL as number) ?? 5),
    LUCK: pick('LUCK', 5),
    MOVE: pick('MOVE', 6),
    BODY: pick('BODY', 5),
    EMP: pick('EMP', 5),
  };
}

export interface HqIp {
  ip: number;
  log: unknown[];
}

export function normalizeHqIp(payload: { ip?: unknown; log?: unknown } | null | undefined): HqIp {
  const src = payload || {};
  return {
    ip: asNumber(src.ip, 0, 0, 999999),
    log: Array.isArray(src.log) ? src.log : [],
  };
}

export function normalizeArmor(armor: Partial<CharacterArmor> | null | undefined): CharacterArmor {
  const src = armor || {};
  const clean = (slot: Partial<ArmorSlot> | null | undefined, fallback: ArmorSlot): ArmorSlot => ({
    name: (slot && slot.name) || fallback.name,
    sp: asNumber(slot && slot.sp, fallback.sp, 0, 99),
    penalty: asNumber(slot && slot.penalty, fallback.penalty, 0, 9),
  });
  return {
    head: clean(src.head, CPRED_DEFAULT_ARMOR.head),
    body: clean(src.body, CPRED_DEFAULT_ARMOR.body),
  };
}

export interface CharacterShield {
  itemId: string;
  hp: number;
  maxHp: number;
}

export function normalizeShield(shield: Partial<CharacterShield> | null | undefined): CharacterShield | null {
  if (!shield || !shield.itemId) return null;
  const maxHp = asNumber(shield.maxHp, 0, 0, 999);
  if (maxHp <= 0) return null;
  return {
    itemId: String(shield.itemId),
    hp: asNumber(shield.hp, maxHp, 0, maxHp),
    maxHp,
  };
}

export function damageShield(shield: Partial<CharacterShield> | null | undefined, amount: unknown): CharacterShield | null {
  const current = normalizeShield(shield);
  if (!current) return null;
  const damage = Math.max(0, Number(amount) || 0);
  return { ...current, hp: Math.max(0, current.hp - damage) };
}

export function repairShield(shield: Partial<CharacterShield> | null | undefined, amount: unknown): CharacterShield | null {
  const current = normalizeShield(shield);
  if (!current) return null;
  const repair = Math.max(0, Number(amount) || 0);
  return { ...current, hp: Math.min(current.maxHp, current.hp + repair) };
}

// Humanity recovery (CPR RAW: therapy, Morale Boost, near-death). Operates
// only on the stored/avulsa humanityLoss scalar — the cyberware-hcost portion
// is never persisted on this field (derivedStatsEngine adds it back live from
// installed cyberware), so recovery here structurally cannot touch it.
export function applyHumanityRecovery(humanityLoss: unknown, amount: unknown): number {
  const current = asNumber(humanityLoss, 0, 0, 100);
  const recover = Math.max(0, Number(amount) || 0);
  return Math.max(0, current - recover);
}

// Morale Boost (QG upgrade tiers), rolled per month: Upgrade 1 halves 1d6
// (round down), Upgrade 4 is a flat 1d6, Upgrade 9 rolls 2d6 and keeps the
// higher single die (not the sum). Takes raw dice faces, not a pre-summed
// total, since Upgrade 9 needs the individual values.
export function moraleBoostRecovery(upgrade: 1 | 4 | 9, faces: number[]): number {
  const rolls = (Array.isArray(faces) ? faces : []).map(face => Number(face) || 0);
  if (upgrade === 1) return Math.floor((rolls[0] || 0) / 2);
  if (upgrade === 9) return rolls.length ? Math.max(...rolls) : 0;
  return rolls[0] || 0;
}

export interface ParsedGearDamage {
  count: number;
  sides: number;
  mod: number;
}

export function parseGearDamage(text: unknown): ParsedGearDamage | null {
  const raw = String(text || '').trim();
  const match = raw.match(/^(\d*)d(\d+)([+-]\d+)?$/i);
  if (!match) return null;
  return {
    count: asNumber(match[1] || 1, 1, 1, 20),
    sides: asNumber(match[2], 6, 2, 100),
    mod: asNumber(match[3] || 0, 0, -99, 99),
  };
}

export function skillCanonicalName(name: unknown): string {
  const raw = String(name || '').trim();
  return CPRED_SKILL_ALIASES[raw] || raw;
}

export interface CharacterSkill {
  id: string;
  name: string;
  stat: string;
  level: number;
  baseLevel: number;
  bonus: number;
  defaultSkill: boolean;
  difficult: boolean;
  total: number;
}

export interface RawSkillInput {
  id?: string;
  name?: string;
  stat?: string;
  level?: unknown;
  bonus?: unknown;
  difficult?: unknown;
}

export function normalizeSkills(skills: unknown, stats: Partial<Record<string, unknown>> | null | undefined): CharacterSkill[] {
  const incoming: RawSkillInput[] = Array.isArray(skills) ? skills : [];
  return CPRED_DEFAULT_SKILLS.map((fallback) => {
    const src = incoming.find(s => s && skillCanonicalName(s.name) === fallback.name) || {};
    const stat = (CPRED_STAT_ORDER as string[]).includes(src.stat as string) ? (src.stat as string) : fallback.stat;
    const minLevel = fallback.defaultSkill ? 2 : 0;
    const level = asNumber(src.level, fallback.level, minLevel, 10);
    const bonus = asNumber(src.bonus, fallback.bonus || 0, -20, 20);
    return {
      id: src.id || fallback.id,
      name: fallback.name,
      stat,
      level,
      baseLevel: fallback.baseLevel || 0,
      bonus,
      defaultSkill: !!fallback.defaultSkill,
      difficult: src.difficult == null ? !!fallback.difficult : !!src.difficult,
      total: (stats && Number(stats[stat])) ? Number(stats[stat]) + level + bonus : level + bonus,
    };
  });
}

export function skillSpend(skills: unknown): number {
  return normalizeSkills(skills, null).reduce((sum, skill) => {
    const base = skill.baseLevel || 0;
    const spent = Math.max(0, (Number(skill.level) || 0) - base);
    return sum + spent * (skill.difficult ? 2 : 1);
  }, 0);
}

export interface SpDamage {
  head: number;
  body: number;
}

export function normalizeSpDamage(spDamage: Partial<SpDamage> | null | undefined): SpDamage {
  const src = spDamage || {};
  return {
    head: asNumber(src.head, 0, 0, 99),
    body: asNumber(src.body, 0, 0, 99),
  };
}

export function armorPenalty(character: { armor?: Partial<CharacterArmor> } | null | undefined): number {
  const armor = normalizeArmor(character && character.armor);
  return Math.max(armor.head.penalty || 0, armor.body.penalty || 0);
}

export function cpredStatMax(key: string): number {
  return key === 'LUCK' ? 10 : CPRED_STAT_MAX;
}
