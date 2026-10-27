import type {
	II18nKeyUsage,
	ISourceFile,
} from '../contracts/interfaces/i18n.interface';

/**
 * Translation calls with a literal key: `t('a.b')`, `$t('a.b')`,
 * `i18n.t('a.b')`, `__('a.b')`, `translate('a.b')`, `i18n.translate(…)`.
 */
const CALL_KEY =
	/(?:\$?\bt|\bi18n\.t|\b__|\b(?:i18n\.)?translate)\(\s*(['"])([^'"]+?)\1/gu;
/** A key given as a property or attribute: `i18nKey="a.b"`, `{ id: 'a.b' }` in a message descriptor. */
const NAMED_KEY =
	/\b(?:i18nKey|messageKey)\s*[=:]\s*\{?\s*(['"])([^'"]+?)\1|\bformatMessage\(\s*\{\s*id\s*:\s*(['"])([^'"]+?)\3/gu;
/** Angular and Transloco pipes: `'a.b' | translate`. */
const PIPE_KEY = /(['"])([^'"]+?)\1\s*\|\s*(?:translate|transloco)\b/gu;
/** A key built at run time, `t(`errors.${code}`)`: everything under its fixed prefix is in use. */
const TEMPLATE_KEY =
	/(?:\$?\bt|\bi18n\.t|\b__|\b(?:i18n\.)?translate)\(\s*`([^`$]*)\$\{/gu;
/** A namespace a file's translator is bound to: `useTranslations('home')`, `useTranslation('home')`. */
const NAMESPACE =
	/\b(?:useTranslations|getTranslations|useTranslation)\(\s*(['"])([^'"]+?)\1/gu;

/**
 * Every way the scanned sources name a translation key: literal keys in
 * the call, property, attribute and pipe forms, the fixed prefix of keys
 * built at run time, and, in a file whose translator is bound to a
 * namespace, the key under that namespace as well.
 */
export const extractKeyUsage = (
	sources: readonly ISourceFile[],
): II18nKeyUsage => {
	const keys = new Set<string>();
	const prefixes = new Set<string>();
	for (const source of sources) {
		const namespaces = [...source.content.matchAll(NAMESPACE)]
			.map((match) => match[2]?.trim() ?? '')
			.filter((namespace) => namespace.length > 0);
		const add = (raw: string | undefined): void => {
			const key = raw?.trim();
			if (!key) return;
			keys.add(key);
			for (const namespace of namespaces) keys.add(`${namespace}.${key}`);
		};
		for (const match of source.content.matchAll(CALL_KEY)) add(match[2]);
		for (const match of source.content.matchAll(NAMED_KEY))
			add(match[2] ?? match[4]);
		for (const match of source.content.matchAll(PIPE_KEY)) add(match[2]);
		for (const match of source.content.matchAll(TEMPLATE_KEY)) {
			const prefix = match[1]?.trim() ?? '';
			if (prefix.length === 0) continue;
			prefixes.add(prefix);
			for (const namespace of namespaces)
				prefixes.add(`${namespace}.${prefix}`);
		}
	}
	return { keys, prefixes };
};

/** The literal translation keys the sources name. */
export const extractUsedKeys = (
	sources: readonly ISourceFile[],
): ReadonlySet<string> => extractKeyUsage(sources).keys;
