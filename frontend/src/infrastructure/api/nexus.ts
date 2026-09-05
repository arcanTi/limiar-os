import type { HttpRequest } from './http.ts';
import { campaignPath } from './campaignScope.ts';

export function createNexusApi(request: HttpRequest, campaignId: string) {
  return {
    get: async (): Promise<unknown> => request(campaignPath(campaignId, '/nexus-challenge')),
    set: async (payload: Record<string, unknown>): Promise<unknown> =>
      request(campaignPath(campaignId, '/nexus-challenge'), { method: 'POST', body: JSON.stringify(payload) }),
    getResult: async (): Promise<unknown> => request(campaignPath(campaignId, '/nexus-result')),
    reportResult: async (payload: Record<string, unknown>): Promise<unknown> =>
      request(campaignPath(campaignId, '/nexus-result'), { method: 'POST', body: JSON.stringify(payload) }),
  };
}
