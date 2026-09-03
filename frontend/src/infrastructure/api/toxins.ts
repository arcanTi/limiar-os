import type { HttpRequest } from './http.ts';
import { campaignPath } from './campaignScope.ts';

export function createToxinsApi(request: HttpRequest, campaignId: string) {
  return {
    list: async (): Promise<unknown> => request(campaignPath(campaignId, '/toxins')),
    save: async (toxins: unknown[]): Promise<unknown> =>
      request(campaignPath(campaignId, '/toxins'), { method: 'POST', body: JSON.stringify({ toxins }) }),
  };
}
