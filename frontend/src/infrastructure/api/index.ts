import { createHttpClient } from './http.ts';
import type { HttpClientOptions } from './http.ts';
import { createAuthApi } from './auth.ts';
import { createCharactersApi } from './characters.ts';
import { createCampaignsApi } from './campaigns.ts';
import { createCampaignMapsApi } from './campaignMaps.ts';
import { createCatalogApi } from './catalog.ts';
import { createMapApi } from './map.ts';
import { createNexusApi } from './nexus.ts';
import { createHqApi } from './hq.ts';
import { createTarotApi } from './tarot.ts';
import { createCombatApi } from './combat.ts';
import { createCommsApi } from './comms.ts';
import { createUploadsApi } from './uploads.ts';
import { createUsersApi } from './users.ts';

export function createLimiarAPI(options: HttpClientOptions = {}) {
  const http = createHttpClient(options);
  const catalog = createCatalogApi(http.request);
  const comms = createCommsApi(http.request);
  return {
    remoteBaseUrl: http.remoteBaseUrl,
    request: http.request,
    auth: createAuthApi(http),
    users: createUsersApi(http.request),
    characters: createCharactersApi(http.request),
    campaigns: createCampaignsApi(http.request),
    campaignMaps: createCampaignMapsApi(http.request),
    catalog,
    items: catalog,
    map: createMapApi(http.request),
    nexus: createNexusApi(http.request),
    hq: createHqApi(http.request),
    tarot: createTarotApi(http.request),
    combat: createCombatApi(http.request),
    comms,
    chat: comms,
    uploads: createUploadsApi(http),
  };
}

export type LimiarAPI = ReturnType<typeof createLimiarAPI>;
