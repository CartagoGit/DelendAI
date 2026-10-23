import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createFakeToolServer } from '@delendai/test-kit';

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

/**
 * The arms the happy path never reaches: the containment refusal on
 * `cwd`, the two narrower `scope` selections, the directories the walker
 * is supposed to skip, and a `cwd` that is a real nested package (so
 * `contained.rel` is NOT `.`).
 */
describe('docs_generate — scope, skipping and cwd containment', () => {
	let root = '';

	const handlerFor = async (workspaceRootAbs: string): Promise<Handler> => {
		let captured: Handler | undefined;
		const server = createFakeToolServer({
			onRegisterTool: ({ handler }) => {
				captured = handler as Handler;
			},
		});
		await buildDocsGenerateToolRegistration({
			namespacePrefix: 'docs',
			workspaceRootAbs,
		}).register(server);
		return captured!;
	};

	beforeEach(() => {
		root = mkdtempSync(join(tmpdir(), 'docs-generate-scope-'));
		write(root, 'src/example.ts', 'export function area() { return 1; }');
	});

	afterEach(() => rmSync(root, { recursive: true, force: true }));

	it('refuses a cwd that climbs out of the workspace', async () => {
		const handler = await handlerFor(root);
		const result = await handler({ cwd: '../outside' });
		expect(result.isError).toBe(true);
	});

	it('scope "module" emits only the module docs, with no synthetic readme', async () => {
		const handler = await handlerFor(root);
		const body = bodyOf(await handler({ scope: 'module' }));
		expect(body.files).toEqual([
			expect.objectContaining({ path: 'src/example.ts' }),
		]);
	});

	it('scope "readme" emits only the synthetic readme', async () => {
		const handler = await handlerFor(root);
		const body = bodyOf(await handler({ scope: 'readme' }));
		expect(body.files).toEqual([
			expect.objectContaining({ path: 'README.generated.md' }),
		]);
	});

	it('skips vendored/build directories and non-TypeScript files', async () => {
		write(root, 'src/node_modules/vendored.ts', 'export const v = 1;');
		write(root, 'src/dist/built.ts', 'export const b = 1;');
		write(root, 'src/notes.md', '# not typescript');
		const handler = await handlerFor(root);
		const body = bodyOf(await handler({ scope: 'module' }));
		expect(body.files).toEqual([
			expect.objectContaining({ path: 'src/example.ts' }),
		]);
	});

	it('generates for a nested package when cwd names one', async () => {
		write(root, 'pkg/src/nested.ts', 'export const n = 1;');
		const handler = await handlerFor(root);
		const body = bodyOf(await handler({ cwd: 'pkg', scope: 'module' }));
		expect(body.files).toEqual([
			expect.objectContaining({ path: 'pkg/src/nested.ts' }),
		]);
	});
});
