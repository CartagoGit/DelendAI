import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { IToolTextResult } from '@delendai/core/public';

import { buildDocsGenerateToolRegistration } from '../../../src/lib/tools/docs-generate.tool';

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

describe('docs_generate tool', () => {
	let root = '';

	beforeEach(() => {
		root = mkdtempSync(join(tmpdir(), 'docs-generate-'));
		write(
			root,
			'src/example.ts',
			[
				'/** Example module. */',
				'export interface Shape {}',
				'export function area() { return 1; }',
			].join('\n'),
		);
	});

	afterEach(() => rmSync(root, { recursive: true, force: true }));

	it('generates module markdown and a synthetic readme', async () => {
		const registration = buildDocsGenerateToolRegistration({
			namespacePrefix: 'docs',
			workspaceRootAbs: root,
		});
		let handler: Handler | undefined;
		await registration.register({
			registerTool: (_name: string, _schema: unknown, next: Handler) => {
				handler = next;
			},
		} as never);
		const body = bodyOf(await handler!({ scope: 'all' }));
		expect(body.ok).toBe(true);
		expect(body.files).toEqual([
			expect.objectContaining({ path: 'README.generated.md' }),
			expect.objectContaining({ path: 'src/example.ts' }),
		]);
	});

	it('returns toolError on invalid input', async () => {
		const registration = buildDocsGenerateToolRegistration({
			namespacePrefix: 'docs',
			workspaceRootAbs: root,
		});
		let handler: Handler | undefined;
		await registration.register({
			registerTool: (_name: string, _schema: unknown, next: Handler) => {
				handler = next;
			},
		} as never);
		const result = await handler!({ scope: 'invalid' });
		expect(result.isError).toBe(true);
	});
});
