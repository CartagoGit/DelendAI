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

const buildHandler = async () => {
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
		sources: [COMMUNITY_SOURCE],
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
});
