import { describe, expect, it } from 'vitest';

import { cameraPanForAnchor, clampZoom, lerpZoom } from '../../../src/domain/map/viewport.ts';

describe('map viewport: clampZoom', () => {
  it('clamps to the default 5%-500% range', () => {
    expect(clampZoom(0.01)).toBe(0.05);
    expect(clampZoom(50)).toBe(5);
    expect(clampZoom(1.2)).toBe(1.2);
  });

  it('accepts a custom range', () => {
    expect(clampZoom(0.5, 0.8, 2)).toBe(0.8);
  });
});

describe('map viewport: lerpZoom', () => {
  it('steps a fraction of the remaining distance toward the target', () => {
    expect(lerpZoom(1, 2, 0.5)).toBe(1.5);
  });

  it('snaps to the target once within epsilon instead of chasing forever', () => {
    expect(lerpZoom(1.9995, 2, 0.5)).toBe(2);
  });

  it('clamps the factor to [0,1]', () => {
    expect(lerpZoom(1, 2, 5)).toBe(2);
    expect(lerpZoom(1, 2, -5)).toBe(1);
  });
});

describe('map viewport: cameraPanForAnchor', () => {
  it('pins the world point under the screen point at the given zoom', () => {
    const cam = cameraPanForAnchor({ x: 100, y: 50 }, { x: 400, y: 300 }, 2);
    expect(cam).toEqual({ x: 200, y: 200 });
  });
});
