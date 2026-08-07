import { describe, it, expect } from 'vitest';
import {
  filterSkills,
  isTrained,
  matchesSkillQuery,
  splitIntoColumns,
  summarizeSkillFilter,
} from '../../../src/domain/character/skillSearch.ts';

const skills = [
  { name: 'Handgun', stat: 'REF', level: 4, baseLevel: 0, total: 12 },
  { name: 'Athletics', stat: 'DEX', level: 2, baseLevel: 2, total: 8 },
  { name: 'Perception', stat: 'INT', level: 6, baseLevel: 2, total: 12 },
  { name: 'Pilot Air Vehicle', stat: 'REF', level: 0, baseLevel: 0, total: 8 },
  { name: 'Conversação', stat: 'EMP', level: 3, baseLevel: 2, total: 7 },
];

describe('treinada', () => {
  it('so conta nivel acima do piso gratuito', () => {
    expect(isTrained({ level: 4, baseLevel: 0 })).toBe(true);
    expect(isTrained({ level: 2, baseLevel: 2 })).toBe(false);
    expect(isTrained({ level: 6, baseLevel: 2 })).toBe(true);
    expect(isTrained({ level: 0 })).toBe(false);
  });
});

describe('busca', () => {
  it('casa por trecho do nome, sem diferenciar caixa', () => {
    expect(matchesSkillQuery(skills[0], 'hand')).toBe(true);
    expect(matchesSkillQuery(skills[0], 'GUN')).toBe(true);
    expect(matchesSkillQuery(skills[0], 'stealth')).toBe(false);
  });

  it('casa pelo atributo exato, nao por trecho dele', () => {
    expect(matchesSkillQuery(skills[0], 'REF')).toBe(true);
    expect(matchesSkillQuery(skills[0], 'ref')).toBe(true);
    // "RE" nao deve arrastar todas as pericias de REF.
    expect(matchesSkillQuery(skills[0], 're')).toBe(false);
  });

  it('ignora acentos nos dois sentidos', () => {
    expect(matchesSkillQuery(skills[4], 'conversacao')).toBe(true);
    expect(matchesSkillQuery({ ...skills[4], name: 'Conversacao' }, 'conversação')).toBe(true);
  });

  it('busca vazia nao filtra nada', () => {
    expect(filterSkills(skills, { query: '   ' })).toHaveLength(skills.length);
    expect(filterSkills(skills)).toHaveLength(skills.length);
  });
});

describe('filtro combinado', () => {
  it('cruza busca com "so treinadas"', () => {
    const result = filterSkills(skills, { query: 'REF', onlyTrained: true });
    expect(result.map((s) => s.name)).toEqual(['Handgun']); // Pilot Air Vehicle tem nivel 0
  });

  it('so treinadas descarta as que estao no piso', () => {
    expect(filterSkills(skills, { onlyTrained: true }).map((s) => s.name))
      .toEqual(['Handgun', 'Perception', 'Conversação']);
  });

  it('aguenta entrada invalida', () => {
    expect(filterSkills(null)).toEqual([]);
    expect(filterSkills(undefined, { query: 'x' })).toEqual([]);
  });
});

describe('resumo para a UI', () => {
  it('conta visiveis, total e treinadas', () => {
    const visible = filterSkills(skills, { query: 'REF' });
    expect(summarizeSkillFilter(skills, visible, { query: 'REF' })).toMatchObject({
      visible: 2, total: 5, trained: 3, filtering: true, empty: false,
    });
  });

  it('nao marca "filtrando" quando nada foi pedido', () => {
    expect(summarizeSkillFilter(skills, skills, {}).filtering).toBe(false);
    expect(summarizeSkillFilter(skills, skills, { query: '  ' }).filtering).toBe(false);
  });

  it('marca vazio so quando o filtro e que zerou a lista', () => {
    expect(summarizeSkillFilter(skills, [], { query: 'zzz' }).empty).toBe(true);
    // Ficha sem pericia nenhuma e lista vazia, mas nao e "filtro sem resultado".
    expect(summarizeSkillFilter([], [], {}).empty).toBe(false);
  });
});

describe('colunas', () => {
  it('mantem a leitura vertical e nao perde linhas', () => {
    const [a, b] = splitIntoColumns([1, 2, 3, 4, 5]);
    expect(a.rows).toEqual([1, 2, 3]);
    expect(b.rows).toEqual([4, 5]);
  });

  it('lida com lista vazia sem quebrar o grid', () => {
    const cols = splitIntoColumns([]);
    expect(cols).toHaveLength(2);
    expect(cols.every((c) => c.rows.length === 0)).toBe(true);
  });
});
