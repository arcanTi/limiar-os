import { describe, expect, it } from 'vitest';

import { createCombatApi } from '../../../src/infrastructure/api/combat.ts';
import { createCommsApi } from '../../../src/infrastructure/api/comms.ts';
import { createHqApi } from '../../../src/infrastructure/api/hq.ts';
import { createNexusApi } from '../../../src/infrastructure/api/nexus.ts';
import { createTarotApi } from '../../../src/infrastructure/api/tarot.ts';
import type { HttpRequest } from '../../../src/infrastructure/api/http.ts';

function requestRecorder() {
  const calls: string[] = [];
  const request: HttpRequest = async <T>(path: string): Promise<T> => {
    calls.push(path);
    return {} as T;
  };
  return { calls, request };
}

describe('campaign-scoped shared state API clients', () => {
  it('addresses every shared-state request under its campaign', async () => {
    const { calls, request } = requestRecorder();
    const campaignId = 'night city';
    const comms = createCommsApi(request, campaignId);
    const combat = createCombatApi(request, campaignId);
    const tarot = createTarotApi(request, campaignId);
    const hq = createHqApi(request, campaignId);
    const nexus = createNexusApi(request, campaignId);

    await comms.list();
    await comms.post({ text: 'hello' });
    await comms.clear();
    await combat.state.get();
    await combat.state.set({
      active: false, round: 0, turnIndex: -1, order: [], combatants: {}, updatedAt: '2026-08-07T00:00:00.000Z',
    });
    await combat.state.endTurn('rook');
    await tarot.state.get();
    await tarot.state.set({
      order: [], seen: [], sessionId: 'session', drawnThisSession: null, history: [], updatedAt: '2026-08-07T00:00:00.000Z',
    });
    await hq.get();
    await hq.set({ ip: 0, log: [] });
    await nexus.get();
    await nexus.set({ id: 'challenge' });
    await nexus.getResult();
    await nexus.reportResult({ score: 1 });

    expect(calls).toEqual([
      '/campaigns/night%20city/chat',
      '/campaigns/night%20city/chat',
      '/campaigns/night%20city/chat',
      '/campaigns/night%20city/combat-state',
      '/campaigns/night%20city/combat-state',
      '/campaigns/night%20city/combat-state/end-turn',
      '/campaigns/night%20city/tarot-state',
      '/campaigns/night%20city/tarot-state',
      '/campaigns/night%20city/hq',
      '/campaigns/night%20city/hq',
      '/campaigns/night%20city/nexus-challenge',
      '/campaigns/night%20city/nexus-challenge',
      '/campaigns/night%20city/nexus-result',
      '/campaigns/night%20city/nexus-result',
    ]);
  });

  it('rejects an unscoped shared-state request before it reaches the transport', async () => {
    const { request } = requestRecorder();

    await expect(createCommsApi(request, '').list()).rejects.toThrow('Selecione uma campanha');
  });
});
