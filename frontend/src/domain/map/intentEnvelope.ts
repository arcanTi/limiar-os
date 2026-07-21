// ARQUITETURA 4A: mapAttackIntent, mapFocusIntent and mapAoeIntent were three
// near-identical sessionStorage envelopes (same version/createdAt/TTL/parse/
// save/load/clear shape, only the payload fields differed). This is the
// generic envelope the three now build on; each intent module still owns its
// own small, typed payload and validation.
export interface IntentEnvelopeMeta {
  version: 1;
  createdAt: number;
}

export function createIntentEnvelope<T extends object>(payload: T, now: number = Date.now()): T & IntentEnvelopeMeta {
  return { ...payload, version: 1, createdAt: now };
}

export function parseIntentEnvelope<T extends object>(
  value: unknown,
  validatePayload: (raw: Record<string, unknown>) => T | null,
  maxAgeMs: number,
  now: number = Date.now(),
): (T & IntentEnvelopeMeta) | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Record<string, unknown>;
  if (raw.version !== 1) return null;
  const createdAt = Number(raw.createdAt);
  if (!(createdAt > 0) || now - createdAt > maxAgeMs || createdAt > now + 60_000) return null;
  const payload = validatePayload(raw);
  if (!payload) return null;
  return { ...payload, version: 1, createdAt };
}

export function loadIntentEnvelope<T extends object>(
  storage: Pick<Storage, 'getItem' | 'removeItem'> | null | undefined,
  key: string,
  validatePayload: (raw: Record<string, unknown>) => T | null,
  maxAgeMs: number,
  now: number = Date.now(),
): (T & IntentEnvelopeMeta) | null {
  if (!storage) return null;
  try {
    const intent = parseIntentEnvelope(JSON.parse(storage.getItem(key) || 'null'), validatePayload, maxAgeMs, now);
    if (!intent) storage.removeItem(key);
    return intent;
  } catch (_) {
    storage.removeItem(key);
    return null;
  }
}

export function saveIntentEnvelope<T extends IntentEnvelopeMeta>(storage: Pick<Storage, 'setItem'>, key: string, intent: T): void {
  storage.setItem(key, JSON.stringify(intent));
}

export function clearIntentEnvelope(storage: Pick<Storage, 'removeItem'> | null | undefined, key: string): void {
  if (storage) storage.removeItem(key);
}
