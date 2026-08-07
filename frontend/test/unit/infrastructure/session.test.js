import { describe, expect, it } from 'vitest';

import { clearToken, getToken, setToken } from '../../../src/infrastructure/session.ts';

function memoryStorage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem: (key) => values.get(key) || null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
  };
}

describe('infrastructure/session', () => {
  it('reads the auth token before the legacy GM token', () => {
    const storage = memoryStorage({ limiar_auth_token: 'auth', limiar_gm_token: 'gm' });
    expect(getToken({ storage })).toBe('auth');
  });

  it('falls back to the legacy GM token', () => {
    const storage = memoryStorage({ limiar_gm_token: 'gm' });
    expect(getToken({ storage })).toBe('gm');
  });

  it('sets the canonical token and removes stale legacy tokens', () => {
    const storage = memoryStorage({ limiar_gm_token: 'old-gm' });
    setToken('new-auth', { storage });
    expect(getToken({ storage })).toBe('new-auth');
    expect(storage.getItem('limiar_gm_token')).toBeNull();
  });

  it('clears canonical and legacy tokens', () => {
    const storage = memoryStorage({ limiar_auth_token: 'auth', limiar_gm_token: 'gm' });
    clearToken({ storage });
    expect(getToken({ storage })).toBeNull();
  });
});
