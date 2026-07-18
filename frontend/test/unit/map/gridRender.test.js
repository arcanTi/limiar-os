import { describe, expect, it } from 'vitest';

import { adaptiveGridStyle } from '../../../src/domain/map/gridRender.ts';

describe('map gridRender: adaptiveGridStyle', () => {
  it('boosts alpha on a dark scene versus a bright one, at the same zoom', () => {
    const bright = adaptiveGridStyle(1, 0);
    const dark = adaptiveGridStyle(1, 1);
    expect(dark.alpha).toBeGreaterThan(bright.alpha);
  });

  it('boosts alpha when zoomed out versus 1:1, at the same darkness', () => {
    const zoomedOut = adaptiveGridStyle(0.3, 0.2);
    const fit = adaptiveGridStyle(1, 0.2);
    expect(zoomedOut.alpha).toBeGreaterThan(fit.alpha);
  });

  it('never exceeds the alpha ceiling even at max darkness and min zoom', () => {
    const style = adaptiveGridStyle(0.05, 1);
    expect(style.alpha).toBeLessThanOrEqual(0.6);
  });

  it('never drops below the floor even at zero darkness and high zoom', () => {
    const style = adaptiveGridStyle(4, 0);
    expect(style.alpha).toBeGreaterThanOrEqual(0.14);
  });

  it('switches line tint from gold to bright text past the dark-scene threshold', () => {
    expect(adaptiveGridStyle(1, 0.1).colorRgb).toBe('214,170,78');
    expect(adaptiveGridStyle(1, 0.6).colorRgb).toBe('240,234,216');
  });

  it('thickens the line when zoomed out past 50%', () => {
    expect(adaptiveGridStyle(0.4, 0).lineWidthPx).toBe(1.4);
    expect(adaptiveGridStyle(1, 0).lineWidthPx).toBe(1);
  });
});
