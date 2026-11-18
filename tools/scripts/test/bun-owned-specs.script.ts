#!/usr/bin/env bun
/**
 * bun-owned-specs.script.ts — `bun run test:sqlite`.
 *
 * Runs, under `bun test`, exactly the specs `BUN_OWNED_SPECS` names —
 * the ones that open a real `bun:sqlite` database and so cannot run
 * under vitest. The list is not repeated here or in `package.json`.
 *
 * The child gets the same per-run temp root vitest runs get, and the
 * root is removed when the child exits, whatever its exit code.
 */
import { spawnSync } from 'node:child_process';

import { BUN_OWNED_SPECS } from '../../../vitest.shared';
import { repoRoot } from '../lib/repo-root';
import { enterRunTempRoot } from './run-temp-root.global-setup';

/** The environment a child run inherits with `root` as its temp root. */
export const withRunTempRoot = (
	env: NodeJS.ProcessEnv,
	root: string,
): NodeJS.ProcessEnv => ({ ...env, TMPDIR: root, TMP: root, TEMP: root });

if (import.meta.main) {
	const run = enterRunTempRoot({ ...process.env });
	let status: number | null = null;
	try {
		status = spawnSync(
			'bun',
			[
				'test',
				'--timeout',
				'30000',
				...BUN_OWNED_SPECS,
				...process.argv.slice(2),
			],
			{
				cwd: repoRoot(),
				stdio: 'inherit',
				env: withRunTempRoot(process.env, run.root),
			},
		).status;
	} finally {
		run.leave();
	}
	process.exit(status ?? 1);
}
