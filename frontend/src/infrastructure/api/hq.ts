import type { HttpRequest } from './http.ts';
import { campaignPath } from './campaignScope.ts';

export function createHqApi(request: HttpRequest, campaignId: string) {
  return {
    get: async (): Promise<unknown> => request(campaignPath(campaignId, '/hq')),
    set: async (payload: Record<string, unknown>): Promise<unknown> =>
      request(campaignPath(campaignId, '/hq'), { method: 'POST', body: JSON.stringify(payload) }),
  };
}
