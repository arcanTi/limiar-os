import { visionContainsPoint } from './visionEngine.ts';
import { createIntentEnvelope, parseIntentEnvelope, loadIntentEnvelope, saveIntentEnvelope, clearIntentEnvelope, IntentEnvelopeMeta } from './intentEnvelope.ts';

export const MAP_ATTACK_INTENT_KEY = 'limiar.mapAttackIntent.v1';
export const MAP_ATTACK_INTENT_MAX_AGE_MS = 10 * 60 * 1000;

export interface MapAttackIntentPayload {
  campaignId: string;
  sceneId: string;
  attackerTokenId: string;
  attackerCharacterId: string;
  targetTokenId: string;
  targetCharacterId: string;
  targetName: string;
  cells: number;
  rangeMeters: number;
}

export type MapAttackIntent = MapAttackIntentPayload & IntentEnvelopeMeta;

function validateMapAttackIntentPayload(raw: Record<string, unknown>): MapAttackIntentPayload | null {
  const fields = ['campaignId', 'sceneId', 'attackerTokenId', 'attackerCharacterId', 'targetTokenId', 'targetCharacterId'];
  if (fields.some(key => !String(raw[key] || ''))) return null;
  const cells = Number(raw.cells);
  const rangeMeters = Number(raw.rangeMeters);
  if (!(cells >= 0) || !(rangeMeters >= 0)) return null;
  return {
    campaignId: String(raw.campaignId), sceneId: String(raw.sceneId),
    attackerTokenId: String(raw.attackerTokenId), attackerCharacterId: String(raw.attackerCharacterId),
    targetTokenId: String(raw.targetTokenId), targetCharacterId: String(raw.targetCharacterId),
    targetName: String(raw.targetName || raw.targetCharacterId), cells, rangeMeters,
  };
}

export function createMapAttackIntent(input: MapAttackIntentPayload, now: number = Date.now()): MapAttackIntent {
  return createIntentEnvelope(input, now);
}

export function parseMapAttackIntent(value: unknown, now: number = Date.now()): MapAttackIntent | null {
  return parseIntentEnvelope(value, validateMapAttackIntentPayload, MAP_ATTACK_INTENT_MAX_AGE_MS, now);
}

export function loadMapAttackIntent(storage: Pick<Storage, 'getItem' | 'removeItem'> | null | undefined, now: number = Date.now()): MapAttackIntent | null {
  return loadIntentEnvelope(storage, MAP_ATTACK_INTENT_KEY, validateMapAttackIntentPayload, MAP_ATTACK_INTENT_MAX_AGE_MS, now);
}

export function saveMapAttackIntent(storage: Pick<Storage, 'setItem'>, intent: MapAttackIntent): void {
  saveIntentEnvelope(storage, MAP_ATTACK_INTENT_KEY, intent);
}

export function clearMapAttackIntent(storage: Pick<Storage, 'removeItem'> | null | undefined): void {
  clearIntentEnvelope(storage, MAP_ATTACK_INTENT_KEY);
}

export function mapTokenVisibleNow(mapState: { scene?: { fogEnabled?: boolean; explorationMode?: string; gridSize?: number }; tokens?: unknown[]; walls?: unknown[]; lights?: unknown[] }, token: { visible?: boolean; x?: number; y?: number } | null | undefined, options: { gm?: boolean; username?: string } = {}): boolean {
  if (!token) return false;
  if (options.gm) return true;
  if (token.visible === false) return false;
  if (!mapState.scene || !mapState.scene.fogEnabled) return true;
  const tokens = Array.isArray(mapState.tokens) ? mapState.tokens as { visible?: boolean; kind?: string; ownerUsername?: string; vision?: number; visionDistanceUnits?: number | null; x?: number; y?: number }[] : [];
  const radius = (row: { vision?: number; visionDistanceUnits?: number | null }) => row.visionDistanceUnits != null ? Number(row.visionDistanceUnits) / 2 * Number(mapState.scene?.gridSize || 64) : Number(row.vision);
  const pool = tokens.filter(row => row.visible !== false && row.kind === 'player' && radius(row) > 0);
  const viewers = mapState.scene.explorationMode === 'individual'
    ? pool.filter(row => row.ownerUsername === options.username)
    : pool;
  const walls = Array.isArray(mapState.walls) ? mapState.walls as never[] : [];
  const target = { x: Number(token.x), y: Number(token.y) };
  if (viewers.some(viewer => visionContainsPoint({ x: Number(viewer.x), y: Number(viewer.y) }, radius(viewer), walls, target))) return true;
  const lights = Array.isArray(mapState.lights) ? mapState.lights as { enabled?: boolean; tokenId?: string; x?: number; y?: number; dimUnits?: number }[] : [];
  return lights.some(light => {
    if (!light.enabled) return false;
    const sourceToken = light.tokenId ? tokens.find(row => (row as { id?: string }).id === light.tokenId) : null;
    const source = sourceToken || light;
    const lightRadius = Number(light.dimUnits) / 2 * Number(mapState.scene?.gridSize || 64);
    return viewers.some(viewer => visionContainsPoint({ x: Number(viewer.x), y: Number(viewer.y) }, radius(viewer), walls, { x: Number(source.x), y: Number(source.y) }))
      && visionContainsPoint({ x: Number(source.x), y: Number(source.y) }, lightRadius, walls, target);
  });
}
