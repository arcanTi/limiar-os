import { describe, expect, it, vi } from 'vitest';

import { createMapDataRuntime } from '../../../src/pages/campaignMapDataRuntime.js';

function makeRuntime(result) {
  const state = { selected: 't1', selectedTemplateId: 'tpl1', selectedPropId: 'p1', selectedIds: ['t1', 'gone'], mapVersion: 2 };
  const renderLoaded = vi.fn().mockResolvedValue(), renderSoft = vi.fn(), ingestPings = vi.fn();
  const api = { get: vi.fn().mockResolvedValue(result || { canEdit: true, scene: { difficultTerrain: [[2, 3]] }, tokens: [{ id: 't1' }], templates: [{ id: 'tpl1' }], props: [{ id: 'p1' }], mapVersion: 4, pings: [{ id: 'ping' }] }) };
  return { state, api, renderLoaded, renderSoft, ingestPings, runtime: createMapDataRuntime({ api, campaignId: 'camp-1', state, cellKey: (x, y) => `${x},${y}`, ingestPings, renderLoaded, renderSoft }) };
}

describe('createMapDataRuntime (ARQUITETURA 4B)', () => {
  it('hydrates map data, version and difficult terrain before rendering', async () => {
    const { runtime, state, api, ingestPings, renderLoaded } = makeRuntime();
    await runtime.load();
    expect(api.get).toHaveBeenCalledWith('camp-1');
    expect(state.canEdit).toBe(true);
    expect(state.selectedIds).toEqual(['t1']);
    expect(state.mapVersion).toBe(4);
    expect([...state.difficultCells]).toEqual(['2,3']);
    expect(ingestPings).toHaveBeenCalledWith([{ id: 'ping' }]);
    expect(renderLoaded).toHaveBeenCalledOnce();
  });

  it('preserves valid selections across a soft reload and rerenders selection UI', async () => {
    const { runtime, state, renderSoft } = makeRuntime();
    await runtime.loadSoft();
    expect(state.selected).toBe('t1');
    expect(state.selectedTemplateId).toBe('tpl1');
    expect(state.selectedPropId).toBe('p1');
    expect(renderSoft).toHaveBeenCalledOnce();
  });

  it('absorbs soft-reload failures without throwing', async () => {
    const { runtime, api } = makeRuntime();
    api.get.mockRejectedValueOnce(new Error('offline'));
    await expect(runtime.loadSoft()).resolves.toBeUndefined();
  });
});
