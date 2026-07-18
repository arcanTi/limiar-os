import { describe, expect, it } from 'vitest';

import {
  MAP_FOCUS_INTENT_KEY,
  MAP_FOCUS_INTENT_MAX_AGE_MS,
  clearMapFocusIntent,
  createMapFocusIntent,
  loadMapFocusIntent,
  parseMapFocusIntent,
  saveMapFocusIntent,
} from '../../../src/domain/map/mapFocusIntent.ts';

const input = { campaignId: 'c', characterId: 'mira', mode: 'sheet' };

function fakeStorage(initial = {}) {
  const store = { ...initial };
  return {
    getItem: (key) => (key in store ? store[key] : null),
    setItem: (key, value) => { store[key] = value; },
    removeItem: (key) => { delete store[key]; },
    _store: store,
  };
}

describe('map focus intent', () => {
  it('is versioned and expires', () => {
    const intent = createMapFocusIntent(input, 1000);
    expect(parseMapFocusIntent(intent, 1001)).toMatchObject({ version: 1, characterId: 'mira', mode: 'sheet' });
    expect(parseMapFocusIntent(intent, 1000 + MAP_FOCUS_INTENT_MAX_AGE_MS + 1)).toBeNull();
  });

  it('rejects a malformed or backdated-future payload', () => {
    expect(parseMapFocusIntent(null)).toBeNull();
    expect(parseMapFocusIntent({ version: 1, campaignId: '', characterId: 'mira', createdAt: 1000 })).toBeNull();
    expect(parseMapFocusIntent({ version: 2, campaignId: 'c', characterId: 'mira', createdAt: 1000 })).toBeNull();
    expect(parseMapFocusIntent({ version: 1, campaignId: 'c', characterId: 'mira', createdAt: 500 + 61_000 }, 500)).toBeNull();
  });

  it('defaults an unrecognized mode to sheet rather than silently accepting an invalid one', () => {
    const intent = createMapFocusIntent({ ...input, mode: 'bogus' }, 1000);
    expect(parseMapFocusIntent(intent, 1001).mode).toBe('sheet');
  });

  it('round-trips through storage and clears itself once consumed', () => {
    const storage = fakeStorage();
    const intent = createMapFocusIntent(input, 1000);
    saveMapFocusIntent(storage, intent);
    expect(loadMapFocusIntent(storage, 1001)).toMatchObject({ characterId: 'mira' });
    clearMapFocusIntent(storage);
    expect(storage.getItem(MAP_FOCUS_INTENT_KEY)).toBeNull();
  });

  it('discards and clears an expired or corrupt entry on load', () => {
    const storage = fakeStorage();
    const intent = createMapFocusIntent(input, 1000);
    saveMapFocusIntent(storage, intent);
    expect(loadMapFocusIntent(storage, 1000 + MAP_FOCUS_INTENT_MAX_AGE_MS + 1)).toBeNull();
    expect(storage.getItem(MAP_FOCUS_INTENT_KEY)).toBeNull();

    const corrupt = fakeStorage({ [MAP_FOCUS_INTENT_KEY]: 'not json' });
    expect(loadMapFocusIntent(corrupt)).toBeNull();
    expect(corrupt.getItem(MAP_FOCUS_INTENT_KEY)).toBeNull();
  });
});
