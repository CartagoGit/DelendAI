#!/usr/bin/env bun
/**
 * bun-owned-specs.script.ts — `bun run test:sqlite`.
 *
 * Runs, under `bun test`, exactly the specs `BUN_OWNED_SPECS` names —
 * the ones that open a real `bun:sqlite` database and so cannot run
 * under vitest. The list is not repeated here or in `package.json`.
 */
import { spawnSync } from 'node:child_process';

import { BUN_OWNED_SPECS } from '../../../vitest.shared';
import { repoRoot } from '../lib/repo-root';

if (import.meta.main) {
	const result = spawnSync(
		'bun',
		[
			'test',
			'--timeout',
			'30000',
			...BUN_OWNED_SPECS,
			...process.argv.slice(2),
		],
		{ cwd: repoRoot(), stdio: 'inherit' },
	);
	process.exit(result.status ?? 1);
}
