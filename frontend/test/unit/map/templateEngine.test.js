import { describe, expect, it } from 'vitest';

import { templateCells } from '../../../src/domain/map/templateEngine.ts';
import { cellKey } from '../../../src/domain/movement/index.ts';

const GRID = 64;
const CFG = { gridSizePx: GRID };

function keys(shape) {
  return new Set(templateCells(shape, CFG).map(c => cellKey(c.x, c.y)));
}

describe('templateEngine: shared behavior', () => {
  it('returns no cells for zero/negative distance or grid size', () => {
    expect(templateCells({ kind: 'circle', x: 0, y: 0, distanceUnits: 0 }, CFG)).toEqual([]);
    expect(templateCells({ kind: 'circle', x: 0, y: 0, distanceUnits: 4 }, { gridSizePx: 0 })).toEqual([]);
  });
});

describe('templateEngine: circle', () => {
  // distanceUnits=2 (1 cell at the CPR 2m/cell default) => radiusPx = 64.
  const shape = { kind: 'circle', x: 0, y: 0, distanceUnits: 2 };

  it('includes the origin cell and near-axis neighbors within the radius', () => {
    const cells = keys(shape);
    expect(cells.has(cellKey(0, 0))).toBe(true);
    expect(cells.has(cellKey(-1, 0))).toBe(true);
    expect(cells.has(cellKey(0, -1))).toBe(true);
  });

  it('excludes a cell whose center is past the radius', () => {
    const cells = keys(shape);
    expect(cells.has(cellKey(1, 0))).toBe(false);
    expect(cells.has(cellKey(0, 1))).toBe(false);
  });
});

describe('templateEngine: cone', () => {
  // distanceUnits=4 (radiusPx=128), pointed east (0 deg), 90 deg spread (±45).
  const shape = { kind: 'cone', x: 0, y: 0, distanceUnits: 4, directionDeg: 0, angleDeg: 90 };

  it('includes a cell within range and within the angular spread', () => {
    const cells = keys(shape);
    expect(cells.has(cellKey(1, 0))).toBe(true);
  });

  it('excludes a cell within range but outside the angular spread', () => {
    const cells = keys(shape);
    expect(cells.has(cellKey(0, 1))).toBe(false);
    expect(cells.has(cellKey(0, -2))).toBe(false);
  });

  it('excludes a cell within the angle but past the radius', () => {
    const cells = keys(shape);
    expect(cells.has(cellKey(3, 0))).toBe(false);
  });
});

describe('templateEngine: rectangle', () => {
  // distanceUnits=4 (lengthPx=128), widthUnits=2 (widthPx=64, half-width 32),
  // pointed east (0 deg) from the origin.
  const shape = { kind: 'rectangle', x: 0, y: 0, distanceUnits: 4, directionDeg: 0, widthUnits: 2 };

  it('includes an on-axis cell within length and width', () => {
    expect(keys(shape).has(cellKey(1, 0))).toBe(true);
  });

  it('excludes a cell within the bounding box but off to the side', () => {
    expect(keys(shape).has(cellKey(1, 1))).toBe(false);
  });

  it('excludes a cell behind the origin (negative `along`)', () => {
    expect(keys(shape).has(cellKey(-1, 0))).toBe(false);
  });
});

describe('templateEngine: ray (same axis-projection math as rectangle)', () => {
  const shape = { kind: 'ray', x: 0, y: 0, distanceUnits: 4, directionDeg: 0, widthUnits: 2 };

  it('matches rectangle inclusion/exclusion for the same parameters', () => {
    const cells = keys(shape);
    expect(cells.has(cellKey(1, 0))).toBe(true);
    expect(cells.has(cellKey(1, 1))).toBe(false);
  });
});

describe('templateEngine: unitsPerCell config (non-CPR systems)', () => {
  it('scales the radius with a different unitsPerCell', () => {
    // 4 units at 4 units/cell = 1 cell radius (radiusPx = 64), matching the
    // CPR circle test's shape at 2 units/cell but half the distanceUnits.
    const shape = { kind: 'circle', x: 0, y: 0, distanceUnits: 4 };
    const cells = new Set(templateCells(shape, { gridSizePx: GRID, unitsPerCell: 4 }).map(c => cellKey(c.x, c.y)));
    expect(cells.has(cellKey(0, 0))).toBe(true);
    expect(cells.has(cellKey(1, 0))).toBe(false);
  });
});
