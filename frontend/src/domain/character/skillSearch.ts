// Pure search and filtering rules for the character sheet's skill list. Keeping
// them outside the DOM makes the visibility contract independently testable.

export interface SearchableSkill {
  name: string;
  stat: string;
  level: number;
  baseLevel?: number;
  total: number;
  [extra: string]: unknown;
}

export interface SkillFilter {
  query?: string;
  /** Include only skills raised above their free base level. */
  onlyTrained?: boolean;
}

/** Fold diacritics so accented and unaccented searches match. */
function fold(value: unknown): string {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

export function isTrained(skill: Pick<SearchableSkill, 'level' | 'baseLevel'>): boolean {
  return Number(skill.level || 0) > Number(skill.baseLevel || 0);
}

export function matchesSkillQuery(skill: SearchableSkill, query: unknown): boolean {
  const term = fold(query);
  if (!term) return true;
  // Stat codes are searchable because they are visible alongside each skill.
  return fold(skill.name).includes(term) || fold(skill.stat) === term;
}

export function filterSkills(skills: SearchableSkill[], filter: SkillFilter = {}): SearchableSkill[] {
  const list = Array.isArray(skills) ? skills : [];
  return list.filter((skill) => {
    if (filter.onlyTrained && !isTrained(skill)) return false;
    return matchesSkillQuery(skill, filter.query);
  });
}

export interface SkillFilterSummary {
  visible: number;
  total: number;
  trained: number;
  /** Whether any filter is active and the UI should offer a clear action. */
  filtering: boolean;
  empty: boolean;
}

export function summarizeSkillFilter(
  all: SearchableSkill[],
  visible: SearchableSkill[],
  filter: SkillFilter = {},
): SkillFilterSummary {
  const total = Array.isArray(all) ? all.length : 0;
  const filtering = Boolean(fold(filter.query) || filter.onlyTrained);
  return {
    visible: Array.isArray(visible) ? visible.length : 0,
    total,
    trained: (Array.isArray(all) ? all : []).filter(isTrained).length,
    filtering,
    empty: filtering && (!visible || visible.length === 0),
  };
}

/**
 * Split rows into columns while preserving vertical reading order.
 */
export function splitIntoColumns<T>(rows: T[], columns = 2): { rows: T[] }[] {
  const list = Array.isArray(rows) ? rows : [];
  const perColumn = Math.ceil(list.length / columns);
  return Array.from({ length: columns }, (_, index) => ({
    rows: list.slice(index * perColumn, (index + 1) * perColumn),
  }));
}
