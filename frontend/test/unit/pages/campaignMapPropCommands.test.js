import { describe, expect, it, vi } from 'vitest';

import { createPropCommands } from '../../../src/pages/campaignMapPropCommands.js';

function makeCtx(overrides = {}) {
  const state = { props: [{ id: 'p1', material: 'wood', hpMax: 10, hp: 10 }], selectedPropId: null, sceneRevision: 0 };
  const api = {
    saveProp: vi.fn().mockResolvedValue({ id: 'p1', hp: 10, sceneRevision: 2 }),
    deleteProp: vi.fn().mockResolvedValue({ sceneRevision: 3 }),
    damageProp: vi.fn().mockResolvedValue({ id: 'p1', hp: 4, sceneRevision: 4, destroyed: false }),
  };
  const status = vi.fn();
  const render = vi.fn();
  const drawOnce = vi.fn();
  return {
    ctx: {
      api,
      campaignId: 'camp-1',
      getMaterialOverride: current => current,
      getHpMaxOverride: current => current,
      getExpectedRevision: () => state.sceneRevision,
      setSceneRevision: revision => { state.sceneRevision = revision; },
      getProps: () => state.props,
      setProps: props => { state.props = props; },
      getSelectedPropId: () => state.selectedPropId,
      setSelectedPropId: id => { state.selectedPropId = id; },
      render,
      drawOnce,
      status,
      confirmDelete: vi.fn().mockResolvedValue(true),
      promptDamage: vi.fn().mockResolvedValue('5'),
      ...overrides,
    },
    state, api, status, render, drawOnce,
  };
}

describe('createPropCommands (ARQUITETURA 4B)', () => {
  it('saveProp persists with the expected revision and folds the new one back, replacing the prop by id', async () => {
    const { ctx, api, state, status } = makeCtx();
    const commands = createPropCommands(ctx);
    await commands.saveProp({ id: 'p1', material: 'wood', hpMax: 10 });
    expect(api.saveProp).toHaveBeenCalledWith('camp-1', expect.objectContaining({ id: 'p1', expectedRevision: 0 }));
    expect(state.sceneRevision).toBe(2);
    expect(state.props.find(p => p.id === 'p1')).toMatchObject({ hp: 10 });
    expect(status).toHaveBeenCalledWith('prop salvo', 'ok');
  });

  it('saveProp flashes an error and does not touch state if the API rejects', async () => {
    const { ctx, state, status } = makeCtx({ api: { saveProp: vi.fn().mockRejectedValue(new Error('conflito')) } });
    const commands = createPropCommands(ctx);
    const before = state.props;
    await commands.saveProp({ id: 'p1' });
    expect(status).toHaveBeenCalledWith('conflito', 'err');
    expect(state.props).toBe(before);
  });

  it('deleteProp does nothing if the confirm dialog is dismissed', async () => {
    const { ctx, api } = makeCtx({ confirmDelete: vi.fn().mockResolvedValue(false) });
    const commands = createPropCommands(ctx);
    await commands.deleteProp('p1');
    expect(api.deleteProp).not.toHaveBeenCalled();
  });

  it('deleteProp removes the prop, clears selection if it was selected, and updates revision', async () => {
    const { ctx, state, status } = makeCtx();
    state.selectedPropId = 'p1';
    const commands = createPropCommands(ctx);
    await commands.deleteProp('p1');
    expect(state.props.find(p => p.id === 'p1')).toBeUndefined();
    expect(state.selectedPropId).toBeNull();
    expect(state.sceneRevision).toBe(3);
    expect(status).toHaveBeenCalledWith('prop removido', 'ok');
  });

  it('damageProp does nothing if the prompt is dismissed or the amount is not positive', async () => {
    const { ctx, api } = makeCtx({ promptDamage: vi.fn().mockResolvedValue(null) });
    const commands = createPropCommands(ctx);
    await commands.damageProp('p1');
    expect(api.damageProp).not.toHaveBeenCalled();

    const { ctx: ctx2, api: api2, status: status2 } = makeCtx({ promptDamage: vi.fn().mockResolvedValue('0') });
    await createPropCommands(ctx2).damageProp('p1');
    expect(api2.damageProp).not.toHaveBeenCalled();
    expect(status2).toHaveBeenCalledWith('dano invalido', 'err');
  });

  it('damageProp applies damage and reports destroyed vs damaged', async () => {
    const { ctx, api, status } = makeCtx();
    const commands = createPropCommands(ctx);
    await commands.damageProp('p1');
    expect(api.damageProp).toHaveBeenCalledWith('camp-1', { propId: 'p1', amount: 5, expectedRevision: 0 });
    expect(status).toHaveBeenCalledWith('dano aplicado', 'ok');

    const { ctx: ctx2, status: status2 } = makeCtx({ api: { damageProp: vi.fn().mockResolvedValue({ id: 'p1', destroyed: true, sceneRevision: 5 }) } });
    await createPropCommands(ctx2).damageProp('p1');
    expect(status2).toHaveBeenCalledWith('prop destruido', 'ok');
  });
});
