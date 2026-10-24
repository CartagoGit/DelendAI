/**
 * Public surface of `@delendai/shared`.
 *
 * S1 ships design tokens + themes; S2 fills in the i18n contract
 * (`Lang`, `ILangDict`, the 12 merged language dictionaries). Runtime UI
 * shells consume this foundation; this package never imports them back.
 *
 * Downstream surfaces import from here:
 *
 *   import { Lang, ILangDict } from '@delendai/shared';
 *   @use '@delendai/shared/styles' as *;
 */
export {
	defaultLang,
	flagFor,
	languages,
	rtlLangs,
	themes,
} from '../i18n/shared';
export type { ILangDict, ILangMeta, Lang, Theme } from '../i18n/shared';
export { BRAND_HEX_BLUE, BRAND_HEX_PURPLE } from '../lib/brand';
export {
	allBrandCodes,
	allFlagCodes,
	BRAND_ICONS,
	FLAGS,
	FLAG_NAMES,
	hasBrandIcon,
	hasFlagIcon,
	languageFlag,
	renderBrandIcon,
	renderFlagIcon,
} from '../components/ui/brand-icons';
