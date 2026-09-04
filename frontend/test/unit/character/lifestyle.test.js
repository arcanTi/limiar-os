import { describe, it, expect } from 'vitest';
import {
  CPRED_LIFESTYLES,
  createLifestyle,
  defaultLifestyleFor,
  fromPreset,
  lifestyleRecord,
  lifestyleSummary,
  setLifestyleField,
} from '../../../src/domain/character/lifestyle.ts';

describe('moradia inicial (CPR p.105)', () => {
  it('todo mundo comeca no Cargo Container com Kibble e um mes de carencia', () => {
    const life = createLifestyle('Solo');
    expect(life).toMatchObject({ id: 'default', housing: 'Cargo Container', food: 'Kibble', monthlyCost: 1100, graceMonths: 1 });
  });

  it('o Exec dorme de graca na Corporacao mas paga o Good Prepak', () => {
    const life = createLifestyle('Exec');
    expect(life.id).toBe('exec');
    expect(life.monthlyCost).toBe(600);
    expect(life.housing).toContain('Corporate Conapt');
  });

  it('o Nomad vive com o pack, e o que a familia cobra fica com a mesa', () => {
    const life = createLifestyle('NOMAD');
    expect(life.id).toBe('nomad');
    expect(life.monthlyCost).toBe(0);
  });

  it('role desconhecido cai no padrao', () => {
    expect(defaultLifestyleFor('Rockerboy')).toBe('default');
    expect(defaultLifestyleFor(null)).toBe('default');
    expect(fromPreset('inexistente').id).toBe('default');
  });

  it('todo preset da a mesma carencia de um mes', () => {
    expect(CPRED_LIFESTYLES.every((preset) => preset.graceMonths === 1)).toBe(true);
  });
});

describe('ajustes de mesa', () => {
  it('mestre escreve moradia e custo proprios', () => {
    let life = fromPreset('custom');
    life = setLifestyleField(life, 'housing', 'Quarto nos fundos do Afterlife');
    life = setLifestyleField(life, 'monthlyCost', '450');
    expect(life).toMatchObject({ housing: 'Quarto nos fundos do Afterlife', monthlyCost: 450 });
  });

  it('custo invalido ou negativo nao passa', () => {
    const life = fromPreset('default');
    expect(setLifestyleField(life, 'monthlyCost', 'abc').monthlyCost).toBe(1100);
    expect(setLifestyleField(life, 'monthlyCost', -50).monthlyCost).toBe(0);
  });

  it('texto longo demais e cortado antes de ir para a ficha', () => {
    const life = setLifestyleField(fromPreset('custom'), 'housing', 'x'.repeat(300));
    expect(life.housing).toHaveLength(120);
  });
});

describe('o que vai para a ficha', () => {
  it('grava carencia e custo, sem inventar data de vencimento', () => {
    const record = lifestyleRecord(createLifestyle('Solo'));
    expect(record).toEqual({
      id: 'default',
      housing: 'Cargo Container',
      food: 'Kibble',
      monthlyCost: 1100,
      graceMonths: 1,
      note: expect.stringContaining('1.100eb'),
    });
    expect(record).not.toHaveProperty('dueDate');
  });

  it('resume em uma linha para a revisao', () => {
    expect(lifestyleSummary(createLifestyle('Solo'))).toBe('Cargo Container · Kibble · 1.100eb/mês (primeiro mês grátis)');
    expect(lifestyleSummary(createLifestyle('Nomad'))).toContain('sem custo mensal fixo');
  });
});
