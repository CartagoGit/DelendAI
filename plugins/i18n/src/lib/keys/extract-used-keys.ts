import type { ISourceFile } from '../contracts/interfaces/i18n.interface';

const KEY_USAGE = /(?:\bi18n\.t|\bt|\b__)\(\s*(['"`])([^'"`]+?)\1/g;

/** Extract translation keys from common call shapes like `t('a.b')`. */
export const extractUsedKeys = (
	sources: readonly ISourceFile[],
): ReadonlySet<string> => {
	const usedKeys = new Set<string>();
	for (const source of sources) {
		for (const match of source.content.matchAll(KEY_USAGE)) {
			const key = match[2]?.trim();
			if (key) usedKeys.add(key);
		}
	}
	return usedKeys;
};
