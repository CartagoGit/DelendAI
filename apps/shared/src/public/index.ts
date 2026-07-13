/**
 * Public surface of `@mcp-vertex/shared`.
 *
 * S1 ships design tokens + themes; S2 fills in the i18n contract
 * (`Lang`, `ILangDict`, the 12 merged language dictionaries). Runtime UI
 * shells consume this foundation; this package never imports them back.
 *
 * Downstream surfaces import from here:
 *
 *   import { Lang, ILangDict } from '@mcp-vertex/shared';
 *   @use '@mcp-vertex/shared/styles' as *;
 */

export {
	defaultLang,
	flagFor,
	languages,
	rtlLangs,
	themes,
} from '../i18n/shared';
export type { ILangDict, ILangMeta, Lang, Theme } from '../i18n/shared';
