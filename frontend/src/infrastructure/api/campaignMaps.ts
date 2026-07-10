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
    waitForUpdate: async (campaignId: string, since: number, signal?: AbortSignal): Promise<unknown> => request(mapPath(campaignId, '/updates?since=' + encodeURIComponent(String(since))), { signal }),
    saveScene: async (campaignId: string, payload: Record<string, unknown>): Promise<unknown> => request(mapPath(campaignId, '/scene'), { method: 'POST', body: JSON.stringify(payload || {}) }),
    activate: async (campaignId: string, sceneIdOrPayload: string | Record<string, unknown>): Promise<unknown> => request(mapPath(campaignId, '/activate'), { method: 'POST', body: JSON.stringify(payloadFromId('sceneId', sceneIdOrPayload)) }),
    saveToken: async (campaignId: string, payload: Record<string, unknown>): Promise<unknown> => request(mapPath(campaignId, '/token'), { method: 'POST', body: JSON.stringify(payload || {}) }),
    moveToken: async (campaignId: string, payload: Record<string, unknown>): Promise<unknown> => request(mapPath(campaignId, '/token/move'), { method: 'POST', body: JSON.stringify(payload || {}) }),
    moveTokens: async (campaignId: string, payload: Record<string, unknown>): Promise<unknown> => request(mapPath(campaignId, '/token/move-group'), { method: 'POST', body: JSON.stringify(payload || {}) }),
    deleteToken: async (campaignId: string, tokenIdOrPayload: string | Record<string, unknown>): Promise<unknown> => request(mapPath(campaignId, '/token/delete'), { method: 'POST', body: JSON.stringify(payloadFromId('tokenId', tokenIdOrPayload)) }),
    saveFog: async (campaignId: string, payload: Record<string, unknown>): Promise<unknown> => request(mapPath(campaignId, '/fog'), { method: 'POST', body: JSON.stringify(payload || {}) }),
    deleteFog: async (campaignId: string, fogIdOrPayload: string | Record<string, unknown>): Promise<unknown> => request(mapPath(campaignId, '/fog/delete'), { method: 'POST', body: JSON.stringify(payloadFromId('fogId', fogIdOrPayload)) }),
    toggleTerrain: async (campaignId: string, payload: Record<string, unknown>): Promise<unknown> => request(mapPath(campaignId, '/terrain/toggle'), { method: 'POST', body: JSON.stringify(payload || {}) }),
    clearTerrain: async (campaignId: string): Promise<unknown> => request(mapPath(campaignId, '/terrain/clear'), { method: 'POST', body: JSON.stringify({}) }),
    clearReveals: async (campaignId: string): Promise<unknown> => request(mapPath(campaignId, '/reveals/clear'), { method: 'POST', body: JSON.stringify({}) }),
    ping: async (campaignId: string, payload: Record<string, unknown>): Promise<unknown> => request(mapPath(campaignId, '/ping'), { method: 'POST', body: JSON.stringify(payload || {}) }),
    saveTemplate: async (campaignId: string, payload: Record<string, unknown>): Promise<unknown> => request(mapPath(campaignId, '/template'), { method: 'POST', body: JSON.stringify(payload || {}) }),
    deleteTemplate: async (campaignId: string, templateIdOrPayload: string | Record<string, unknown>): Promise<unknown> => request(mapPath(campaignId, '/template/delete'), { method: 'POST', body: JSON.stringify(payloadFromId('templateId', templateIdOrPayload)) }),
    saveWall: async (campaignId: string, payload: Record<string, unknown>): Promise<unknown> => request(mapPath(campaignId, '/wall'), { method: 'POST', body: JSON.stringify(payload || {}) }),
    deleteWall: async (campaignId: string, payload: Record<string, unknown>): Promise<unknown> => request(mapPath(campaignId, '/wall/delete'), { method: 'POST', body: JSON.stringify(payload || {}) }),
    toggleDoor: async (campaignId: string, payload: Record<string, unknown>): Promise<unknown> => request(mapPath(campaignId, '/door/toggle'), { method: 'POST', body: JSON.stringify(payload || {}) }),
    saveLight: async (campaignId: string, payload: Record<string, unknown>): Promise<unknown> => request(mapPath(campaignId, '/light'), { method: 'POST', body: JSON.stringify(payload || {}) }),
    deleteLight: async (campaignId: string, payload: Record<string, unknown>): Promise<unknown> => request(mapPath(campaignId, '/light/delete'), { method: 'POST', body: JSON.stringify(payload || {}) }),
    toggleLight: async (campaignId: string, payload: Record<string, unknown>): Promise<unknown> => request(mapPath(campaignId, '/light/toggle'), { method: 'POST', body: JSON.stringify(payload || {}) }),
    saveDrawing: async (campaignId: string, payload: Record<string, unknown>): Promise<unknown> => request(mapPath(campaignId, '/drawing'), { method: 'POST', body: JSON.stringify(payload || {}) }),
    deleteDrawing: async (campaignId: string, payload: Record<string, unknown>): Promise<unknown> => request(mapPath(campaignId, '/drawing/delete'), { method: 'POST', body: JSON.stringify(payload || {}) }),
    savePin: async (campaignId: string, payload: Record<string, unknown>): Promise<unknown> => request(mapPath(campaignId, '/pin'), { method: 'POST', body: JSON.stringify(payload || {}) }),
    deletePin: async (campaignId: string, payload: Record<string, unknown>): Promise<unknown> => request(mapPath(campaignId, '/pin/delete'), { method: 'POST', body: JSON.stringify(payload || {}) }),
    syncPlayers: async (campaignId: string): Promise<unknown> => request(mapPath(campaignId, '/sync'), { method: 'POST', body: JSON.stringify({}) }),
  };
}
