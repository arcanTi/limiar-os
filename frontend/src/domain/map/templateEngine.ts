// Area-of-effect template geometry (F3, Foundry-style primitives: circle,
// cone, rectangle, ray). Given a template placed in scene-pixel space,
// returns which grid cells it covers. Pure — no rendering, no persistence.
// Distances/widths arrive in system units (meters for CPR) and convert to
// pixels via unitsPerCell/gridSizePx, the same conversion domain/movement
// already uses (default 2m/cell, CPR).
//
// Cell membership rule: a cell is affected when its CENTER falls inside the
// shape. This is a simpler, fully deterministic test than Foundry's
// polygon-overlap check, chosen so the geometry stays easy to test and
// reason about; it's a documented approximation, not a RAW rule.
//
// Direction convention: directionDeg is a standard atan2(dy,dx) angle in a
// y-down canvas (0 deg = +x/"east", increasing clockwise as y grows) —
// matches ctx.rotate()'s convention, so the renderer can reuse the same
// angle with no sign flip.

import type { GridCell } from '../movement/index.ts';

export type TemplateKind = 'circle' | 'cone' | 'rectangle' | 'ray';

export interface TemplateShape {
  kind: TemplateKind;
  x: number;
  y: number;
  directionDeg?: number;
  distanceUnits: number;
  angleDeg?: number;
  widthUnits?: number;
}

export interface TemplateGridConfig {
  gridSizePx: number;
  unitsPerCell?: number;
}

const DEFAULT_CONE_ANGLE_DEG = 53;

function unitsToPixels(units: number, config: TemplateGridConfig): number {
  const unitsPerCell = config.unitsPerCell ?? 2;
  return unitsPerCell > 0 ? (units / unitsPerCell) * config.gridSizePx : 0;
}

function normalizeAngleDeg(deg: number): number {
  const wrapped = deg % 360;
  return wrapped < 0 ? wrapped + 360 : wrapped;
}

// Shortest angular distance between two headings, in [0, 180].
function angularDelta(a: number, b: number): number {
  const diff = Math.abs(normalizeAngleDeg(a) - normalizeAngleDeg(b));
  return Math.min(diff, 360 - diff);
}

function cellInShape(
  shape: TemplateShape,
  cx: number,
  cy: number,
  radiusPx: number,
  widthPx: number,
  directionDeg: number,
  halfAngleDeg: number,
): boolean {
  const dx = cx - shape.x;
  const dy = cy - shape.y;
  const dist = Math.hypot(dx, dy);

  if (shape.kind === 'circle') {
    return dist <= radiusPx;
  }

  if (shape.kind === 'cone') {
    if (dist > radiusPx) return false;
    if (dist === 0) return true;
    const angleToCell = (Math.atan2(dy, dx) * 180) / Math.PI;
    return angularDelta(angleToCell, directionDeg) <= halfAngleDeg;
  }

  // rectangle & ray: project onto the direction axis (Foundry's "ray"
  // template is geometrically a thin rectangle). `along` is the distance
  // down the length axis from the origin; `across` is the perpendicular
  // offset, centered on that axis.
  const rad = (directionDeg * Math.PI) / 180;
  const along = dx * Math.cos(rad) + dy * Math.sin(rad);
  const across = -dx * Math.sin(rad) + dy * Math.cos(rad);
  return along >= 0 && along <= radiusPx && Math.abs(across) <= widthPx / 2;
}

// Scans the shape's bounding box on the grid and keeps cells whose center
// lands inside it. Returns [] for a non-positive grid size or distance.
export function templateCells(shape: TemplateShape, config: TemplateGridConfig): GridCell[] {
  const g = config.gridSizePx;
  if (!(g > 0)) return [];
  const radiusPx = unitsToPixels(shape.distanceUnits, config);
  if (!(radiusPx > 0)) return [];
  const widthPx = unitsToPixels(shape.widthUnits ?? 0, config);
  const directionDeg = shape.directionDeg ?? 0;
  const halfAngleDeg = (shape.angleDeg ?? DEFAULT_CONE_ANGLE_DEG) / 2;

  const reach = shape.kind === 'rectangle' || shape.kind === 'ray' ? Math.max(radiusPx, widthPx) : radiusPx;
  const minGx = Math.floor((shape.x - reach) / g);
  const maxGx = Math.floor((shape.x + reach) / g);
  const minGy = Math.floor((shape.y - reach) / g);
  const maxGy = Math.floor((shape.y + reach) / g);

  const cells: GridCell[] = [];
  for (let gy = minGy; gy <= maxGy; gy++) {
    for (let gx = minGx; gx <= maxGx; gx++) {
      const cx = gx * g + g / 2;
      const cy = gy * g + g / 2;
      if (cellInShape(shape, cx, cy, radiusPx, widthPx, directionDeg, halfAngleDeg)) {
        cells.push({ x: gx, y: gy });
      }
    }
  }
  return cells;
}
