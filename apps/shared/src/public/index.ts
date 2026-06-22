/**
 * Public surface of `@mcp-vertex/shared`.
 *
 * S1 ships design tokens + themes; S2 fills in the i18n contract
 * (`Lang`, `ILangDict`, the 12 merged language dictionaries); S3+ adds
 * the host-agnostic runtime components exported by
 * `@mcp-vertex/ui-extension`.
 *
 * Downstream surfaces import from here:
 *
 *   import { Lang, ILangDict } from '@mcp-vertex/shared';
 *   @use '@mcp-vertex/shared/styles' as *;
 */

export type { Lang, ILangDict, ILangMeta } from '../i18n/shared';
export {
	languages,
	rtlLangs,
	defaultLang,
	themes,
	flagFor,
} from '../i18n/shared';
export type { Theme } from '../i18n/shared';
