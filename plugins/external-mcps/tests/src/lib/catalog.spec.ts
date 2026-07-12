/**
 * catalog.spec.ts — seed-catalog data invariants + the `catalog` tool
 * (f00068 S1): compact-by-default payloads, query filtering, the max-10
 * cap with a true `total`, and single-entry detail mode.
 */
import { describe, expect, it } from 'vitest';

import type { IToolRegistration } from '@mcp-vertex/core/public';

import plugin from '../../../src/index';
import {
	CURATED_CATALOG,
	DISCOVERABLE_CATALOG,
	FULL_CATALOG,
} from '../../../src/lib/catalog/catalog-data';
import {
	buildCatalogToolRegistration,
	CatalogOutputSchema,
	filterCatalog,
	MAX_CATALOG_MATCHES,
} from '../../../src/lib/tools/catalog.tool';

const KEBAB = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

interface IToolResult {
	readonly content: Array<{ type: 'text'; text: string }>;
	readonly structuredContent?: Record<string, unknown>;
	readonly isError?: boolean;
}

interface ICapturedTool {
	readonly name: string;
	readonly config: {
		description: string;
		inputSchema: unknown;
		outputSchema: unknown;
	};
	readonly handler: (args: Record<string, unknown>) => Promise<IToolResult>;
}

/** Capture what a registration hands the MCP server, without an SDK dep. */
const captureTool = async (reg: IToolRegistration): Promise<ICapturedTool> => {
	const captured: ICapturedTool[] = [];
	const server = {
		registerTool: (
			name: string,
			config: ICapturedTool['config'],
			handler: ICapturedTool['handler'],
		) => {
			captured.push({ name, config, handler });
		},
	} as unknown as Parameters<IToolRegistration['register']>[0];
	await reg.register(server);
	const tool = captured[0];
	if (tool === undefined) throw new Error('tool did not register');
	return tool;
};

const registration = buildCatalogToolRegistration({
	namespacePrefix: 'external-mcps',
});

describe('catalog data (pure module invariants)', () => {
	it('curated tier is exactly the 10 resolved entries (gate decision 1)', () => {
		expect(CURATED_CATALOG.map((e) => e.id).sort()).toEqual([
			'angular',
			'docker',
			'fetch',
			'filesystem',
			'git',
			'github',
			'memory',
			'playwright',
			'postgres',
			'sqlite',
		]);
		for (const entry of CURATED_CATALOG) expect(entry.tier).toBe('curated');
	});

	it('discoverable tier has ≥30 entries across ≥5 categories', () => {
		expect(DISCOVERABLE_CATALOG.length).toBeGreaterThanOrEqual(30);
		const categories = new Set(DISCOVERABLE_CATALOG.map((e) => e.category));
		expect(categories.size).toBeGreaterThanOrEqual(5);
		for (const entry of DISCOVERABLE_CATALOG) {
			expect(entry.tier).toBe('discoverable');
		}
	});

	it('ids are kebab-case and unique across both tiers', () => {
		const ids = FULL_CATALOG.map((e) => e.id);
		expect(new Set(ids).size).toBe(ids.length);
		for (const id of ids) expect(id).toMatch(KEBAB);
	});

	it('summaries are ONE line of at most 80 chars (compactness invariant)', () => {
		for (const entry of FULL_CATALOG) {
			expect(entry.summary.length).toBeLessThanOrEqual(80);
			expect(entry.summary).not.toContain('\n');
		}
	});

	it('envVars are variable NAMES only, never values', () => {
		for (const entry of FULL_CATALOG) {
			for (const name of entry.envVars ?? []) {
				expect(name).not.toContain('=');
				expect(name).toMatch(/^[A-Z][A-Z0-9_]*$/);
			}
		}
	});

	it('every install recipe carries a pin — no floating "latest" anywhere', () => {
		for (const entry of FULL_CATALOG) {
			expect(entry.install.pinExample).not.toMatch(/latest/i);
			for (const arg of entry.install.args) {
				expect(arg).not.toMatch(/@latest\b/);
			}
		}
	});
});

describe('external-mcps plugin manifest (token-lean)', () => {
	const ctx = {
		options: {},
		args: {},
		namespacePrefix: 'external-mcps',
		pluginCacheDir: 'external-mcps',
		cacheDir: '.cache/mcp-vertex',
		docsDir: 'docs/mcp-vertex',
		workspace: {
			root: '/tmp/external-mcps-spec',
			resolve: (rel: string) => `/tmp/external-mcps-spec/${rel}`,
		},
	} as unknown as Parameters<typeof plugin.register>[0];

	it('registers the plugin tools (catalog, discover, suggest, ack, call, status, validate_config)', async () => {
		const regs = await plugin.register(ctx);
		expect((regs.tools ?? []).map((t) => t.id).sort()).toEqual([
			'ack',
			'call',
			'catalog',
			'discover',
			'status',
			'suggest',
			'validate_config',
		]);
	});

	it('ships ZERO system-prompt bytes: no knowledge, no skills (decision 1)', async () => {
		const regs = await plugin.register(ctx);
		expect(regs.knowledge).toBeUndefined();
		expect(regs.skills).toBeUndefined();
	});

	it('contributes configured external servers to activation introspection', async () => {
		const regs = await plugin.register({
			...ctx,
			options: {
				servers: {
					filesystem: {
						version: '1.2.3',
						command: 'npx',
						args: ['@modelcontextprotocol/server-filesystem@1.2.3'],
					},
				},
			},
		});
		expect(regs.activation).toEqual([
			{
				id: 'ext.filesystem',
				origin: 'external',
				source: 'config',
				active: true,
				toolCount: 0,
			},
		]);
	});

	it('every tool declares a summary + a namespaced descriptionKey', async () => {
		const regs = await plugin.register(ctx);
		for (const tool of regs.tools ?? []) {
			expect(tool.summary).toBeTruthy();
			expect(tool.descriptionKey).toMatch(/^mcp-vertex_external-mcps_/);
		}
	});
});

describe('catalog tool', () => {
	it('registers under the plugin namespace with input + output schemas', async () => {
		const tool = await captureTool(registration);
		expect(tool.name).toBe('external-mcps_catalog');
		expect(tool.config.inputSchema).toBeDefined();
		expect(tool.config.outputSchema).toBeDefined();
	});

	it('is compact by default: ≤10 rows with ONLY {id, category, summary}', async () => {
		const tool = await captureTool(registration);
		const result = await tool.handler({});
		const payload = CatalogOutputSchema.parse(result.structuredContent);
		expect(payload.mode).toBe('list');
		expect(payload.total).toBe(FULL_CATALOG.length);
		expect(payload.entries).toHaveLength(MAX_CATALOG_MATCHES);
		for (const row of payload.entries ?? []) {
			expect(Object.keys(row).sort()).toEqual([
				'category',
				'id',
				'summary',
			]);
		}
		expect(payload.entry).toBeUndefined();
	});

	it('filters by case-insensitive substring over id/category/summary', async () => {
		const tool = await captureTool(registration);
		const result = await tool.handler({ query: 'SQLite' });
		const payload = CatalogOutputSchema.parse(result.structuredContent);
		expect(payload.total).toBeGreaterThanOrEqual(1);
		for (const row of payload.entries ?? []) {
			const haystack =
				`${row.id} ${row.category} ${row.summary}`.toLowerCase();
			expect(haystack).toContain('sqlite');
		}
	});

	it('caps matches at 10 while `total` reports the real match count', async () => {
		const matches = filterCatalog('server');
		expect(matches.length).toBeGreaterThan(MAX_CATALOG_MATCHES);
		const tool = await captureTool(registration);
		const result = await tool.handler({ query: 'server' });
		const payload = CatalogOutputSchema.parse(result.structuredContent);
		expect(payload.total).toBe(matches.length);
		expect(payload.entries).toHaveLength(MAX_CATALOG_MATCHES);
	});

	it('returns an empty list (total 0) for an unmatched query', async () => {
		const tool = await captureTool(registration);
		const result = await tool.handler({ query: 'no-such-server-xyz' });
		const payload = CatalogOutputSchema.parse(result.structuredContent);
		expect(payload.total).toBe(0);
		expect(payload.entries).toEqual([]);
	});

	it('detail returns ONE full entry (tier + install + env NAMES)', async () => {
		const tool = await captureTool(registration);
		const result = await tool.handler({ detail: 'github' });
		const payload = CatalogOutputSchema.parse(result.structuredContent);
		expect(payload.mode).toBe('detail');
		expect(payload.total).toBe(1);
		expect(payload.entries).toBeUndefined();
		expect(payload.entry?.id).toBe('github');
		expect(payload.entry?.tier).toBe('curated');
		expect(payload.entry?.install.command).toBe('docker');
		expect(payload.entry?.envVars).toEqual([
			'GITHUB_PERSONAL_ACCESS_TOKEN',
		]);
	});

	it('detail with an unknown id is a structured error, not a throw', async () => {
		const tool = await captureTool(registration);
		const result = await tool.handler({ detail: 'nope' });
		expect(result.isError).toBe(true);
		expect(result.content[0]?.text).toContain('unknown-catalog-id');
	});
});
