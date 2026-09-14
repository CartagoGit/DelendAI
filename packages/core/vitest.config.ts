import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

import { sharedSetupFiles, workspaceAliases } from '../../vitest.shared';

const here = dirname(fileURLToPath(import.meta.url));
const workspaceRoot = resolve(here, '../..');

export default defineConfig({
	cacheDir: resolve(workspaceRoot, '.cache/vitest/packages-core'),
	resolve: { alias: workspaceAliases(workspaceRoot) },
	test: {
		// Concurrency/IO tests can exceed the 5s default under heavy
		// parallel-suite CPU load; widen so CI is not flaky (a real hang
		// still fails — assertions are the contract, not the wait).
		//
		// Raised 30s -> 120s. The 30s was chosen when the suite was
		// smaller; a full `validate` now runs 1466 test files in
		// parallel, and `first-party-config-example.spec.ts` — which
		// reads every plugin directory — timed out at 30s despite
		// costing 11.3s measured idle. A 2.6x margin does not survive
		// the several-fold transform/import inflation a full run
		// produces. 120s is the ceiling `tools/vitest.config.ts` had
		// already concluded for specs that scan the whole repository;
		// `plugins/proposals/vitest.config.ts` documents the same
		// reasoning but stops at 30s.
		testTimeout: 120_000,
		// Hooks interleave with the tests they set up, so they get the
		// same ceiling for the same reason.
		hookTimeout: 120_000,
		name: 'core',
		include: ['tests/**/*.spec.ts'],
		exclude: [
			'**/node_modules/**',
			'**/dist/**',
			// The evidence store's SQLite backend needs `bun:sqlite`, a Bun
			// builtin with no node resolution. `evidence-repo.spec.ts`
			// imports it directly and the other two open a real database,
			// so all three run under `bun run test:sqlite`, a CI step of
			// its own. The file-backend and facade specs stay here.
			'tests/src/lib/evidence/evidence-repo.spec.ts',
			'tests/src/lib/evidence/evidence-migrate.spec.ts',
			'tests/src/lib/evidence/evidence-store.spec.ts',
		],
		environment: 'node',
		globals: false,
		setupFiles: sharedSetupFiles(workspaceRoot),
	},
});
