/**
 * read-cache-file.helper.ts — the text of one of this plugin's cache
 * files, read through the contained reader.
 *
 * The reader is rooted at the file's own directory, so the read cannot
 * leave it whatever the name holds. A missing file reads as `undefined`.
 */
import { basename, dirname } from 'node:path';

import { SafeWorkspaceReader } from '@delendai/core/runtime';

export const readCacheFile = async (
	absolutePath: string,
): Promise<string | undefined> => {
	const reader = new SafeWorkspaceReader(dirname(absolutePath));
	if ((await reader.exists(basename(absolutePath))) === null)
		return undefined;
	return (await reader.readText(basename(absolutePath))).content;
};
