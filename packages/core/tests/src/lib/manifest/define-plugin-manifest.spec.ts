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

// f00179 S1/S3 — `tokenBudget` accepts the new `IPluginTokenBudget`
// shape, the legacy `ITokenBudgetCeiling` shape, and a bare number.
// `resolveTokenBudget` normalises every accepted form so downstream
// consumers can rely on a single shape.
describe('definePluginManifest — f00179 tokenBudget (MAN-003)', () => {
	const newBudget = {
		staticBytes: 5_800,
		adaptiveActivationBytes: 950,
		typicalOutput: 1_400,
		caps: { hard: 6_800, warning: 6_200 },
		measuredAt: '2026-08-25',
		source: 'token-budget-real',
	} as const;

	it('accepts the new IPluginTokenBudget shape (staticBytes + caps + measuredAt + source)', () => {
		const manifest = definePluginManifest({
			id: 'git',
			package: '@mcp-vertex/git',
			version: '0.1.1',
			visibility: 'public',
			summary: 'Git wrappers (PR list/view, diff, changelog, extended).',
			tags: ['git'],
			maturity: 'stable',
			permissions: ['git-read', 'git-write'],
			presets: ['minimal'],
			tokenBudget: newBudget,
			dependencies: ['@mcp-vertex/core'],
			capabilities: ['git'],
		});
		expect(manifest.tokenBudget).toEqual(newBudget);
	});

	it('accepts a bare number as staticBytes (third legacy form)', () => {
		const manifest = definePluginManifest({
			id: 'git',
			package: '@mcp-vertex/git',
			version: '0.1.1',
			visibility: 'public',
			summary: 'Git wrappers (PR list/view, diff, changelog, extended).',
			tags: ['git'],
			maturity: 'stable',
			permissions: ['git-read', 'git-write'],
			presets: ['minimal'],
			tokenBudget: 2_700,
			dependencies: ['@mcp-vertex/core'],
			capabilities: ['git'],
		});
		expect(manifest.tokenBudget).toBe(2_700);
	});

	it('accepts the legacy ITokenBudgetCeiling shape (hard + warning + releaseRelativePercent)', () => {
		const legacy = TOKEN_BUDGETS.toolPayloads.search;
		const manifest = definePluginManifest({
			id: 'git',
			package: '@mcp-vertex/git',
			version: '0.1.1',
			visibility: 'public',
			summary: 'Git wrappers (PR list/view, diff, changelog, extended).',
			tags: ['git'],
			maturity: 'stable',
			permissions: ['git-read', 'git-write'],
			presets: ['minimal'],
			tokenBudget: legacy,
			dependencies: ['@mcp-vertex/core'],
			capabilities: ['git'],
		});
		expect(manifest.tokenBudget).toEqual(legacy);
	});

	it('rejects an IPluginTokenBudget with caps.warning > caps.hard', () => {
		expect(() =>
			definePluginManifest({
				id: 'git',
				package: '@mcp-vertex/git',
				version: '0.1.1',
				visibility: 'public',
				summary:
					'Git wrappers (PR list/view, diff, changelog, extended).',
				tags: ['git'],
				maturity: 'stable',
				permissions: ['git-read', 'git-write'],
				presets: ['minimal'],
				tokenBudget: {
					staticBytes: 5_800,
					caps: { hard: 1_000, warning: 5_000 },
					measuredAt: '2026-08-25',
					source: 'token-budget-real',
				},
				dependencies: ['@mcp-vertex/core'],
				capabilities: ['git'],
			}),
		).toThrow(/caps\.warning must be <= caps\.hard/u);
	});

	it('rejects an IPluginTokenBudget with a malformed measuredAt', () => {
		expect(() =>
			definePluginManifest({
				id: 'git',
				package: '@mcp-vertex/git',
				version: '0.1.1',
				visibility: 'public',
				summary:
					'Git wrappers (PR list/view, diff, changelog, extended).',
				tags: ['git'],
				maturity: 'stable',
				permissions: ['git-read', 'git-write'],
				presets: ['minimal'],
				tokenBudget: {
					staticBytes: 5_800,
					caps: { hard: 6_800, warning: 6_200 },
					measuredAt: '08-25-2026',
					source: 'token-budget-real',
				},
				dependencies: ['@mcp-vertex/core'],
				capabilities: ['git'],
			}),
		).toThrow(/measuredAt must be an ISO date/u);
	});
});

describe('resolveTokenBudget — f00179 normalisation', () => {
	const TODAY = '2026-08-25';

	it('passes an IPluginTokenBudget through unchanged', async () => {
		const { resolveTokenBudget } = await import('@mcp-vertex/core/public');
		const input = {
			staticBytes: 5_800,
			caps: { hard: 6_800, warning: 6_200 },
			measuredAt: '2026-07-01',
			source: 'token-budget-real',
		} as const;
		expect(resolveTokenBudget(input, TODAY)).toEqual(input);
	});

	it('promotes a bare number to staticBytes + caps.hard === caps.warning', async () => {
		const { resolveTokenBudget } = await import('@mcp-vertex/core/public');
		const result = resolveTokenBudget(2_700, TODAY);
		expect(result).toEqual({
			staticBytes: 2_700,
			caps: { hard: 2_700, warning: 2_700 },
			measuredAt: TODAY,
			source: 'token-budget-fallback',
		});
	});

	it('derives staticBytes from a legacy ITokenBudgetCeiling.warning (no hard ceiling raised)', async () => {
		const { resolveTokenBudget } = await import('@mcp-vertex/core/public');
		const result = resolveTokenBudget(
			{ hard: 3_000, warning: 2_700, releaseRelativePercent: 20 },
			TODAY,
		);
		expect(result).toEqual({
			staticBytes: 2_700,
			caps: { hard: 3_000, warning: 2_700 },
			measuredAt: TODAY,
			source: 'token-budget-fallback',
		});
	});
});
