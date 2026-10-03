import { describe, expect, it } from 'vitest';

import type { IFileReader, IToolTextResult } from '@delendai/core/public';

import { buildQualityCoverageToolRegistration } from '../../../src/lib/tools/quality-coverage.tool';

type Handler = (args: unknown) => Promise<IToolTextResult>;

const reader = (files: Record<string, string>): IFileReader => ({
	readFile: async (path) => files[path],
	exists: async (path) => path in files,
	listDir: async () => [],
});

const bodyOf = (result: IToolTextResult): Record<string, unknown> =>
	JSON.parse((result.content[0] as { text: string }).text) as Record<
		string,
		unknown
	>;

const handlerFor = async (files: Record<string, string>): Promise<Handler> => {
	const registration = buildQualityCoverageToolRegistration({
		namespacePrefix: 'quality',
		reader: reader(files),
		workspaceRoot: '/ws',
		run: async () => ({ code: 0, output: '', timedOut: false }),
	});
	let handler: Handler | undefined;
	await registration.register({
		registerTool: (_name: string, _schema: unknown, next: Handler) => {
			handler = next;
		},
	} as never);
	if (!handler) throw new Error('coverage handler not registered');
	return handler;
};

describe('quality_coverage tool', () => {
	it('returns a compact coverage summary', async () => {
		const handler = await handlerFor({
			'.vitest/coverage/coverage-final.json': JSON.stringify({
				'src/a.ts': {
					statementMap: { 1: { start: { line: 1 } } },
					s: { 1: 1 },
					b: { 1: [1, 1] },
					f: { 1: 1 },
				},
			}),
		});
		const body = bodyOf(await handler({ scope: 'all' }));
		expect(body.ok).toBe(true);
		expect(body.lines).toEqual({ covered: 1, total: 1, pct: 100 });
		expect(body.branches).toEqual({ covered: 2, total: 2, pct: 100 });
	});

	it('returns skipped when coverage is missing', async () => {
		const handler = await handlerFor({});
		const body = bodyOf(await handler({}));
		expect(body.ok).toBe('skipped');
	});

	it('returns toolError on invalid input', async () => {
		const handler = await handlerFor({});
		const result = await handler({ scope: 'invalid' });
		expect(result.isError).toBe(true);
	});
});
