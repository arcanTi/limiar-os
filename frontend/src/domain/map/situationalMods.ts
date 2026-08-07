// Convert map darkness and line-of-sight knowledge into a small catalog of
// pre-filled, dismissible modifier chips for the combat cockpit. This is
// deliberately not configurable: three chips provide fixed advisory values
// that the GM can still freely adjust via the
// same stepper afterwards (enforcement stays advisory everywhere in this
// repository, this is a suggestion rather than a rule engine).
import { visionContainsPoint } from './visionEngine.ts';
import type { Point, Wall } from './visionEngine.ts';

export interface SituationalChip {
  id: 'darkness' | 'noLos' | 'inCover';
  label: string;
  mod: number;
}

// "Hugging a wall" heuristic for the in-cover chip: CPR has no map-derived
// cover geometry today (only the manual GM toggle in attackContextState), so
// this is a documented approximation — a target within half a grid cell of
// a wall segment reads as being near cover, not a RAW cover determination.
const NEAR_WALL_PX_DEFAULT = 32;

function distancePointToSegment(point: Point, wall: Wall): number {
  const dx = wall.x2 - wall.x1;
  const dy = wall.y2 - wall.y1;
  const lenSq = dx * dx + dy * dy;
  const t = lenSq > 0 ? Math.max(0, Math.min(1, ((point.x - wall.x1) * dx + (point.y - wall.y1) * dy) / lenSq)) : 0;
  const px = wall.x1 + t * dx;
  const py = wall.y1 + t * dy;
  return Math.hypot(point.x - px, point.y - py);
}

export interface SituationalModsContext {
  darkness?: number;
  walls?: Wall[];
  attacker: Point;
  target: Point;
  nearWallPx?: number;
}

export function computeSituationalChips(ctx: SituationalModsContext): SituationalChip[] {
  const chips: SituationalChip[] = [];
  if (Number(ctx.darkness) > 0) chips.push({ id: 'darkness', label: 'ESCURIDAO', mod: -2 });

  const walls = Array.isArray(ctx.walls) ? ctx.walls : [];
  const reach = Math.hypot(ctx.target.x - ctx.attacker.x, ctx.target.y - ctx.attacker.y) + 1;
  const hasLos = reach > 0 ? visionContainsPoint(ctx.attacker, reach, walls, ctx.target) : true;
  if (!hasLos) {
    chips.push({ id: 'noLos', label: 'SEM LINHA DE VISAO', mod: -4 });
  } else if (walls.some(wall => distancePointToSegment(ctx.target, wall) <= (ctx.nearWallPx ?? NEAR_WALL_PX_DEFAULT))) {
    chips.push({ id: 'inCover', label: 'ALVO PROXIMO A COBERTURA', mod: -2 });
  }
  return chips;
}
