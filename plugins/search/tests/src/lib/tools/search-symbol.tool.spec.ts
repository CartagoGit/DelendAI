import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { IToolTextResult } from '@mcp-vertex/core/public';

import { buildSearchSymbolToolRegistration } from '../../../../src/lib/tools/search-symbol.tool';

type Handler = (args: unknown) => Promise<IToolTextResult>;

const write = (root: string, rel: string, body: string): void => {
	const abs = join(root, rel);
	mkdirSync(dirname(abs), { recursive: true });
	writeFileSync(abs, body, 'utf8');
};

const bodyOf = (result: IToolTextResult): Record<string, unknown> =>
	JSON.parse((result.content[0] as { text: string }).text) as Record<
		string,
		unknown
	>;

describe('search_symbol tool', () => {
	let root = '';

	beforeEach(() => {
		root = mkdtempSync(join(tmpdir(), 'search-symbol-'));
		write(root, 'src/a.ts', 'export function target() { return 1; }');
	});

	afterEach(() => rmSync(root, { recursive: true, force: true }));

	it('finds exact exported symbols', async () => {
		const registration = buildSearchSymbolToolRegistration({
			namespacePrefix: 'search',
			workspaceRootAbs: root,
		});
		let handler: Handler | undefined;
		await registration.register({
			registerTool: (_name: string, _schema: unknown, next: Handler) => {
				handler = next;
			},
		} as never);
		const body = bodyOf(await handler!({ symbol: 'target' }));
		expect(body.hits).toEqual([
			expect.objectContaining({ file: 'src/a.ts', kind: 'function' }),
		]);
	});

	it('returns toolError on invalid input', async () => {
		const registration = buildSearchSymbolToolRegistration({
			namespacePrefix: 'search',
			workspaceRootAbs: root,
		});
		let handler: Handler | undefined;
		await registration.register({
			registerTool: (_name: string, _schema: unknown, next: Handler) => {
				handler = next;
			},
		} as never);
		const result = await handler!({ symbol: '' });
		expect(result.isError).toBe(true);
	});
});
