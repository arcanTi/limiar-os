import { describe, expect, it, vi } from 'vitest';

import { campaignsHandlers } from '../../../src/ui/views/campaigns.js';

function fakeComponent(state = {}) {
  const component = {
    state: { draft: { id: '', name: '', description: '', visibility: 'public', status: 'active', bannerUrl: '' }, ...state },
    // Mirrors the overlay controller: it merges plain objects and has no
    // updater-function form, so a handler that passes one must fail here.
    setState: vi.fn((next) => { component.state = { ...component.state, ...next }; }),
  };
  return component;
}

function fakeApi(overrides = {}) {
  return {
    auth: { token: () => 'tok', session: vi.fn().mockResolvedValue({ authenticated: true, user: { username: 'gm1', role: 'gm' } }) },
    campaigns: {
      list: vi.fn().mockResolvedValue([]),
      notifications: vi.fn().mockResolvedValue([]),
      create: vi.fn().mockResolvedValue({ id: 'campaign-1', name: 'Mesa' }),
      cancelInvite: vi.fn().mockResolvedValue({ cancelled: true }),
      removeMember: vi.fn().mockResolvedValue({ removed: true }),
      grantControl: vi.fn().mockResolvedValue({ characterId: 'leu-1', username: 'bari' }),
      revokeControl: vi.fn().mockResolvedValue({ revoked: true }),
      ...overrides.campaigns,
    },
    characters: { list: vi.fn().mockResolvedValue([]) },
    users: { list: vi.fn().mockResolvedValue([]) },
    uploads: { image: vi.fn().mockResolvedValue({ url: '/uploads/banner-1.png' }) },
  };
}

describe('ui/views/campaigns campaignsHandlers', () => {
  it('editCampaign loads a campaign into the draft for editing', () => {
    const component = fakeComponent();
    const handlers = campaignsHandlers(component, fakeApi());
    handlers.editCampaign({ id: 'campaign-1', name: 'Mesa', description: 'briefing', visibility: 'private', status: 'active', bannerUrl: '/uploads/banner-1.png' });
    expect(component.state.draft).toMatchObject({ id: 'campaign-1', name: 'Mesa', bannerUrl: '/uploads/banner-1.png' });
  });

  it('cancelEdit resets the draft back to empty', () => {
    const component = fakeComponent({ draft: { id: 'campaign-1', name: 'Mesa', description: '', visibility: 'public', status: 'active', bannerUrl: '' } });
    const handlers = campaignsHandlers(component, fakeApi());
    handlers.cancelEdit();
    expect(component.state.draft.id).toBe('');
  });

  it('saveCampaign uploads a pending banner file and re-saves the campaign with the resulting url', async () => {
    const api = fakeApi();
    const component = fakeComponent({ draft: { id: '', name: 'Mesa', description: '', visibility: 'public', status: 'active', bannerUrl: '' }, bannerFile: { name: 'cover.png' } });
    const handlers = campaignsHandlers(component, api);
    await handlers.saveCampaign();
    expect(api.uploads.image).toHaveBeenCalledWith({ name: 'cover.png' }, { scope: 'campaign-banner', ownerId: 'campaign-1' });
    expect(api.campaigns.create).toHaveBeenLastCalledWith(expect.objectContaining({ id: 'campaign-1', bannerUrl: '/uploads/banner-1.png' }));
    expect(component.state.bannerFile).toBeNull();
  });

  it('clearBanner sends clearBanner:true with the campaign id and name', async () => {
    const api = fakeApi();
    const component = fakeComponent();
    const handlers = campaignsHandlers(component, api);
    await handlers.clearBanner({ id: 'campaign-1', name: 'Mesa' });
    expect(api.campaigns.create).toHaveBeenCalledWith({ id: 'campaign-1', name: 'Mesa', clearBanner: true });
  });

  it('cancelInvite and removeMember call the api and refresh', async () => {
    const api = fakeApi();
    const component = fakeComponent();
    const handlers = campaignsHandlers(component, api);
    await handlers.cancelInvite('campaign-1', 'player1');
    expect(api.campaigns.cancelInvite).toHaveBeenCalledWith('campaign-1', 'player1');
    await handlers.removeMember('campaign-1', 'player1');
    expect(api.campaigns.removeMember).toHaveBeenCalledWith('campaign-1', 'player1');
  });
});

// --- Ceder a ficha de um jogador ausente ---
// O mestre escolhe quem cobre e cede; devolver e um clique. O select guarda a
// escolha por ficha, senao duas linhas dividiriam o mesmo nome.

describe('cessao de controle pelo mestre', () => {
  it('guarda a escolha do substituto por ficha', () => {
    const component = fakeComponent();
    const handlers = campaignsHandlers(component, fakeApi());

    handlers.chooseSubstitute('leu-1', 'bari');
    handlers.chooseSubstitute('carol-1', 'dex');

    expect(component.state.substituteByCharacter).toEqual({ 'leu-1': 'bari', 'carol-1': 'dex' });
  });

  it('cede o controle para quem foi escolhido', async () => {
    const api = fakeApi();
    const component = fakeComponent({ substituteByCharacter: { 'leu-1': 'bari' } });
    const handlers = campaignsHandlers(component, api);

    await handlers.grantControl('mesa-1', 'leu-1');

    expect(api.campaigns.grantControl).toHaveBeenCalledWith('mesa-1', 'leu-1', 'bari');
    expect(component.state.status).toContain('bari');
  });

  it('sem substituto escolhido nao chama a API', async () => {
    const api = fakeApi();
    const handlers = campaignsHandlers(fakeComponent(), api);

    await handlers.grantControl('mesa-1', 'leu-1');

    expect(api.campaigns.grantControl).not.toHaveBeenCalled();
  });

  it('reporta falha da API em vez de mentir que cedeu', async () => {
    const api = fakeApi({ campaigns: { grantControl: vi.fn().mockRejectedValue(new Error('API 403')) } });
    const component = fakeComponent({ substituteByCharacter: { 'leu-1': 'bari' } });
    const handlers = campaignsHandlers(component, api);

    await handlers.grantControl('mesa-1', 'leu-1');

    expect(component.state.status).toBe('Nao foi possivel ceder o controle');
  });

  it('devolve o controle ao dono', async () => {
    const api = fakeApi();
    const component = fakeComponent();
    const handlers = campaignsHandlers(component, api);

    await handlers.revokeControl('mesa-1', 'leu-1');

    expect(api.campaigns.revokeControl).toHaveBeenCalledWith('mesa-1', 'leu-1');
    expect(component.state.status).toBe('Controle devolvido ao dono');
  });
});
