import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

import { sharedSetupFiles } from '../vitest.shared';

const here = dirname(fileURLToPath(import.meta.url));
const workspaceRoot = resolve(here, '..');

/**
 * Standalone vitest project for `tools/`. Walks every `*.spec.ts`
 * under that tree. Wired up by the root `vitest.config.ts#projects`.
 *
 * The silence-console-setup file lives in this very tree
 * (`tools/scripts/lib/silence-console-setup.ts`); importing it would
 * be circular, so we wire the absolute path via `sharedSetupFiles`
 * from the shared root — vitest resolves it before any spec is
 * collected.
 */
export default defineConfig({
	test: {
		include: ['**/*.spec.ts'],
		exclude: ['**/node_modules/**', '**/dist/**'],
		setupFiles: sharedSetupFiles(workspaceRoot),
	},
});
