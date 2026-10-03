import { t, type ILangDict } from '@delendai/shared/i18n';

export const extensionText = (
	dict: ILangDict,
	key: string,
	fallbackOrVars?: string | Readonly<Record<string, string | number>>,
	vars?: Readonly<Record<string, string | number>>,
): string => {
	if (typeof fallbackOrVars === 'string') {
		const resolved = t(dict, ['extension', key], vars);
		return resolved === `extension.${key}` ? fallbackOrVars : resolved;
	}
	return t(dict, ['extension', key], fallbackOrVars);
};
