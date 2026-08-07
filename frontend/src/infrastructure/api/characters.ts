import type { HttpRequest } from './http.ts';
import type { CharacterDocument, DeleteResult } from './contracts.ts';

function withExpectedRevision(payload: Record<string, unknown>): Record<string, unknown> {
  if (payload.expectedRevision !== undefined) return payload;
  const revision = payload.revision;
  return Number.isInteger(revision) && Number(revision) >= 0
    ? { ...payload, expectedRevision: revision }
    : payload;
}

export function createCharactersApi(request: HttpRequest) {
  return {
    list: async (): Promise<CharacterDocument[]> => request('/characters'),
    get: async (id: string): Promise<CharacterDocument> => request('/characters/' + id),
    createPlayer: async (payload: Record<string, unknown>): Promise<CharacterDocument> => request('/player-characters', { method: 'POST', body: JSON.stringify(withExpectedRevision(payload)) }),
    upsert: async (payload: Record<string, unknown>): Promise<CharacterDocument> => request('/characters', { method: 'POST', body: JSON.stringify(withExpectedRevision(payload)) }),
    patchNotes: async (id: string, payload: Record<string, unknown>): Promise<CharacterDocument> => request('/characters/' + id + '/notes', { method: 'POST', body: JSON.stringify(withExpectedRevision(payload)) }),
    delete: async (id: string): Promise<DeleteResult> => request('/characters/' + id, { method: 'DELETE' }),
  };
}
