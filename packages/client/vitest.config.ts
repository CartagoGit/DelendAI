import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

import { sharedSetupFiles, workspaceAliases } from '../../vitest.shared';

const here = dirname(fileURLToPath(import.meta.url));
const workspaceRoot = resolve(here, '../..');

export default defineConfig({
	// Resolve `@delendai/core/public` (and friends) to workspace source
	// so the scaffold/authoring specs under `src/tests/**` exercise the
	// live code, not a stale `dist` build.
	resolve: { alias: workspaceAliases(workspaceRoot) },
	test: {
		// Measured in isolation on 2026-09-14: the slowest
		// test of this suite costs 1412 ms (`e2e: McpStdioClient over a real delendai stdio server spawns the so...`).
		// A full run starts ~1,466 spec files at once, so a ceiling under
		// 6x a measured cost is a coin flip rather than a decision.
		testTimeout: 30_000,
		hookTimeout: 30_000,
		// `tests/**` holds the service/transport/e2e specs; `src/tests/**`
		// holds the scaffold/authoring unit specs that live next to their
		// `src/lib/scaffold` code (f00087 S2 + f00089 U4).
		include: ['tests/**/*.spec.ts', 'src/tests/**/*.spec.ts'],
		setupFiles: sharedSetupFiles(workspaceRoot),
	},
});
