// Movimentacao tatica (CPR RAW): 1 quadrado de grid = 2m. Uma Acao de
// Movimento cobre ate MOVE quadrados; Run gasta a Acao Principal por uma
// Acao de Movimento extra, dobrando a distancia do turno. Terreno dificil
// custa 2m de movimento por 1m percorrido (2 quadrados por 1). Este modulo e
// puro — a page (campaign-map.js) so desenha o resultado.

export const GRID_METERS_PER_CELL = 2;

// unitsPerCell/difficultTerrainMultiplier default to CPR (2m/cell, 2x cost)
// but are parametrized so a future non-CPR system adapter (D&D 5ft/cell,
// zombies with no difficult-terrain rule, ...) can pass its own config
// without forking this module — see PLANO-MAPA-FOUNDRY.md section 4.
export function cellsToMeters(cells: number, unitsPerCell: number = GRID_METERS_PER_CELL): number {
  return Math.max(0, Number(cells) || 0) * unitsPerCell;
}

export function metersToCells(meters: number, unitsPerCell: number = GRID_METERS_PER_CELL): number {
  return Math.max(0, Number(meters) || 0) / unitsPerCell;
}

export function pixelsToCells(pixels: number, gridSizePx: number): number {
  const g = Number(gridSizePx) || 0;
  return g > 0 ? Math.max(0, Number(pixels) || 0) / g : 0;
}

export function pixelsToMeters(pixels: number, gridSizePx: number): number {
  return cellsToMeters(pixelsToCells(pixels, gridSizePx));
}

export interface MoveRangeOptions {
  run?: boolean;
}

// A Movement Action range in grid cells: effective MOVE, doubled by Run
// (Main Action spent for an extra Movement Action, RAW).
export function moveRangeCells(effectiveMove: unknown, options: MoveRangeOptions = {}): number {
  const base = Math.max(0, Number(effectiveMove) || 0);
  return options.run ? base * 2 : base;
}

export function moveRangeMeters(effectiveMove: unknown, options: MoveRangeOptions = {}): number {
  return cellsToMeters(moveRangeCells(effectiveMove, options));
}

export function moveRangePixels(effectiveMove: unknown, gridSizePx: number, options: MoveRangeOptions = {}): number {
  return moveRangeCells(effectiveMove, options) * (Number(gridSizePx) || 0);
}

// Difficult terrain: 2m spent per 1m traveled (2 cells of cost per 1 cell
// crossed), CPR default. Non-difficult cells cost 1 cell of movement as normal.
export function pathMovementCost(cellCount: number, difficultCellCount: number, difficultMultiplier: number = 2): number {
  const total = Math.max(0, Number(cellCount) || 0);
  const difficult = Math.max(0, Math.min(total, Number(difficultCellCount) || 0));
  return (total - difficult) + difficult * difficultMultiplier;
}

export interface GridCell {
  x: number;
  y: number;
}

export function cellKey(x: number, y: number): string {
  return `${Math.round(x)},${Math.round(y)}`;
}

// Bresenham cell walk: enumerates the grid cells a segment passes through,
// in order from the start cell to the end cell (inclusive of both).
export function cellsAlongSegment(from: { x: number; y: number }, to: { x: number; y: number }, gridSizePx: number): GridCell[] {
  const g = Number(gridSizePx) || 0;
  if (g <= 0) return [];
  let x0 = Math.floor(from.x / g);
  let y0 = Math.floor(from.y / g);
  const x1 = Math.floor(to.x / g);
  const y1 = Math.floor(to.y / g);
  const dx = Math.abs(x1 - x0);
  const dy = Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx - dy;
  const cells: GridCell[] = [];
  for (;;) {
    cells.push({ x: x0, y: y0 });
    if (x0 === x1 && y0 === y1) break;
    const e2 = 2 * err;
    if (e2 > -dy) { err -= dy; x0 += sx; }
    if (e2 < dx) { err += dx; y0 += sy; }
  }
  return cells;
}

export interface SegmentMovementCost {
  cellCount: number;
  difficultCellCount: number;
  costCells: number;
  costMeters: number;
}

export interface SegmentMovementCostConfig {
  unitsPerCell?: number;
  difficultMultiplier?: number;
}

// Cost of a measured segment: the start cell is free (you're already there);
// each subsequent cell entered costs 1, or 2 if it's marked difficult
// terrain (CPR defaults). difficultCells is the set of "x,y" keys (see cellKey).
export function segmentMovementCost(
  from: { x: number; y: number },
  to: { x: number; y: number },
  gridSizePx: number,
  difficultCells: Set<string> | string[] = [],
  config: SegmentMovementCostConfig = {},
): SegmentMovementCost {
  const unitsPerCell = config.unitsPerCell ?? GRID_METERS_PER_CELL;
  const difficultMultiplier = config.difficultMultiplier ?? 2;
  const difficult = difficultCells instanceof Set ? difficultCells : new Set(difficultCells);
  const cells = cellsAlongSegment(from, to, gridSizePx);
  const steps = cells.slice(1);
  const difficultCellCount = steps.filter(c => difficult.has(cellKey(c.x, c.y))).length;
  const cellCount = steps.length;
  const costCells = pathMovementCost(cellCount, difficultCellCount, difficultMultiplier);
  return { cellCount, difficultCellCount, costCells, costMeters: cellsToMeters(costCells, unitsPerCell) };
}
