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
		testTimeout: 30000,
		hookTimeout: 30000,
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
