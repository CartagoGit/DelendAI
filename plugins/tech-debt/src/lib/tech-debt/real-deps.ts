/**
 * real-deps.ts — production I/O adapter: walk source files under the workspace
 * root (via Bun.Glob), skip vendored / build / VCS dirs, and read each within
 * bounds. The only module here that touches the OS. Never throws.
 */
import { stat } from 'node:fs/promises';
import { join } from 'node:path';

import { SafeWorkspaceReader } from '@delendai/core/runtime';

import {
	TECH_DEBT_MAX_FILE_BYTES,
	TECH_DEBT_MAX_FILES,
} from '../contracts/constants/tech-debt.constant';
import type {
	ISkippedSourceFile,
	ISourceFile,
	ISourceFileScan,
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

const isExcluded = (rel: string): boolean =>
	EXCLUDED.some((fragment) => `/${rel}`.includes(fragment));

/** Production tech-debt deps rooted at `workspaceRootAbs`. */
export const realTechDebtDeps = (
	workspaceRootAbs: string,
): ITechDebtScanDeps => ({
	listSourceFiles: async (): Promise<ISourceFileScan> => {
		const reader = new SafeWorkspaceReader(workspaceRootAbs);
		const files: ISourceFile[] = [];
		const skipped: ISkippedSourceFile[] = [];
		let capped = false;
		const glob = new Bun.Glob(GLOB);
		for await (const rel of glob.scan({
			cwd: workspaceRootAbs,
			onlyFiles: true,
			dot: false,
		})) {
			if (isExcluded(rel)) continue;
			if (files.length >= TECH_DEBT_MAX_FILES) {
				capped = true;
				break;
			}
			const abs = join(workspaceRootAbs, rel);
			try {
				const info = await stat(abs);
				if (info.size > TECH_DEBT_MAX_FILE_BYTES) {
					skipped.push({ path: rel, reason: 'too-large' });
					continue;
				}
				files.push({
					path: rel,
					content: (await reader.readText(rel)).content,
				});
			} catch {
				skipped.push({ path: rel, reason: 'unreadable' });
			}
		}
		return { files, skipped, capped };
	},
});
