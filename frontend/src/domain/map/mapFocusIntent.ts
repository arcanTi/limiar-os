// CM1 (PLANO-COMBATE-MAPA.md / M2): a lighter sibling of mapAttackIntent —
// "open this character" from the map's token context menu has no range/turn
// validation to carry, just who and where to land. Same envelope shape,
// same one-shot sessionStorage handoff and expiry discipline as F4's attack
// intent, so the two flows stay easy to reason about together.
export const MAP_FOCUS_INTENT_KEY = 'limiar.mapFocusIntent.v1';
export const MAP_FOCUS_INTENT_MAX_AGE_MS = 10 * 60 * 1000;

export type MapFocusIntentMode = 'sheet' | 'combat';

export interface MapFocusIntent {
  version: 1;
  campaignId: string;
  characterId: string;
  mode: MapFocusIntentMode;
  createdAt: number;
}

export function createMapFocusIntent(input: Omit<MapFocusIntent, 'version' | 'createdAt'>, now: number = Date.now()): MapFocusIntent {
  return { ...input, version: 1, createdAt: now };
}

export function parseMapFocusIntent(value: unknown, now: number = Date.now()): MapFocusIntent | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Partial<MapFocusIntent>;
  if (raw.version !== 1 || !String(raw.campaignId || '') || !String(raw.characterId || '')) return null;
  const mode: MapFocusIntentMode = raw.mode === 'combat' ? 'combat' : 'sheet';
  const createdAt = Number(raw.createdAt);
  if (!(createdAt > 0) || now - createdAt > MAP_FOCUS_INTENT_MAX_AGE_MS || createdAt > now + 60_000) return null;
  return { version: 1, campaignId: String(raw.campaignId), characterId: String(raw.characterId), mode, createdAt };
}

export function loadMapFocusIntent(storage: Pick<Storage, 'getItem' | 'removeItem'> | null | undefined, now: number = Date.now()): MapFocusIntent | null {
  if (!storage) return null;
  try {
    const intent = parseMapFocusIntent(JSON.parse(storage.getItem(MAP_FOCUS_INTENT_KEY) || 'null'), now);
    if (!intent) storage.removeItem(MAP_FOCUS_INTENT_KEY);
    return intent;
  } catch (_) {
    storage.removeItem(MAP_FOCUS_INTENT_KEY);
    return null;
  }
}

export function saveMapFocusIntent(storage: Pick<Storage, 'setItem'>, intent: MapFocusIntent): void {
  storage.setItem(MAP_FOCUS_INTENT_KEY, JSON.stringify(intent));
}

export function clearMapFocusIntent(storage: Pick<Storage, 'removeItem'> | null | undefined): void {
  if (storage) storage.removeItem(MAP_FOCUS_INTENT_KEY);
}
