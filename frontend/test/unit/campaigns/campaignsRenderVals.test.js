import { describe, expect, it } from 'vitest';

import { campaignsRenderVals } from '../../../src/ui/views/campaigns.js';

const campaign = {
  id: 'campaign-1',
  name: 'Mesa 1',
  visibility: 'private',
  status: 'active',
  members: [{ username: 'player1', character_id: 'char-1' }],
  invites: [{ id: 'invite-1', username: 'player2', status: 'pending' }],
};

describe('ui/views/campaigns campaignsRenderVals', () => {
  it('exposes GM render state with creation and invite candidates', () => {
    const vals = campaignsRenderVals({
      session: { authenticated: true, user: { username: 'mestre', role: 'gm' } },
      campaigns: [campaign],
      selectedCampaignId: 'campaign-1',
      notifications: [{ kind: 'invite' }],
      users: [{ username: 'player1', role: 'player' }, { username: 'gm2', role: 'gm' }],
    });

    expect(vals.staff).toBe(true);
    expect(vals.logged).toBe(true);
    expect(vals.notifyCount).toBe(1);
    expect(vals.users).toEqual([{ username: 'player1', role: 'player' }]);
    expect(vals.selected.pendingInviteCount).toBe(1);
  });

  it('exposes player render state for invited private campaigns', () => {
    const vals = campaignsRenderVals({
      session: { authenticated: true, user: { username: 'player2', role: 'player' } },
      campaigns: [campaign],
      selectedCampaignId: 'campaign-1',
      characters: [{ id: 'char-2', name: 'Solo' }],
    });

    expect(vals.staff).toBe(false);
    expect(vals.selected.canJoin).toBe(true);
    expect(vals.selected.selectedCharacterId).toBe('char-2');
  });

  it('exposes admin render state and filters invite search', () => {
    const vals = campaignsRenderVals({
      session: { authenticated: true, user: { username: 'admin', role: 'admin' } },
      campaigns: [{ ...campaign, id: 'campaign-2', visibility: 'public' }],
      selectedCampaignId: 'missing',
      inviteQuery: 'ana',
      users: [{ username: 'ana', role: 'player' }, { username: 'bruno', role: 'player' }],
    });

    expect(vals.staff).toBe(true);
    expect(vals.selected.id).toBe('campaign-2');
    expect(vals.users).toEqual([{ username: 'ana', role: 'player' }]);
  });
});
