import { describe, it, expect, vi } from 'vitest';
import { buildCharacterPayload, createWizardController } from '../../../src/ui/views/onboarding.js';
import { createWizardDraft, setSkillLevel, skillFloor } from '../../../src/domain/character/characterWizard.ts';

function completeDraft(name = 'V Angel') {
  let draft = createWizardDraft({ name });
  const cheap = draft.skills.filter((s) => !s.difficult && skillFloor(s) === 0).slice(0, 6);
  cheap.forEach((skill) => { draft = setSkillLevel(draft, skill.id, 10); });
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
