// Adaptive grid contrast (README-MAPA A4): the grid was a flat
// rgba(214,170,78,.14) regardless of scene darkness or zoom, which reads as
// "practically invisible" over a dark map at <100% zoom. This computes an
// alpha/line-width/color that lifts contrast on darker scenes and at low
// zoom (where each line covers fewer screen pixels), without ever going
// so bright it competes with tokens. Pure function — draw() just applies it.

export interface AdaptiveGridStyle {
  colorRgb: string; // "r,g,b" — caller wraps in rgba(...)
  alpha: number;
  lineWidthPx: number;
}

export function adaptiveGridStyle(zoom: number, darkness: number): AdaptiveGridStyle {
  const z = Math.max(0.05, Number(zoom) || 1);
  const d = Math.max(0, Math.min(1, Number(darkness) || 0));
  // Zoomed out past 1:1, lines get thin/sparse on screen — boost contrast.
  const zoomBoost = z < 1 ? (1 - z) * 0.55 : 0;
  const alpha = Math.max(0.14, Math.min(0.6, 0.14 + d * 0.32 + zoomBoost));
  // Past a dark-scene threshold, switch the line tint from gold to the
  // brighter text color so it still reads against a near-black background.
  const colorRgb = d > 0.35 ? '240,234,216' : '214,170,78';
  const lineWidthPx = z < 0.5 ? 1.4 : 1;
  return { colorRgb, alpha, lineWidthPx };
}
