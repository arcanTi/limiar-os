import { describe, expect, it, vi } from 'vitest';

import { createLightCommands } from '../../../src/pages/campaignMapLightCommands.js';

function makeCtx(overrides = {}) {
  const state = { revision: 1, lights: [{ id: 'l1', enabled: true, color: '#fff' }] };
  const api = {
    saveLight: vi.fn().mockResolvedValue({ id: 'l1', enabled: true, sceneRevision: 2 }),
    deleteLight: vi.fn().mockResolvedValue({ sceneRevision: 3 }),
    toggleLight: vi.fn().mockResolvedValue({ id: 'l1', enabled: false, sceneRevision: 4 }),
  };
  const render = vi.fn(), drawOnce = vi.fn(), status = vi.fn();
  return {
    ctx: {
      api, campaignId: 'camp-1', getExpectedRevision: () => state.revision, setSceneRevision: revision => { state.revision = revision; },
      getLights: () => state.lights, setLights: lights => { state.lights = lights; }, render, drawOnce, status, ...overrides,
    }, state, api, render, drawOnce, status,
  };
}

describe('createLightCommands (ARQUITETURA 4B)', () => {
  it('saves a light with the current revision, replaces it, and advances the revision', async () => {
    const { ctx, api, state, status } = makeCtx();
    await createLightCommands(ctx).saveLight({ id: 'l1', kind: 'point' });
    expect(api.saveLight).toHaveBeenCalledWith('camp-1', { id: 'l1', kind: 'point', expectedRevision: 1 });
    expect(state.revision).toBe(2);
    expect(state.lights).toEqual([expect.objectContaining({ id: 'l1', enabled: true })]);
    expect(status).toHaveBeenCalledWith('luz salva', 'ok');
  });

  it('deletes a light and updates revision plus local list', async () => {
    const { ctx, api, state, status } = makeCtx();
    await createLightCommands(ctx).deleteLight('l1');
    expect(api.deleteLight).toHaveBeenCalledWith('camp-1', { lightId: 'l1', expectedRevision: 1 });
    expect(state.lights).toEqual([]);
    expect(state.revision).toBe(3);
    expect(status).toHaveBeenCalledWith('luz removida', 'ok');
  });

  it('toggles a light and reports whether it was turned on or off', async () => {
    const { ctx, api, state, status } = makeCtx();
    await createLightCommands(ctx).toggleLight('l1');
    expect(api.toggleLight).toHaveBeenCalledWith('camp-1', { lightId: 'l1', expectedRevision: 1 });
    expect(state.lights[0].enabled).toBe(false);
    expect(status).toHaveBeenCalledWith('luz apagada', 'ok');

    const on = makeCtx({ api: { toggleLight: vi.fn().mockResolvedValue({ id: 'l1', enabled: true, sceneRevision: 5 }) } });
    await createLightCommands(on.ctx).toggleLight('l1');
    expect(on.status).toHaveBeenCalledWith('luz ligada', 'ok');
  });

  it('redraws and rerenders after every successful mutation', async () => {
    const { ctx, render, drawOnce } = makeCtx();
    const commands = createLightCommands(ctx);
    await commands.saveLight({ id: 'l1' });
    await commands.deleteLight('l1');
    await commands.toggleLight('l1');
    expect(render).toHaveBeenCalledTimes(3);
    expect(drawOnce).toHaveBeenCalledTimes(3);
  });
});
