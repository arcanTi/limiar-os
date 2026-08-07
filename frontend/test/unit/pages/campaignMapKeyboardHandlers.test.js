import { describe, expect, it, vi } from 'vitest';

import { createMapKeyboardHandler } from '../../../src/pages/campaignMapKeyboardHandlers.js';

function makeHandler() {
  const state = { canEdit: true, selected: 't1', selectedIds: ['t1'], tokens: [{ id: 't1', x: 10, y: 20 }] };
  const deps = { state, closeTokenMenu: vi.fn(), renderTokens: vi.fn(), renderTokenHud: vi.fn(), updateSelectedMove: vi.fn(), drawOnce: vi.fn(), setTool: vi.fn(), sceneSize: () => ({ g: 10 }), snap: point => point, canMove: () => true, moveTokenGroup: vi.fn().mockResolvedValue(), status: vi.fn() };
  return { state, deps, handler: createMapKeyboardHandler(deps) };
}

describe('createMapKeyboardHandler (ARQUITETURA 4B)', () => {
  it('switches to permitted tools and leaves form inputs alone', () => {
    const { handler, deps } = makeHandler();
    const event = { key: 'l', target: { tagName: 'DIV' }, preventDefault: vi.fn() };
    handler(event);
    expect(deps.setTool).toHaveBeenCalledWith('light');
    handler({ key: 'm', target: { tagName: 'INPUT' }, preventDefault: vi.fn() });
    expect(deps.setTool).toHaveBeenCalledTimes(1);
  });

  it('moves selected movable tokens by one grid cell with arrow keys', () => {
    const { handler, state, deps } = makeHandler();
    handler({ key: 'ArrowRight', target: null, preventDefault: vi.fn() });
    expect(state.tokens[0]).toMatchObject({ x: 20, y: 20 });
    expect(deps.moveTokenGroup).toHaveBeenCalledWith(state.tokens);
    expect(deps.drawOnce).toHaveBeenCalledOnce();
  });
});
