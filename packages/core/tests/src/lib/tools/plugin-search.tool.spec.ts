/**
 * plugin-search.tool.spec.ts — f00141/S3 focused acceptance.
 *
 * Verifies the MCP tool wrapper preserves resolver semantics for query,
 * tag, origin, and limit while keeping the surfaced response compact.
 * The handler is tested through registration to match real server usage.
 */
import { describe, expect, it } from 'vitest';

import type {
	IPluginRegistryEntry,
	IResolvePluginsOptions,
} from '@mcp-vertex/core/public';
import { resolvePlugins } from '@mcp-vertex/core/public';
import { buildPluginSearchRegistration } from '@mcp-vertex/core/lib/tools/plugin-search.tool';

const sample = (over: Partial<IPluginRegistryEntry>): IPluginRegistryEntry => ({
	id: over.id ?? 'sample',
	origin: over.origin ?? 'first-party',
	package: over.package ?? '@mcp-vertex/sample',
	summary: over.summary ?? 'sample summary',
	tags: over.tags ?? [],
	...(over.defaultPreset !== undefined
		? { defaultPreset: over.defaultPreset }
		: {}),
});

const sampleEntries: readonly IPluginRegistryEntry[] = [
	sample({
		id: 'audit',
		package: '@mcp-vertex/audit',
		summary: 'Audit planning and consolidation.',
		tags: ['audit'],
		defaultPreset: 'standard',
	}),
	sample({
		id: 'search',
		package: '@mcp-vertex/search',
		summary: 'Semantic search and symbol lookup.',
		tags: ['search'],
	}),
	sample({
		id: 'security-shield',
		package: '@community/security-shield',
		summary: 'Security posture checks for repos.',
		tags: ['security', 'compliance'],
		origin: 'community',
	}),
	sample({
		id: 'sec-lint',
		package: '@community/sec-lint',
		summary: 'Fast lint rules for secure defaults.',
		tags: ['security', 'lint'],
		origin: 'community',
	}),
	sample({
		id: 'docs',
		package: '@mcp-vertex/docs',
		summary: 'Docs generation and catalog.',
		tags: ['docs'],
	}),
];

const parseTextResult = (
	result: unknown,
): {
	total: number;
	truncated: boolean;
	entries: Array<{ id: string; tags: string[]; origin: string }>;
} => {
	const text = (result as { content: Array<{ type: string; text: string }> })
		.content[0]?.text;
	return JSON.parse(text ?? '{}') as {
		total: number;
		truncated: boolean;
		entries: Array<{ id: string; tags: string[]; origin: string }>;
	};
};

const buildHandler = async () => {
	let handler:
		| ((args: {
				query?: string;
				tag?: string;
				origin?: 'first-party' | 'community';
				limit?: number;
		  }) => Promise<unknown>)
		| undefined;
	const registration = buildPluginSearchRegistration({
		namespacePrefix: 'mcp-vertex',
		resolve: (options: IResolvePluginsOptions) =>
			resolvePlugins({
				...options,
				sources: [{ origin: 'first-party', entries: sampleEntries }],
			}),
	});
	await registration.register({
		registerTool: (
			_name: string,
			_meta: unknown,
			toolHandler: (args: unknown) => Promise<unknown>,
		) => {
			handler = toolHandler as typeof handler;
		},
	} as never);
	if (handler === undefined) throw new Error('tool handler not registered');
	return handler;
};

describe('buildPluginSearchRegistration', () => {
	it('returns all entries when the query is empty', async () => {
		const handler = await buildHandler();
		const result = parseTextResult(await handler({ query: '' }));

		expect(result.total).toBe(5);
		expect(result.truncated).toBe(false);
		expect(result.entries).toHaveLength(5);
	});

	it('narrows by case-insensitive query across id and summary', async () => {
		const handler = await buildHandler();
		const result = parseTextResult(await handler({ query: 'sec' }));

		expect(result.entries.map((entry) => entry.id)).toEqual([
			'sec-lint',
			'security-shield',
		]);
		expect(result.total).toBe(2);
	});

	it('narrows by tag membership', async () => {
		const handler = await buildHandler();
		const result = parseTextResult(await handler({ tag: 'security' }));

		expect(result.entries.map((entry) => entry.id)).toEqual([
			'sec-lint',
			'security-shield',
		]);
		expect(
			result.entries.every((entry) => entry.tags.includes('security')),
		).toBe(true);
	});

	it('filters to community entries when origin is community', async () => {
		const handler = await buildHandler();
		const result = parseTextResult(await handler({ origin: 'community' }));

		expect(result.entries).toHaveLength(2);
		expect(
			result.entries.every((entry) => entry.origin === 'community'),
		).toBe(true);
	});

	it('reports truncation when the requested limit clips the result set', async () => {
		const handler = await buildHandler();
		const result = parseTextResult(await handler({ limit: 2 }));

		expect(result.entries).toHaveLength(2);
		expect(result.total).toBe(5);
		expect(result.truncated).toBe(true);
	});
});
