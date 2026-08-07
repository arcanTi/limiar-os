import { describe, expect, it } from 'vitest';

import { clearIntentEnvelope, createIntentEnvelope, loadIntentEnvelope, parseIntentEnvelope, saveIntentEnvelope } from '../../../src/domain/map/intentEnvelope.ts';

const KEY = 'test.intent.v1';
const MAX_AGE_MS = 1000;
const validate = (raw) => (raw.foo ? { foo: String(raw.foo) } : null);

function fakeStorage(initial) {
  const data = { ...initial };
  return {
    getItem: (k) => (k in data ? data[k] : null),
    setItem: (k, v) => { data[k] = v; },
    removeItem: (k) => { delete data[k]; },
    _data: data,
  };
}

describe('intent envelope (ARQUITETURA 4A shared base)', () => {
  it('creates, saves, loads and round-trips a payload', () => {
    const intent = createIntentEnvelope({ foo: 'bar' }, 1000);
    expect(intent).toEqual({ foo: 'bar', version: 1, createdAt: 1000 });
    const storage = fakeStorage();
    saveIntentEnvelope(storage, KEY, intent);
    expect(loadIntentEnvelope(storage, KEY, validate, MAX_AGE_MS, 1001)).toEqual(intent);
  });

  it('rejects and clears an expired envelope', () => {
    const intent = createIntentEnvelope({ foo: 'bar' }, 1000);
    const storage = fakeStorage();
    saveIntentEnvelope(storage, KEY, intent);
    expect(loadIntentEnvelope(storage, KEY, validate, MAX_AGE_MS, 1000 + MAX_AGE_MS + 1)).toBeNull();
    expect(storage.getItem(KEY)).toBeNull();
  });

  it('rejects a createdAt too far in the future (clock skew guard)', () => {
    expect(parseIntentEnvelope({ foo: 'bar', version: 1, createdAt: Date.now() + 120_000 }, validate, MAX_AGE_MS)).toBeNull();
  });

  it('rejects a payload that fails validation and a wrong version', () => {
    expect(parseIntentEnvelope({ version: 1, createdAt: 1000 }, validate, MAX_AGE_MS, 1000)).toBeNull();
    expect(parseIntentEnvelope({ foo: 'bar', version: 2, createdAt: 1000 }, validate, MAX_AGE_MS, 1000)).toBeNull();
  });

  it('returns null for missing storage or corrupt JSON without throwing', () => {
    expect(loadIntentEnvelope(null, KEY, validate, MAX_AGE_MS)).toBeNull();
    const storage = fakeStorage({ [KEY]: '{not json' });
    expect(loadIntentEnvelope(storage, KEY, validate, MAX_AGE_MS)).toBeNull();
    expect(storage.getItem(KEY)).toBeNull();
  });

  it('clearIntentEnvelope removes the key and tolerates a missing storage', () => {
    const storage = fakeStorage({ [KEY]: 'x' });
    clearIntentEnvelope(storage, KEY);
    expect(storage.getItem(KEY)).toBeNull();
    expect(() => clearIntentEnvelope(null, KEY)).not.toThrow();
  });
});
