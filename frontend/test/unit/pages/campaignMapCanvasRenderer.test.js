import { describe, expect, it, vi } from 'vitest';

import { createCanvasRenderer } from '../../../src/pages/campaignMapCanvasRenderer.js';

function makeRenderer(overrides = {}) {
  const calls = [];
  const ctx = { clearRect: vi.fn(), save: vi.fn(), restore: vi.fn(), translate: vi.fn(), scale: vi.fn() };
  const layers = Object.fromEntries(['base', 'grid', 'terrain', 'frame', 'tokens', 'movement', 'visibility', 'objects', 'overlays'].map(name => [name, vi.fn(() => calls.push(name))]));
  const afterFrame = vi.fn(() => calls.push('afterFrame'));
  const requestFrame = vi.fn(), cancelFrame = vi.fn();
  const renderer = createCanvasRenderer({
    canvas: { getBoundingClientRect: () => ({ width: 800, height: 600 }) }, ctx,
    getCamera: () => ({ x: 4, y: 8, zoom: 1.5 }), sceneSize: () => ({ w: 1600, h: 1000, g: 64 }),
    drawLayers: layers, afterFrame, requestFrame, cancelFrame, ...overrides,
  });
  return { renderer, ctx, layers, afterFrame, requestFrame, cancelFrame, calls };
}

describe('createCanvasRenderer (ARQUITETURA 4B)', () => {
  it('draws the named layers in the fixed map paint order within the camera transform', () => {
    const { renderer, ctx, calls, afterFrame } = makeRenderer();
    renderer.draw();
    expect(calls).toEqual(['base', 'grid', 'terrain', 'frame', 'tokens', 'movement', 'visibility', 'objects', 'overlays', 'afterFrame']);
    expect(ctx.clearRect).toHaveBeenCalledWith(0, 0, 800, 600);
    expect(ctx.translate).toHaveBeenCalledWith(4, 8);
    expect(ctx.scale).toHaveBeenCalledWith(1.5, 1.5);
    expect(afterFrame).toHaveBeenCalledWith({ w: 1600, h: 1000, g: 64 });
  });

  it('coalesces pending draws through requestAnimationFrame', () => {
    const requestFrame = vi.fn().mockReturnValueOnce(10).mockReturnValueOnce(11);
    const { renderer, cancelFrame } = makeRenderer({ requestFrame });
    renderer.schedule();
    renderer.schedule();
    expect(cancelFrame).toHaveBeenNthCalledWith(1, 0);
    expect(cancelFrame).toHaveBeenNthCalledWith(2, 10);
    expect(requestFrame).toHaveBeenCalledTimes(2);
  });
});
