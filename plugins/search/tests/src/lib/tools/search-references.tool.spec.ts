import {
	mkdirSync,
	mkdtempSync,
	rmSync,
	symlinkSync,
	writeFileSync,
} from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { IToolTextResult } from '@delendai/core/public';

import { buildSearchReferencesToolRegistration } from '../../../../src/lib/tools/search-references.tool';

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

describe('search_references tool', () => {
	let root = '';
	let outsideRoot = '';

	beforeEach(() => {
		root = mkdtempSync(join(tmpdir(), 'search-references-'));
		outsideRoot = mkdtempSync(join(tmpdir(), 'search-references-outside-'));
		write(
			root,
			'src/a.ts',
			'export const target = 1;\nconsole.log(target);\n"target";',
		);
		write(
			outsideRoot,
			'outside.ts',
			'export const target = 2;\nconsole.log(target);',
		);
	});

	afterEach(() => {
		rmSync(root, { recursive: true, force: true });
		rmSync(outsideRoot, { recursive: true, force: true });
	});

	it('finds identifier references and flags definitions', async () => {
		const registration = buildSearchReferencesToolRegistration({
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
			expect.objectContaining({ isDefinition: true }),
			expect.objectContaining({ isDefinition: false }),
		]);
	});

	it('returns toolError on invalid input', async () => {
		const registration = buildSearchReferencesToolRegistration({
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

	it('rejects cwd symlinks that resolve outside the workspace', async () => {
		symlinkSync(outsideRoot, join(root, 'linked-outside'));
		const registration = buildSearchReferencesToolRegistration({
			namespacePrefix: 'search',
			workspaceRootAbs: root,
		});
		let handler: Handler | undefined;
		await registration.register({
			registerTool: (_name: string, _schema: unknown, next: Handler) => {
				handler = next;
			},
		} as never);
		const result = await handler!({
			symbol: 'target',
			cwd: 'linked-outside',
		});
		expect(result.isError).toBe(true);
		expect((result.content[0] as { text: string }).text).toContain(
			'cwd must stay inside the workspace',
		);
	});
});
