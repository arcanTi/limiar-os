import type { HttpRequest } from './http.ts';
import { campaignPath } from './campaignScope.ts';

export function createCommsApi(request: HttpRequest, campaignId: string) {
  return {
    list: async (): Promise<unknown> => request(campaignPath(campaignId, '/chat')),
    post: async (payload: Record<string, unknown>): Promise<unknown> =>
      request(campaignPath(campaignId, '/chat'), { method: 'POST', body: JSON.stringify(payload) }),
    clear: async (): Promise<unknown> => request(campaignPath(campaignId, '/chat'), { method: 'DELETE' }),
  };
}
