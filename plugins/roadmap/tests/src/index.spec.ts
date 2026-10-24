/**
 * index.spec.ts — a project with no roadmap gets nothing from the
 * plugin; one that declares a file gets the seven tools.
 */
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import type { IMcpPluginContext } from '@delendai/core/contracts';

import plugin from '../../src/index';

const ROOT = '/workspace';

const makeCtx = (options: Record<string, unknown> = {}): IMcpPluginContext => ({
	workspace: { root: ROOT, resolve: (rel: string) => join(ROOT, rel) },
	corePaths: { cacheDir: '.cache/delendai', docsDir: 'docs/delendai' },
	cacheDir: '.cache/delendai',
	docsDir: 'docs/delendai',
	keepLegacy: false,
	pluginCacheDir: '.cache/delendai/roadmap',
	pluginDocsDir: 'docs/delendai/roadmap',
	namespacePrefix: 'x',
	options,
	args: {},
});

const idsOf = async (options: Record<string, unknown>) =>
	((await plugin.register(makeCtx(options))).tools ?? []).map(
		(tool) => tool.id,
	);

describe('the roadmap plugin', () => {
	it('registers no tool for a project that declares no roadmap file', async () => {
		expect(await idsOf({})).toEqual([]);
		expect(
			await idsOf({ promotion: { deferralPolicy: 'report' } }),
		).toEqual([]);
	});

	it('registers its seven tools once a file is declared', async () => {
		expect(await idsOf({ file: 'ROADMAP.md' })).toEqual([
			'roadmap_show',
			'roadmap_sync',
			'roadmap_readiness',
			'roadmap_delta',
			'roadmap_plan_init',
			'roadmap_plan_close',
			'roadmap_promotion',
		]);
	});

	it('marks only the two that write as writing, and none as touching git', async () => {
		const registered = await plugin.register(
			makeCtx({ file: 'ROADMAP.md' }),
		);
		const writing = (registered.tools ?? [])
			.filter((tool) => (tool.effects ?? []).length > 0)
			.map((tool) => tool.id);
		expect(writing).toEqual(['roadmap_plan_init', 'roadmap_plan_close']);
	});

	it('refuses options it does not know, and a file outside the workspace', async () => {
		await expect(
			Promise.resolve().then(() =>
				plugin.register(makeCtx({ branch: 'main' })),
			),
		).rejects.toThrow(/rejected its options/u);
		await expect(
			Promise.resolve().then(() =>
				plugin.register(makeCtx({ file: '../ROADMAP.md' })),
			),
		).rejects.toThrow(/outside the workspace/u);
	});
});
