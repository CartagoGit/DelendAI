import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';

import { sharedSetupFiles, workspaceAliases } from '../../vitest.shared';

const root = resolve(__dirname, '../..');

export default defineConfig({
	test: {
		environment: 'node',
		include: ['tests/**/*.spec.ts'],
		setupFiles: sharedSetupFiles(root),
	},
	resolve: {
		alias: workspaceAliases(root),
	},
});
