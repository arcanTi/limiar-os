// Camera/zoom math (README-MAPA A5): the page used to jump straight to the
// target zoom on every wheel tick or +/- click. These are the pure pieces of
// a lerp-toward-target animation loop — the page owns the rAF ticking and
// the DOMRect reads, this module only does the numbers.

export interface Point {
  x: number;
  y: number;
}

export interface Camera {
  x: number;
  y: number;
  zoom: number;
}

export function clampZoom(zoom: number, min = 0.05, max = 5): number {
  return Math.max(min, Math.min(max, Number(zoom) || min));
}

// One animation step toward targetZoom. `factor` is the fraction of the
// remaining distance covered this frame (0..1) — small values feel like
// smooth easing, 1 jumps instantly. Snaps to the target once within
// `epsilon` so the animation loop has a clean stop condition instead of
// chasing a fractional tail forever.
export function lerpZoom(current: number, target: number, factor: number, epsilon = 0.001): number {
  const next = current + (target - current) * Math.max(0, Math.min(1, factor));
  return Math.abs(target - next) < epsilon ? target : next;
}

// Camera pan that keeps `worldPoint` pinned under `screenPoint` at the given
// zoom — the standard "zoom toward the cursor/anchor" formula, factored out
// so it can be reused for both the wheel handler and the lerp animation tick.
export function cameraPanForAnchor(worldPoint: Point, screenPoint: Point, zoom: number): Point {
  return { x: screenPoint.x - worldPoint.x * zoom, y: screenPoint.y - worldPoint.y * zoom };
}
