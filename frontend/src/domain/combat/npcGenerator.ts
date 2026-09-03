// Random NPC generator for the GM Cockpit. Rolls a complete combat-ready
// stat block (all ten STATs, HP by the RAW formula, catalog armor, catalog
// weapons, a focused skill set and descriptive tags) from an archetype
// ("who is this": guard, ganger, corpsec, civilian...) crossed with a tier
// ("how dangerous": base, veterano, elite, chefe). Baselines follow the CPR
// RED core NPC blocks (Boosterganger, Security Officer/Operative, Lawman,
// Solo); tiers stack fixed deltas on top, so the same archetype scales from
// a mook to a boss without a second table.
//
// Pure module: every random decision goes through the injected rng so a
// seed reproduces a whole squad. UI glue (drafts, chips, spawning) lives in
// ui/views/combat.js; this file only knows CPR numbers and catalog codes.

import { CPRED_STAT_ORDER } from '../character/constants.ts';
import type { CpredStat } from '../character/constants.ts';
import { parseGearDamage } from '../character/index.ts';
import { asNumber } from '../shared/num.ts';
import { slug } from '../shared/text.ts';
import type { NpcDraftShape, NpcTemplateAttack } from './npcTemplates.ts';

export type NpcTierId = 'base' | 'veterano' | 'elite' | 'chefe';
/** 'misto' is a group-only option: one leader plus a base/veterano mix. */
export type NpcTierChoice = NpcTierId | 'misto';
export type NpcArchetypeId = 'civil' | 'guarda' | 'ganger' | 'policial' | 'corpsec' | 'solo' | 'drone';
export type NpcBodyType = 'meat' | 'fbc' | 'drone';

export interface NpcWeaponSpec {
  code: string;
  name: string;
  weaponType: string;
  /** Skill used for a single shot / swing (catalog value). */
  skill: string;
  dmg: string;
  rof: number;
  magazine: number | null;
  ammoType: string | null;
  hands: number;
  /** Autofire multiplier when the weapon supports it (SMG x3, AR x4). */
  autofire?: number;
  melee?: boolean;
  /** False for pseudo-entries (unarmed) that have no catalog row. */
  catalog: boolean;
}

export interface NpcArmorSpec {
  code: string;
  name: string;
  sp: number;
  /** Positive REF/DEX/MOVE penalty, as stored on character.armor.*.penalty. */
  penalty: number;
  catalog: boolean;
}

export interface WeightedCode {
  code: string;
  weight: number;
}

export interface NpcTierProfile {
  id: NpcTierId;
  label: string;
  description: string;
  statBonus: number;
  boostedStats: CpredStat[];
  /** Level of the NPC's weapon skills. */
  skillLevel: number;
  /** Level of the archetype's support skills (Perception, Evasion...). */
  supportSkillLevel: number;
  hpBonus: number;
  /** Steps up the archetype's armor ladder. */
  armorShift: number;
  secondaryWeaponChance: number;
  luck: number;
  namePrefix: string;
}

export interface NpcArchetype {
  id: NpcArchetypeId;
  label: string;
  description: string;
  bodyType: NpcBodyType;
  stats: Record<CpredStat, number>;
  jitterStats: CpredStat[];
  primaryWeapons: WeightedCode[];
  secondaryWeapons: WeightedCode[];
  /** Chance the NPC carries nothing and falls back to Brawling. */
  unarmedChance: number;
  /** Armor codes from weakest to strongest; tiers walk up this ladder. */
  armorLadder: string[];
  supportSkills: string[];
  callsigns: string[];
  tags: string[];
}

export interface GeneratedNpcSkill {
  name: string;
  level: number;
}

export interface GeneratedNpcArmor {
  code: string;
  head: { name: string; sp: number; penalty: number };
  body: { name: string; sp: number; penalty: number };
}

export interface GeneratedNpc {
  name: string;
  archetype: NpcArchetypeId;
  tier: NpcTierId;
  tags: string[];
  faction: string;
  bodyType: NpcBodyType;
  stats: Record<CpredStat, number>;
  hpMax: number;
  armor: GeneratedNpcArmor;
  weapons: NpcWeaponSpec[];
  attacks: NpcTemplateAttack[];
  skills: GeneratedNpcSkill[];
  seed: string;
  notes: string;
}

export interface GenerateNpcOptions {
  archetype?: NpcArchetypeId | string;
  tier?: NpcTierId | string;
  faction?: string;
  seed?: string | number;
  rng?: () => number;
  /** Callsigns already taken in the group, so squad mates never share a name. */
  usedCallsigns?: Set<string>;
}

export interface GenerateNpcGroupOptions {
  archetype?: NpcArchetypeId | string;
  tier?: NpcTierChoice | string;
  qty?: number;
  faction?: string;
  seed?: string | number;
  rng?: () => number;
}

export const NPC_GROUP_MAX = 20;
const STAT_MIN = 1;
const STAT_MAX = 10;

// --- Catalog slices ---------------------------------------------------------
// Numbers mirror data/seed/limiar-seed.json (WEAPONS / ARMOR); the
// npcGenerator test cross-checks every catalog:true row against the seed so
// a catalog correction cannot silently drift from what the generator hands
// out. Gear items are still emitted self-contained (dmg/rof/mag inline)
// because the combat kit does not hydrate NPC gear from the catalog.
export const NPC_WEAPON_SPECS: Record<string, NpcWeaponSpec> = {
  'MEDIUM-PISTOL': { code: 'MEDIUM-PISTOL', name: 'Medium Pistol', weaponType: 'Medium Pistol', skill: 'Handgun', dmg: '2d6', rof: 2, magazine: 12, ammoType: 'M Pistol', hands: 1, catalog: true },
  'HEAVY-PISTOL': { code: 'HEAVY-PISTOL', name: 'Heavy Pistol', weaponType: 'Heavy Pistol', skill: 'Handgun', dmg: '3d6', rof: 2, magazine: 8, ammoType: 'H Pistol', hands: 1, catalog: true },
  'VERY-HEAVY-PISTOL': { code: 'VERY-HEAVY-PISTOL', name: 'Very Heavy Pistol', weaponType: 'Very Heavy Pistol', skill: 'Handgun', dmg: '4d6', rof: 1, magazine: 8, ammoType: 'VH Pistol', hands: 1, catalog: true },
  SMG: { code: 'SMG', name: 'SMG', weaponType: 'SMG', skill: 'Handgun', dmg: '2d6', rof: 1, magazine: 30, ammoType: 'M Pistol', hands: 1, autofire: 3, catalog: true },
  'HEAVY-SMG': { code: 'HEAVY-SMG', name: 'Heavy SMG', weaponType: 'Heavy SMG', skill: 'Handgun', dmg: '3d6', rof: 1, magazine: 40, ammoType: 'H Pistol', hands: 1, autofire: 3, catalog: true },
  SHOTGUN: { code: 'SHOTGUN', name: 'Shotgun', weaponType: 'Shotgun', skill: 'Shoulder Arms', dmg: '5d6', rof: 1, magazine: 4, ammoType: 'Slug', hands: 2, catalog: true },
  'ASSAULT-RIFLE': { code: 'ASSAULT-RIFLE', name: 'Assault Rifle', weaponType: 'Assault Rifle', skill: 'Shoulder Arms', dmg: '5d6', rof: 1, magazine: 25, ammoType: 'Rifle', hands: 2, autofire: 4, catalog: true },
  'SNIPER-RIFLE': { code: 'SNIPER-RIFLE', name: 'Sniper Rifle', weaponType: 'Sniper Rifle', skill: 'Shoulder Arms', dmg: '5d6', rof: 1, magazine: 4, ammoType: 'Rifle', hands: 2, catalog: true },
  'LIGHT-MELEE': { code: 'LIGHT-MELEE', name: 'Light Melee Weapon', weaponType: 'Light Melee Weapon', skill: 'Melee Weapon', dmg: '1d6', rof: 2, magazine: null, ammoType: null, hands: 1, melee: true, catalog: true },
  'MEDIUM-MELEE': { code: 'MEDIUM-MELEE', name: 'Medium Melee Weapon', weaponType: 'Medium Melee Weapon', skill: 'Melee Weapon', dmg: '2d6', rof: 2, magazine: null, ammoType: null, hands: 1, melee: true, catalog: true },
  'HEAVY-MELEE': { code: 'HEAVY-MELEE', name: 'Heavy Melee Weapon', weaponType: 'Heavy Melee Weapon', skill: 'Melee Weapon', dmg: '3d6', rof: 2, magazine: null, ammoType: null, hands: 2, melee: true, catalog: true },
  'VERY-HEAVY-MELEE': { code: 'VERY-HEAVY-MELEE', name: 'Very Heavy Melee Weapon', weaponType: 'Very Heavy Melee Weapon', skill: 'Melee Weapon', dmg: '4d6', rof: 1, magazine: null, ammoType: null, hands: 2, melee: true, catalog: true },
};

const UNARMED_CODE = 'BRAWLING';

// CPR RED Brawling damage steps by BODY (core p.176).
export function brawlingDiceForBody(body: number): string {
  if (body <= 4) return '1d6';
  if (body <= 6) return '2d6';
  if (body <= 10) return '3d6';
  return '4d6';
}

export function unarmedWeaponSpec(body: number): NpcWeaponSpec {
  return { code: UNARMED_CODE, name: 'Briga', weaponType: 'Brawling', skill: 'Brawling', dmg: brawlingDiceForBody(body), rof: 2, magazine: null, ammoType: null, hands: 0, melee: true, catalog: false };
}

export const NPC_ARMOR_SPECS: Record<string, NpcArmorSpec> = {
  'NO-ARMOR': { code: 'NO-ARMOR', name: 'Sem armadura', sp: 0, penalty: 0, catalog: false },
  LEATHERS: { code: 'LEATHERS', name: 'Leathers', sp: 4, penalty: 0, catalog: true },
  KEVLAR: { code: 'KEVLAR', name: 'Kevlar', sp: 7, penalty: 0, catalog: true },
  'LIGHT-ARMORJACK': { code: 'LIGHT-ARMORJACK', name: 'Light Armorjack', sp: 11, penalty: 0, catalog: true },
  'MEDIUM-ARMORJACK': { code: 'MEDIUM-ARMORJACK', name: 'Medium Armorjack', sp: 12, penalty: 2, catalog: true },
  'HEAVY-ARMORJACK': { code: 'HEAVY-ARMORJACK', name: 'Heavy Armorjack', sp: 13, penalty: 2, catalog: true },
  FLAK: { code: 'FLAK', name: 'Flak', sp: 15, penalty: 4, catalog: true },
  METALGEAR: { code: 'METALGEAR', name: 'Metalgear', sp: 18, penalty: 4, catalog: true },
  // Drone chassis plating is not purchasable gear; the SP steps just track
  // the human ladder so a "chefe" drone is as tough as a boss in Flak.
  'DRONE-PLATING-LIGHT': { code: 'DRONE-PLATING-LIGHT', name: 'Chassi leve', sp: 8, penalty: 0, catalog: false },
  'DRONE-PLATING-MEDIUM': { code: 'DRONE-PLATING-MEDIUM', name: 'Chassi reforcado', sp: 11, penalty: 0, catalog: false },
  'DRONE-PLATING-HEAVY': { code: 'DRONE-PLATING-HEAVY', name: 'Chassi blindado', sp: 13, penalty: 0, catalog: false },
  'DRONE-PLATING-ASSAULT': { code: 'DRONE-PLATING-ASSAULT', name: 'Chassi de assalto', sp: 15, penalty: 0, catalog: false },
};

// --- Tiers -----------------------------------------------------------------
export const NPC_TIERS: NpcTierProfile[] = [
  {
    id: 'base', label: 'BASE', description: 'Mook padrao: numeros do bloco de NPC do livro.',
    statBonus: 0, boostedStats: [], skillLevel: 4, supportSkillLevel: 2, hpBonus: 0, armorShift: 0, secondaryWeaponChance: 0.3, luck: 0, namePrefix: '',
  },
  {
    id: 'veterano', label: 'VETERANO', description: '+1 REF/BODY/WILL, pericias 5, armadura um degrau acima.',
    statBonus: 1, boostedStats: ['REF', 'BODY', 'WILL'], skillLevel: 5, supportSkillLevel: 3, hpBonus: 0, armorShift: 1, secondaryWeaponChance: 0.6, luck: 1, namePrefix: '',
  },
  {
    id: 'elite', label: 'ELITE', description: '+2 REF/DEX/BODY/WILL/COOL, pericias 6, sempre com arma secundaria.',
    statBonus: 2, boostedStats: ['REF', 'DEX', 'BODY', 'WILL', 'COOL'], skillLevel: 6, supportSkillLevel: 4, hpBonus: 5, armorShift: 2, secondaryWeaponChance: 1, luck: 2, namePrefix: 'ELITE ',
  },
  {
    id: 'chefe', label: 'CHEFE', description: '+3 nos atributos de combate, pericias 7, +10 HP, melhor armadura da escada.',
    statBonus: 3, boostedStats: ['REF', 'DEX', 'BODY', 'WILL', 'COOL'], skillLevel: 7, supportSkillLevel: 5, hpBonus: 10, armorShift: 3, secondaryWeaponChance: 1, luck: 4, namePrefix: 'CHEFE ',
  },
];

export const NPC_TIER_CHOICES: { id: NpcTierChoice; label: string; description: string }[] = NPC_TIERS
  .map(t => ({ id: t.id as NpcTierChoice, label: t.label, description: t.description }))
  .concat([{ id: 'misto', label: 'MISTO', description: 'Esquadrao: um lider mais forte, o resto base/veterano.' }]);

// --- Archetypes ------------------------------------------------------------
const stats = (INT: number, REF: number, DEX: number, TECH: number, COOL: number, WILL: number, LUCK: number, MOVE: number, BODY: number, EMP: number): Record<CpredStat, number> =>
  ({ INT, REF, DEX, TECH, COOL, WILL, LUCK, MOVE, BODY, EMP });

export const NPC_ARCHETYPES: NpcArchetype[] = [
  {
    id: 'civil', label: 'CIVIL', description: 'Pessoa comum: transeunte, funcionario, refem. Quase nunca armado.',
    bodyType: 'meat',
    stats: stats(5, 4, 4, 4, 4, 4, 0, 4, 4, 5),
    jitterStats: ['INT', 'REF', 'DEX', 'BODY', 'COOL', 'EMP'],
    primaryWeapons: [{ code: 'LIGHT-MELEE', weight: 60 }, { code: 'MEDIUM-PISTOL', weight: 40 }],
    secondaryWeapons: [],
    unarmedChance: 0.55,
    armorLadder: ['NO-ARMOR', 'LEATHERS', 'KEVLAR', 'LIGHT-ARMORJACK'],
    supportSkills: ['Perception', 'Evasion', 'Brawling', 'Athletics'],
    callsigns: ['SILVA', 'SOUZA', 'OLIVEIRA', 'NAKAMURA', 'PEREIRA', 'KOWALSKI', 'ALVES', 'MENDES', 'FERREIRA', 'TANAKA', 'ROCHA', 'DUARTE'],
    tags: ['civil'],
  },
  {
    id: 'guarda', label: 'GUARDA', description: 'Seguranca privada de porta, loja ou predio (Security Officer).',
    bodyType: 'meat',
    stats: stats(4, 6, 6, 2, 4, 4, 0, 5, 6, 3),
    jitterStats: ['REF', 'DEX', 'BODY', 'COOL'],
    primaryWeapons: [{ code: 'MEDIUM-PISTOL', weight: 40 }, { code: 'HEAVY-PISTOL', weight: 35 }, { code: 'SMG', weight: 25 }],
    secondaryWeapons: [{ code: 'LIGHT-MELEE', weight: 50 }, { code: 'MEDIUM-MELEE', weight: 50 }],
    unarmedChance: 0,
    armorLadder: ['KEVLAR', 'LIGHT-ARMORJACK', 'MEDIUM-ARMORJACK', 'HEAVY-ARMORJACK'],
    supportSkills: ['Perception', 'Evasion', 'Brawling', 'Athletics', 'Interrogation'],
    callsigns: ['VASQUEZ', 'BRITO', 'OKADA', 'MARQUES', 'HOLT', 'PRADO', 'SANTOS', 'KLEIN', 'MORAES', 'DIAZ', 'BARROS', 'NUNES'],
    tags: ['seguranca'],
  },
  {
    id: 'ganger', label: 'GANGER', description: 'Boosterganger de rua: pouca armadura, muita arma.',
    bodyType: 'meat',
    stats: stats(3, 6, 6, 2, 3, 3, 0, 5, 6, 3),
    jitterStats: ['REF', 'DEX', 'BODY', 'COOL', 'MOVE'],
    primaryWeapons: [{ code: 'HEAVY-PISTOL', weight: 35 }, { code: 'SMG', weight: 25 }, { code: 'MEDIUM-MELEE', weight: 20 }, { code: 'SHOTGUN', weight: 10 }, { code: 'VERY-HEAVY-PISTOL', weight: 10 }],
    secondaryWeapons: [{ code: 'MEDIUM-MELEE', weight: 50 }, { code: 'HEAVY-MELEE', weight: 30 }, { code: 'MEDIUM-PISTOL', weight: 20 }],
    unarmedChance: 0,
    armorLadder: ['LEATHERS', 'KEVLAR', 'LIGHT-ARMORJACK', 'MEDIUM-ARMORJACK'],
    supportSkills: ['Evasion', 'Brawling', 'Perception', 'Streetwise', 'Athletics'],
    callsigns: ['RAZOR', 'FUMACA', 'CROMO', 'VIBORA', 'SPIKE', 'NEON', 'GANCHO', 'FAISCA', 'RATO', 'BRASA', 'SERRA', 'DENTE'],
    tags: ['gangue'],
  },
  {
    id: 'policial', label: 'POLICIAL', description: 'Lawman / NCPD: pistola pesada, escopeta e colete.',
    bodyType: 'meat',
    stats: stats(4, 6, 6, 3, 5, 5, 0, 5, 6, 4),
    jitterStats: ['REF', 'DEX', 'BODY', 'COOL'],
    primaryWeapons: [{ code: 'HEAVY-PISTOL', weight: 45 }, { code: 'SHOTGUN', weight: 30 }, { code: 'ASSAULT-RIFLE', weight: 25 }],
    secondaryWeapons: [{ code: 'MEDIUM-MELEE', weight: 60 }, { code: 'HEAVY-PISTOL', weight: 40 }],
    unarmedChance: 0,
    armorLadder: ['LIGHT-ARMORJACK', 'MEDIUM-ARMORJACK', 'HEAVY-ARMORJACK', 'FLAK'],
    supportSkills: ['Perception', 'Evasion', 'Brawling', 'Drive Land Vehicle', 'Interrogation', 'Athletics'],
    callsigns: ['CARDOSO', 'MENEZES', 'HALL', 'RIBEIRO', 'ORTEGA', 'LIMA', 'FARIAS', 'KHAN', 'TORRES', 'PIRES', 'MURPHY', 'CUNHA'],
    tags: ['lei'],
  },
  {
    id: 'corpsec', label: 'CORPSEC', description: 'Operativo de seguranca corporativa (Security Operative): SMG/fuzil e armorjack.',
    bodyType: 'meat',
    stats: stats(5, 7, 7, 3, 5, 5, 0, 6, 7, 2),
    jitterStats: ['REF', 'DEX', 'BODY', 'COOL', 'INT'],
    primaryWeapons: [{ code: 'ASSAULT-RIFLE', weight: 40 }, { code: 'SMG', weight: 35 }, { code: 'HEAVY-SMG', weight: 25 }],
    secondaryWeapons: [{ code: 'HEAVY-PISTOL', weight: 70 }, { code: 'MEDIUM-MELEE', weight: 30 }],
    unarmedChance: 0,
    armorLadder: ['MEDIUM-ARMORJACK', 'HEAVY-ARMORJACK', 'FLAK', 'METALGEAR'],
    supportSkills: ['Evasion', 'Perception', 'Tactics', 'Athletics', 'Concentration', 'Brawling'],
    callsigns: ['KOVACS', 'TANAKA', 'WEISS', 'HAYES', 'SAITO', 'LINDQVIST', 'ADLER', 'MORGAN', 'NAKASHIMA', 'REYES', 'STRAND', 'VOSS'],
    tags: ['corporativo'],
  },
  {
    id: 'solo', label: 'SOLO', description: 'Mercenario profissional: fuzil, lamina pesada, armadura pesada.',
    bodyType: 'meat',
    stats: stats(5, 8, 7, 3, 6, 6, 2, 6, 7, 2),
    jitterStats: ['REF', 'DEX', 'BODY', 'COOL', 'WILL'],
    primaryWeapons: [{ code: 'ASSAULT-RIFLE', weight: 40 }, { code: 'SHOTGUN', weight: 25 }, { code: 'HEAVY-SMG', weight: 20 }, { code: 'SNIPER-RIFLE', weight: 15 }],
    secondaryWeapons: [{ code: 'HEAVY-PISTOL', weight: 50 }, { code: 'HEAVY-MELEE', weight: 35 }, { code: 'VERY-HEAVY-MELEE', weight: 15 }],
    unarmedChance: 0,
    armorLadder: ['HEAVY-ARMORJACK', 'FLAK', 'METALGEAR', 'METALGEAR'],
    supportSkills: ['Evasion', 'Perception', 'Athletics', 'Tactics', 'Resist Torture/Drugs', 'First Aid', 'Stealth'],
    callsigns: ['GHOST', 'KESTREL', 'MARROW', 'VULTURE', 'HAVOC', 'SABLE', 'RONIN', 'ASH', 'WRAITH', 'JACKAL', 'CINDER', 'LOBO'],
    tags: ['mercenario'],
  },
  {
    id: 'drone', label: 'DRONE', description: 'Drone de combate: inorganico (imune a toxinas), arma montada, chassi blindado.',
    bodyType: 'drone',
    stats: stats(2, 7, 6, 2, 2, 2, 0, 8, 5, 0),
    jitterStats: ['REF', 'BODY', 'MOVE'],
    primaryWeapons: [{ code: 'HEAVY-SMG', weight: 50 }, { code: 'ASSAULT-RIFLE', weight: 30 }, { code: 'SHOTGUN', weight: 20 }],
    secondaryWeapons: [{ code: 'MEDIUM-MELEE', weight: 100 }],
    unarmedChance: 0,
    armorLadder: ['DRONE-PLATING-LIGHT', 'DRONE-PLATING-MEDIUM', 'DRONE-PLATING-HEAVY', 'DRONE-PLATING-ASSAULT'],
    supportSkills: ['Perception', 'Evasion'],
    callsigns: ['MK-I', 'MK-II', 'UNIT-7', 'UNIT-12', 'K9-3', 'SENTRY-4', 'HAWK-2', 'TALON-9', 'ORB-5', 'WASP-6', 'RHINO-1', 'OWL-8'],
    tags: ['drone', 'inorganico'],
  },
];

export function npcArchetypeById(id: unknown): NpcArchetype {
  const key = String(id || '').trim().toLowerCase();
  return NPC_ARCHETYPES.find(a => a.id === key) || NPC_ARCHETYPES[1];
}

export function npcTierById(id: unknown): NpcTierProfile {
  const key = String(id || '').trim().toLowerCase();
  return NPC_TIERS.find(t => t.id === key) || NPC_TIERS[0];
}

// --- RNG -------------------------------------------------------------------
// mulberry32 seeded from an FNV-1a hash of the seed string: tiny, decent
// distribution, and the same seed always replays the same squad.
function hashSeed(seed: string | number): number {
  const text = String(seed);
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export function seededRng(seed: string | number): () => number {
  let a = hashSeed(seed) || 0x9e3779b9;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pick<T>(rows: T[], rng: () => number): T {
  return rows[Math.min(rows.length - 1, Math.floor(rng() * rows.length))];
}

export function weightedPick(rows: WeightedCode[], rng: () => number, exclude: Set<string> = new Set()): string | null {
  const pool = rows.filter(row => row && row.weight > 0 && !exclude.has(row.code));
  if (!pool.length) return null;
  const total = pool.reduce((sum, row) => sum + row.weight, 0);
  let cursor = rng() * total;
  for (const row of pool) {
    cursor -= row.weight;
    if (cursor < 0) return row.code;
  }
  return pool[pool.length - 1].code;
}

// --- Generation ------------------------------------------------------------
function clampStat(value: number, allowZero: boolean): number {
  return Math.max(allowZero ? 0 : STAT_MIN, Math.min(STAT_MAX, Math.round(value)));
}

function rollStats(archetype: NpcArchetype, tier: NpcTierProfile, rng: () => number): Record<CpredStat, number> {
  const out = {} as Record<CpredStat, number>;
  CPRED_STAT_ORDER.forEach((stat) => {
    let value = archetype.stats[stat] || 0;
    if (tier.boostedStats.includes(stat)) value += tier.statBonus;
    if (archetype.jitterStats.includes(stat)) {
      const r = rng();
      if (r < 0.2) value -= 1;
      else if (r > 0.8) value += 1;
    }
    // LUCK and EMP legitimately sit at 0 on NPC blocks (drones have no EMP).
    out[stat] = clampStat(value, stat === 'LUCK' || stat === 'EMP');
  });
  out.LUCK = Math.max(out.LUCK, tier.luck);
  return out;
}

// RAW HP (CPR p.42): 10 + 5 x ceil((BODY + WILL) / 2). Tier bonus on top is
// a house rule to make chefes outlast a single lucky autofire burst.
export function npcHpMax(statsBlock: Record<string, number>, hpBonus: number = 0): number {
  const body = asNumber(statsBlock.BODY, 0, 0, 20);
  const will = asNumber(statsBlock.WILL, 0, 0, 20);
  return 10 + 5 * Math.ceil((body + will) / 2) + Math.max(0, hpBonus);
}

function rollArmor(archetype: NpcArchetype, tier: NpcTierProfile, rng: () => number): GeneratedNpcArmor {
  const ladder = archetype.armorLadder.length ? archetype.armorLadder : ['NO-ARMOR'];
  const bump = rng() < 0.25 ? 1 : 0;
  const index = Math.max(0, Math.min(ladder.length - 1, tier.armorShift + bump));
  const spec = NPC_ARMOR_SPECS[ladder[index]] || NPC_ARMOR_SPECS['NO-ARMOR'];
  const slot = { name: spec.name, sp: spec.sp, penalty: spec.penalty };
  return { code: spec.code, head: { ...slot }, body: { ...slot } };
}

function rollWeapons(archetype: NpcArchetype, tier: NpcTierProfile, body: number, rng: () => number): NpcWeaponSpec[] {
  // Bosses and elites are never caught unarmed, whatever the archetype says.
  const unarmed = tier.statBonus < 2 && rng() < archetype.unarmedChance;
  if (unarmed) return [unarmedWeaponSpec(body)];
  const chosen: NpcWeaponSpec[] = [];
  const taken = new Set<string>();
  const primary = weightedPick(archetype.primaryWeapons, rng);
  if (primary && NPC_WEAPON_SPECS[primary]) { chosen.push(NPC_WEAPON_SPECS[primary]); taken.add(primary); }
  if (archetype.secondaryWeapons.length && rng() < tier.secondaryWeaponChance) {
    const secondary = weightedPick(archetype.secondaryWeapons, rng, taken);
    if (secondary && NPC_WEAPON_SPECS[secondary]) chosen.push(NPC_WEAPON_SPECS[secondary]);
  }
  return chosen.length ? chosen : [unarmedWeaponSpec(body)];
}

/** Attack row the GM Cockpit builder edits; autofire-capable guns roll Autofire, like the hand-built presets. */
export function attackRowForWeapon(spec: NpcWeaponSpec): NpcTemplateAttack {
  return { name: spec.name, dice: spec.dmg, skill: spec.autofire ? 'Autofire' : spec.skill, code: spec.code };
}

function rollSkills(archetype: NpcArchetype, tier: NpcTierProfile, weapons: NpcWeaponSpec[]): GeneratedNpcSkill[] {
  const levels = new Map<string, number>();
  const raise = (name: string, level: number) => {
    if (!name) return;
    levels.set(name, Math.max(levels.get(name) || 0, level));
  };
  weapons.forEach((weapon) => {
    raise(weapon.skill, tier.skillLevel);
    if (weapon.autofire) raise('Autofire', tier.skillLevel);
  });
  archetype.supportSkills.forEach(name => raise(name, tier.supportSkillLevel));
  return Array.from(levels.entries()).map(([name, level]) => ({ name, level }));
}

function rollCallsign(archetype: NpcArchetype, rng: () => number, used: Set<string>): string {
  const free = archetype.callsigns.filter(name => !used.has(name));
  if (free.length) {
    const name = pick(free, rng);
    used.add(name);
    return name;
  }
  // Pool exhausted (squads above the pool size): number the repeats.
  const base = pick(archetype.callsigns, rng);
  let n = 2;
  while (used.has(base + ' ' + n)) n += 1;
  const name = base + ' ' + n;
  used.add(name);
  return name;
}

export function generateNpc(options: GenerateNpcOptions = {}): GeneratedNpc {
  const archetype = npcArchetypeById(options.archetype);
  const tier = npcTierById(options.tier);
  const seed = options.seed === undefined || options.seed === null || options.seed === '' ? '' : String(options.seed);
  const rng = typeof options.rng === 'function' ? options.rng : (seed ? seededRng(seed) : Math.random);
  const faction = String(options.faction || '').trim().toUpperCase();
  const used = options.usedCallsigns instanceof Set ? options.usedCallsigns : new Set<string>();

  const statsBlock = rollStats(archetype, tier, rng);
  const hpMax = npcHpMax(statsBlock, tier.hpBonus);
  const armor = rollArmor(archetype, tier, rng);
  const weapons = rollWeapons(archetype, tier, statsBlock.BODY, rng);
  const skills = rollSkills(archetype, tier, weapons);
  const callsign = rollCallsign(archetype, rng, used);
  const name = (tier.namePrefix + archetype.label + ' ' + callsign).toUpperCase();
  const tags: string[] = [String(tier.id), String(archetype.id)]
    .concat(archetype.tags.filter(tag => tag !== archetype.id))
    .concat(faction ? [slug(faction)] : []);
  const notes = [
    'NPC aleatorio: ' + archetype.label + ' / ' + tier.label + (faction ? ' / ' + faction : '') + '.',
    'Armadura: ' + armor.body.name + ' (SP ' + armor.body.sp + ').',
    'Armas: ' + weapons.map(w => w.name + ' ' + w.dmg).join(', ') + '.',
    seed ? 'Seed: ' + seed : '',
  ].filter(Boolean).join(' ');

  return {
    name,
    archetype: archetype.id,
    tier: tier.id,
    tags,
    faction,
    bodyType: archetype.bodyType,
    stats: statsBlock,
    hpMax,
    armor,
    weapons,
    attacks: weapons.map(attackRowForWeapon),
    skills,
    seed,
    notes,
  };
}

// 'misto' squads: one leader (elite from 4 up, veterano for 2-3), a quarter
// of the rest veterano, everyone else base — the classic "lieutenant plus
// mooks" encounter without the GM rolling each one by hand.
export function resolveTierMix(tier: unknown, qty: number, rng: () => number): NpcTierId[] {
  const count = Math.max(1, Math.min(NPC_GROUP_MAX, asNumber(qty, 1, 1, NPC_GROUP_MAX)));
  const key = String(tier || '').trim().toLowerCase();
  if (key !== 'misto') {
    const fixed = npcTierById(key).id;
    return Array.from({ length: count }, () => fixed);
  }
  if (count === 1) return ['base'];
  const leader: NpcTierId = count >= 4 ? 'elite' : 'veterano';
  const rest: NpcTierId[] = Array.from({ length: count - 1 }, () => (rng() < 0.25 ? 'veterano' : 'base'));
  return ([leader] as NpcTierId[]).concat(rest);
}

export function generateNpcGroup(options: GenerateNpcGroupOptions = {}): GeneratedNpc[] {
  const seed = options.seed === undefined || options.seed === null || options.seed === '' ? '' : String(options.seed);
  const rng = typeof options.rng === 'function' ? options.rng : (seed ? seededRng(seed) : Math.random);
  const tiers = resolveTierMix(options.tier, asNumber(options.qty, 1, 1, NPC_GROUP_MAX), rng);
  const used = new Set<string>();
  return tiers.map((tier, index) => {
    const npc = generateNpc({ archetype: options.archetype, tier, faction: options.faction, rng, usedCallsigns: used });
    return seed ? { ...npc, seed: seed + '#' + (index + 1) } : npc;
  });
}

// --- Bridges to the GM Cockpit builder -------------------------------------
export function npcDraftFromGenerated(npc: GeneratedNpc, qty: string = '1'): NpcDraftShape {
  return {
    name: npc.name,
    bodyType: npc.bodyType,
    body: String(npc.stats.BODY),
    ref: String(npc.stats.REF),
    hpMax: String(npc.hpMax),
    headSp: String(npc.armor.head.sp),
    bodySp: String(npc.armor.body.sp),
    qty: String(qty || '1'),
    templateId: '',
    attackRows: npc.attacks.map(a => ({ ...a })),
    generated: {
      archetype: npc.archetype,
      tier: npc.tier,
      tags: npc.tags.slice(),
      faction: npc.faction,
      stats: { ...npc.stats },
      skills: npc.skills.map(s => ({ ...s })),
      armor: { code: npc.armor.code, head: { ...npc.armor.head }, body: { ...npc.armor.body } },
      seed: npc.seed,
      notes: npc.notes,
    },
  };
}

/**
 * Turns one builder attack row into a gear item for the NPC record. Rows
 * carrying a catalog code (generated NPCs) keep the real weapon profile
 * (ROF, magazine, autofire, hands) so the combat kit treats them like
 * catalog guns; hand-typed rows fall back to the bare "name|dice|skill"
 * shape the old free-text builder produced.
 */
export function npcAttackRowToGearItem(row: Partial<NpcTemplateAttack> & { notes?: string }, idx: number = 0): Record<string, unknown> | null {
  const name = String(row && row.name || '').trim();
  if (!name) return null;
  const spec = row.code ? NPC_WEAPON_SPECS[String(row.code)] || null : null;
  const dmg = String(row.dice || (spec && spec.dmg) || '1d6').trim() || '1d6';
  const parsed = parseGearDamage(dmg) || { count: 1, sides: 6, mod: 0 };
  const skill = String(row.skill || (spec && spec.skill) || 'Autofire');
  const item: Record<string, unknown> = {
    id: 'npc-atk-' + idx + '-' + slug(name),
    code: spec ? spec.code : '',
    name,
    type: spec ? 'WEAPON - ' + spec.weaponType.toUpperCase() : 'WEAPON - NPC',
    weaponClass: spec ? spec.weaponType : 'NPC',
    skill,
    dmg,
    count: parsed.count,
    sides: parsed.sides,
    mod: parsed.mod,
    qty: 1,
    equipped: true,
    source: 'npc',
    notes: String(row.notes || ''),
  };
  if (spec) {
    item.weaponType = spec.weaponType;
    item.rof = spec.rof;
    item.mag = spec.magazine;
    item.magazine = spec.magazine;
    item.ammoType = spec.ammoType;
    item.hands = spec.hands;
    item.melee = !!spec.melee;
    if (spec.autofire) item.autofire = { enabled: true, multiplier: spec.autofire };
  }
  return item;
}

export function npcGearFromAttackRows(rows: unknown): Record<string, unknown>[] {
  const list = Array.isArray(rows) ? rows : [];
  return list
    .map((row, idx) => npcAttackRowToGearItem((row || {}) as Partial<NpcTemplateAttack>, idx))
    .filter((item): item is Record<string, unknown> => !!item);
}

export function npcStatLine(statsBlock: Record<string, number> | null | undefined): string {
  if (!statsBlock) return '';
  return CPRED_STAT_ORDER.map(stat => stat + ' ' + asNumber(statsBlock[stat], 0, 0, 20)).join(' · ');
}
