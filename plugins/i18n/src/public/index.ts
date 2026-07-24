/**
 * Public surface of `@mcp-vertex/i18n`. Pure cross-locale checking primitives
 * for programmatic reuse.
 */
export { checkLocales, flattenKeys } from '../lib/i18n/check-i18n';
export { realI18nDeps } from '../lib/i18n/real-deps';
export type {
	II18nCheckToolOptions,
	II18nScanDeps,
	ILocaleFile,
} from '../lib/contracts/interfaces/i18n.interface';
