import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

import { sharedSetupFiles, workspaceAliases } from '../../vitest.shared';

const here = dirname(fileURLToPath(import.meta.url));
const workspaceRoot = resolve(here, '../..');

export default defineConfig({
	root: workspaceRoot,
	resolve: { alias: workspaceAliases(workspaceRoot) },
	test: {
		name: 'skills-pack',
		include: ['plugins/skills-pack/src/**/*.spec.ts'],
		setupFiles: sharedSetupFiles(workspaceRoot),
		// The catalog spec walks every plugin's tool ids across the whole
		// `plugins/` tree, so it is slow by nature rather than by defect:
		// 2.9s measured idle, against vitest's bare 5s default. A 1.7x
		// margin does not survive `verify:plugin-suites` running under a
		// loaded machine, and it timed out at 5.0s in a full `validate`.
		// 120s is the ceiling `tools/vitest.config.ts` already documents
		// for "specs that scan the whole repository"; a genuine hang still
		// fails, it just takes longer to say so.
		testTimeout: 120_000,
		hookTimeout: 120_000,
	},
});
