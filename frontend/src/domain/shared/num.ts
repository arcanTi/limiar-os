// Shared numeric helpers used across domain modules. Pure — no DOM, no state.

// Coerce to a rounded integer with optional clamping; falls back when not finite.
export function asNumber(value: unknown, fallback: number, min?: number, max?: number): number {
  const n = Number(value);
  let out = Number.isFinite(n) ? Math.round(n) : fallback;
  if (typeof min === 'number') out = Math.max(min, out);
  if (typeof max === 'number') out = Math.min(max, out);
  return out;
}
