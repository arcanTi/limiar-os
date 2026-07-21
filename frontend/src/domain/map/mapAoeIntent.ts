// Fase AREA (README-PLANO.md sec. 5): the RESOLVER action on a map template
// hands off to the cockpit exactly like F4's attack intent and CM1's focus
// intent — same sessionStorage-based, one-shot, expiring envelope, now built
// on the shared envelope in intentEnvelope.ts (ARQUITETURA 4A) instead of
// triplicating the version/createdAt/TTL/parse/save/load/clear boilerplate.
import { createIntentEnvelope, parseIntentEnvelope, loadIntentEnvelope, saveIntentEnvelope, clearIntentEnvelope, IntentEnvelopeMeta } from './intentEnvelope.ts';

export const MAP_AOE_INTENT_KEY = 'limiar.mapAoeIntent.v1';
export const MAP_AOE_INTENT_MAX_AGE_MS = 10 * 60 * 1000;

export interface MapAoeIntentPayload {
  campaignId: string;
  sceneId: string;
  templateId: string;
  expectedRevision: number;
  areaKind: string;
  areaLabel: string;
  targetCharacterIds: string[];
}

export type MapAoeIntent = MapAoeIntentPayload & IntentEnvelopeMeta;

function validateMapAoeIntentPayload(raw: Record<string, unknown>): MapAoeIntentPayload | null {
  if (!String(raw.campaignId || '') || !String(raw.sceneId || '') || !String(raw.templateId || '')) return null;
  const targetCharacterIds = Array.isArray(raw.targetCharacterIds)
    ? Array.from(new Set((raw.targetCharacterIds as unknown[]).map(id => String(id || '')).filter(Boolean)))
    : [];
  if (!targetCharacterIds.length) return null;
  const expectedRevision = Number(raw.expectedRevision);
  if (!(expectedRevision >= 0)) return null;
  return {
    campaignId: String(raw.campaignId),
    sceneId: String(raw.sceneId),
    templateId: String(raw.templateId),
    expectedRevision,
    areaKind: String(raw.areaKind || ''),
    areaLabel: String(raw.areaLabel || ''),
    targetCharacterIds,
  };
}

export function createMapAoeIntent(input: MapAoeIntentPayload, now: number = Date.now()): MapAoeIntent {
  return createIntentEnvelope(input, now);
}

export function parseMapAoeIntent(value: unknown, now: number = Date.now()): MapAoeIntent | null {
  return parseIntentEnvelope(value, validateMapAoeIntentPayload, MAP_AOE_INTENT_MAX_AGE_MS, now);
}

export function loadMapAoeIntent(storage: Pick<Storage, 'getItem' | 'removeItem'> | null | undefined, now: number = Date.now()): MapAoeIntent | null {
  return loadIntentEnvelope(storage, MAP_AOE_INTENT_KEY, validateMapAoeIntentPayload, MAP_AOE_INTENT_MAX_AGE_MS, now);
}

export function saveMapAoeIntent(storage: Pick<Storage, 'setItem'>, intent: MapAoeIntent): void {
  saveIntentEnvelope(storage, MAP_AOE_INTENT_KEY, intent);
}

export function clearMapAoeIntent(storage: Pick<Storage, 'removeItem'> | null | undefined): void {
  clearIntentEnvelope(storage, MAP_AOE_INTENT_KEY);
}
