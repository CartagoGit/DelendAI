import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import type { IMcpPluginContext } from '@delendai/core/contracts';

import plugin from '../../src/index';

const ROOT = '/workspace';

const makeCtx = (options: Record<string, unknown>): IMcpPluginContext => ({
	workspace: { root: ROOT, resolve: (rel: string) => join(ROOT, rel) },
	corePaths: { cacheDir: '.cache/delendai', docsDir: 'docs/delendai' },
	cacheDir: '.cache/delendai',
	docsDir: 'docs/delendai',
	keepLegacy: false,
	pluginCacheDir: '.cache/delendai/auto-agent-selector',
	pluginDocsDir: 'docs/delendai/auto-agent-selector',
	namespacePrefix: 'mcp',
	options,
	args: {},
});

describe('auto-agent-selector options', () => {
	it('[<50ms] accepts a task-class tier policy with the owner authorization', async () => {
		const options = {
			taskClassTiers: { docs: 2 },
			ownerAuthorizedTopTier: true,
		};
		expect(plugin.optionsSchema?.safeParse(options).success).toBe(true);
		const reg = await plugin.register(makeCtx(options));
		expect(reg.tools).toHaveLength(5);
	});

	it('[<50ms] refuses a tier outside 1..5', () => {
		expect(
			plugin.optionsSchema?.safeParse({ taskClassTiers: { docs: 9 } })
				.success,
		).toBe(false);
	});

	it('[<50ms] still registers its tools when the options are invalid', async () => {
		const reg = await plugin.register(
			makeCtx({ taskClassTiers: { docs: 9 } }),
		);
		expect(reg.tools).toHaveLength(5);
	});
});
