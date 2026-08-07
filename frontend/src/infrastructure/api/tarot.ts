import type { HttpRequest } from './http.ts';
import type { TarotState } from '../../domain/tarot/index.ts';
import { campaignPath } from './campaignScope.ts';

export function createTarotApi(request: HttpRequest, campaignId: string) {
  return {
    state: {
      get: async (): Promise<unknown> => request(campaignPath(campaignId, '/tarot-state')),
      set: async (payload: TarotState & { updatedAt: string }): Promise<unknown> =>
        request(campaignPath(campaignId, '/tarot-state'), { method: 'POST', body: JSON.stringify(payload) }),
    },
  };
}
