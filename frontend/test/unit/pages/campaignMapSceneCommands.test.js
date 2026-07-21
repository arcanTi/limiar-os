import { describe, expect, it, vi } from 'vitest';

import { createSceneCommands } from '../../../src/pages/campaignMapSceneCommands.js';

// test env is node (no DOM) — readImageSize() uses the browser Image
// constructor, so stub a synchronous-ish one just for this suite.
class FakeImage {
  set src(value) {
    queueMicrotask(() => {
      this.naturalWidth = 800;
      this.naturalHeight = 600;
      if (this.onload) this.onload();
    });
  }
}
globalThis.Image = FakeImage;

function makeCtx(overrides = {}) {
  const state = { background: '', width: 0, height: 0 };
  const api = {
    saveScene: vi.fn().mockResolvedValue({}),
    activate: vi.fn().mockResolvedValue({}),
  };
  const status = vi.fn();
  const reload = vi.fn().mockResolvedValue(undefined);
  const fitView = vi.fn();
  return {
    ctx: {
      api,
      campaignId: 'camp-1',
      getSceneForm: () => ({
        selectedSceneId: 'scene-2', currentSceneId: 'scene-1', name: 'Cena A',
        background: 'bg.png', backgroundFit: 'contain', width: 1600, height: 1000,
        gridSize: 64, shadowOpacity: 0.92, darkness: 0, explorationMode: 'shared',
      }),
      setBackground: url => { state.background = url; },
      setSize: (w, h) => { state.width = w; state.height = h; },
      getUploadFile: () => state.uploadFile,
      clearUploadFile: () => { state.uploadFile = null; },
      getBackgroundSrc: () => state.background,
      reload,
      fitView,
      status,
      promptSceneName: vi.fn().mockResolvedValue('Nova Cena'),
      uploadImage: vi.fn().mockResolvedValue({ url: 'uploaded.png' }),
      ...overrides,
    },
    state, api, status, reload, fitView,
  };
}

describe('createSceneCommands (ARQUITETURA 4B)', () => {
  it('saveScene(false) persists against the current scene id and reloads', async () => {
    const { ctx, api, status, reload } = makeCtx();
    const commands = createSceneCommands(ctx);
    await commands.saveScene(false);
    expect(api.saveScene).toHaveBeenCalledWith('camp-1', expect.objectContaining({ id: 'scene-1', activate: false, name: 'Cena A' }));
    expect(reload).toHaveBeenCalled();
    expect(status).toHaveBeenCalledWith('cenario salvo', 'ok');
  });

  it('saveScene(true) persists against the selected scene id', async () => {
    const { ctx, api } = makeCtx();
    const commands = createSceneCommands(ctx);
    await commands.saveScene(true);
    expect(api.saveScene).toHaveBeenCalledWith('camp-1', expect.objectContaining({ id: 'scene-2', activate: true }));
  });

  it('newScene does nothing if the name prompt is dismissed', async () => {
    const { ctx, api } = makeCtx({ promptSceneName: vi.fn().mockResolvedValue(null) });
    const commands = createSceneCommands(ctx);
    await commands.newScene();
    expect(api.saveScene).not.toHaveBeenCalled();
  });

  it('newScene creates+activates the named scene and fits view', async () => {
    const { ctx, api, fitView, reload } = makeCtx();
    const commands = createSceneCommands(ctx);
    await commands.newScene();
    expect(api.saveScene).toHaveBeenCalledWith('camp-1', { name: 'Nova Cena', activate: true });
    expect(reload).toHaveBeenCalled();
    expect(fitView).toHaveBeenCalled();
  });

  it('activateScene activates the given scene id and fits view', async () => {
    const { ctx, api, fitView } = makeCtx();
    const commands = createSceneCommands(ctx);
    await commands.activateScene('scene-9');
    expect(api.activate).toHaveBeenCalledWith('camp-1', 'scene-9');
    expect(fitView).toHaveBeenCalled();
  });

  it('uploadMap does nothing without a selected file', async () => {
    const { ctx, api } = makeCtx();
    ctx.getUploadFile = () => null;
    const commands = createSceneCommands(ctx);
    await commands.uploadMap();
    expect(api.saveScene).not.toHaveBeenCalled();
  });

  it('uploadMap uploads, sets background+size and saves the scene, always clearing the file input', async () => {
    const { ctx, api, state, status } = makeCtx();
    ctx.getUploadFile = () => ({ name: 'map.png' });
    const commands = createSceneCommands(ctx);
    await commands.uploadMap();
    expect(ctx.uploadImage).toHaveBeenCalledWith({ name: 'map.png' }, 'campaign-map');
    expect(state.background).toBe('uploaded.png');
    expect(api.saveScene).toHaveBeenCalled();
    expect(state.uploadFile).toBeNull();
    expect(status).toHaveBeenCalledWith('imagem do mapa enviada e salva', 'ok');
  });

  it('uploadMap clears the file input and flashes an error even if the upload rejects', async () => {
    const { ctx, status, state } = makeCtx();
    ctx.getUploadFile = () => ({ name: 'map.png' });
    ctx.uploadImage = vi.fn().mockRejectedValue(new Error('network down'));
    state.uploadFile = { name: 'map.png' };
    const commands = createSceneCommands(ctx);
    await commands.uploadMap();
    expect(status).toHaveBeenCalledWith('falha no upload do mapa: network down', 'err');
    expect(state.uploadFile).toBeNull();
  });

  it('useImageSize requires a background source', async () => {
    const { ctx, status } = makeCtx();
    ctx.getBackgroundSrc = () => '';
    const commands = createSceneCommands(ctx);
    await commands.useImageSize();
    expect(status).toHaveBeenCalledWith('informe uma imagem primeiro', 'err');
  });
});
