import { describe, expect, it } from 'vitest';

import { propsToWalls, visionContainsPoint, visionPolygon } from '../../../src/domain/map/visionEngine.ts';

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

describe('propsToWalls (G2 destructible cover)', () => {
  const prop = { id: 'prop-1', x: 5, y: -5, w: 10, h: 10, hp: 8 };

  it('emits four wall segments (one per edge) for a live prop', () => {
    const walls = propsToWalls([prop]);
    expect(walls).toHaveLength(4);
    expect(walls.every(w => w.kind === 'wall')).toBe(true);
  });

  it('emits nothing for a destroyed prop (hp <= 0) — rubble stops blocking LOS', () => {
    expect(propsToWalls([{ ...prop, hp: 0 }])).toEqual([]);
    expect(propsToWalls([{ ...prop, hp: -3 }])).toEqual([]);
  });

  it('a live prop blocks LOS through it, exactly like a wall', () => {
    const behind = { x: 20, y: 0 };
    expect(visionContainsPoint(origin, 30, [], behind)).toBe(true);
    expect(visionContainsPoint(origin, 30, propsToWalls([prop]), behind)).toBe(false);
  });

  it('a destroyed prop no longer blocks LOS', () => {
    const behind = { x: 20, y: 0 };
    expect(visionContainsPoint(origin, 30, propsToWalls([{ ...prop, hp: 0 }]), behind)).toBe(true);
  });
});
