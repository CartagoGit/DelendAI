/**
 * nearest-configured-root.helper.ts — the workspace a server serves when
 * it is not told one.
 *
 * It took its working directory, so a server started inside a workspace
 * member (`packages/core`) served that directory, wrote its cache there and
 * read no configuration. The workspace is the nearest directory up from
 * there that holds a configuration, without leaving the repository; with
 * none, the working directory is the workspace (a project's first start).
 */
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

import { DEFAULT_CONFIG_FILENAME } from '../plugins/load-config-file';

export const nearestConfiguredRoot = (
	cwd: string,
	exists: (path: string) => boolean = existsSync,
): string => {
	let dir = resolve(cwd);
	for (;;) {
		if (exists(join(dir, DEFAULT_CONFIG_FILENAME))) return dir;
		const parent = dirname(dir);
		// The repository's root ends the search; so does the filesystem's.
		if (parent === dir || exists(join(dir, '.git'))) return resolve(cwd);
		dir = parent;
	}
};
