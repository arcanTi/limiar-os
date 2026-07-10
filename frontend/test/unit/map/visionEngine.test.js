import { describe, expect, it } from 'vitest';

import { visionContainsPoint, visionPolygon } from '../../../src/domain/map/visionEngine.ts';

const origin = { x: 0, y: 0 };
const wall = { id: 'wall', x1: 5, y1: -20, x2: 5, y2: 20, kind: 'wall' };

describe('visionEngine', () => {
  it('keeps the no-wall case circular', () => {
    expect(visionContainsPoint(origin, 10, [], { x: 9, y: 0 })).toBe(true);
    expect(visionContainsPoint(origin, 10, [], { x: 11, y: 0 })).toBe(false);
    expect(visionPolygon(origin, 10, []).length).toBeGreaterThan(32);
  });

  it('blocks sight through a closed wall and restores it when a door opens', () => {
    expect(visionContainsPoint(origin, 20, [wall], { x: 10, y: 0 })).toBe(false);
    expect(visionContainsPoint(origin, 20, [{ ...wall, kind: 'door', open: true }], { x: 10, y: 0 })).toBe(true);
    expect(visionContainsPoint(origin, 20, [wall], { x: 2, y: 0 })).toBe(true);
  });
});
