import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

import { sharedSetupFiles, workspaceAliases } from '../../vitest.shared';

const here = dirname(fileURLToPath(import.meta.url));
const workspaceRoot = resolve(here, '../..');

export default defineConfig({
	root: here,
	resolve: {
		alias: [
			...workspaceAliases(workspaceRoot),
			{
				find: '@delendai/agent-orchestrator/public',
				replacement: resolve(
					here,
					'../agent-orchestrator/src/public/index.ts',
				),
			},
			{
				find: '@delendai/agent-orchestrator',
				replacement: resolve(
					here,
					'../agent-orchestrator/src/index.ts',
				),
			},
		],
	},
	test: {
		testTimeout: 30000,
		hookTimeout: 30000,
		name: 'audit-orchestrator',
		include: ['tests/src/**/*.spec.ts'],
		exclude: ['**/node_modules/**', '**/dist/**'],
		environment: 'node',
		globals: false,
		setupFiles: sharedSetupFiles(workspaceRoot),
	},
});
