import { describe, it, expect } from 'vitest';
import {
  WIZARD_STEPS,
  canAdvance,
  changeStat,
  createWizardDraft,
  furthestReachableStep,
  nextStep,
  previousStep,
  setOriginLanguage,
  rollStat,
  rollStats,
  setSkillLevel,
  setStat,
  setStatMethod,
  skillBudgetView,
  skillFloor,
  skillPointsRemaining,
  skillPointsSpent,
  skillStepCost,
  statBounds,
  statChangeMessage,
  statMethodGuide,
  statPointsRemaining,
  statPointsSpent,
  statRerollCount,
  statRollCount,
  unrolledStats,
  validateStep,
  wizardProgress,
} from '../../../src/domain/character/characterWizard.ts';
import { CPRED_CULTURAL_ORIGINS, CPRED_LANGUAGES, CPRED_SKILL_BUDGET, CPRED_STAT_BUDGET } from '../../../src/domain/character/constants.ts';

// Ten cheap, untrained skills at the creation cap of 6 spend exactly 60.
function spendAll(draft) {
  const cheap = draft.skills.filter((skill) => !skill.difficult && skillFloor(skill) === 0).slice(0, 10);
  cheap.forEach((skill) => { draft = setSkillLevel(draft, skill.id, 6); });
  return draft;
}

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

  it('teto 6 na criacao, mesmo com orcamento sobrando', () => {
    const draft = createWizardDraft();
    const target = draft.skills.find((skill) => !skill.difficult && skillFloor(skill) === 0);
    expect(setSkillLevel(draft, target.id, 10).skills.find((s) => s.id === target.id).level).toBe(6);
    expect(setSkillLevel(draft, target.id, 7).skills.find((s) => s.id === target.id).level).toBe(6);
  });

  it('pericia treinada nunca fica em 1: sobe 0 -> 2 e desce 2 -> 0', () => {
    const draft = createWizardDraft();
    const target = draft.skills.find((skill) => !skill.difficult && skillFloor(skill) === 0);
    const up = setSkillLevel(draft, target.id, 1);
    expect(up.skills.find((s) => s.id === target.id).level).toBe(2);
    expect(skillPointsSpent(up.skills)).toBe(2);
    const down = setSkillLevel(up, target.id, 1);
    expect(down.skills.find((s) => s.id === target.id).level).toBe(0);
  });

  it('com 1 ponto sobrando nao treina pericia nova (precisaria de 2)', () => {
    let draft = spendAll(createWizardDraft());
    const trained = draft.skills.find((s) => !s.difficult && skillFloor(s) === 0 && s.level === 6);
    draft = setSkillLevel(draft, trained.id, 5); // libera 1 ponto
    expect(skillPointsRemaining(draft.skills)).toBe(1);
    const fresh = draft.skills.find((s) => !s.difficult && skillFloor(s) === 0 && s.level === 0);
    const next = setSkillLevel(draft, fresh.id, 2);
    expect(next.skills.find((s) => s.id === fresh.id).level).toBe(0);
  });

  it('mostra o orcamento como no livro: 86 com 26 nas basicas', () => {
    expect(skillBudgetView(createWizardDraft().skills)).toEqual({ total: 86, basic: 26, spent: 26, remaining: 60 });
    expect(skillBudgetView(spendAll(createWizardDraft()).skills)).toEqual({ total: 86, basic: 26, spent: 86, remaining: 0 });
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
    const lowered = setSkillLevel(raised, target.id, 2);
    expect(skillPointsRemaining(lowered.skills)).toBe(CPRED_SKILL_BUDGET - 2);
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
    expect(furthestReachableStep(createWizardDraft({ name: 'V' }))).toBe('identity'); // falta idioma
    const named = createWizardDraft({ name: 'V', originLanguage: 'Japanese' });
    expect(furthestReachableStep(named)).toBe('skills');
  });

  it('a revisao acumula as pendencias de todos os passos', () => {
    const result = validateStep('review', createWizardDraft({ system: 'dnd5e' }));
    expect(result.ok).toBe(false);
    expect(result.errors.length).toBeGreaterThanOrEqual(3);
  });

  it('a revisao fecha quando tudo esta resolvido', () => {
    const draft = spendAll(createWizardDraft({ name: 'V Angel', originLanguage: 'Portuguese' }));
    expect(skillPointsRemaining(draft.skills)).toBe(0);
    expect(canAdvance('review', draft)).toBe(true);
  });
});

describe('progresso para a UI', () => {
  it('descreve o passo com indice, total e pendencias', () => {
    const progress = wizardProgress('skills', createWizardDraft({ name: 'V', originLanguage: 'Spanish' }));
    expect(progress).toMatchObject({ step: 'skills', index: 3, total: WIZARD_STEPS.length, isLast: false, canAdvance: false });
    expect(progress.errors[0]).toContain('Faltam 60 pontos de perícia');
  });

  it('marca o ultimo passo', () => {
    expect(wizardProgress('review', createWizardDraft()).isLast).toBe(true);
  });
});

describe('metodo dos atributos', () => {
  const seq = (faces) => { let i = 0; return () => (faces[i++ % faces.length] - 1) / 10 + 0.001; };

  it('nasce distribuindo pontos', () => {
    expect(createWizardDraft().statMethod).toBe('points');
    expect(statRollCount(createWizardDraft())).toBe(0);
  });

  it('LUCK tambem para em 8 na criacao', () => {
    expect(statBounds('LUCK').max).toBe(8);
    let draft = setStat(createWizardDraft(), 'EMP', 2);
    draft = setStat(draft, 'INT', 2); // libera 6 pontos
    const change = changeStat(draft, 'LUCK', 9);
    expect(change.value).toBe(8);
    expect(change.reason).toBe('max');
  });

  it('explica quando o atributo bate no teto de 8', () => {
    let draft = setStat(createWizardDraft(), 'EMP', 2);
    draft = setStat(draft, 'INT', 8);
    const change = changeStat(draft, 'INT', 9);
    expect(change.reason).toBe('max');
    expect(change.value).toBe(8);
    expect(statChangeMessage('INT', change.reason)).toContain('8');
  });

  it('explica quando o orcamento acabou', () => {
    const change = changeStat(createWizardDraft(), 'INT', 7);
    expect(change.reason).toBe('budget');
    expect(statChangeMessage('INT', change.reason)).toContain('reduza outro atributo');
  });

  it('explica o minimo e nao explica nada numa mudanca valida', () => {
    expect(changeStat(createWizardDraft(), 'EMP', 1).reason).toBe('min');
    expect(changeStat(createWizardDraft(), 'EMP', 3).reason).toBe(null);
  });

  it('rolar 1d10 por atributo reroda o 1 e ignora o orcamento', () => {
    const rolled = rollStats(createWizardDraft(), seq([1, 10, 1, 9, 8, 7, 6, 5, 4, 3, 2, 10]));
    expect(rolled.statMethod).toBe('roll');
    expect(statRollCount(rolled)).toBe(10);
    expect(statRerollCount(rolled)).toBe(0);
    expect(unrolledStats(rolled)).toEqual([]);
    expect(rolled.base.INT).toBe(10); // o 1 foi rerolado
    expect(Object.values(rolled.base).every((v) => v >= 2 && v <= 10)).toBe(true);
    expect(canAdvance('attributes', rolled)).toBe(true);
    expect(statPointsSpent(rolled.base)).not.toBe(CPRED_STAT_BUDGET);
  });

  it('conta as rolagens repetidas pro GM ver', () => {
    const twice = rollStats(rollStats(createWizardDraft(), seq([5])), seq([6]));
    expect(statRollCount(twice)).toBe(20);
    expect(statRerollCount(twice)).toBe(10);
  });

  it('rola um atributo so, e a rerolagem dele fica contada', () => {
    let draft = rollStats(createWizardDraft(), seq([5]));
    draft = rollStat(draft, 'INT', seq([9]));
    expect(draft.base.INT).toBe(9);
    expect(draft.base.REF).toBe(5);
    expect(draft.statRolled.INT).toBe(2);
    expect(statRerollCount(draft)).toBe(1);
  });

  it('rolar atributo a atributo tambem fecha o passo, e aponta o que falta', () => {
    let draft = setStatMethod(createWizardDraft(), 'roll');
    draft = rollStat(draft, 'INT', seq([7]));
    expect(validateStep('attributes', draft).errors[0]).toContain('Falta rolar: REF');
    expect(unrolledStats(draft)).toHaveLength(9);
    ['REF', 'DEX', 'TECH', 'COOL', 'WILL', 'LUCK', 'MOVE', 'BODY', 'EMP'].forEach((k) => { draft = rollStat(draft, k, seq([4])); });
    expect(canAdvance('attributes', draft)).toBe(true);
    expect(statRerollCount(draft)).toBe(0);
  });

  it('ignora rolagem de chave que nao e atributo', () => {
    const draft = createWizardDraft();
    expect(rollStat(draft, 'CHARISMA', seq([5]))).toBe(draft);
  });

  it('atributo rolado fica travado contra edicao manual', () => {
    const rolled = rollStats(createWizardDraft(), seq([5]));
    const change = changeStat(rolled, 'INT', 8);
    expect(change.reason).toBe('locked');
    expect(change.draft.base.INT).toBe(5);
    expect(statBounds('INT', 'roll').max).toBe(10);
  });

  it('escolher dados sem rolar ainda bloqueia o passo', () => {
    const draft = setStatMethod(createWizardDraft(), 'roll');
    expect(validateStep('attributes', draft).errors[0]).toContain('Role os atributos');
  });

  it('voltar para pontos restaura a distribuicao padrao de 62', () => {
    const rolled = rollStats(createWizardDraft(), seq([10]));
    const back = setStatMethod(rolled, 'points');
    expect(back.statMethod).toBe('points');
    expect(statRollCount(back)).toBe(0);
    expect(statPointsRemaining(back.base)).toBe(0);
  });

  it('descreve cada metodo para a UI', () => {
    expect(statMethodGuide('points')).toContain('62');
    expect(statMethodGuide('roll')).toContain('1d10');
  });
});

describe('idioma de origem', () => {
  it('a identidade exige o idioma', () => {
    expect(validateStep('identity', createWizardDraft({ name: 'V' })).errors).toContain('Escolha o idioma de origem (Cultural Origin).');
    expect(canAdvance('identity', createWizardDraft({ name: 'V', originLanguage: 'Japanese' }))).toBe(true);
  });

  it('da Language (X) 4 de graca, fora dos 60 livres', () => {
    const draft = setOriginLanguage(createWizardDraft(), 'Japanese');
    const skill = draft.skills.find((s) => s.name === 'Language (Japanese)');
    expect(skill).toMatchObject({ level: 4, baseLevel: 4, origin: true, stat: 'INT', difficult: false });
    expect(skillFloor(skill)).toBe(4);
    expect(skillPointsSpent(draft.skills)).toBe(0);
    expect(skillPointsRemaining(draft.skills)).toBe(CPRED_SKILL_BUDGET);
  });

  it('trocar o idioma substitui a pericia gratis; vazio remove', () => {
    let draft = setOriginLanguage(createWizardDraft(), 'Japanese');
    draft = setOriginLanguage(draft, 'Spanish');
    expect(draft.skills.filter((s) => s.origin).map((s) => s.name)).toEqual(['Language (Spanish)']);
    draft = setOriginLanguage(draft, '');
    expect(draft.skills.some((s) => s.origin)).toBe(false);
    expect(draft.originLanguage).toBe('');
  });

  it('recusa idioma fora da lista do livro', () => {
    const draft = createWizardDraft();
    expect(setOriginLanguage(draft, 'Klingon')).toBe(draft);
  });

  it('subir o idioma de origem acima de 4 custa pontos; nao desce abaixo de 4', () => {
    let draft = setOriginLanguage(createWizardDraft(), 'Japanese');
    const skill = draft.skills.find((s) => s.origin);
    draft = setSkillLevel(draft, skill.id, 6);
    expect(skillPointsSpent(draft.skills)).toBe(2);
    draft = setSkillLevel(draft, skill.id, 1);
    expect(draft.skills.find((s) => s.origin).level).toBe(4);
  });
});

describe('tabela de Cultural Origins (CPR p.45)', () => {
  it('tem as 10 regioes do livro com os idiomas exatos', () => {
    expect(Object.fromEntries(CPRED_CULTURAL_ORIGINS.map((o) => [o.region, o.languages]))).toEqual({
      'North American': ['Chinese', 'Cree', 'Creole', 'English', 'French', 'Navajo', 'Spanish'],
      'South/Central American': ['Creole', 'English', 'German', 'Guarani', 'Mayan', 'Portuguese', 'Quechua', 'Spanish'],
      'Western European': ['Dutch', 'English', 'French', 'German', 'Italian', 'Norwegian', 'Portuguese', 'Spanish'],
      'Eastern European': ['English', 'Finnish', 'Polish', 'Romanian', 'Russian', 'Ukrainian'],
      'Middle Eastern/North African': ['Arabic', 'Berber', 'English', 'Farsi', 'French', 'Hebrew', 'Turkish'],
      'Sub-Saharan African': ['Arabic', 'English', 'French', 'Hausa', 'Lingala', 'Oromo', 'Portuguese', 'Swahili', 'Twi', 'Yoruba'],
      'South Asian': ['Bengali', 'Dari', 'English', 'Hindi', 'Nepali', 'Sinhalese', 'Tamil', 'Urdu'],
      'South East Asian': ['Arabic', 'Burmese', 'English', 'Filipino', 'Hindi', 'Indonesian', 'Khmer', 'Malay', 'Vietnamese'],
      'East Asian': ['Cantonese Chinese', 'English', 'Japanese', 'Korean', 'Mandarin Chinese', 'Mongolian'],
      'Oceania/Pacific Islander': ['English', 'French', 'Hawaiian', 'Maori', 'Pama-Nyungan', 'Tahitian'],
    });
  });

  it('a lista plana nao repete idioma e nao tem os nomes antigos', () => {
    expect(new Set(CPRED_LANGUAGES).size).toBe(CPRED_LANGUAGES.length);
    expect(CPRED_LANGUAGES).not.toContain('Malayan');
    expect(CPRED_LANGUAGES).not.toContain('Tagalog');
    expect(CPRED_LANGUAGES).toContain('Tahitian');
  });
});
