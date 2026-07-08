// Character domain constants: stats, skills, default armor, and the
// critical-injury catalog. Pure reference data shared by the character
// domain functions and the UI layer. data/seed/critical-injuries.json and
// data/seed/skills.json are the source of truth for the two catalogs below
// (see @seed alias in vite.config.js).
import criticalInjuriesJson from '@seed/critical-injuries.json';
import skillRowsJson from '@seed/skills.json';

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
export const CPRED_ARMOR_PENALTY_STATS: CpredStat[] = ['REF', 'DEX', 'MOVE'];
export const CPRED_ROLES = ['Rockerboy', 'Solo', 'Netrunner', 'Tech', 'Medtech', 'Media', 'Exec', 'Lawman', 'Fixer', 'Nomad'];

export const CPRED_SKILL_BUDGET = 60;

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
