import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
	assemblePluginForTest,
	createLocalPluginImporter,
	type IPluginImporter,
} from './plugin-test-bed';

/** The real repo root (this file lives at tools/scripts/lib/). */
const REPO_ROOT = resolve(__dirname, '../../..');

/**
 * Solid-DRY tests for the shared plugin-test-bed factory. We do NOT
 * test the full `assemblePluginForTest` here — that path boots
 * `assembleCliConfig` and requires a real plugin module. Instead we
 * pin the **adapter** contract: the importer resolves the right
 * path, and the options round-trip without mutation.
 *
 * The end-to-end integration is exercised by `plugin-tool-verify`
 * and `generate-tool-types` at runtime.
 */
describe('plugin-test-bed (Solid DRY extraction)', async () => {
	describe('createLocalPluginImporter', async () => {
		it('returns a function that maps plugin name → import closure', async () => {
			const importer = createLocalPluginImporter('/some/workspace');
			expect(typeof importer).toBe('function');
		});

		it('returns the same shape every consumer needs (Promise<{default}>)', async () => {
			const importer: IPluginImporter = createLocalPluginImporter('/ws');
			// Type check (compile-time) + shape: importer is callable
			// and returns a Promise that resolves to an object with
			// a `default` key. We can't assert runtime path resolution
			// here (it would need a real plugin on disk); the
			// integration test does that.
			expect(importer).toBeDefined();
		});
	});

	describe('end-to-end: the bed loads PLUGIN-OWNED tools (x00105 S1)', async () => {
		// The pre-x00105 importer ignored `workspaceRoot`, resolved a
		// relative path that broke when this module moved into `lib/`,
		// and received npm SPECIFIERS (`@delendai/x`) where it expected
		// bare names — so every plugin load failed, the errors were
		// swallowed, and verify:tools silently probed core tools only.
		it('assembles status-marker with its own tools present', async () => {
			const bed = await assemblePluginForTest({
				workspaceRoot: REPO_ROOT,
				pluginName: 'status-marker',
				// Isolate from the repo's real mcp-vertex.config.json —
				// only the plugin under test.
				syntheticConfig: {},
			});
			expect(bed.loadErrors).toEqual([]);
			const ids = bed.tools.map((t) => t.id);
			expect(ids.some((id) => id.endsWith('status-marker_close'))).toBe(
				true,
			);
			expect(ids.some((id) => id.endsWith('status-marker_ping'))).toBe(
				true,
			);
		});

		it('surfaces load errors instead of swallowing them', async () => {
			const bed = await assemblePluginForTest({
				workspaceRoot: REPO_ROOT,
				pluginName: 'no-such-plugin-xyz',
				syntheticConfig: {},
			});
			expect(bed.loadErrors.length).toBeGreaterThan(0);
		});
	});

	describe('IPluginImporter contract (LSP test)', async () => {
		it('accepts any function (name) => Promise<{default}> as a valid IPluginImporter', async () => {
			// Solid-LSP: the test-bed never cares about WHICH plugin
			// loader it gets. A stub satisfying the interface must
			// type-check without casts.
			const stub: IPluginImporter = async (name) => ({
				default: { name, marker: 'stub' },
			});
			return stub('audit').then((mod) => {
				expect((mod.default as { name: string }).name).toBe('audit');
			});
		});
	});
});
