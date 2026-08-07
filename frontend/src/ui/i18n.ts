// UI copy in en/pt. data/seed/i18n.json is the source of truth.
import i18nData from '@seed/i18n.json';

export type I18nTable = Record<string, Record<string, string>>;

export let LIMIAR_I18N: I18nTable = i18nData;

export function setI18n(data: I18nTable): void {
  LIMIAR_I18N = data;
}

export function i18nTranslations(lang: string): Record<string, string> {
  return { ...LIMIAR_I18N.en, ...(LIMIAR_I18N[lang] || {}) };
}
