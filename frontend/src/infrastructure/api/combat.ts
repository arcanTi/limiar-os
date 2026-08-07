import type { HttpRequest } from './http.ts';
import type { CombatState } from '../../domain/combat/index.ts';

export function createCombatApi(request: HttpRequest) {
  return {
    state: {
      get: async (): Promise<unknown> => request('/combat-state'),
      set: async (payload: CombatState & { updatedAt: string }): Promise<unknown> => request('/combat-state', { method: 'POST', body: JSON.stringify(payload) }),
      endTurn: async (targetId: string): Promise<CombatState> => request('/combat-state/end-turn', { method: 'POST', body: JSON.stringify({ targetId }) }) as Promise<CombatState>,
    },
  };
}
