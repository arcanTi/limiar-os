import type { HttpRequest } from './http.ts';

export function createCharactersApi(request: HttpRequest) {
  return {
    list: async (): Promise<unknown> => request('/characters'),
    get: async (id: string): Promise<unknown> => request('/characters/' + id),
    createPlayer: async (payload: Record<string, unknown>): Promise<unknown> => request('/player-characters', { method: 'POST', body: JSON.stringify(payload) }),
    upsert: async (payload: Record<string, unknown>): Promise<unknown> => request('/characters', { method: 'POST', body: JSON.stringify(payload) }),
    patchNotes: async (id: string, payload: Record<string, unknown>): Promise<unknown> => request('/characters/' + id + '/notes', { method: 'POST', body: JSON.stringify(payload) }),
    delete: async (id: string): Promise<unknown> => request('/characters/' + id, { method: 'DELETE' }),
  };
}
