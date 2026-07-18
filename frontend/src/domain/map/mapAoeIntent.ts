// Fase AREA (README-PLANO.md sec. 5): the RESOLVER action on a map template
// hands off to the cockpit exactly like F4's attack intent and CM1's focus
// intent — same sessionStorage-based, one-shot, expiring envelope. This is
// deliberately the THIRD near-identical intent module (see README-PLANO.md
// sec. 7 item 4: "if a third intent is born, unify into a generic versioned
// envelope instead of triplicating" — noted, not done here: the three
// modules are still small and independently trivial to read; unifying them
// is a refactor for when a fourth one shows up, not a prerequisite for this
// one).
export const MAP_AOE_INTENT_KEY = 'limiar.mapAoeIntent.v1';
export const MAP_AOE_INTENT_MAX_AGE_MS = 10 * 60 * 1000;

export interface MapAoeIntent {
  version: 1;
  campaignId: string;
  sceneId: string;
  templateId: string;
  expectedRevision: number;
  areaKind: string;
  areaLabel: string;
  targetCharacterIds: string[];
  createdAt: number;
}

export function createMapAoeIntent(input: Omit<MapAoeIntent, 'version' | 'createdAt'>, now: number = Date.now()): MapAoeIntent {
  return { ...input, version: 1, createdAt: now };
}

export function parseMapAoeIntent(value: unknown, now: number = Date.now()): MapAoeIntent | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Partial<MapAoeIntent>;
  if (raw.version !== 1 || !String(raw.campaignId || '') || !String(raw.sceneId || '') || !String(raw.templateId || '')) return null;
  const targetCharacterIds = Array.isArray(raw.targetCharacterIds)
    ? Array.from(new Set(raw.targetCharacterIds.map(id => String(id || '')).filter(Boolean)))
    : [];
  if (!targetCharacterIds.length) return null;
  const expectedRevision = Number(raw.expectedRevision);
  const createdAt = Number(raw.createdAt);
  if (!(expectedRevision >= 0) || !(createdAt > 0) || now - createdAt > MAP_AOE_INTENT_MAX_AGE_MS || createdAt > now + 60_000) return null;
  return {
    version: 1,
    campaignId: String(raw.campaignId),
    sceneId: String(raw.sceneId),
    templateId: String(raw.templateId),
    expectedRevision,
    areaKind: String(raw.areaKind || ''),
    areaLabel: String(raw.areaLabel || ''),
    targetCharacterIds,
    createdAt,
  };
}

export function loadMapAoeIntent(storage: Pick<Storage, 'getItem' | 'removeItem'> | null | undefined, now: number = Date.now()): MapAoeIntent | null {
  if (!storage) return null;
  try {
    const intent = parseMapAoeIntent(JSON.parse(storage.getItem(MAP_AOE_INTENT_KEY) || 'null'), now);
    if (!intent) storage.removeItem(MAP_AOE_INTENT_KEY);
    return intent;
  } catch (_) {
    storage.removeItem(MAP_AOE_INTENT_KEY);
    return null;
  }
}

export function saveMapAoeIntent(storage: Pick<Storage, 'setItem'>, intent: MapAoeIntent): void {
  storage.setItem(MAP_AOE_INTENT_KEY, JSON.stringify(intent));
}

export function clearMapAoeIntent(storage: Pick<Storage, 'removeItem'> | null | undefined): void {
  if (storage) storage.removeItem(MAP_AOE_INTENT_KEY);
}
