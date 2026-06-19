import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';

import { workspaceAliases } from '../../vitest.shared';

const root = resolve(__dirname, '../..');

export default defineConfig({
	test: {
		environment: 'node',
		include: ['tests/**/*.spec.ts'],
	},
	resolve: {
		alias: workspaceAliases(root),
	},
});
