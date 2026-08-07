import { describe, it, expect } from 'vitest';
import {
  WIZARD_STEPS,
  canAdvance,
  createWizardDraft,
  furthestReachableStep,
  nextStep,
  previousStep,
  setSkillLevel,
  setStat,
  skillFloor,
  skillPointsRemaining,
  skillPointsSpent,
  skillStepCost,
  statBounds,
  statPointsRemaining,
  statPointsSpent,
  validateStep,
  wizardProgress,
} from '../../../src/domain/character/characterWizard.ts';
import { CPRED_SKILL_BUDGET, CPRED_STAT_BUDGET } from '../../../src/domain/character/constants.ts';

describe('rascunho inicial', () => {
  it('nasce com os atributos ja fechados no orcamento', () => {
    const draft = createWizardDraft();
    expect(statPointsSpent(draft.base)).toBe(CPRED_STAT_BUDGET);
    expect(statPointsRemaining(draft.base)).toBe(0);
    expect(canAdvance('attributes', draft)).toBe(true);
  });

  it('nasce com as pericias zeradas — o muro real do jogador novo', () => {
    const draft = createWizardDraft();
    expect(skillPointsSpent(draft.skills)).toBe(0);
    expect(skillPointsRemaining(draft.skills)).toBe(CPRED_SKILL_BUDGET);
    expect(canAdvance('skills', draft)).toBe(false);
  });

  it('nasce sem nome, entao a identidade bloqueia', () => {
    expect(validateStep('identity', createWizardDraft()).errors).toContain('Dê um nome ao seu operativo.');
  });

  it('nasce em Cyberpunk RED, que e o unico sistema jogavel', () => {
    expect(canAdvance('system', createWizardDraft())).toBe(true);
  });
});

describe('passo de sistema', () => {
  it('recusa sistema nao implementado com o nome dele na mensagem', () => {
    const result = validateStep('system', createWizardDraft({ system: 'dnd5e' }));
    expect(result.ok).toBe(false);
    expect(result.errors[0]).toContain('D&D 5e');
  });

  it('recusa o sistema parcialmente implementado', () => {
    expect(canAdvance('system', createWizardDraft({ system: 'other' }))).toBe(false);
  });

  it('trata id desconhecido como "outro sistema" e recusa', () => {
    expect(canAdvance('system', createWizardDraft({ system: 'pathfinder' }))).toBe(false);
  });
});

describe('atributos', () => {
  it('nao deixa passar do orcamento ao subir um atributo', () => {
    const draft = createWizardDraft();
    const next = setStat(draft, 'INT', 8);
    // O orcamento ja estava fechado, entao INT nao pode subir sozinho.
    expect(next.base.INT).toBe(draft.base.INT);
    expect(statPointsRemaining(next.base)).toBe(0);
  });

  it('permite realocar depois de liberar pontos', () => {
    let draft = createWizardDraft();
    draft = setStat(draft, 'EMP', 2);
    expect(statPointsRemaining(draft.base)).toBe(2);
    draft = setStat(draft, 'INT', 8);
    expect(draft.base.INT).toBe(8);
    expect(statPointsRemaining(draft.base)).toBe(0);
  });

  it('respeita o minimo do sistema', () => {
    const draft = setStat(createWizardDraft(), 'EMP', -5);
    expect(draft.base.EMP).toBe(statBounds('EMP').min);
  });

  it('ignora chave que nao e atributo', () => {
    const draft = createWizardDraft();
    expect(setStat(draft, 'CHARISMA', 9)).toBe(draft);
  });

  it('aponta quantos pontos faltam', () => {
    const draft = setStat(createWizardDraft(), 'BODY', 2);
    expect(validateStep('attributes', draft).errors[0]).toContain('Faltam 6 pontos');
  });
});

describe('pericias', () => {
  it('cobra dobrado por pericia dificil', () => {
    expect(skillStepCost({ difficult: true })).toBe(2);
    expect(skillStepCost({ difficult: false })).toBe(1);
  });

  it('nao deixa gastar mais que o orcamento', () => {
    const draft = createWizardDraft();
    const target = draft.skills.find((skill) => !skill.difficult);
    const next = setSkillLevel(draft, target.id, 10);
    expect(skillPointsSpent(next.skills)).toBeLessThanOrEqual(CPRED_SKILL_BUDGET);
  });

  it('desconta o custo dobrado ao limitar uma pericia dificil', () => {
    const draft = createWizardDraft();
    const hard = draft.skills.find((skill) => skill.difficult);
    if (!hard) return; // catalogo sem pericia dificil: nada a provar
    const next = setSkillLevel(draft, hard.id, 10);
    expect(skillPointsSpent(next.skills)).toBe(next.skills.find((s) => s.id === hard.id).level * 2);
  });

  it('permite baixar uma pericia e devolver os pontos', () => {
    const draft = createWizardDraft();
    const target = draft.skills.find((skill) => !skill.difficult && skillFloor(skill) === 0);
    const raised = setSkillLevel(draft, target.id, 4);
    expect(skillPointsRemaining(raised.skills)).toBe(CPRED_SKILL_BUDGET - 4);
    const lowered = setSkillLevel(raised, target.id, 1);
    expect(skillPointsRemaining(lowered.skills)).toBe(CPRED_SKILL_BUDGET - 1);
  });

  it('nao cobra os niveis gratuitos das pericias default', () => {
    const draft = createWizardDraft();
    const withFloor = draft.skills.find((skill) => skillFloor(skill) > 0);
    expect(withFloor.level).toBe(skillFloor(withFloor));
    // Subir 2 acima do piso custa 2 (ou 4 se dificil), nunca o nivel cheio.
    const raised = setSkillLevel(draft, withFloor.id, skillFloor(withFloor) + 2);
    expect(skillPointsSpent(raised.skills)).toBe(2 * skillStepCost(withFloor));
  });

  it('nao deixa vender de volta os niveis gratuitos', () => {
    const draft = createWizardDraft();
    const withFloor = draft.skills.find((skill) => skillFloor(skill) > 0);
    const lowered = setSkillLevel(draft, withFloor.id, 0);
    expect(lowered.skills.find((s) => s.id === withFloor.id).level).toBe(skillFloor(withFloor));
    expect(skillPointsRemaining(lowered.skills)).toBe(CPRED_SKILL_BUDGET);
  });

  it('ignora pericia inexistente', () => {
    const draft = createWizardDraft();
    expect(setSkillLevel(draft, 'nao-existe', 5)).toBe(draft);
  });
});

describe('navegacao', () => {
  it('avanca e volta sem sair dos limites', () => {
    expect(nextStep('system')).toBe('identity');
    expect(previousStep('identity')).toBe('system');
    expect(previousStep('system')).toBe('system');
    expect(nextStep('review')).toBe('review');
  });

  it('para no primeiro passo pendente', () => {
    expect(furthestReachableStep(createWizardDraft())).toBe('identity');
    const named = createWizardDraft({ name: 'V' });
    expect(furthestReachableStep(named)).toBe('skills');
  });

  it('a revisao acumula as pendencias de todos os passos', () => {
    const result = validateStep('review', createWizardDraft({ system: 'dnd5e' }));
    expect(result.ok).toBe(false);
    expect(result.errors.length).toBeGreaterThanOrEqual(3);
  });

  it('a revisao fecha quando tudo esta resolvido', () => {
    let draft = createWizardDraft({ name: 'V Angel' });
    // Gasta o orcamento inteiro em pericias baratas e sem nivel gratuito, pra
    // que 1 ponto de orcamento seja exatamente 1 nivel.
    const cheap = draft.skills.filter((skill) => !skill.difficult && skillFloor(skill) === 0).slice(0, 6);
    cheap.forEach((skill) => { draft = setSkillLevel(draft, skill.id, 10); });
    expect(skillPointsRemaining(draft.skills)).toBe(0);
    expect(canAdvance('review', draft)).toBe(true);
  });
});

describe('progresso para a UI', () => {
  it('descreve o passo com indice, total e pendencias', () => {
    const progress = wizardProgress('skills', createWizardDraft({ name: 'V' }));
    expect(progress).toMatchObject({ step: 'skills', index: 3, total: WIZARD_STEPS.length, isLast: false, canAdvance: false });
    expect(progress.errors[0]).toContain('Faltam 60 pontos de perícia');
  });

  it('marca o ultimo passo', () => {
    expect(wizardProgress('review', createWizardDraft()).isLast).toBe(true);
  });
});
