import { describe, expect, it } from 'vitest';

import {
  CPRED_SKILL_DESCRIPTIONS,
  CPRED_SKILL_ROWS,
  skillDescription,
} from '../../../src/domain/character/constants.ts';

describe('domain/character skill descriptions', () => {
  it('covers every skill in the catalog and nothing else', () => {
    const catalog = CPRED_SKILL_ROWS.map(row => row[0]).sort();
    expect(Object.keys(CPRED_SKILL_DESCRIPTIONS).sort()).toEqual(catalog);
  });

  it('resolves aliases to the canonical blurb', () => {
    expect(skillDescription('Melee Weapons')).toBe(CPRED_SKILL_DESCRIPTIONS['Melee Weapon']);
    expect(skillDescription('Local Expert (Home)')).toBe(CPRED_SKILL_DESCRIPTIONS['Local Expert (Your Home)']);
  });

  it('falls back to the family blurb for parameterized skills', () => {
    expect(skillDescription('Language (Portuguese)')).toMatch(/^Idioma\./);
    expect(skillDescription('Local Expert (Watson)')).toMatch(/^Especialista local\./);
  });

  it('returns an empty string for skills it does not know', () => {
    expect(skillDescription('Homebrew Nonsense')).toBe('');
    expect(skillDescription(null)).toBe('');
  });
});
