import { describe, expect, it } from 'vitest';

import {
  cellKey,
  cellsAlongSegment,
  cellsToMeters,
  metersToCells,
  moveRangeCells,
  moveRangeMeters,
  moveRangePixels,
  pathMovementCost,
  pixelsToCells,
  pixelsToMeters,
  segmentMovementCost,
} from '../../../src/domain/movement/index.ts';
import { effectiveMoveStat } from '../../../src/domain/character/derivedStatsEngine.ts';

describe('movement: cell <-> meter conversion (CPR RAW: 1 grid square = 2m)', () => {
  it('converts cells to meters and back', () => {
    expect(cellsToMeters(1)).toBe(2);
    expect(cellsToMeters(6)).toBe(12);
    expect(metersToCells(12)).toBe(6);
    expect(metersToCells(2)).toBe(1);
  });

  it('converts canvas pixels to cells/meters using the scene grid size', () => {
    expect(pixelsToCells(128, 64)).toBe(2);
    expect(pixelsToMeters(128, 64)).toBe(4);
    expect(pixelsToCells(100, 0)).toBe(0);
  });
});

describe('movement: MOVE range per turn (CPR RAW: MOVE squares = MOVE x 2m, Run doubles it)', () => {
  it('a normal Movement Action covers MOVE cells/meters', () => {
    expect(moveRangeCells(6)).toBe(6);
    expect(moveRangeMeters(6)).toBe(12);
  });

  it('Run spends the Main Action for an extra Movement Action, doubling the turn distance', () => {
    expect(moveRangeCells(6, { run: true })).toBe(12);
    expect(moveRangeMeters(6, { run: true })).toBe(24);
  });

  it('converts the range to canvas pixels for the overlay radius', () => {
    expect(moveRangePixels(6, 64)).toBe(384);
    expect(moveRangePixels(6, 64, { run: true })).toBe(768);
  });

  it('clamps negative/invalid MOVE to zero range', () => {
    expect(moveRangeCells(-3)).toBe(0);
    expect(moveRangeCells(undefined)).toBe(0);
  });
});

describe('movement: difficult terrain cost (CPR RAW: 2m spent per 1m traveled)', () => {
  it('normal cells cost 1, difficult cells cost 2', () => {
    expect(pathMovementCost(5, 0)).toBe(5);
    expect(pathMovementCost(5, 5)).toBe(10);
    expect(pathMovementCost(5, 2)).toBe(7);
  });

  it('clamps difficult count to the total cell count', () => {
    expect(pathMovementCost(3, 99)).toBe(6);
  });
});

describe('movement: cellsAlongSegment (Bresenham cell walk for the measure tool)', () => {
  it('walks a straight horizontal segment cell by cell', () => {
    const cells = cellsAlongSegment({ x: 0, y: 32 }, { x: 192, y: 32 }, 64);
    expect(cells).toEqual([{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }, { x: 3, y: 0 }]);
  });

  it('a zero-length segment is just the start cell', () => {
    expect(cellsAlongSegment({ x: 10, y: 10 }, { x: 10, y: 10 }, 64)).toEqual([{ x: 0, y: 0 }]);
  });
});

describe('movement: segmentMovementCost (measure tool crossing difficult terrain)', () => {
  it('a segment through only normal terrain costs 1 cell per step', () => {
    const result = segmentMovementCost({ x: 0, y: 0 }, { x: 192, y: 0 }, 64, []);
    expect(result).toEqual({ cellCount: 3, difficultCellCount: 0, costCells: 3, costMeters: 6 });
  });

  it('a segment crossing difficult cells doubles their cost', () => {
    const difficult = new Set([cellKey(1, 0), cellKey(2, 0)]);
    const result = segmentMovementCost({ x: 0, y: 0 }, { x: 192, y: 0 }, 64, difficult);
    expect(result).toEqual({ cellCount: 3, difficultCellCount: 2, costCells: 5, costMeters: 10 });
  });
});

describe('movement: effectiveMoveStat (base MOVE - armor penalty - condition movePenalty)', () => {
  it('defaults to base MOVE 6 with no armor or conditions', () => {
    expect(effectiveMoveStat({ base: {} })).toBe(6);
  });

  it('subtracts the higher of head/body armor penalty', () => {
    expect(effectiveMoveStat({ base: { MOVE: 8 }, armor: { head: { penalty: 2 }, body: { penalty: 4 } } })).toBe(4);
  });

  it('never goes below zero', () => {
    expect(effectiveMoveStat({ base: { MOVE: 4 }, armor: { head: { penalty: 0 }, body: { penalty: 9 } } })).toBe(0);
  });
});
