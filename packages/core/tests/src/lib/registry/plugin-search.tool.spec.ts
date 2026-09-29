import { describe, expect, it } from 'vitest';

import { buildPluginSearchRegistration } from '@delendai/core/public';
import type { IPluginRegistrySource } from '@delendai/core/public';

const parseToolResult = (
	result: unknown,
): {
	entries: Array<{ id: string; origin: string }>;
	total: number;
	truncated: boolean;
} => {
	const text = (result as { content: Array<{ type: string; text: string }> })
		.content[0]?.text;
	return JSON.parse(text ?? '{}') as {
		entries: Array<{ id: string; origin: string }>;
		total: number;
		truncated: boolean;
	};
};

const COMMUNITY_SOURCE: IPluginRegistrySource = {
	origin: 'community',
	entries: [
		{
			id: 'community-demo',
			package: '@community/demo',
			summary: 'Community demo plugin.',
			tags: ['demo'],
			origin: 'community',
		},
	],
};

const buildHandler = async (
	options: {
		readonly sources?: readonly IPluginRegistrySource[];
		readonly defaultLimit?: number;
	} = { sources: [COMMUNITY_SOURCE] },
) => {
	let handler:
		| ((args: {
				query?: string;
				tags?: readonly string[];
				origin?: 'first-party' | 'community';
				limit?: number;
		  }) => Promise<unknown>)
		| undefined;
	const registration = buildPluginSearchRegistration({
		namespacePrefix: 'delendai',
		...(options.sources !== undefined ? { sources: options.sources } : {}),
		...(options.defaultLimit !== undefined
			? { defaultLimit: options.defaultLimit }
			: {}),
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

describe('buildPluginSearchRegistration (registry)', () => {
	it('injects configured community sources into the resolver', async () => {
		const handler = await buildHandler();
		const result = parseToolResult(
			await handler({ origin: 'community', query: 'demo' }),
		);

		expect(result.entries.map((entry) => entry.id)).toEqual([
			'community-demo',
		]);
		expect(result.total).toBe(1);
	});

	it('retains bundled first-party entries as fallback alongside configured community sources', async () => {
		const handler = await buildHandler();
		const result = parseToolResult(await handler({ query: 'search' }));

		expect(result.entries.some((entry) => entry.id === 'search')).toBe(
			true,
		);
	});

	it('filters by tags', async () => {
		const handler = await buildHandler();
		const result = parseToolResult(
			await handler({ origin: 'community', tags: ['demo'] }),
		);

		expect(result.entries.map((entry) => entry.id)).toEqual([
			'community-demo',
		]);
	});

	it('caps the answer at the requested limit and says it truncated', async () => {
		const handler = await buildHandler();
		const result = parseToolResult(await handler({ limit: 1 }));

		expect(result.entries).toHaveLength(1);
		expect(result.truncated).toBe(true);
	});

	it('applies the host default limit when the caller gives none', async () => {
		const handler = await buildHandler({ defaultLimit: 2 });
		const result = parseToolResult(await handler({}));

		expect(result.entries).toHaveLength(2);
	});

	it('finds no community entries when no community source is configured', async () => {
		const handler = await buildHandler({});
		const result = parseToolResult(await handler({ origin: 'community' }));

		expect(result.total).toBe(0);
	});
});
