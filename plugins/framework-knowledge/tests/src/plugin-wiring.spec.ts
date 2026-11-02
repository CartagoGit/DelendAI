/**
 * plugin-wiring.spec.ts
 *
 * Pins that the plugin entry registers exactly its two tools and that
 * each one is registered with an output schema.
 */
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { describe, expect, it, vi } from 'vitest';

import type {
	IMcpPluginContext,
	IMcpPluginRegistrations,
} from '@delendai/core/contracts';
import { fakePartial } from '@delendai/test-kit';

import plugin from '../../src/index';

describe('the framework-knowledge plugin entry', () => {
	it('names itself and describes what it will answer', () => {
		expect(plugin.name).toBe('framework-knowledge');
		expect(plugin.describe).toContain('installed framework version');
	});

	it('registers the guidance and source tools, each with an output schema', async () => {
		const ctx = fakePartial<IMcpPluginContext>({
			namespacePrefix: 'dl',
			cacheDir: '.cache/delendai',
			workspace: { root: '/ws', resolve: (rel: string) => `/ws/${rel}` },
		});
		const registrations = (await plugin.register(
			ctx,
		)) as IMcpPluginRegistrations;
		expect((registrations.tools ?? []).map((tool) => tool.id)).toEqual([
			'framework_guidance',
			'framework_source',
		]);

		const registerTool = vi.fn();
		for (const tool of registrations.tools ?? []) {
			await tool.register(fakePartial<McpServer>({ registerTool }));
		}
		const names = registerTool.mock.calls.map((call) => call[0]);
		expect(names).toEqual(['dl_framework_guidance', 'dl_framework_source']);
		for (const call of registerTool.mock.calls) {
			expect(call[1].outputSchema).toBeDefined();
		}
	});
});
