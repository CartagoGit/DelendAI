import { describe, expect, it } from 'vitest';

import { scaffoldPluginFiles } from '@mcp-vertex/core/public';
import { writeScaffoldedFiles } from '@mcp-vertex/client';

/**
 * f00087 S2 smoke spec for `tools/scripts/create-plugin.ts`.
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
 * `@mcp-vertex/core/public` subpath.
 */

describe('tools/scripts/create-plugin.ts (f00087 S2 smoke)', () => {
	it('generates the canonical four files for a fresh plugin', async () => {
		const files = scaffoldPluginFiles({
			pluginName: 'smoke',
			description: 'Smoke test plugin',
		});
		const relativePaths = files.map((f) => f.path).sort();
		// The four canonical files produced by `scaffoldPluginFiles`.
		expect(relativePaths).toEqual(
			[
				'plugins/smoke/README.md',
				'plugins/smoke/package.json',
				'plugins/smoke/src/index.ts',
				'plugins/smoke/tsconfig.json',
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
