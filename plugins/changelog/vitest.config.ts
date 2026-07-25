import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { sharedSetupFiles, workspaceAliases } from '../../vitest.shared';

import { defineConfig } from 'vitest/config';

const here = dirname(fileURLToPath(import.meta.url));
const workspaceRoot = resolve(here, '../..');

export default defineConfig({
	resolve: {
		alias: workspaceAliases(workspaceRoot),
	},
	test: {
		include: ['src/**/*.spec.ts'],
		setupFiles: sharedSetupFiles(workspaceRoot),
	},
});
