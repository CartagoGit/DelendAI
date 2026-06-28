import { t, type ILangDict } from '@mcp-vertex/shared/i18n';

export const extensionText = (
	dict: ILangDict,
	key: string,
	vars?: Readonly<Record<string, string | number>>,
): string => t(dict, ['extension', key], vars);