// Character domain constants: stats, skills, default armor, and the
// critical-injury catalog. Pure reference data shared by the character
// domain functions and the UI layer. data/seed/critical-injuries.json and
// data/seed/skills.json are the source of truth for the two catalogs below
// (see @seed alias in vite.config.js).
import criticalInjuriesJson from '@seed/critical-injuries.json';
import skillRowsJson from '@seed/skills.json';
import skillDescriptionsJson from '@seed/skill-descriptions.json';

export interface CriticalInjuryMechanics {
  penalties: { scope: string; stat?: string; value: number }[];
  hpOnApply?: number;
  autoBypassesArmor?: boolean;
  flags?: Record<string, boolean>;
}

export interface CriticalInjuryCatalogEntry {
  id: string;
  name_en?: string;
  name_pt: string;
  location: 'head' | 'body';
  bonusDamage: number;
  quickFixDV: number | null;
  quickFixWho?: string | null;
  treatmentDV: number | null;
  treatmentWho?: string;
  lastingPenalty_pt: string;
  autoBypassesArmor: boolean;
  mechanics: CriticalInjuryMechanics;
  source: string;
  verify: boolean;
}

export const CPRED_CRITICAL_INJURIES = criticalInjuriesJson as unknown as Record<string, CriticalInjuryCatalogEntry>;

// 2d6 sum -> catalog id, one table per hit location. Body is rolled on any
// qualifying hit; Head only follows a successful Aimed Shot (and is never
// used for area/blast damage, which always resolves against Body).
export const CPRED_CRITICAL_INJURY_TABLE: { body: Record<number, string>; head: Record<number, string> } = {
  body: { 2: 'crit_body_2', 3: 'crit_body_3', 4: 'crit_body_4', 5: 'crit_body_5', 6: 'crit_body_6', 7: 'crit_body_7', 8: 'crit_body_8', 9: 'crit_body_9', 10: 'crit_body_10', 11: 'crit_body_11', 12: 'crit_body_12' },
  head: { 2: 'crit_head_2', 3: 'crit_head_3', 4: 'crit_head_4', 5: 'crit_head_5', 6: 'crit_head_6', 7: 'crit_head_7', 8: 'crit_head_8', 9: 'crit_head_9', 10: 'crit_head_10', 11: 'crit_head_11', 12: 'crit_head_12' },
};

export type CpredStat = 'INT' | 'REF' | 'DEX' | 'TECH' | 'COOL' | 'WILL' | 'LUCK' | 'MOVE' | 'BODY' | 'EMP';

export const CPRED_STAT_ORDER: CpredStat[] = ['INT', 'REF', 'DEX', 'TECH', 'COOL', 'WILL', 'LUCK', 'MOVE', 'BODY', 'EMP'];
export const CPRED_STAT_BUDGET = 62;
export const CPRED_STAT_MIN = 2;
export const CPRED_STAT_MAX = 8;
// Rolled STATs (1d10 per attribute, ones rerolled) are not capped by the point-buy maximum.
export const CPRED_STAT_ROLL_SIDES = 10;
export const CPRED_STAT_ROLL_MAX = 10;
export const CPRED_ARMOR_PENALTY_STATS: CpredStat[] = ['REF', 'DEX', 'MOVE'];
export const CPRED_ROLES = ['Rockerboy', 'Solo', 'Netrunner', 'Tech', 'Medtech', 'Media', 'Exec', 'Lawman', 'Fixer', 'Nomad'];

// RAW (CPR p.88/90): 86 skill points, of which 26 are the mandatory 13 basic
// skills at level 2. The app tracks the 60 that remain free (`skillSpend`
// excludes `baseLevel`), and the UI shows both numbers.
export const CPRED_SKILL_BUDGET = 60;
export const CPRED_SKILL_BUDGET_TOTAL = 86;
export const CPRED_SKILL_BASIC_ALLOCATION = CPRED_SKILL_BUDGET_TOTAL - CPRED_SKILL_BUDGET;
// At creation no skill goes above 6, and a trained skill starts at 2 (p.42/88/90).
export const CPRED_SKILL_CREATION_MAX = 6;
export const CPRED_SKILL_TRAINED_MIN = 2;

// Complete Package starting money (CPR p.42/104/105): 2.550eb buy gear, armor
// and cyberware — surgery included, free at creation (p.110) — and whatever is
// left becomes the character's cash. A separate 800eb only buys Fashion and
// Fashionware, and any part of it not spent is lost instead of banked.
export const CPRED_CREATION_CASH = 2550;
export const CPRED_CREATION_FASHION_CASH = 800;
// Cultural Origin grants Language (origin) 4 for free (p.41/45, 89).
export const CPRED_ORIGIN_LANGUAGE_LEVEL = 4;
export const CPRED_CULTURAL_ORIGINS: { region: string; languages: string[] }[] = [
  // CPR p.45, Cultural Origins table.
  { region: 'North American', languages: ['Chinese', 'Cree', 'Creole', 'English', 'French', 'Navajo', 'Spanish'] },
  { region: 'South/Central American', languages: ['Creole', 'English', 'German', 'Guarani', 'Mayan', 'Portuguese', 'Quechua', 'Spanish'] },
  { region: 'Western European', languages: ['Dutch', 'English', 'French', 'German', 'Italian', 'Norwegian', 'Portuguese', 'Spanish'] },
  { region: 'Eastern European', languages: ['English', 'Finnish', 'Polish', 'Romanian', 'Russian', 'Ukrainian'] },
  { region: 'Middle Eastern/North African', languages: ['Arabic', 'Berber', 'English', 'Farsi', 'French', 'Hebrew', 'Turkish'] },
  { region: 'Sub-Saharan African', languages: ['Arabic', 'English', 'French', 'Hausa', 'Lingala', 'Oromo', 'Portuguese', 'Swahili', 'Twi', 'Yoruba'] },
  { region: 'South Asian', languages: ['Bengali', 'Dari', 'English', 'Hindi', 'Nepali', 'Sinhalese', 'Tamil', 'Urdu'] },
  { region: 'South East Asian', languages: ['Arabic', 'Burmese', 'English', 'Filipino', 'Hindi', 'Indonesian', 'Khmer', 'Malay', 'Vietnamese'] },
  { region: 'East Asian', languages: ['Cantonese Chinese', 'English', 'Japanese', 'Korean', 'Mandarin Chinese', 'Mongolian'] },
  { region: 'Oceania/Pacific Islander', languages: ['English', 'French', 'Hawaiian', 'Maori', 'Pama-Nyungan', 'Tahitian'] },
];
export const CPRED_LANGUAGES: string[] = [...new Set(CPRED_CULTURAL_ORIGINS.flatMap((o) => o.languages))].sort();
export const languageSkillName = (language: string): string => `Language (${String(language || '').trim()})`;

export const CPRED_STORY_TEMPLATE = 'ORIGEM:\\n\\nOBJETIVO:\\n\\nDIVIDA OU PROBLEMA:\\n\\nALIADOS:\\n\\nINIMIGOS:\\n\\nESTILO / ASSINATURA:\\n';

export interface ArmorSlot {
  name: string;
  sp: number;
  penalty: number;
}

export interface CharacterArmor {
  head: ArmorSlot;
  body: ArmorSlot;
}

export const CPRED_DEFAULT_ARMOR: CharacterArmor = {
  head: { name: 'Light Armorjack', sp: 11, penalty: 0 },
  body: { name: 'Light Armorjack', sp: 11, penalty: 0 },
};

export const CPRED_DEFAULT_SKILL_NAMES = new Set([
  'Athletics', 'Brawling', 'Concentration', 'Conversation', 'Education', 'Evasion', 'First Aid',
  'Human Perception', 'Language (Streetslang)', 'Local Expert (Your Home)', 'Perception', 'Persuasion', 'Stealth',
]);

export type SkillRow = [string, string] | [string, string, boolean];

export let CPRED_SKILL_ROWS: SkillRow[] = skillRowsJson as SkillRow[];
export const CPRED_SKILL_ALIASES: Record<string, string> = { 'Local Expert (Home)': 'Local Expert (Your Home)', 'Melee Weapons': 'Melee Weapon' };

// Player-facing "what is this skill for" blurbs, keyed by the catalog name in
// data/seed/skills.json. Reference text only — nothing here feeds a roll.
export const CPRED_SKILL_DESCRIPTIONS: Record<string, string> = skillDescriptionsJson as Record<string, string>;

// Characters carry skills the catalog does not list by name: the language and
// local-expert families are parameterized (`Language (Portuguese)`), so they
// fall back to the family blurb instead of showing nothing.
const SKILL_DESCRIPTION_FAMILIES: { test: RegExp; text: string }[] = [
  { test: /^Language\s*\(/i, text: 'Idioma. Usada para falar, ler e escrever nessa lingua especifica, entender giria local e sotaques, e traduzir conversas ou documentos.' },
  { test: /^Local Expert\s*\(/i, text: 'Especialista local. Conhecimento profundo sobre essa regiao: pontos de interesse, rotas seguras, gangues locais e quem realmente manda no pedaco.' },
];

export interface DefaultSkill {
  id: string;
  name: string;
  stat: string;
  level: number;
  baseLevel: number;
  bonus: number;
  defaultSkill: boolean;
  difficult: boolean;
}

const buildDefaultSkills = (rows: SkillRow[]): DefaultSkill[] => rows.map((row, idx) => {
  const name = row[0];
  const defaultSkill = CPRED_DEFAULT_SKILL_NAMES.has(name);
  return { id: 'skill-' + idx, name, stat: row[1], level: defaultSkill ? 2 : 0, baseLevel: defaultSkill ? 2 : 0, bonus: 0, defaultSkill, difficult: !!row[2] };
});

export let CPRED_DEFAULT_SKILLS: DefaultSkill[] = buildDefaultSkills(CPRED_SKILL_ROWS);

// Reassigning an imported binding is illegal in ES modules, but reassigning an
// exported `let` from inside its own module updates the live binding for every
// importer. The UI calls this when the backend ships an updated skill table.
export function setSkillRows(rows: SkillRow[]): void {
  CPRED_SKILL_ROWS = rows;
  CPRED_DEFAULT_SKILLS = buildDefaultSkills(rows);
}

// Resolves the blurb for any skill name a sheet may carry, aliases and the
// parameterized families included. Unknown custom skills return ''.
export function skillDescription(name: unknown): string {
  const raw = String(name || '').trim();
  const canonical = CPRED_SKILL_ALIASES[raw] || raw;
  const exact = CPRED_SKILL_DESCRIPTIONS[canonical];
  if (exact) return exact;
  const family = SKILL_DESCRIPTION_FAMILIES.find((entry) => entry.test.test(canonical));
  return family ? family.text : '';
}
