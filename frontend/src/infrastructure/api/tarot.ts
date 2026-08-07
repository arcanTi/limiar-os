import type { HttpRequest } from './http.ts';
import type { TarotState } from '../../domain/tarot/index.ts';

export function createTarotApi(request: HttpRequest) {
  return {
    state: {
      get: async (): Promise<unknown> => request('/tarot-state'),
      set: async (payload: TarotState & { updatedAt: string }): Promise<unknown> => request('/tarot-state', { method: 'POST', body: JSON.stringify(payload) }),
    },
  };
}
