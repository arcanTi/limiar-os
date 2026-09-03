import type { HttpRequest } from './http.ts';
import { campaignPath } from './campaignScope.ts';

export function createEffectsApi(request: HttpRequest, campaignId: string) {
  return {
    list: async (): Promise<unknown> => request(campaignPath(campaignId, '/effects')),
    save: async (effects: unknown[]): Promise<unknown> =>
      request(campaignPath(campaignId, '/effects'), { method: 'POST', body: JSON.stringify({ effects }) }),
  };
}
