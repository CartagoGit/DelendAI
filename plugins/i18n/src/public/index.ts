/**
 * Public surface of `@delendai/i18n`. Pure cross-locale checking primitives
 * for programmatic reuse.
 */
export { checkLocales, flattenKeys } from '../lib/i18n/check-i18n';
export { realI18nDeps } from '../lib/i18n/real-deps';
export { extractUsedKeys } from '../lib/keys/extract-used-keys';
export { validateInterpolation } from '../lib/validate/validate-interpolation';
export type {
	II18nCheckToolOptions,
	II18nScanDeps,
	II18nValidateToolOptions,
	ILocaleFile,
	ISourceFile,
} from '../lib/contracts/interfaces/i18n.interface';
