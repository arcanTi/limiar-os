import { describe, expect, it } from 'vitest';

import { computeSituationalChips } from '../../../src/domain/map/situationalMods.ts';

const attacker = { x: 0, y: 0 };
const target = { x: 100, y: 0 };

describe('computeSituationalChips (G8)', () => {
  it('returns no chips in a clear, lit line of sight', () => {
    expect(computeSituationalChips({ attacker, target })).toEqual([]);
  });

  it('flags darkness whenever the scene has any darkness value', () => {
    const chips = computeSituationalChips({ attacker, target, darkness: 0.4 });
    expect(chips).toContainEqual({ id: 'darkness', label: 'ESCURIDAO', mod: -2 });
  });

  it('does not flag darkness at exactly zero', () => {
    expect(computeSituationalChips({ attacker, target, darkness: 0 })).toEqual([]);
  });

  it('flags no-LOS when a wall crosses the direct line to the target', () => {
    const wall = { x1: 50, y1: -20, x2: 50, y2: 20, kind: 'wall' };
    const chips = computeSituationalChips({ attacker, target, walls: [wall] });
    expect(chips).toEqual([{ id: 'noLos', label: 'SEM LINHA DE VISAO', mod: -4 }]);
  });

  it('an open door does not block LOS', () => {
    const door = { x1: 50, y1: -20, x2: 50, y2: 20, kind: 'door', open: true };
    expect(computeSituationalChips({ attacker, target, walls: [door] })).toEqual([]);
  });

  it('flags in-cover when the target sits near a wall that does not block the line', () => {
    const wall = { x1: 110, y1: -50, x2: 110, y2: -10, kind: 'wall' };
    const chips = computeSituationalChips({ attacker, target, walls: [wall], nearWallPx: 15 });
    expect(chips).toEqual([{ id: 'inCover', label: 'ALVO PROXIMO A COBERTURA', mod: -2 }]);
  });

  it('prefers no-LOS over in-cover when both would apply', () => {
    const blocking = { x1: 50, y1: -20, x2: 50, y2: 20, kind: 'wall' };
    const nearby = { x1: 105, y1: -50, x2: 105, y2: -10, kind: 'wall' };
    const chips = computeSituationalChips({ attacker, target, walls: [blocking, nearby], nearWallPx: 15 });
    expect(chips.map(c => c.id)).toEqual(['noLos']);
  });

  it('can combine darkness with a LOS/cover chip', () => {
    const wall = { x1: 50, y1: -20, x2: 50, y2: 20, kind: 'wall' };
    const chips = computeSituationalChips({ attacker, target, walls: [wall], darkness: 0.6 });
    expect(chips.map(c => c.id)).toEqual(['darkness', 'noLos']);
  });
});
