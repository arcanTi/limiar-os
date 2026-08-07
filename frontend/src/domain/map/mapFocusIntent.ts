// One-shot intent for opening a character from the map's token context menu.
// It carries only the target identity and destination, using the same expiring
// sessionStorage envelope as other map handoffs.
import { createIntentEnvelope, parseIntentEnvelope, loadIntentEnvelope, saveIntentEnvelope, clearIntentEnvelope, IntentEnvelopeMeta } from './intentEnvelope.ts';

export const MAP_FOCUS_INTENT_KEY = 'limiar.mapFocusIntent.v1';
export const MAP_FOCUS_INTENT_MAX_AGE_MS = 10 * 60 * 1000;

export type MapFocusIntentMode = 'sheet' | 'combat';

export interface MapFocusIntentPayload {
  campaignId: string;
  characterId: string;
  mode: MapFocusIntentMode;
}

export type MapFocusIntent = MapFocusIntentPayload & IntentEnvelopeMeta;

function validateMapFocusIntentPayload(raw: Record<string, unknown>): MapFocusIntentPayload | null {
  if (!String(raw.campaignId || '') || !String(raw.characterId || '')) return null;
  const mode: MapFocusIntentMode = raw.mode === 'combat' ? 'combat' : 'sheet';
  return { campaignId: String(raw.campaignId), characterId: String(raw.characterId), mode };
}

export function createMapFocusIntent(input: MapFocusIntentPayload, now: number = Date.now()): MapFocusIntent {
  return createIntentEnvelope(input, now);
}

export function parseMapFocusIntent(value: unknown, now: number = Date.now()): MapFocusIntent | null {
  return parseIntentEnvelope(value, validateMapFocusIntentPayload, MAP_FOCUS_INTENT_MAX_AGE_MS, now);
}

export function loadMapFocusIntent(storage: Pick<Storage, 'getItem' | 'removeItem'> | null | undefined, now: number = Date.now()): MapFocusIntent | null {
  return loadIntentEnvelope(storage, MAP_FOCUS_INTENT_KEY, validateMapFocusIntentPayload, MAP_FOCUS_INTENT_MAX_AGE_MS, now);
}

export function saveMapFocusIntent(storage: Pick<Storage, 'setItem'>, intent: MapFocusIntent): void {
  saveIntentEnvelope(storage, MAP_FOCUS_INTENT_KEY, intent);
}

export function clearMapFocusIntent(storage: Pick<Storage, 'removeItem'> | null | undefined): void {
  clearIntentEnvelope(storage, MAP_FOCUS_INTENT_KEY);
}
