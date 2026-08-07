import type { HttpRequest } from './http.ts';
import type { CharacterDocument, DeleteResult } from './contracts.ts';

export function createCharactersApi(request: HttpRequest) {
  return {
    list: async (): Promise<CharacterDocument[]> => request('/characters'),
    get: async (id: string): Promise<CharacterDocument> => request('/characters/' + id),
    createPlayer: async (payload: Record<string, unknown>): Promise<CharacterDocument> => request('/player-characters', { method: 'POST', body: JSON.stringify(payload) }),
    upsert: async (payload: Record<string, unknown>): Promise<CharacterDocument> => request('/characters', { method: 'POST', body: JSON.stringify(payload) }),
    patchNotes: async (id: string, payload: Record<string, unknown>): Promise<CharacterDocument> => request('/characters/' + id + '/notes', { method: 'POST', body: JSON.stringify(payload) }),
    delete: async (id: string): Promise<DeleteResult> => request('/characters/' + id, { method: 'DELETE' }),
  };
}
