import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

import { sharedSetupFiles, workspaceAliases } from '../../vitest.shared';

const here = dirname(fileURLToPath(import.meta.url));
const workspaceRoot = resolve(here, '../..');

export default defineConfig({
	resolve: { alias: workspaceAliases(workspaceRoot) },
	test: {
		// The proposal state tools and peer-review bypass audit share
		// process-local buffers. Running their files concurrently lets one
		// spec reset another spec's audit state mid-assertion.
		fileParallelism: false,
		// Concurrency/IO tests can exceed the 5s default under heavy
		// parallel-suite CPU load; widen so CI is not flaky (a real hang
		// still fails — assertions are the contract, not the wait).
		testTimeout: 30000,
		hookTimeout: 30000,
		name: 'proposals',
		include: ['tests/**/*.spec.ts'],
		exclude: ['**/node_modules/**', '**/dist/**'],
		environment: 'node',
		setupFiles: [
			...sharedSetupFiles(workspaceRoot),
			// Reset ambient CI/GITHUB_ACTIONS/GITHUB_SHA env vars before each
			// test so specs stay hermetic on a real GitHub Actions runner
			// (which sets CI=true and GITHUB_ACTIONS=true for every job).
			// See the file for the full story.
			resolve(here, 'tests/setup/reset-ci-env.setup.ts'),
			// Wire the Bun polyfill ONLY in this project. The proposals
			// integration spec (`executable-acceptance.spec.ts`) gates itself
			// on `typeof Bun !== 'undefined'`; vitest's thread pool is plain
			// Node, so without this shim the spec is skipped on hosts that
			// have Bun installed. The polyfill is a no-op on hosts without
			// Bun (returns `null` from `Bun.which`, matching the real Bun API
			// and keeping the integration spec guarded by intent).
			resolve(workspaceRoot, 'tools/scripts/lib/bun-polyfill.ts'),
		],
		globals: false,
	},
});
