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
		// No `repo` option in the smoke test ctx — the plugin registers
		// only the `setup_github` helper (f00030 S2: setup guidance is
		// available before the repo is configured) and emits a
		// discoverable knowledge entry.
		expect(
			(issuesEntry?.registrations.tools ?? []).map((t) => t.id),
		).toEqual(['setup_github']);
	});
});

describe('issues plugin — UX guard when `repo` is missing', () => {
	const buildCtx = (options: Record<string, unknown>): IMcpPluginContext => ({
		workspace: { root: '/ws', resolve: (p: string) => `/ws/${p}` },
		corePaths: {
			cacheDir: '.cache/mcp-vertex',
			docsDir: 'docs/mcp-vertex',
		},
		cacheDir: '.cache/mcp-vertex',
		docsDir: 'docs/mcp-vertex',
		keepLegacy: false,
		pluginCacheDir: '.cache/mcp-vertex/issues',
		pluginDocsDir: 'docs/mcp-vertex/issues',
		namespacePrefix: 'issues',
		options,
		args: {},
	});

	/**
	 * `IMcpPlugin.register` may return a sync or async registrations
	 * record (the loader treats them identically). Normalize via
	 * `Promise.resolve` so the tests work with whichever the plugin
	 * actually returns.
	 */
	const unwrap = (
		r: ReturnType<typeof issuesPlugin.register>,
	): Promise<Awaited<ReturnType<typeof issuesPlugin.register>>> =>
		Promise.resolve(r);

	it('registers only the setup helper when `repo` is missing, and emits an `issues-needs-repo-config` knowledge entry', async () => {
		const result = await unwrap(issuesPlugin.register(buildCtx({})));
		expect((result.tools ?? []).map((t) => t.id)).toEqual(['setup_github']);
		expect(result.knowledge).toHaveLength(1);
		const entry = result.knowledge?.[0];
		expect(entry?.id).toBe('issues-needs-repo-config');
		expect(entry?.title).toBe('issues plugin needs `repo` configured');
		// The body must mention the two fix paths so the host can
		// act on it without reading the source.
		expect(entry?.body).toContain('plugins.issues.options.repo');
		expect(entry?.body).toContain('setup-github');
	});

	it('treats empty-string `repo` the same as missing (no throw, knowledge entry surfaces)', async () => {
		const result = await unwrap(
			issuesPlugin.register(buildCtx({ repo: '' })),
		);
		expect((result.tools ?? []).map((t) => t.id)).toEqual(['setup_github']);
		expect(result.knowledge?.[0]?.id).toBe('issues-needs-repo-config');
	});

	it('treats whitespace-only `repo` the same as missing (defensive)', async () => {
		const result = await unwrap(
			issuesPlugin.register(buildCtx({ repo: '   ' })),
		);
		expect((result.tools ?? []).map((t) => t.id)).toEqual(['setup_github']);
		expect(result.knowledge?.[0]?.id).toBe('issues-needs-repo-config');
	});

	it('registers the 5 `issues_*` tools + setup_github when `repo` is provided', async () => {
		const result = await unwrap(
			issuesPlugin.register(buildCtx({ repo: 'CartagoGit/mcp-vertex' })),
		);
		expect(result.tools ?? []).toHaveLength(6);
		const toolIds = (result.tools ?? []).map((t) => t.id).sort();
		expect(toolIds).toEqual([
			'issues_analyze',
			'issues_fetch',
			'issues_ingest',
			'issues_list',
			'issues_resolve',
			'setup_github',
		]);
		// No knowledge entry when fully configured — the hint is
		// irrelevant and would just be noise.
		expect(result.knowledge).toBeUndefined();
	});

	it('throws on invalid `scaffoldDir` (workspace escape)', () => {
		expect(() =>
			issuesPlugin.register(
				buildCtx({
					repo: 'CartagoGit/mcp-vertex',
					scaffoldDir: '../escape',
				}),
			),
		).toThrow(/invalid scaffoldDir/);
	});
});
