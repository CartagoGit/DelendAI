/**
 * real-deps.ts — production I/O adapter for the env check: read the `.env`
 * text from the filesystem. The only module here that touches the OS.
 */
import { readFile } from 'node:fs/promises';
import { isAbsolute, join } from 'node:path';

import type { IEnvScanDeps } from '../contracts/interfaces/env.interface';

/** Production env deps rooted at `workspaceRootAbs`. */
export const realEnvDeps = (workspaceRootAbs: string): IEnvScanDeps => ({
	readEnv: async (path) => {
		const abs = isAbsolute(path) ? path : join(workspaceRootAbs, path);
		try {
			return await readFile(abs, 'utf8');
		} catch {
			return undefined;
		}
	},
});
