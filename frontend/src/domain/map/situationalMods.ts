// G8 (Fase AREA, partial close — README-PLANO.md sec. 5/6): the map already
// knows darkness (F6 scene.darkness) and LOS (walls, via visionEngine); this
// turns that into a small, named catalog of pre-filled, dismissible chips
// for the cockpit's existing MOD stepper (CM0's pendingRollMods/
// adjustAdHocMod in ui/views/combat.js) instead of the GM eyeballing and
// typing a modifier from memory. Deliberately NOT a configurable system —
// three chips, fixed advisory values the GM can still freely adjust via the
// same stepper afterwards (enforcement stays advisory everywhere in this
// repo, this is a suggestion, not a rule engine).
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
