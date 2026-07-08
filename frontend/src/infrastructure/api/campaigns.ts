import type { HttpRequest } from './http.ts';

function campaignPath(id: string, suffix = ''): string {
  return '/campaigns/' + encodeURIComponent(id) + suffix;
}

export function createCampaignsApi(request: HttpRequest) {
  return {
    list: async (): Promise<unknown> => request('/campaigns'),
    notifications: async (): Promise<unknown> => request('/notifications'),
    create: async (payload: Record<string, unknown>): Promise<unknown> => request('/campaigns', { method: 'POST', body: JSON.stringify(payload) }),
    invite: async (campaignId: string, usernameOrPayload: string | Record<string, unknown>): Promise<unknown> => {
      const payload = typeof usernameOrPayload === 'string' ? { username: usernameOrPayload } : usernameOrPayload;
      return request(campaignPath(campaignId, '/invite'), { method: 'POST', body: JSON.stringify(payload || {}) });
    },
    join: async (campaignId: string, characterIdOrPayload: string | Record<string, unknown>): Promise<unknown> => {
      const payload = typeof characterIdOrPayload === 'string' ? { characterId: characterIdOrPayload } : characterIdOrPayload;
      return request(campaignPath(campaignId, '/join'), { method: 'POST', body: JSON.stringify(payload || {}) });
    },
  };
}
