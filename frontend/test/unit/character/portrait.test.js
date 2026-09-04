import { describe, expect, it } from 'vitest';

import { uploadedPortrait } from '../../../src/domain/character/portrait.ts';

describe('domain/character/portrait', () => {
  it('returns an uploaded photo path', () => {
    expect(uploadedPortrait({ portraitUrl: '/uploads/character-portrait-abc.png' }))
      .toBe('/uploads/character-portrait-abc.png');
  });

  // The wizard fills every new sheet with svgCard's data: URI, which is the
  // same drawing for everyone — a placeholder, not a face.
  it('treats the generated card art as no portrait at all', () => {
    expect(uploadedPortrait({ portraitUrl: 'data:image/svg+xml;charset=UTF-8,%3Csvg' })).toBe('');
    expect(uploadedPortrait({ portraitUrl: 'DATA:image/svg+xml,x' })).toBe('');
  });

  it('is empty for a sheet with no portrait field at all', () => {
    expect(uploadedPortrait({})).toBe('');
    expect(uploadedPortrait(null)).toBe('');
    expect(uploadedPortrait({ portraitUrl: '   ' })).toBe('');
  });
});
