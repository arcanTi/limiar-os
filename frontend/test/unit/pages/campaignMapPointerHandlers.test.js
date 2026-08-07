import { describe, expect, it, vi } from 'vitest';

import { createPointerHandlers } from '../../../src/pages/campaignMapPointerHandlers.js';

function makeHandlers(overrides = {}) {
  const state = { camera: { x: 0, y: 0, zoom: 1 }, tool: 'select', canEdit: true, tokens: [{ id: 't1', x: 10, y: 20 }], templates: [], selectedIds: [], selected: null, hoverTokenId: null };
  const pointer = { down: false, mode: '', start: {}, startWorld: {}, cam: {}, offset: {} };
  const drawOnce = vi.fn();
  const deps = {
    canvas: { focus: vi.fn() }, state, pointer, ui: {}, screenToWorld: (x, y) => ({ x, y }), tokenAt: () => state.tokens[0], snap: point => point,
    renderTokens: vi.fn(), syncTokenForm: vi.fn(), renderTokenHud: vi.fn(), updateSelectedMove: vi.fn(), drawOnce, canMove: () => true,
    templateAt: () => null, canEditTemplate: () => true, syncTemplateForm: vi.fn(), renderTemplateList: vi.fn(), wallAt: () => null,
    toggleDoor: vi.fn(), openPromptModal: vi.fn(), savePin: vi.fn(), toggleTerrainAtWorld: vi.fn(), pixelsToMeters: value => value, sceneSize: () => ({ g: 64 }),
    moveTokenGroup: vi.fn(), saveTemplatePlacement: vi.fn(), saveWall: vi.fn(), saveProp: vi.fn(), saveLight: vi.fn(), saveDrawing: vi.fn(), saveFog: vi.fn(),
    buildAttackMeasure: vi.fn(), prepareMapAttack: vi.fn(), status: vi.fn(), ...overrides,
  };
  return { handlers: createPointerHandlers(deps), state, pointer, drawOnce, deps };
}

describe('createPointerHandlers (ARQUITETURA 4B)', () => {
  it('updates hover only when the pointed token changes', () => {
    const { handlers, state, drawOnce } = makeHandlers();
    handlers.onHover({ clientX: 10, clientY: 20 });
    handlers.onHover({ clientX: 10, clientY: 20 });
    expect(state.hoverTokenId).toBe('t1');
    expect(drawOnce).toHaveBeenCalledOnce();
  });

  it('selects a movable token and starts a token drag with its pointer offset', async () => {
    const { handlers, state, pointer, deps } = makeHandlers();
    await handlers.onDown({ clientX: 8, clientY: 18, button: 0, ctrlKey: false, metaKey: false });
    expect(state.selected).toBe('t1');
    expect(state.selectedIds).toEqual(['t1']);
    expect(pointer.mode).toBe('token');
    expect(pointer.offset).toEqual({ x: 2, y: 2 });
    expect(deps.renderTokens).toHaveBeenCalledOnce();
  });

  it('pans the camera while dragging in pan mode', () => {
    const { handlers, state, pointer } = makeHandlers();
    pointer.down = true; pointer.mode = 'pan'; pointer.cam = { x: 3, y: 5 }; pointer.start = { x: 10, y: 20 };
    handlers.onMove({ clientX: 17, clientY: 32 });
    expect(state.camera).toMatchObject({ x: 10, y: 17 });
  });
});
