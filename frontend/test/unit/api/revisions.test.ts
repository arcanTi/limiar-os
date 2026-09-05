import { afterEach, describe, expect, it, vi } from 'vitest';

import { createCharactersApi } from '../../../src/infrastructure/api/characters.ts';
import { createCombatApi } from '../../../src/infrastructure/api/combat.ts';
import { createHttpClient } from '../../../src/infrastructure/api/http.ts';
import type { HttpRequest } from '../../../src/infrastructure/api/http.ts';

function requestRecorder() {
  const calls: { path: string; options?: RequestInit }[] = [];
  const request: HttpRequest = async <T>(path: string, options?: RequestInit): Promise<T> => {
    calls.push({ path, options });
    return {} as T;
  };
  return { calls, request };
}

describe('revision-aware API clients', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('sends a character revision back as expectedRevision', async () => {
    const { calls, request } = requestRecorder();

    await createCharactersApi(request).upsert({ id: 'rook', name: 'Rook', revision: 4 });

    expect(JSON.parse(String(calls[0].options?.body))).toEqual({
      id: 'rook', name: 'Rook', revision: 4, expectedRevision: 4,
    });
  });

  it('sends combat revisions for state writes and end-turn commands', async () => {
    const { calls, request } = requestRecorder();
    const combat = createCombatApi(request, 'night-city');
    const state = {
      active: true, round: 1, turnIndex: 0, order: ['rook'],
      combatants: { rook: { side: 'pc' as const, initiative: 12, acted: false, defeated: false } },
      updatedAt: '2026-08-07T00:00:00.000Z', revision: 6,
    };

    await combat.state.set(state);
    await combat.state.endTurn('rook', state.revision);

    expect(JSON.parse(String(calls[0].options?.body))).toMatchObject({ expectedRevision: 6 });
    expect(JSON.parse(String(calls[1].options?.body))).toEqual({ targetId: 'rook', expectedRevision: 6 });
  });

  it('keeps API conflict codes and details available to the UI', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 409,
      json: async () => ({ error: { code: 'REVISION_CONFLICT', message: 'Reload', details: { currentRevision: 2 } } }),
    }));

    await expect(createHttpClient().request('/characters/rook')).rejects.toMatchObject({
      status: 409, code: 'REVISION_CONFLICT', details: { currentRevision: 2 }, message: 'Reload',
    });
  });
});
