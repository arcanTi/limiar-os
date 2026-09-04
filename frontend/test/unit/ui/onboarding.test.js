import { describe, it, expect, vi } from 'vitest';
import { buildCharacterPayload, createWizardController, wizardCopy } from '../../../src/ui/views/onboarding.js';
import { createWizardDraft, rollStats, setSkillLevel, skillFloor } from '../../../src/domain/character/characterWizard.ts';

function completeDraft(name = 'V Angel') {
  let draft = createWizardDraft({ name, originLanguage: 'Portuguese' });
  const cheap = draft.skills.filter((s) => !s.difficult && skillFloor(s) === 0).slice(0, 10);
  cheap.forEach((skill) => { draft = setSkillLevel(draft, skill.id, 6); });
  return draft;
}

function fakeApi(overrides = {}) {
  return {
    characters: { createPlayer: vi.fn(async (payload) => ({ ...payload })) },
    campaigns: { join: vi.fn(async () => ({ joined: true })) },
    ...overrides,
  };
}

describe('payload enviado ao backend', () => {
  it('usa o formato do builder, sem rota nova', () => {
    const payload = buildCharacterPayload(completeDraft('v angel'));
    expect(payload.name).toBe('V ANGEL');
    expect(payload.initials).toBe('V ');
    expect(payload.id).toMatch(/^v-angel-/);
    expect(payload.base).toHaveProperty('INT');
    expect(payload.skills.length).toBeGreaterThan(0);
    expect(payload.skills[0]).toHaveProperty('difficult');
  });

  it('gera id utilizavel mesmo com nome so de simbolos', () => {
    expect(buildCharacterPayload(createWizardDraft({ name: '!!!' })).id).toMatch(/^operativo-/);
  });

  it('gera retrato procedural para a ficha nao abrir com PORTRAIT vazio', () => {
    const svgCard = (initials, name, role) => `svg:${initials}|${name}|${role}`;
    const payload = buildCharacterPayload(completeDraft('v angel'), { svgCard });
    expect(payload.portraitUrl).toBe('svg:V |V ANGEL|SOLO');
  });

  it('sem gerador de retrato, nao inventa um campo quebrado', () => {
    expect(buildCharacterPayload(completeDraft()).portraitUrl).toBeUndefined();
  });
});

describe('metodo dos atributos no payload', () => {
  it('declara distribuicao por pontos por padrao', () => {
    expect(buildCharacterPayload(completeDraft()).creation).toEqual({ method: 'points', statRolls: 0, statRerolls: 0, originLanguage: 'Portuguese' });
  });

  it('declara dados e quantas rolagens quando o jogador rolou', () => {
    const rolled = rollStats(rollStats(completeDraft(), () => 0.5), () => 0.5);
    expect(buildCharacterPayload(rolled).creation).toEqual({ method: 'roll', statRolls: 20, statRerolls: 10, originLanguage: 'Portuguese' });
  });

  it('manda o idioma de origem como pericia marcada origin, e so ela', () => {
    const skills = buildCharacterPayload(completeDraft()).skills;
    const flagged = skills.filter((s) => s.origin);
    expect(flagged).toHaveLength(1);
    expect(flagged[0]).toMatchObject({ name: 'Language (Portuguese)', level: 4, origin: true });
    expect(skills.find((s) => s.name === 'Athletics').origin).toBeUndefined();
  });
});

describe('orientacao de atributos no controller', () => {
  it('explica por que o + nao subiu o atributo e limpa ao acertar', () => {
    const controller = createWizardController({ api: fakeApi() });
    controller.handlers.bumpStat('INT', 1); // orcamento fechado
    expect(controller.state.hint).toContain('Sem pontos sobrando');
    controller.handlers.bumpStat('EMP', -1);
    expect(controller.state.hint).toBe('');
  });

  it('avisa o teto de 8 ao digitar acima dele', () => {
    const controller = createWizardController({ api: fakeApi() });
    controller.handlers.setStat('EMP', 2);
    controller.handlers.setStat('INT', 12);
    expect(controller.state.draft.base.INT).toBe(8);
    expect(controller.state.hint).toContain('não passa de 8');
  });

  it('rola os atributos e trava os steppers', () => {
    const controller = createWizardController({ api: fakeApi() });
    controller.handlers.setStatMethod('roll');
    expect(controller.state.draft.statMethod).toBe('roll');
    controller.handlers.rollStats(() => 0.95);
    expect(controller.state.draft.base.BODY).toBe(10);
    controller.handlers.bumpStat('BODY', -1);
    expect(controller.state.draft.base.BODY).toBe(10);
    expect(controller.state.hint).toContain('rolados');
    controller.handlers.rollStat('BODY', () => 0.15);
    expect(controller.state.draft.base.BODY).toBe(2);
    expect(controller.state.draft.statRolled.BODY).toBe(2);
    expect(controller.state.hint).toBe('');
  });

  it('avancar de passo descarta a dica antiga', () => {
    const controller = createWizardController({ api: fakeApi() });
    controller.state.draft = completeDraft();
    controller.state.step = 'attributes';
    controller.handlers.bumpStat('INT', 1);
    expect(controller.state.hint).not.toBe('');
    controller.handlers.next();
    expect(controller.state.hint).toBe('');
  });
});

describe('navegacao do controller', () => {
  it('nao avanca enquanto o passo tem pendencia', () => {
    const controller = createWizardController({ api: fakeApi() });
    expect(controller.handlers.next()).toBe(false);
    expect(controller.state.step).toBe('identity'); // sistema ja valido, avancou 1
    expect(controller.handlers.next()).toBe(false);
    expect(controller.state.step).toBe('identity'); // sem nome, travou
  });

  it('recusa selecionar sistema nao implementado', () => {
    const controller = createWizardController({ api: fakeApi() });
    controller.handlers.selectSystem('dnd5e');
    expect(controller.state.draft.system).toBe('cyberpunk-red');
  });

  it('sinaliza gravacao so no ultimo passo', () => {
    const controller = createWizardController({ api: fakeApi() });
    controller.state.draft = completeDraft();
    controller.state.step = 'review';
    expect(controller.handlers.next()).toBe(true);
  });
});

describe('conclusao', () => {
  it('cria a ficha e entra na campanha de origem', async () => {
    const api = fakeApi();
    const onDone = vi.fn();
    const controller = createWizardController({ api, campaignId: 'mesa-1', onDone });
    controller.state.draft = completeDraft();

    const result = await controller.finish();

    expect(result.ok).toBe(true);
    expect(api.characters.createPlayer).toHaveBeenCalledOnce();
    expect(api.campaigns.join).toHaveBeenCalledWith('mesa-1', expect.stringMatching(/^v-angel-/));
    expect(onDone).toHaveBeenCalledOnce();
  });

  it('nao tenta entrar em campanha quando nao veio de uma', async () => {
    const api = fakeApi();
    const controller = createWizardController({ api });
    controller.state.draft = completeDraft();

    await controller.finish();

    expect(api.characters.createPlayer).toHaveBeenCalledOnce();
    expect(api.campaigns.join).not.toHaveBeenCalled();
  });

  it('expoe a falha da API em vez de fechar em silencio', async () => {
    const api = fakeApi({ characters: { createPlayer: vi.fn(async () => { throw new Error('API 403 /player-characters'); }) } });
    const onDone = vi.fn();
    const controller = createWizardController({ api, onDone });
    controller.state.draft = completeDraft();

    const result = await controller.finish();

    expect(result.ok).toBe(false);
    expect(controller.state.status).toContain('403');
    expect(onDone).not.toHaveBeenCalled();
  });

  it('mantem a ficha criada quando so o join falha, sem duplicar a ficha', async () => {
    const api = fakeApi({ campaigns: { join: vi.fn(async () => { throw new Error('API 403 /join'); }) } });
    const controller = createWizardController({ api, campaignId: 'mesa-1' });
    controller.state.draft = completeDraft();

    const result = await controller.finish();

    expect(result.ok).toBe(false);
    expect(api.characters.createPlayer).toHaveBeenCalledOnce();
    expect(controller.state.status).toContain('403');
  });

  it('ignora clique duplo no botao final', async () => {
    const api = fakeApi();
    const controller = createWizardController({ api });
    controller.state.draft = completeDraft();

    const [first, second] = await Promise.all([controller.finish(), controller.finish()]);

    expect(api.characters.createPlayer).toHaveBeenCalledOnce();
    expect(first.ok !== second.ok).toBe(true);
  });
});

describe('modo novo operativo (jogador ja dentro do app)', () => {
  it('troca o cabecalho e o botao de saida sem mudar os passos', () => {
    const first = wizardCopy('first');
    const again = wizardCopy('new');
    expect(first.kicker).toContain('PRIMEIRO ACESSO');
    expect(first.skipLabel).toBe('Fazer isso depois');
    expect(again.kicker).toContain('NOVO OPERATIVO');
    expect(again.skipLabel).toBe('Cancelar');
    expect(again.campaignNote('Mesa X')).toContain('passa a ser o seu personagem');
  });

  it('cai no modo de primeiro acesso para valores desconhecidos', () => {
    expect(wizardCopy('whatever').mode).toBe('first');
    expect(createWizardController({ api: fakeApi(), mode: 'bogus' }).state.mode).toBe('first');
    expect(createWizardController({ api: fakeApi(), mode: 'new' }).state.mode).toBe('new');
  });

  it('dentro da campanha, a nova ficha entra na mesa e substitui o assento', async () => {
    const api = fakeApi();
    const onDone = vi.fn();
    const controller = createWizardController({ api, campaignId: 'mesa-1', mode: 'new', onDone });
    controller.state.draft = completeDraft('rook two');

    const result = await controller.finish();

    expect(result.ok).toBe(true);
    expect(api.campaigns.join).toHaveBeenCalledWith('mesa-1', expect.stringMatching(/^rook-two-/));
    expect(onDone).toHaveBeenCalledWith(expect.objectContaining({ campaignId: 'mesa-1', character: expect.objectContaining({ name: 'ROOK TWO' }) }));
  });
});

describe('passo de chrome', () => {
  const CATALOG_ROWS = [
    { code: 'GORILLA-ARMS', name: 'Gorilla Arms', cat: 'LIMBS', price: 1000, hcost: 14, stock: 'IN STOCK' },
    { code: 'ENH-TUNGSTEN', name: 'Tungsten Reinforcement', cat: 'LIMBS', price: 500, hcost: 3, stock: 'IN STOCK', attachesTo: ['GORILLA-ARMS'] },
    { code: 'MEDTECH-BAG', name: 'Medtech Bag', cat: 'GEAR', price: 100, hcost: 0, stock: 'IN STOCK' },
  ];

  function chromeApi(list = async () => CATALOG_ROWS) {
    return fakeApi({ items: { list: vi.fn(list) } });
  }

  it('carrega so o que e implantavel do catalogo', async () => {
    const controller = createWizardController({ api: chromeApi() });
    await controller.loadCatalog();
    expect(controller.state.catalogStatus).toBe('ready');
    expect(controller.state.catalog.map((item) => item.code)).toEqual(['GORILLA-ARMS', 'ENH-TUNGSTEN']);
  });

  it('busca o catalogo uma vez so', async () => {
    const api = chromeApi();
    const controller = createWizardController({ api });
    await controller.loadCatalog();
    await controller.loadCatalog();
    expect(api.items.list).toHaveBeenCalledTimes(1);
  });

  it('catalogo fora do ar nao impede criar a ficha sem chrome', async () => {
    const controller = createWizardController({ api: chromeApi(async () => { throw new Error('offline'); }) });
    await controller.loadCatalog();
    expect(controller.state.catalogStatus).toBe('error');
    expect(controller.state.catalog).toEqual([]);
  });

  it('instala, explica a recusa e remove', async () => {
    const controller = createWizardController({ api: chromeApi() });
    await controller.loadCatalog();

    controller.handlers.buyChrome('ENH-TUNGSTEN');
    expect(controller.state.draft.chrome).toEqual([]);
    expect(controller.state.chromeHint).toContain('GORILLA-ARMS');

    controller.handlers.buyChrome('GORILLA-ARMS');
    controller.handlers.buyChrome('ENH-TUNGSTEN');
    expect(controller.state.draft.chrome.map((item) => item.code)).toEqual(['GORILLA-ARMS', 'ENH-TUNGSTEN']);
    expect(controller.state.chromeHint).toBe('');

    controller.handlers.sellChrome('GORILLA-ARMS');
    expect(controller.state.draft.chrome).toEqual([]);
  });

  it('manda chrome instalado, codigos e o dinheiro que sobrou no payload', async () => {
    const controller = createWizardController({ api: chromeApi() });
    await controller.loadCatalog();
    controller.state.draft = completeDraft('chrome kid');
    controller.handlers.buyChrome('GORILLA-ARMS');
    controller.handlers.buyChrome('ENH-TUNGSTEN');

    const payload = buildCharacterPayload(controller.state.draft);
    expect(payload.credits).toBe(2550 - 1500);
    expect(payload.owned).toEqual(['GORILLA-ARMS', 'ENH-TUNGSTEN']);
    expect(payload.equipped[0]).toMatchObject({ code: 'GORILLA-ARMS', hcost: 14, enhancements: ['ENH-TUNGSTEN'] });
    // A perda de HUMANITY sai do hcost do equipado; gravar tambem humanityLoss
    // cobraria a mesma cirurgia duas vezes.
    expect(payload.humanityLoss).toBeUndefined();
  });

  it('sem chrome, comeca com o orcamento inteiro em dinheiro vivo', () => {
    const payload = buildCharacterPayload(completeDraft('sem chrome'));
    expect(payload.credits).toBe(2550);
    expect(payload.equipped).toEqual([]);
    expect(payload.owned).toEqual([]);
  });
});
