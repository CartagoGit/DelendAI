import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

import { sharedSetupFiles, workspaceAliases } from '../vitest.shared.ts';

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
	root: here,
	resolve: { alias: workspaceAliases(workspaceRoot) },
	test: {
		include: ['**/*.spec.ts'],
		exclude: ['**/node_modules/**', '**/dist/**'],
		setupFiles: sharedSetupFiles(workspaceRoot),
		// Several specs here scan the whole repository or boot a real MCP
		// server; they are slow by nature, not by defect. The 5s default
		// (and even a hand-written 30s) turns them into coin flips whenever
		// the machine is busy — and because `bun run validate` is the
		// evidence `close_slice` / `proposal_transition` require, a flaky
		// failure here blocks every proposal from closing. Widen the
		// ceiling: a genuine hang still fails, it just takes longer to say
		// so. Mirrors the same reasoning in `plugins/proposals/vitest.config.ts`.
		testTimeout: 120_000,
		hookTimeout: 120_000,
	},
});
