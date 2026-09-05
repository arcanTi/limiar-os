import { describe, expect, it } from 'vitest';

import {
  SHEET_CORE_SECTION_KEYS,
  normalizeCoreSections,
  toggleCoreSection,
} from '../../../src/ui/views/sheetSections.js';

describe('ui/views/sheetSections', () => {
  it('defaults every CORE block to folded', () => {
    expect(normalizeCoreSections(null)).toEqual({
      attrs: false, stats: false, dossier: false, brief: false,
    });
  });

  it('keeps only the known keys, so a stale preference cannot inject sections', () => {
    const sections = normalizeCoreSections({ attrs: true, gone: true });
    expect(Object.keys(sections)).toEqual(SHEET_CORE_SECTION_KEYS);
    expect(sections.attrs).toBe(true);
  });

  it('treats a non-boolean stored value as folded', () => {
    // A preference written as a string ("true") must not read as open by
    // accident; only a real boolean unfolds a section.
    expect(normalizeCoreSections({ attrs: 'true', stats: 1 })).toMatchObject({ attrs: false, stats: false });
  });

  it('survives a preference that is not an object at all', () => {
    expect(normalizeCoreSections('broken')).toMatchObject({ attrs: false });
    expect(normalizeCoreSections([true])).toMatchObject({ attrs: false });
  });

  it('toggles one section and leaves the others alone', () => {
    const opened = toggleCoreSection({ attrs: false, stats: true }, 'attrs');
    expect(opened).toEqual({ attrs: true, stats: true, dossier: false, brief: false });
    expect(toggleCoreSection(opened, 'attrs').attrs).toBe(false);
  });

  it('ignores an unknown key instead of storing it', () => {
    const sections = toggleCoreSection({ attrs: true }, 'nope');
    expect(sections).toEqual({ attrs: true, stats: false, dossier: false, brief: false });
  });
});
