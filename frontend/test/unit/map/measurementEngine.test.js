import { describe, expect, it } from 'vitest';

import { measureTokenDistance } from '../../../src/domain/map/measurementEngine.ts';

describe('measurementEngine', () => {
  it('uses square-grid distance for axes and diagonals', () => {
    expect(measureTokenDistance({ x: 0, y: 0 }, { x: 192, y: 64 }, 64)).toMatchObject({ cells: 3, rangeMeters: 6 });
    expect(measureTokenDistance({ x: 0, y: 0 }, { x: 192, y: 192 }, 64)).toMatchObject({ cells: 3, rangeMeters: 6 });
  });

  it('keeps same-cell range at zero and rejects invalid grids', () => {
    expect(measureTokenDistance({ x: 4, y: 4 }, { x: 4, y: 4 }, 64)).toMatchObject({ cells: 0, rangeMeters: 0 });
    expect(measureTokenDistance({ x: 0, y: 0 }, { x: 1, y: 1 }, 0)).toBeNull();
  });

  it('accepts a system-specific unit scale', () => {
    expect(measureTokenDistance({ x: 0, y: 0 }, { x: 128, y: 0 }, 64, 5)).toMatchObject({ cells: 2, units: 10, rangeMeters: 10 });
  });
});
