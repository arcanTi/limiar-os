import { describe, expect, it, vi } from 'vitest';

import { campaignsHandlers } from '../../../src/ui/views/campaigns.js';

function fakeComponent(state = {}) {
  const component = {
    state: { draft: { id: '', name: '', description: '', visibility: 'public', status: 'active', bannerUrl: '' }, ...state },
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
