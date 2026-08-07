import { describe, expect, it } from 'vitest';

import {
  MAP_AOE_INTENT_KEY,
  MAP_AOE_INTENT_MAX_AGE_MS,
  clearMapAoeIntent,
  createMapAoeIntent,
  loadMapAoeIntent,
  parseMapAoeIntent,
  saveMapAoeIntent,
} from '../../../src/domain/map/mapAoeIntent.ts';

const input = {
  campaignId: 'c', sceneId: 's1', templateId: 'tpl-1', expectedRevision: 0,
  areaKind: 'circle', areaLabel: 'granada', targetCharacterIds: ['mira', 'rook'],
};

function fakeStorage(initial = {}) {
  const store = { ...initial };
  return {
    getItem: (key) => (key in store ? store[key] : null),
    setItem: (key, value) => { store[key] = value; },
    removeItem: (key) => { delete store[key]; },
    _store: store,
  };
}

describe('map aoe intent', () => {
  it('is versioned and expires', () => {
    const intent = createMapAoeIntent(input, 1000);
    expect(parseMapAoeIntent(intent, 1001)).toMatchObject({ version: 1, templateId: 'tpl-1', targetCharacterIds: ['mira', 'rook'] });
    expect(parseMapAoeIntent(intent, 1000 + MAP_AOE_INTENT_MAX_AGE_MS + 1)).toBeNull();
  });

  it('rejects a malformed, backdated-future, or targetless payload', () => {
    expect(parseMapAoeIntent(null)).toBeNull();
    expect(parseMapAoeIntent({ ...input, version: 2, createdAt: 1000 })).toBeNull();
    expect(parseMapAoeIntent({ ...input, templateId: '', createdAt: 1000 })).toBeNull();
    expect(parseMapAoeIntent({ ...input, targetCharacterIds: [], createdAt: 1000 })).toBeNull();
    expect(parseMapAoeIntent({ ...input, expectedRevision: undefined, createdAt: 1000 })).toBeNull();
    expect(parseMapAoeIntent({ ...input, createdAt: 500 + 61_000 }, 500)).toBeNull();
  });

  it('de-duplicates target ids and drops blanks', () => {
    const intent = createMapAoeIntent({ ...input, targetCharacterIds: ['mira', 'mira', '', 'rook'] }, 1000);
    expect(parseMapAoeIntent(intent, 1001).targetCharacterIds).toEqual(['mira', 'rook']);
  });

  it('round-trips through storage and clears itself once consumed', () => {
    const storage = fakeStorage();
    const intent = createMapAoeIntent(input, 1000);
    saveMapAoeIntent(storage, intent);
    expect(loadMapAoeIntent(storage, 1001)).toMatchObject({ templateId: 'tpl-1' });
    clearMapAoeIntent(storage);
    expect(storage.getItem(MAP_AOE_INTENT_KEY)).toBeNull();
  });

  it('discards and clears an expired or corrupt entry on load', () => {
    const storage = fakeStorage();
    const intent = createMapAoeIntent(input, 1000);
    saveMapAoeIntent(storage, intent);
    expect(loadMapAoeIntent(storage, 1000 + MAP_AOE_INTENT_MAX_AGE_MS + 1)).toBeNull();
    expect(storage.getItem(MAP_AOE_INTENT_KEY)).toBeNull();

    const corrupt = fakeStorage({ [MAP_AOE_INTENT_KEY]: 'not json' });
    expect(loadMapAoeIntent(corrupt)).toBeNull();
    expect(corrupt.getItem(MAP_AOE_INTENT_KEY)).toBeNull();
  });
});
