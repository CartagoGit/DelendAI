/**
 * real-deps.ts — production I/O adapter: walk source files under the workspace
 * root (via Bun.Glob), skip vendored / build / VCS dirs, and read each within
 * bounds. The only module here that touches the OS. Never throws.
 */
import { stat } from 'node:fs/promises';
import { join } from 'node:path';

import { SafeWorkspaceReader } from '@delendai/core/public';

import type {
	ISourceFile,
	ITechDebtScanDeps,
} from '../contracts/interfaces/tech-debt.interface';

/** Extensions worth scanning for marker comments. */
const INCLUDE = 'ts,tsx,mts,cts,js,jsx,mjs,cjs,vue,svelte,astro,scss,css,md';
const GLOB = `**/*.{${INCLUDE}}`;

/** Path fragments whose presence excludes a file from the scan. */
const EXCLUDED = [
	'/node_modules/',
	'/dist/',
	'/build/',
	'/.cache/',
	'/.git/',
	'/coverage/',
	'/.astro/',
];

/** Bounds so a huge tree can't blow up memory or the response. */
const MAX_FILES = 4000;
const MAX_FILE_BYTES = 512 * 1024;

const isExcluded = (rel: string): boolean =>
	EXCLUDED.some((fragment) => `/${rel}`.includes(fragment));

/** Production tech-debt deps rooted at `workspaceRootAbs`. */
export const realTechDebtDeps = (
	workspaceRootAbs: string,
): ITechDebtScanDeps => ({
	listSourceFiles: async () => {
		const reader = new SafeWorkspaceReader(workspaceRootAbs);
		const out: ISourceFile[] = [];
		const glob = new Bun.Glob(GLOB);
		for await (const rel of glob.scan({
			cwd: workspaceRootAbs,
			onlyFiles: true,
			dot: false,
		})) {
			if (out.length >= MAX_FILES) break;
			if (isExcluded(rel)) continue;
			const abs = join(workspaceRootAbs, rel);
			try {
				const info = await stat(abs);
				if (info.size > MAX_FILE_BYTES) continue;
				out.push({
					path: rel,
					content: (await reader.readText(rel)).content,
				});
			} catch {
				// unreadable or vanished — skip it
			}
		}
		return out;
	},
});
