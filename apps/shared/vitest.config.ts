import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

import { sharedSetupFiles, workspaceAliases } from '../../vitest.shared';

const here = dirname(fileURLToPath(import.meta.url));
const workspaceRoot = resolve(here, '../..');

/**
 * Vitest config for `apps/shared/`. The shared package carries the
 * SCSS contract (tokens, themes, component partials) plus the public
 * `index.ts` re-export surface. Today only the styles layer ships
 * specs; the TS side is type-checked via `bun run type` and has no
 * runtime behaviour of its own.
 *
 * f00055 S2 added the first colocated spec
 * (`src/styles/_dropdown.spec.ts`) so the project was promoted to a
 * vitest project by adding its path to the root `vitest.config.ts`
 * `projects` array. The list entry is what wires us into the root
 * `bun run test` aggregation.
 */
export default defineConfig({
	resolve: {
		alias: workspaceAliases(workspaceRoot),
	},
	test: {
		name: 'apps-shared',
		include: ['src/**/*.spec.ts'],
		exclude: ['**/node_modules/**', '**/dist/**'],
		environment: 'node',
		globals: false,
		setupFiles: sharedSetupFiles(workspaceRoot),
	},
});
