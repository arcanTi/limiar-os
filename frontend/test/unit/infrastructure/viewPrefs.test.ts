import { describe, expect, it } from 'vitest';

import { VIEW_PREFS_KEY, readViewPrefs, writeViewPrefs } from '../../../src/infrastructure/viewPrefs.ts';

function memoryStorage(seed: Record<string, string> = {}): Storage {
  const map = new Map(Object.entries(seed));
  return {
    get length() { return map.size; },
    clear: () => map.clear(),
    getItem: (key: string) => (map.has(key) ? map.get(key)! : null),
    key: (index: number) => Array.from(map.keys())[index] ?? null,
    removeItem: (key: string) => { map.delete(key); },
    setItem: (key: string, value: string) => { map.set(key, value); },
  } as Storage;
}

const throwingStorage = () => ({
  getItem: () => { throw new Error('blocked'); },
  setItem: () => { throw new Error('blocked'); },
  removeItem: () => { throw new Error('blocked'); },
  clear: () => {},
  key: () => null,
  length: 0,
}) as unknown as Storage;

describe('infrastructure/viewPrefs', () => {
  it('reads an empty object when nothing was stored', () => {
    expect(readViewPrefs({ storage: memoryStorage() })).toEqual({});
  });

  it('round-trips a preference', () => {
    const storage = memoryStorage();
    writeViewPrefs({ sheetCoreSections: { attrs: true } }, { storage });
    expect(readViewPrefs({ storage })).toEqual({ sheetCoreSections: { attrs: true } });
  });

  it('merges into what is already stored instead of replacing it', () => {
    const storage = memoryStorage();
    writeViewPrefs({ a: 1 }, { storage });
    writeViewPrefs({ b: 2 }, { storage });
    expect(readViewPrefs({ storage })).toEqual({ a: 1, b: 2 });
  });

  it('degrades to defaults when the stored value is corrupt or the wrong shape', () => {
    expect(readViewPrefs({ storage: memoryStorage({ [VIEW_PREFS_KEY]: '{not json' }) })).toEqual({});
    expect(readViewPrefs({ storage: memoryStorage({ [VIEW_PREFS_KEY]: '[1,2]' }) })).toEqual({});
    expect(readViewPrefs({ storage: memoryStorage({ [VIEW_PREFS_KEY]: '"text"' }) })).toEqual({});
  });

  it('stays silent when storage itself throws (private mode, blocked site data)', () => {
    const storage = throwingStorage();
    expect(readViewPrefs({ storage })).toEqual({});
    expect(() => writeViewPrefs({ a: 1 }, { storage })).not.toThrow();
  });

  it('does nothing when there is no storage at all', () => {
    expect(readViewPrefs({ storage: null })).toEqual({});
    expect(() => writeViewPrefs({ a: 1 }, { storage: null })).not.toThrow();
  });
});
