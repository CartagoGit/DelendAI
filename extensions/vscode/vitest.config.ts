import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

import { workspaceAliases } from '../../vitest.shared';

const here = dirname(fileURLToPath(import.meta.url));
const workspaceRoot = resolve(here, '../..');

export default defineConfig({
	resolve: {
		alias: workspaceAliases(workspaceRoot),
	},
	test: {
		include: ['src/test/**/*.spec.ts'],
	},
});
