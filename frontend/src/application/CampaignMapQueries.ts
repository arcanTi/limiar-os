export interface CampaignMapApi {
  campaignMaps?: {
    get: (campaignId: string) => Promise<Record<string, unknown>>;
    saveTemplate: (campaignId: string, payload: Record<string, unknown>) => Promise<Record<string, unknown>>;
  };
}

/** Map queries/commands initiated from outside the dedicated Mesa page. */
export default class CampaignMapQueries {
  constructor(private readonly api?: CampaignMapApi) {}

  available(): boolean {
    return Boolean(this.api?.campaignMaps);
  }

  async get(campaignId: string): Promise<Record<string, unknown>> {
    if (!this.api?.campaignMaps) throw new Error('Mapa indisponivel');
    return this.api.campaignMaps.get(campaignId);
  }

  async saveTemplate(campaignId: string, payload: Record<string, unknown>): Promise<Record<string, unknown>> {
    if (!this.api?.campaignMaps) throw new Error('Mapa indisponivel');
    return this.api.campaignMaps.saveTemplate(campaignId, payload);
  }
}
