import { describe, expect, it, vi } from 'vitest';

import { createTokenCommands } from '../../../src/pages/campaignMapTokenCommands.js';

function makeCtx(overrides = {}) {
  const state = {
    canEdit: true, selected: null, selectedIds: [], tokens: [{ id: 't1', name: 'Drone', kind: 'npc', x: 4, y: 8, move: 6 }],
    form: { name: 'Guard', color: '#fff', image: '', size: '1', visionDistanceUnits: '10', rotation: '0', elevation: '0', move: '5', hp: '10', hpMax: '10', visible: true, resourceVisibility: 'gm' },
  };
  const api = { saveToken: vi.fn().mockResolvedValue({ id: 't2' }), syncPlayers: vi.fn().mockResolvedValue({ players: 2 }), deleteToken: vi.fn().mockResolvedValue({}) };
  const reload = vi.fn().mockResolvedValue();
  const status = vi.fn();
  const clearUploadFile = vi.fn();
  return {
    ctx: {
      api, campaignId: 'camp-1', canEdit: () => state.canEdit, getSelectedTokenId: () => state.selected, getTokens: () => state.tokens,
      getTokenForm: () => state.form, getDefaultPosition: () => ({ x: 100, y: 200 }), setSelectedTokenId: id => { state.selected = id; }, setSelectedTokenIds: ids => { state.selectedIds = ids; },
      reload, status, confirmDelete: vi.fn().mockResolvedValue(true), getUploadFile: () => null, clearUploadFile,
      uploadImage: vi.fn(), setTokenImage: url => { state.form.image = url; }, ...overrides,
    }, state, api, reload, status, clearUploadFile,
  };
}

describe('createTokenCommands (ARQUITETURA 4B)', () => {
  it('creates a token at the supplied default position with an incremented name', async () => {
    const { ctx, api, state, status } = makeCtx();
    await createTokenCommands(ctx).saveToken();
    expect(api.saveToken).toHaveBeenCalledWith('camp-1', expect.objectContaining({ name: 'Guard 1', x: 100, y: 200, move: 5, hp: 10 }));
    expect(state.selected).toBe('t2');
    expect(state.selectedIds).toEqual(['t2']);
    expect(status).toHaveBeenCalledWith('token salvo', 'ok');
  });

  it('keeps identity and placement when saving an existing token', async () => {
    const { ctx, api, state } = makeCtx();
    state.selected = 't1';
    await createTokenCommands(ctx).saveToken();
    expect(api.saveToken).toHaveBeenCalledWith('camp-1', expect.objectContaining({ id: 't1', x: 4, y: 8, kind: 'npc' }));
  });

  it('does not save or delete if editing is forbidden', async () => {
    const { ctx, api, state } = makeCtx();
    state.canEdit = false;
    const commands = createTokenCommands(ctx);
    await commands.saveToken();
    await commands.deleteToken('t1');
    expect(api.saveToken).not.toHaveBeenCalled();
    expect(api.deleteToken).not.toHaveBeenCalled();
  });

  it('deletes only after confirmation, then reloads and reports', async () => {
    const { ctx, api, reload, status } = makeCtx();
    await createTokenCommands(ctx).deleteToken('t1');
    expect(api.deleteToken).toHaveBeenCalledWith('camp-1', 't1');
    expect(reload).toHaveBeenCalledOnce();
    expect(status).toHaveBeenCalledWith('token removido', 'ok');
  });

  it('syncs player tokens and reports how many were handled', async () => {
    const { ctx, api, status } = makeCtx();
    await createTokenCommands(ctx).syncPlayers();
    expect(api.syncPlayers).toHaveBeenCalledWith('camp-1');
    expect(status).toHaveBeenCalledWith('tokens criados/atualizados: 2', 'ok');
  });

  it('uploads an image, saves the token, and clears the input on success or failure', async () => {
    const file = { name: 'guard.png' };
    const { ctx, api, state, status, clearUploadFile } = makeCtx({ getUploadFile: () => file, uploadImage: vi.fn().mockResolvedValue({ url: '/guard.png' }) });
    await createTokenCommands(ctx).uploadToken();
    expect(state.form.image).toBe('/guard.png');
    expect(api.saveToken).toHaveBeenCalledOnce();
    expect(status).toHaveBeenCalledWith('token atualizado', 'ok');
    expect(clearUploadFile).toHaveBeenCalledOnce();

    const failed = makeCtx({ getUploadFile: () => file, uploadImage: vi.fn().mockRejectedValue(new Error('offline')) });
    await createTokenCommands(failed.ctx).uploadToken();
    expect(failed.status).toHaveBeenCalledWith('falha no upload do token: offline', 'err');
    expect(failed.clearUploadFile).toHaveBeenCalledOnce();
  });
});
