import type { HttpRequest } from './http.ts';

function mapPath(campaignId: string, suffix = ''): string {
  return '/campaign-maps/' + encodeURIComponent(campaignId) + suffix;
}

function payloadFromId(key: string, value: string | Record<string, unknown> | undefined): Record<string, unknown> {
  return typeof value === 'string' ? { [key]: value } : (value || {});
}

export function createCampaignMapsApi(request: HttpRequest) {
  return {
    get: async (campaignId: string): Promise<unknown> => request(mapPath(campaignId)),
    saveScene: async (campaignId: string, payload: Record<string, unknown>): Promise<unknown> => request(mapPath(campaignId, '/scene'), { method: 'POST', body: JSON.stringify(payload || {}) }),
    activate: async (campaignId: string, sceneIdOrPayload: string | Record<string, unknown>): Promise<unknown> => request(mapPath(campaignId, '/activate'), { method: 'POST', body: JSON.stringify(payloadFromId('sceneId', sceneIdOrPayload)) }),
    saveToken: async (campaignId: string, payload: Record<string, unknown>): Promise<unknown> => request(mapPath(campaignId, '/token'), { method: 'POST', body: JSON.stringify(payload || {}) }),
    moveToken: async (campaignId: string, payload: Record<string, unknown>): Promise<unknown> => request(mapPath(campaignId, '/token/move'), { method: 'POST', body: JSON.stringify(payload || {}) }),
    deleteToken: async (campaignId: string, tokenIdOrPayload: string | Record<string, unknown>): Promise<unknown> => request(mapPath(campaignId, '/token/delete'), { method: 'POST', body: JSON.stringify(payloadFromId('tokenId', tokenIdOrPayload)) }),
    saveFog: async (campaignId: string, payload: Record<string, unknown>): Promise<unknown> => request(mapPath(campaignId, '/fog'), { method: 'POST', body: JSON.stringify(payload || {}) }),
    deleteFog: async (campaignId: string, fogIdOrPayload: string | Record<string, unknown>): Promise<unknown> => request(mapPath(campaignId, '/fog/delete'), { method: 'POST', body: JSON.stringify(payloadFromId('fogId', fogIdOrPayload)) }),
    toggleTerrain: async (campaignId: string, payload: Record<string, unknown>): Promise<unknown> => request(mapPath(campaignId, '/terrain/toggle'), { method: 'POST', body: JSON.stringify(payload || {}) }),
    clearTerrain: async (campaignId: string): Promise<unknown> => request(mapPath(campaignId, '/terrain/clear'), { method: 'POST', body: JSON.stringify({}) }),
    clearReveals: async (campaignId: string): Promise<unknown> => request(mapPath(campaignId, '/reveals/clear'), { method: 'POST', body: JSON.stringify({}) }),
    syncPlayers: async (campaignId: string): Promise<unknown> => request(mapPath(campaignId, '/sync'), { method: 'POST', body: JSON.stringify({}) }),
  };
}
