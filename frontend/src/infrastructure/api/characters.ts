import type { HttpRequest } from './http.ts';
import type { CharacterDocument, DeleteResult } from './contracts.ts';

function withExpectedRevision(payload: Record<string, unknown>): Record<string, unknown> {
  if (payload.expectedRevision !== undefined) return payload;
  const revision = payload.revision;
  return Number.isInteger(revision) && Number(revision) >= 0
    ? { ...payload, expectedRevision: revision }
    : payload;
}

// Characters belong to one campaign. With a campaign selected every list and
// create goes through its scoped path; the campaign-less desktop keeps the bare
// paths, which reach only sheets that belong to no campaign.
function scoped(campaignId: string, suffix: string): string {
  return campaignId ? '/campaigns/' + encodeURIComponent(campaignId) + suffix : suffix;
}

export function createCharactersApi(request: HttpRequest, campaignId = '') {
  return {
    list: async (): Promise<CharacterDocument[]> => request(scoped(campaignId, '/characters')),
    get: async (id: string): Promise<CharacterDocument> => request('/characters/' + id),
    createPlayer: async (payload: Record<string, unknown>): Promise<CharacterDocument> => request(scoped(campaignId, '/player-characters'), { method: 'POST', body: JSON.stringify(withExpectedRevision(payload)) }),
    upsert: async (payload: Record<string, unknown>): Promise<CharacterDocument> => request(scoped(campaignId, '/characters'), { method: 'POST', body: JSON.stringify(withExpectedRevision(payload)) }),
    patchNotes: async (id: string, payload: Record<string, unknown>): Promise<CharacterDocument> => request('/characters/' + id + '/notes', { method: 'POST', body: JSON.stringify(withExpectedRevision(payload)) }),
    delete: async (id: string): Promise<DeleteResult> => request('/characters/' + id, { method: 'DELETE' }),
  };
}
