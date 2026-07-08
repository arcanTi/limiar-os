import { describe, expect, it } from 'vitest';

import { LIMIAR_I18N, i18nTranslations, setI18n } from '../../../src/infrastructure/i18n.ts';

describe('infrastructure/i18n', () => {
  it('returns the English baseline for "en"', () => {
    expect(i18nTranslations('en').desktop).toBe('DESKTOP');
  });

  it('overlays the requested language over the English baseline', () => {
    expect(i18nTranslations('pt').desktop).toBe('DESKTOP');
    expect(i18nTranslations('pt').market).toBe('MERCADO');
  });

  it('falls back to English for an unknown language', () => {
    expect(i18nTranslations('fr')).toEqual(i18nTranslations('en'));
  });

  it('setI18n swaps the live-binding table used by i18nTranslations', () => {
    const original = LIMIAR_I18N;
    try {
      setI18n({ en: { desktop: 'HOME' }, pt: { desktop: 'INICIO' } });
      expect(i18nTranslations('en').desktop).toBe('HOME');
      expect(i18nTranslations('pt').desktop).toBe('INICIO');
    } finally {
      setI18n(original);
    }
  });

  it('a partial backend-supplied table for a language still falls back to English for missing keys', () => {
    const original = LIMIAR_I18N;
    try {
      setI18n({ en: { desktop: 'HOME', market: 'SHOP' }, pt: { desktop: 'INICIO' } });
      expect(i18nTranslations('pt').market).toBe('SHOP');
    } finally {
      setI18n(original);
    }
  });
});
