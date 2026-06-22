import { describe, expect, it } from 'vitest';

import { loadPlugins } from '@mcp-vertex/core/lib/plugins/load-plugins';
import type { IMcpPluginContext } from '@mcp-vertex/core/lib/plugins/plugin-contract';

import issuesPlugin from '../src/index';

const ctx = (name: string): IMcpPluginContext => ({
	workspace: { root: '/ws', resolve: (p: string) => `/ws/${p}` },
	corePaths: { cacheDir: '.cache/mcp-vertex', docsDir: 'docs/mcp-vertex' },
	cacheDir: '.cache/mcp-vertex',
	docsDir: 'docs/mcp-vertex',
	keepLegacy: false,
	pluginCacheDir: `.cache/mcp-vertex/${name}`,
	pluginDocsDir: `docs/mcp-vertex/${name}`,
	namespacePrefix: name,
	options: {},
	args: {},
});

/** Minimal stand-in for `@mcp-vertex/proposals`'s loadable default export. */
const fakeProposalsPlugin = {
	name: 'proposals',
	register: () => ({ tools: [] }),
};

/**
 * Builds an injectable importer that resolves `@mcp-vertex/<name>`
 * specifiers to in-memory fakes (or the real `issues` plugin under
 * test), simulating the loader's resolution without touching the
 * filesystem or other workspace packages.
 */
const fakeImporter =
	(loadSet: { proposals: boolean; issues: boolean }) =>
	async (specifier: string) => {
		if (specifier === '@mcp-vertex/proposals') {
			if (!loadSet.proposals) throw new Error('not found');
			return { default: fakeProposalsPlugin };
		}
		if (specifier === '@mcp-vertex/issues') {
			if (!loadSet.issues) throw new Error('not found');
			return { default: issuesPlugin };
		}
		throw new Error(`unexpected specifier: ${specifier}`);
	};

describe('issues plugin — dependsOn contract', () => {
	it('declares a hard dependency on proposals', () => {
		expect(issuesPlugin.dependsOn).toEqual(['proposals']);
	});

	it('fails the whole load when proposals is not in the load set', async () => {
		const specifiers = ['issues'];
		const loadSet = { proposals: false, issues: true };
		const result = await loadPlugins({
			specifiers,
			buildContext: ctx,
			import: fakeImporter(loadSet),
		});

		expect(result.loaded).toHaveLength(0);
		expect(
			result.errors.some((error) =>
				error.message.includes(
					'plugin "issues" requires "proposals" (not in load set)',
				),
			),
		).toBe(true);
	});

	it('loads cleanly (smoke test) when proposals is also in the load set', async () => {
		const specifiers = ['proposals', 'issues'];
		const loadSet = { proposals: true, issues: true };
		const result = await loadPlugins({
			specifiers,
			buildContext: ctx,
			import: fakeImporter(loadSet),
		});

		expect(result.errors).toEqual([]);
		expect(result.loaded.map((entry) => entry.plugin.name)).toEqual([
			'proposals',
			'issues',
		]);
		const issuesEntry = result.loaded.find(
			(entry) => entry.plugin.name === 'issues',
		);
		// S1 ships the skeleton only — 0 tools is the expected mid-state
		// until S3 wires the 5 issues_* tools.
		expect(issuesEntry?.registrations.tools).toEqual([]);
	});
});
