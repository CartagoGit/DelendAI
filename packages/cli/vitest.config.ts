import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

import { sharedSetupFiles, workspaceAliases } from '../../vitest.shared';

const here = dirname(fileURLToPath(import.meta.url));
const workspaceRoot = resolve(here, '../..');

export default defineConfig({
	resolve: {
		alias: workspaceAliases(workspaceRoot),
	},
	test: {
		// f00037 S5: tests are co-located next to the source they cover
		// (`*.spec.ts` next to the implementation). The historical
		// `tests/src/**` mirror was retired by the S4 slice (every
		// test moved next to its source); the directory was removed.
		include: ['src/**/*.spec.ts'],
		setupFiles: sharedSetupFiles(workspaceRoot),
	},
});
