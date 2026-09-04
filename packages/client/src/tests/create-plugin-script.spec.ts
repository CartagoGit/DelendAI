import { describe, expect, it } from 'vitest';

import { writeScaffoldedFiles } from '@delendai/client';
import { scaffoldPluginFiles } from '@delendai/core/public';

/**
 * f00087 S2 smoke spec for `tools/scripts/scaffold/create-plugin.script.ts`.
 *
 * We do not spawn the script as a child process (that would require
 * bun on PATH and a tmp workspace setup); instead we exercise the
 * same code path the script uses, proving that the generator +
 * writer pair produces the four expected files for a minimal plugin.
 *
 * Lives in the `client` package because both APIs the script
 * consumes (`scaffoldPluginFiles` from core, `writeScaffoldedFiles`
 * from client) are workspace-resolved there; the original
 * `tools/scripts/tests/` location could not resolve the
 * `@delendai/core/public` subpath.
 */

describe('tools/scripts/scaffold/create-plugin.script.ts (f00087 S2 smoke)', () => {
	it('generates the canonical nine files for a fresh plugin', async () => {
		const files = scaffoldPluginFiles({
			pluginName: 'smoke',
			description: 'Smoke test plugin',
		});
		const relativePaths = files.map((f) => f.path).sort();
		// The nine canonical files produced by `scaffoldPluginFiles`
		// (f00120 S1 added LICENSE, vitest.config.ts, the public barrel, the
		// IPluginOptions contract, and a passing sample spec on top of
		// the original four).
		expect(relativePaths).toEqual(
			[
				'plugins/smoke/LICENSE',
				'plugins/smoke/README.md',
				'plugins/smoke/package.json',
				'plugins/smoke/src/contracts/interfaces/plugin-options.interface.ts',
				'plugins/smoke/src/index.ts',
				'plugins/smoke/src/public/index.ts',
				'plugins/smoke/tests/src/lib/ping.spec.ts',
				'plugins/smoke/tsconfig.json',
				'plugins/smoke/vitest.config.ts',
			].sort(),
		);
	});

	it('writeScaffoldedFiles accepts the canonical writer contract', async () => {
		const files = scaffoldPluginFiles({
			pluginName: 'smoke',
			description: 'Smoke test plugin',
		});
		const ops: { path: string; content: string }[] = [];
		const fakeWriter = {
			async writeAll(
				operations: readonly { path: string; content: string }[],
			) {
				ops.push(...operations);
				return {
					ok: true,
					committed: operations.map((o) => o.path),
					errors: [],
				};
			},
		};
		const result = await writeScaffoldedFiles('/anywhere', files, {
			batchWriter: fakeWriter,
		});
		expect(result.errors).toEqual([]);
		expect(result.written.length).toBe(files.length);
		expect(ops.length).toBe(files.length);
	});
});
