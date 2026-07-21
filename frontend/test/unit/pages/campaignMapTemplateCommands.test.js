import { describe, expect, it, vi } from 'vitest';

import { createTemplateCommands } from '../../../src/pages/campaignMapTemplateCommands.js';

function makeCtx(overrides = {}) {
  const state = {
    selectedId: 'tpl-1', templates: [{ id: 'tpl-1', kind: 'circle', x: 10, y: 20 }], editable: true,
    form: { kind: 'cone', color: '#3fe0d0', label: 'blast', distanceUnits: '12', directionDeg: '45', angleDeg: '60', widthUnits: '4', hidden: true, lifecycle: 'untilResolved' },
  };
  const api = { saveTemplate: vi.fn().mockResolvedValue({}), deleteTemplate: vi.fn().mockResolvedValue({}) };
  const reload = vi.fn().mockResolvedValue(), status = vi.fn();
  return {
    ctx: {
      api, campaignId: 'camp-1', getTemplates: () => state.templates, getSelectedTemplateId: () => state.selectedId,
      setSelectedTemplateId: id => { state.selectedId = id; }, getTemplateForm: () => state.form,
      canEditTemplate: () => state.editable, reload, status, confirmDelete: vi.fn().mockResolvedValue(true), ...overrides,
    }, state, api, reload, status,
  };
}

describe('createTemplateCommands (ARQUITETURA 4B)', () => {
  it('saves a placement, reloads the map, and reports success', async () => {
    const { ctx, api, reload, status } = makeCtx();
    await createTemplateCommands(ctx).saveTemplatePlacement({ kind: 'circle', x: 10, y: 20 });
    expect(api.saveTemplate).toHaveBeenCalledWith('camp-1', { kind: 'circle', x: 10, y: 20 });
    expect(reload).toHaveBeenCalledOnce();
    expect(status).toHaveBeenCalledWith('template salvo', 'ok');
  });

  it('reports a save failure without reloading', async () => {
    const { ctx, reload, status } = makeCtx({ api: { saveTemplate: vi.fn().mockRejectedValue(new Error('conflito')) } });
    await createTemplateCommands(ctx).saveTemplatePlacement({});
    expect(reload).not.toHaveBeenCalled();
    expect(status).toHaveBeenCalledWith('conflito', 'err');
  });

  it('requires a selected editable template before saving form edits', async () => {
    const missing = makeCtx();
    missing.state.selectedId = null;
    await createTemplateCommands(missing.ctx).saveTemplateEdit();
    expect(missing.api.saveTemplate).not.toHaveBeenCalled();
    expect(missing.status).toHaveBeenCalledWith('selecione um template na lista', 'err');

    const denied = makeCtx();
    denied.state.editable = false;
    await createTemplateCommands(denied.ctx).saveTemplateEdit();
    expect(denied.api.saveTemplate).not.toHaveBeenCalled();
    expect(denied.status).toHaveBeenCalledWith('sem permissao para editar este template', 'err');
  });

  it('builds an edit payload from form values while retaining template placement', async () => {
    const { ctx, api } = makeCtx();
    await createTemplateCommands(ctx).saveTemplateEdit();
    expect(api.saveTemplate).toHaveBeenCalledWith('camp-1', {
      id: 'tpl-1', kind: 'cone', x: 10, y: 20, directionDeg: 45, distanceUnits: 12,
      angleDeg: 60, widthUnits: 4, color: '#3fe0d0', label: 'blast', hidden: true, lifecycle: 'untilResolved',
    });
  });

  it('does not delete when dismissed; otherwise clears selected template and reloads', async () => {
    const cancelled = makeCtx({ confirmDelete: vi.fn().mockResolvedValue(false) });
    await createTemplateCommands(cancelled.ctx).deleteTemplate('tpl-1');
    expect(cancelled.api.deleteTemplate).not.toHaveBeenCalled();

    const { ctx, api, state, status } = makeCtx();
    await createTemplateCommands(ctx).deleteTemplate('tpl-1');
    expect(api.deleteTemplate).toHaveBeenCalledWith('camp-1', 'tpl-1');
    expect(state.selectedId).toBeNull();
    expect(status).toHaveBeenCalledWith('template removido', 'ok');
  });

  it('reports a delete failure and leaves selection intact', async () => {
    const { ctx, state, status } = makeCtx({ api: { deleteTemplate: vi.fn().mockRejectedValue(new Error('offline')) } });
    await createTemplateCommands(ctx).deleteTemplate('tpl-1');
    expect(state.selectedId).toBe('tpl-1');
    expect(status).toHaveBeenCalledWith('offline', 'err');
  });
});
