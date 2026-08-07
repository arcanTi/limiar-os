import { describe, expect, it } from 'vitest';

import { createCampaignMapsApi } from '../../../src/infrastructure/api/campaignMaps.ts';
import { createCampaignsApi } from '../../../src/infrastructure/api/campaigns.ts';

function requestRecorder() {
  const calls = [];
  const request = async (path, options = {}) => {
    calls.push({ path, options });
    return { ok: true };
  };
  return { calls, request };
}

describe('infrastructure/api/campaigns', () => {
  it('covers campaign list, notifications, create, invite and join endpoints', async () => {
    const { calls, request } = requestRecorder();
    const api = createCampaignsApi(request);

    await api.list();
    await api.notifications();
    await api.create({ name: 'Limiar' });
    await api.invite('camp 1', 'player');
    await api.join('camp 1', 'char-1');
    await api.cancelInvite('camp 1', 'player');
    await api.removeMember('camp 1', 'player');

    expect(calls.map(call => call.path)).toEqual([
      '/campaigns',
      '/notifications',
      '/campaigns',
      '/campaigns/camp%201/invite',
      '/campaigns/camp%201/join',
      '/campaigns/camp%201/invites/player',
      '/campaigns/camp%201/members/player',
    ]);
    expect(JSON.parse(calls[3].options.body)).toEqual({ username: 'player' });
    expect(JSON.parse(calls[4].options.body)).toEqual({ characterId: 'char-1' });
    expect(calls[5].options.method).toBe('DELETE');
    expect(calls[6].options.method).toBe('DELETE');
  });
});

describe('infrastructure/api/campaignMaps', () => {
  it('covers campaign map endpoints used by the overlay', async () => {
    const { calls, request } = requestRecorder();
    const api = createCampaignMapsApi(request);

    await api.get('camp 1');
    await api.saveScene('camp 1', { sceneId: 'scene-1' });
    await api.activate('camp 1', 'scene-1');
    await api.saveToken('camp 1', { tokenId: 'tok-1' });
    await api.moveToken('camp 1', { tokenId: 'tok-1', x: 1 });
    await api.deleteToken('camp 1', 'tok-1');
    await api.saveFog('camp 1', { fogId: 'fog-1' });
    await api.deleteFog('camp 1', 'fog-1');
    await api.clearReveals('camp 1');
    await api.syncPlayers('camp 1');

    expect(calls.map(call => call.path)).toEqual([
      '/campaign-maps/camp%201',
      '/campaign-maps/camp%201/scene',
      '/campaign-maps/camp%201/activate',
      '/campaign-maps/camp%201/token',
      '/campaign-maps/camp%201/token/move',
      '/campaign-maps/camp%201/token/delete',
      '/campaign-maps/camp%201/fog',
      '/campaign-maps/camp%201/fog/delete',
      '/campaign-maps/camp%201/reveals/clear',
      '/campaign-maps/camp%201/sync',
    ]);
    expect(JSON.parse(calls[2].options.body)).toEqual({ sceneId: 'scene-1' });
    expect(JSON.parse(calls[5].options.body)).toEqual({ tokenId: 'tok-1' });
    expect(JSON.parse(calls[7].options.body)).toEqual({ fogId: 'fog-1' });
  });
});
