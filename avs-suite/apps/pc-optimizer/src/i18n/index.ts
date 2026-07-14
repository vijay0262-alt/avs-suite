import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { DEFAULT_LOCALE, en } from '@avs/shared/i18n';

/**
 * Initialise i18next with the English tree from @avs/shared/i18n as the
 * default resource. Additional locales are lazy-loaded from
 * `./locales/<code>.json` when the user changes their language.
 */
export async function initI18n(): Promise<void> {
  await i18n.use(initReactI18next).init({
    lng: DEFAULT_LOCALE,
    fallbackLng: DEFAULT_LOCALE,
    resources: { en: { translation: en } },
    interpolation: { escapeValue: false },
    returnNull: false,
  });
}

export { i18n };
