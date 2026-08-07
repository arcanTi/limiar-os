/** Stable HTTP DTOs mirrored from the FastAPI OpenAPI contract. */
export interface CharacterDocument extends Record<string, unknown> {
  id: string;
  name?: string;
  ownerUsername?: string;
  createdBy?: string;
}

export interface CampaignDocument extends Record<string, unknown> {
  id: string;
  name: string;
  canJoin?: boolean;
}

export interface CampaignUpdate {
  version: number;
  changed: boolean;
  topics: Array<'map' | 'chat' | 'combat' | 'roster'>;
}

export interface MapScene extends Record<string, unknown> {
  id: string;
  gridSize: number;
}

export interface MapToken extends Record<string, unknown> {
  id: string;
  characterId?: string;
  x: number;
  y: number;
}

export interface CampaignMapState extends Record<string, unknown> {
  scene: MapScene;
  tokens: MapToken[];
}

export interface DeleteResult { deleted: boolean }
