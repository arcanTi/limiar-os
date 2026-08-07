import type { HttpRequest } from './http.ts';
import type { CombatState } from '../../domain/combat/index.ts';
import { campaignPath } from './campaignScope.ts';

export function createCombatApi(request: HttpRequest, campaignId: string) {
  return {
    state: {
      get: async (): Promise<unknown> => request(campaignPath(campaignId, '/combat-state')),
      set: async (payload: CombatState & { updatedAt: string }): Promise<unknown> =>
        request(campaignPath(campaignId, '/combat-state'), {
          method: 'POST',
          body: JSON.stringify({ ...payload, expectedRevision: payload.revision ?? 0 }),
        }),
      endTurn: async (targetId: string, expectedRevision: number = 0): Promise<CombatState> =>
        request(campaignPath(campaignId, '/combat-state/end-turn'), {
          method: 'POST', body: JSON.stringify({ targetId, expectedRevision }),
        }) as Promise<CombatState>,
    },
  };
}
