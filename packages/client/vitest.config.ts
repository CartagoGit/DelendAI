import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

import { sharedSetupFiles, workspaceAliases } from '../../vitest.shared';

const here = dirname(fileURLToPath(import.meta.url));
const workspaceRoot = resolve(here, '../..');

export default defineConfig({
	// Resolve `@mcp-vertex/core/public` (and friends) to workspace source
	// so the scaffold/authoring specs under `src/tests/**` exercise the
	// live code, not a stale `dist` build.
	resolve: { alias: workspaceAliases(workspaceRoot) },
	test: {
		// `tests/**` holds the service/transport/e2e specs; `src/tests/**`
		// holds the scaffold/authoring unit specs that live next to their
		// `src/lib/scaffold` code (f00087 S2 + f00089 U4).
		include: ['tests/**/*.spec.ts', 'src/tests/**/*.spec.ts'],
		setupFiles: sharedSetupFiles(workspaceRoot),
	},
});
