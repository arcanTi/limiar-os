// UI copy in en/pt. data/seed/i18n.json is the source of truth (see @seed
// alias in vite.config.js); this object is the bundled default.
// Runtime-mutable: the backend can ship an updated table via
// loadReferenceData, applied through setI18n (live-binding setter, same
// pattern as domain/tarot/constants.ts's setTarotCards).
import i18nData from '@seed/i18n.json';

export type I18nTable = Record<string, Record<string, string>>;

export let LIMIAR_I18N: I18nTable = i18nData;

export function setI18n(data: I18nTable): void {
  LIMIAR_I18N = data;
}

// Merge the active language over the English baseline so missing keys in a
// partial/backend-supplied translation table still fall back to English.
export function i18nTranslations(lang: string): Record<string, string> {
  return { ...LIMIAR_I18N.en, ...(LIMIAR_I18N[lang] || {}) };
}
