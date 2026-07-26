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
	},
});
