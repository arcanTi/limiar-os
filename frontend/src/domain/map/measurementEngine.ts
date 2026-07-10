import { GRID_METERS_PER_CELL } from '../movement/index.ts';

export interface MapPoint { x?: number; y?: number }

export interface TokenDistance {
  dxCells: number;
  dyCells: number;
  cells: number;
  units: number;
  rangeMeters: number;
}

// Distance is deliberately separate from movement cost. This is the table's
// square-grid convention: a diagonal crosses one cell, and terrain never
// changes weapon range.
export function measureTokenDistance(
  from: MapPoint,
  to: MapPoint,
  gridSizePx: number,
  unitsPerCell: number = GRID_METERS_PER_CELL,
): TokenDistance | null {
  const grid = Number(gridSizePx);
  const units = Number(unitsPerCell);
  if (!(grid > 0) || !(units > 0)) return null;
  const dxCells = Math.abs((Number(to?.x) || 0) - (Number(from?.x) || 0)) / grid;
  const dyCells = Math.abs((Number(to?.y) || 0) - (Number(from?.y) || 0)) / grid;
  const cells = Math.max(dxCells, dyCells);
  return { dxCells, dyCells, cells, units: cells * units, rangeMeters: cells * units };
}
