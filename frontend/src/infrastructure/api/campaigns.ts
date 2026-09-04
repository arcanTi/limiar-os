import type { HttpRequest } from './http.ts';
import type { CampaignEventWaiter } from './campaignEvents.ts';
import type { CampaignDocument, CampaignUpdate } from './contracts.ts';

function campaignPath(id: string, suffix = ''): string {
  return '/campaigns/' + encodeURIComponent(id) + suffix;
}

export function createCampaignsApi(request: HttpRequest, waitForCampaignEvent?: CampaignEventWaiter | null) {
  return {
    list: async (): Promise<CampaignDocument[]> => request('/campaigns'),
    notifications: async (): Promise<unknown> => request('/notifications'),
    create: async (payload: Record<string, unknown>): Promise<CampaignDocument> => request('/campaigns', { method: 'POST', body: JSON.stringify(payload) }),
    invite: async (campaignId: string, usernameOrPayload: string | Record<string, unknown>): Promise<unknown> => {
      const payload = typeof usernameOrPayload === 'string' ? { username: usernameOrPayload } : usernameOrPayload;
      return request(campaignPath(campaignId, '/invite'), { method: 'POST', body: JSON.stringify(payload || {}) });
    },
    cancelInvite: async (campaignId: string, username: string): Promise<unknown> =>
      request(campaignPath(campaignId, '/invites/' + encodeURIComponent(username)), { method: 'DELETE' }),
    removeMember: async (campaignId: string, username: string): Promise<unknown> =>
      request(campaignPath(campaignId, '/members/' + encodeURIComponent(username)), { method: 'DELETE' }),
    // Stand-in control of an absent player's sheet, granted and taken back by
    // the GM of this table.
    grantControl: async (campaignId: string, characterId: string, username: string): Promise<unknown> =>
      request(campaignPath(campaignId, '/delegations'), { method: 'POST', body: JSON.stringify({ characterId, username }) }),
    revokeControl: async (campaignId: string, characterId: string): Promise<unknown> =>
      request(campaignPath(campaignId, '/delegations/' + encodeURIComponent(characterId)), { method: 'DELETE' }),
    join: async (campaignId: string, characterIdOrPayload: string | Record<string, unknown>): Promise<unknown> => {
      const payload = typeof characterIdOrPayload === 'string' ? { characterId: characterIdOrPayload } : characterIdOrPayload;
      return request(campaignPath(campaignId, '/join'), { method: 'POST', body: JSON.stringify(payload || {}) });
    },
    // M3 unified sync: one long-poll per campaign covering map/chat/combat/roster,
    // replacing the app's fixed-interval chat/roster polling.
    waitForUpdate: async (campaignId: string, since: number, signal?: AbortSignal): Promise<CampaignUpdate> =>
      waitForCampaignEvent
        ? waitForCampaignEvent(campaignId, since, signal) as Promise<CampaignUpdate>
        : request(campaignPath(campaignId, '/updates?since=' + encodeURIComponent(String(since))), { signal }),
  };
}
