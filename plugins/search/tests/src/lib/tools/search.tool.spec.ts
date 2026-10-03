import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { createFakeToolServer } from '@delendai/test-kit/public';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { buildSearchToolRegistrations } from '../../../../src/lib/tools/search.tool';

type Hit = {
	file: string;
	line: number;
	text: string;
	before?: string[];
	after?: string[];
};
type Payload = Record<string, unknown> & {
	hits: Hit[];
	availableProviders: unknown[];
};
type Handler = (args: Record<string, unknown>) => Promise<{
	isError?: boolean;
	structuredContent?: Payload;
}>;

describe('search tool detail levels', () => {
	let root = '';
	let handler: Handler;
	let outputSchema: { parse: (value: unknown) => unknown };

	beforeEach(async () => {
		root = mkdtempSync(join(tmpdir(), 'search-detail-'));
		mkdirSync(join(root, 'src'), { recursive: true });
		writeFileSync(
			join(root, 'src/alpha.ts'),
			'const before = 1;\nconst needle = 2;\nconst after = 3;\n',
			'utf8',
		);
		const [registration] = buildSearchToolRegistrations({
			namespacePrefix: 'search',
			workspaceRootAbs: root,
			env: {},
		});
		await registration!.register(
			createFakeToolServer({
				onRegisterTool: ({ config, handler: registered }) => {
					handler = registered as Handler;
					outputSchema = (
						config as { outputSchema: typeof outputSchema }
					).outputSchema;
				},
			}),
		);
	});
	afterEach(() => rmSync(root, { recursive: true, force: true }));

	const search = async (extra: Record<string, unknown>): Promise<Payload> => {
		const result = await handler({
			query: 'needle',
			context: 1,
			preferRg: false,
			...extra,
		});
		expect(result.isError).not.toBe(true);
		expect(() =>
			outputSchema.parse(result.structuredContent),
		).not.toThrow();
		return result.structuredContent!;
	};

	it('keeps the legacy payload with context blocks when detail is omitted', async () => {
		const legacy = await search({});
		const full = await search({ detail: 'full' });

		expect(legacy).not.toHaveProperty('detail');
		expect(legacy.hits).toEqual([
			{
				file: 'src/alpha.ts',
				line: 2,
				text: 'const needle = 2;',
				before: ['const before = 1;'],
				after: ['const after = 3;'],
			},
		]);
		expect(legacy.availableProviders.length).toBeGreaterThan(0);
		expect(full).toEqual({ detail: 'full', ...legacy });
	});

	it('normal keeps hit lines without surrounding context', async () => {
		const legacy = await search({});
		const normal = await search({ detail: 'normal' });

		expect(normal).toEqual({
			detail: 'normal',
			...legacy,
			hits: [
				{ file: 'src/alpha.ts', line: 2, text: 'const needle = 2;' },
			],
		});
	});

	it('compact keeps counters and drops providers and hit rows', async () => {
		const legacy = await search({});
		const compact = await search({ detail: 'compact' });

		expect(compact).toEqual({
			detail: 'compact',
			...legacy,
			availableProviders: [],
			hits: [],
		});
		expect(compact.count).toBe(1);
	});

	it('rejects an unknown detail level', async () => {
		const result = await handler({ query: 'needle', detail: 'verbose' });

		expect(result.isError).toBe(true);
	});
});
