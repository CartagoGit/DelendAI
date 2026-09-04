/**
 * real-deps.ts — production I/O adapter for the env check: read the `.env`
 * text from the filesystem. The only module here that touches the OS.
 *
 * x00168 (S3): `readEnv`'s `path` used to hand-roll
 * `isAbsolute(path) ? path : join(root, path)` — honoring an absolute
 * or `../`-escaping path unconditionally. The tool boundary
 * (`env-check.tool.ts`) now rejects an escaping `path` before this
 * module is ever constructed, but `resolveWorkspaceContained` is
 * applied here too as defense-in-depth for any other caller.
 */
import { readFile } from 'node:fs/promises';

import { resolveWorkspaceContained } from '@delendai/core/public';

import type { IEnvScanDeps } from '../contracts/interfaces/env.interface';

/** Production env deps rooted at `workspaceRootAbs`. */
export const realEnvDeps = (workspaceRootAbs: string): IEnvScanDeps => ({
	readEnv: async (path) => {
		const contained = resolveWorkspaceContained(workspaceRootAbs, path);
		if (!contained.ok) return undefined;
		try {
			return await readFile(contained.abs, 'utf8');
		} catch {
			return undefined;
		}
	},
});
