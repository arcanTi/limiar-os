// Adaptive grid contrast based on scene darkness and zoom. The result remains
// visible on dark, zoomed-out maps without competing visually with tokens.

export interface AdaptiveGridStyle {
  colorRgb: string; // "r,g,b" — caller wraps in rgba(...)
  alpha: number;
  lineWidthPx: number;
}

export function adaptiveGridStyle(zoom: number, darkness: number): AdaptiveGridStyle {
  const z = Math.max(0.05, Number(zoom) || 1);
  const d = Math.max(0, Math.min(1, Number(darkness) || 0));
  // Zoomed out past 1:1, lines get thin/sparse on screen — boost contrast.
  const zoomBoost = z < 1 ? (1 - z) * 0.4 : 0;
  const alpha = Math.max(0.08, Math.min(0.4, 0.08 + d * 0.22 + zoomBoost));
  // Neutral gray instead of gold so the grid reads as measurement scaffolding,
  // not scene decoration; past a dark-scene threshold it lifts to a lighter
  // gray so it still reads against a near-black background.
  const colorRgb = d > 0.35 ? '210,210,210' : '150,150,150';
  const lineWidthPx = z < 0.5 ? 1.4 : 1;
  return { colorRgb, alpha, lineWidthPx };
}
