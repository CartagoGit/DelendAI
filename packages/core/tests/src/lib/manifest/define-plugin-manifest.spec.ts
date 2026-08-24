import { describe, expect, it } from 'vitest';

import { definePluginManifest, TOKEN_BUDGETS } from '@mcp-vertex/core/public';

describe('definePluginManifest', () => {
	it('accepts a valid manifest', () => {
		const manifest = definePluginManifest({
			id: 'search',
			package: '@mcp-vertex/search',
			version: '0.1.1',
			visibility: 'public',
			summary: 'Code search with low-token result windows.',
			tags: ['search', 'token-budget'],
			maturity: 'stable',
			permissions: ['filesystem-read'],
			toolPermissions: [
				{
					tool: 'search_search',
					permissions: ['filesystem-read'],
				},
			],
			presets: ['minimal', 'lean'],
			tokenBudget: TOKEN_BUDGETS.toolPayloads.search,
			dependencies: ['@mcp-vertex/core', 'zod'],
			capabilities: ['lexical-search', 'regex-search'],
		});

		expect(manifest.id).toBe('search');
		expect(manifest.package).toBe('@mcp-vertex/search');
	});

	it('rejects duplicated list entries', () => {
		expect(() =>
			definePluginManifest({
				id: 'search',
				package: '@mcp-vertex/search',
				version: '0.1.1',
				visibility: 'public',
				summary: 'Code search with low-token result windows.',
				tags: ['search', 'search'],
				maturity: 'stable',
				permissions: ['filesystem-read'],
				presets: ['minimal'],
				tokenBudget: TOKEN_BUDGETS.toolPayloads.search,
				dependencies: ['@mcp-vertex/core'],
				capabilities: ['lexical-search'],
			}),
		).toThrow(/unique/u);
	});

	it('rejects mismatched package names', () => {
		expect(() =>
			definePluginManifest({
				id: 'search',
				package: '@mcp-vertex/docs',
				version: '0.1.1',
				visibility: 'public',
				summary: 'Code search with low-token result windows.',
				tags: ['search'],
				maturity: 'stable',
				permissions: ['filesystem-read'],
				presets: ['minimal'],
				tokenBudget: TOKEN_BUDGETS.toolPayloads.search,
				dependencies: ['@mcp-vertex/core'],
				capabilities: ['lexical-search'],
			}),
		).toThrow(/must match id/u);
	});

	it('rejects invalid permission categories', () => {
		expect(() =>
			definePluginManifest({
				id: 'search',
				package: '@mcp-vertex/search',
				version: '0.1.1',
				visibility: 'public',
				summary: 'Code search with low-token result windows.',
				tags: ['search'],
				maturity: 'stable',
				permissions: ['read-workspace' as 'filesystem-read'],
				presets: ['minimal'],
				tokenBudget: TOKEN_BUDGETS.toolPayloads.search,
				dependencies: ['@mcp-vertex/core'],
				capabilities: ['lexical-search'],
			}),
		).toThrow(/Invalid option/u);
	});

	it('rejects duplicated toolPermissions tool ids', () => {
		expect(() =>
			definePluginManifest({
				id: 'search',
				package: '@mcp-vertex/search',
				version: '0.1.1',
				visibility: 'public',
				summary: 'Code search with low-token result windows.',
				tags: ['search'],
				maturity: 'stable',
				permissions: ['filesystem-read'],
				toolPermissions: [
					{
						tool: 'search_search',
						permissions: ['filesystem-read'],
					},
					{
						tool: 'search_search',
						permissions: ['filesystem-read'],
					},
				],
				presets: ['minimal'],
				tokenBudget: TOKEN_BUDGETS.toolPayloads.search,
				dependencies: ['@mcp-vertex/core'],
				capabilities: ['lexical-search'],
			}),
		).toThrow(/toolPermissions tools must be unique/u);
	});
});
