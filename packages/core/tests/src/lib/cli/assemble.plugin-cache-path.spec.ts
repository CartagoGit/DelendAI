/**
 * assemble.plugin-cache-path.spec.ts — the `cachePath` every plugin is
 * handed at registration.
 *
 * A plugin never builds its own cache location: it asks the context,
 * and the context answers with an absolute path under this workspace's
 * cache directory, namespaced by plugin. The interesting half is the
 * refusal — a relative path that climbs out must throw rather than
 * return, because "somewhere above the workspace" is precisely where a
 * plugin must never be allowed to write in a repository several agents
 * share.
 */
import { afterAll, describe, expect, it } from 'vitest';

import { assembleCliConfig } from '@delendai/core/lib/cli/assemble';
import { parseCliArgs } from '@delendai/core/lib/plugins/parse-cli-args';

import { createTestWorkspace, removeTestWorkspace } from '../test-workspace';

const WORKSPACE = createTestWorkspace('delendai-plugin-cache-path-');
afterAll(() => removeTestWorkspace(WORKSPACE));

interface ICapturedContext {
	readonly pluginCacheDir: string;
	readonly inside: string;
	readonly escape: () => string;
}

let captured: ICapturedContext | undefined;

/**
 * Reads back what the plugin was handed. A function, not the variable:
 * the assignment happens inside a callback the compiler cannot follow,
 * so reading `captured` directly narrows it to `undefined`.
 */
const registered = (): ICapturedContext => {
	if (captured === undefined) throw new Error('the plugin never registered');
	return captured;
};

const plugin = {
	name: 'cachePlugin',
	register: (context: {
		pluginCacheDir: string;
		cachePath: (relativePath?: string) => string;
	}) => {
		captured = {
			pluginCacheDir: context.pluginCacheDir,
			inside: context.cachePath('state/db.json'),
			escape: () =>
				context.cachePath('../../../../outside-the-workspace.json'),
		};
		return {};
	},
};

const assemble = async () =>
	assembleCliConfig(
		parseCliArgs(
			[
				'--plugins=cachePlugin',
				`--workspace=${WORKSPACE}`,
				'--surface=native',
			],
			WORKSPACE,
		),
		{
			readFile: async () => undefined,
			import: async () => ({ default: plugin }),
		},
	);

describe('the cache path a plugin is handed', () => {
	it('is absolute, inside the workspace, and namespaced by plugin', async () => {
		captured = undefined;
		await assemble();

		const context = registered();
		expect(context.pluginCacheDir).toContain('cachePlugin');
		expect(context.inside.startsWith(WORKSPACE)).toBe(true);
		expect(context.inside.endsWith('state/db.json')).toBe(true);
	});

	it('refuses a relative path that climbs out of the cache directory', async () => {
		captured = undefined;
		await assemble();

		// Returning a path here — even one the plugin then fails to open
		// — would make the escape look supported. It throws instead, and
		// the message names the directory that was escaped.
		expect(() => registered().escape()).toThrow(/escapes/);
	});
});
