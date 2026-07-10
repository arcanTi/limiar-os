export interface Point { x: number; y: number }
export interface Wall { id?: string; x1: number; y1: number; x2: number; y2: number; kind?: 'wall' | 'door'; open?: boolean }

const EPSILON = 0.0001;
const FULL_CIRCLE_RAYS = 96;

function blocks(wall: Wall): boolean { return wall.kind !== 'door' || !wall.open; }

function rayHit(origin: Point, angle: number, radius: number, wall: Wall): Point | null {
  const dx = Math.cos(angle), dy = Math.sin(angle);
  const sx = wall.x2 - wall.x1, sy = wall.y2 - wall.y1;
  const denom = dx * sy - dy * sx;
  if (Math.abs(denom) < EPSILON) return null;
  const ox = wall.x1 - origin.x, oy = wall.y1 - origin.y;
  const t = (ox * sy - oy * sx) / denom;
  const u = (ox * dy - oy * dx) / denom;
  if (t < 0 || t > radius || u < 0 || u > 1) return null;
  return { x: origin.x + dx * t, y: origin.y + dy * t };
}

// Raycast endpoints plus a uniform circle sample. The uniform rays keep the
// no-wall case circular; endpoint epsilon rays keep wall corners stable.
export function visionPolygon(origin: Point, radius: number, walls: Wall[] = []): Point[] {
  if (!(Number(radius) > 0)) return [];
  const angles: number[] = [];
  for (let i = 0; i < FULL_CIRCLE_RAYS; i++) angles.push((Math.PI * 2 * i) / FULL_CIRCLE_RAYS);
  walls.filter(blocks).forEach(wall => {
    [[wall.x1, wall.y1], [wall.x2, wall.y2]].forEach(([x, y]) => {
      const angle = Math.atan2(y - origin.y, x - origin.x);
      angles.push(angle - EPSILON, angle, angle + EPSILON);
    });
  });
  return angles.map(angle => {
    let point: Point = { x: origin.x + Math.cos(angle) * radius, y: origin.y + Math.sin(angle) * radius };
    walls.filter(blocks).forEach(wall => { const hit = rayHit(origin, angle, radius, wall); if (hit && Math.hypot(hit.x - origin.x, hit.y - origin.y) < Math.hypot(point.x - origin.x, point.y - origin.y)) point = hit; });
    return { ...point, angle };
  }).sort((a, b) => a.angle - b.angle).map(({ x, y }) => ({ x, y }));
}

export function pointInPolygon(point: Point, polygon: Point[]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i], b = polygon[j];
    if (((a.y > point.y) !== (b.y > point.y)) && point.x < ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

export function visionContainsPoint(origin: Point, radius: number, walls: Wall[], point: Point): boolean {
  if (Math.hypot(point.x - origin.x, point.y - origin.y) > radius) return false;
  return pointInPolygon(point, visionPolygon(origin, radius, walls));
}
