/**
 * write-roots.spec.ts — every tool of this plugin that writes says where
 * its writes belong (x00623).
 *
 * Read from the real registration, so a new write tool without a root, or
 * a root that drifts, fails here rather than in review.
 */
import { describe, expect, it } from 'vitest';

import type {
	IMcpPluginContext,
	IToolRegistration,
} from '@delendai/core/public';

import plugin from '@delendai/proposals';

const ctx = (): IMcpPluginContext => ({
	workspace: {
		root: '/ws',
		resolve: (relativePath: string) => `/ws/${relativePath}`,
	},
	corePaths: { cacheDir: '.cache/delendai', docsDir: 'docs/delendai' },
	cacheDir: '.cache/delendai',
	docsDir: 'docs/delendai',
	keepLegacy: false,
	pluginCacheDir: '.cache/delendai/proposals',
	pluginDocsDir: 'docs/delendai/proposals',
	namespacePrefix: 'proposals',
	options: {},
	args: {},
});

const writeTools = async (): Promise<readonly IToolRegistration[]> => {
	const registrations = await plugin.register(ctx());
	return (registrations.tools ?? []).filter((tool) =>
		tool.effects?.includes('write'),
	);
};

describe('proposals write tools declare a write root', () => {
	it('declares one on every tool that writes', async () => {
		const tools = await writeTools();
		expect(tools.length).toBeGreaterThan(0);
		expect(
			tools
				.filter((tool) => tool.writeRoot === undefined)
				.map((t) => t.id),
		).toEqual([]);
	});

	it('writes proposal files in the caller checkout and shared facts in the repository', async () => {
		const roots = new Map(
			(await writeTools()).map((tool) => [tool.id, tool.writeRoot]),
		);
		expect(roots.get('create_proposal')).toBe('caller-checkout');
		expect(roots.get('proposal_transition')).toBe('caller-checkout');
		expect(roots.get('agent_lock')).toBe('repository');
		expect(roots.get('task_queue')).toBe('host-state');
	});
});
