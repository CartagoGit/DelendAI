import { mkdtemp, mkdir, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import {
	buildContextForChangeToolRegistrations,
	ContextForChangeOutputSchema,
	runContextForChange,
} from '../../src/public/index';

const createdRoots: string[] = [];

const makeWorkspace = async (): Promise<string> => {
	const root = await mkdtemp(join(tmpdir(), 'context-for-change-'));
	createdRoots.push(root);
	await mkdir(join(root, 'src/lib'), { recursive: true });
	await mkdir(join(root, 'tests/src/lib'), { recursive: true });
	await mkdir(join(root, 'docs'), { recursive: true });
	await writeFile(
		join(root, 'src/lib/foo.ts'),
		[
			'export function foo(value: string): string {',
			'\treturn value.toUpperCase();',
			'}',
		].join('\n'),
		'utf8',
	);
	await writeFile(
		join(root, 'tests/src/lib/foo.spec.ts'),
		[
			"import { describe, expect, it } from 'vitest';",
			"import { foo } from '../../../src/lib/foo';",
			"describe('foo', () => {",
			"\tit('uppercases', () => {",
			"\t\texpect(foo('a')).toBe('A');",
			'\t});',
			'});',
		].join('\n'),
		'utf8',
	);
	await writeFile(
		join(root, 'docs/foo.md'),
		['# Foo', '', 'Task notes for foo changes.'].join('\n'),
		'utf8',
	);
	await writeFile(
		join(root, 'README.md'),
		['# Temp', '', 'foo project'].join('\n'),
		'utf8',
	);
	await mkdir(join(root, '.git'), { recursive: true });
	await mkdir(join(root, 'node_modules/demo'), { recursive: true });
	await writeFile(join(root, '.env'), 'TOKEN=secret', 'utf8');
	await writeFile(join(root, '.git/HEAD'), 'ref: refs/heads/develop', 'utf8');
	await writeFile(
		join(root, 'node_modules/demo/index.js'),
		'module.exports = true;',
		'utf8',
	);
	const outside = await mkdtemp(
		join(tmpdir(), 'context-for-change-outside-'),
	);
	createdRoots.push(outside);
	await writeFile(
		join(outside, 'secret.ts'),
		'export const secret = true;',
		'utf8',
	);
	await symlink(
		join(outside, 'secret.ts'),
		join(root, 'src/lib/link-outside.ts'),
	);
	await symlink(
		join(root, 'src/lib/foo.ts'),
		join(root, 'src/lib/link-inside.ts'),
	);
	return root;
};

afterEach(async () => {
	for (const root of createdRoots.splice(0)) {
		await rm(root, { recursive: true, force: true });
	}
});

describe('context_for_change', () => {
	it('builds the registration and combines multiple sources for files + task', async () => {
		const root = await makeWorkspace();
		const registrations = buildContextForChangeToolRegistrations({
			namespacePrefix: 'delendai',
			workspaceRootAbs: root,
			maxBytes: 3000,
			docsRoots: ['docs', 'README.md'],
			testPolicyMode: 'tests-after',
		});

		const registerTool = vi.fn();
		const server = { registerTool } as Pick<
			McpServer,
			'registerTool'
		> as McpServer;
		await registrations[0]!.register(server);
		expect(registerTool).toHaveBeenCalledTimes(1);

		const [, meta, handler] = registerTool.mock.calls[0] as [
			string,
			{ outputSchema: typeof ContextForChangeOutputSchema },
			(args: {
				files: string[];
				task: string;
			}) => Promise<{ structuredContent?: unknown }>,
		];
		const result = await handler({
			files: ['src/lib/foo.ts'],
			task: 'add validation around foo',
		});
		const output = meta.outputSchema.parse(result.structuredContent);

		expect(output.files).toContain('src/lib/foo.ts');
		expect(output.bytes).toBeGreaterThan(0);
		expect(output.bytes).toBeLessThanOrEqual(3000);
		expect(
			output.sections.some((section) => section.source === 'symbols'),
		).toBe(true);
		expect(
			output.sections.some((section) => section.source === 'conventions'),
		).toBe(true);
	});

	it('keeps the output schema-valid and marks truncation when over budget', async () => {
		const root = await makeWorkspace();
		await writeFile(
			join(root, 'src/lib/big.ts'),
			`export const gigantic = '${'x'.repeat(4000)}';`,
			'utf8',
		);

		const result = await runContextForChange(
			{ files: ['src/lib/big.ts'], task: 'trim output' },
			{
				namespacePrefix: 'delendai',
				workspaceRootAbs: root,
				maxBytes: 220,
				docsRoots: ['docs'],
			},
		);
		const output = ContextForChangeOutputSchema.parse(
			result.structuredContent,
		);

		expect(output.truncated).toBe(true);
		expect(output.bytes).toBeLessThanOrEqual(220);
		expect(output.sections.length).toBeGreaterThan(0);
	});

	it('rejects adversarial workspace-escape and reserved paths with a structured error', async () => {
		const root = await makeWorkspace();
		const outside = await mkdtemp(
			join(tmpdir(), 'context-for-change-external-'),
		);
		createdRoots.push(outside);
		const adversarialPaths = [
			'../outside.ts',
			'../../etc/passwd',
			join(outside, 'secret.ts'),
			`${root}-secret/file.ts`,
			'.env',
			'.git/HEAD',
			'node_modules/demo/index.js',
			'src/lib/link-outside.ts',
			'tests/../../outside.ts',
			'./../outside.ts',
			'.././outside.ts',
			'../../outside.ts',
			'../../../outside.ts',
			'../../../../outside.ts',
			'../outside.ts/../secret.ts',
		];

		for (const file of adversarialPaths) {
			const result = await runContextForChange(
				{ files: [file], task: 'reject containment bypass' },
				{
					namespacePrefix: 'delendai',
					workspaceRootAbs: root,
					maxBytes: 3000,
					docsRoots: ['docs'],
				},
			);
			expect(result.isError).toBe(true);
			expect(result.structuredContent?.ok).toBe(false);
			const containmentError = result.structuredContent?.error as
				| { reason: string }
				| undefined;
			expect(containmentError?.reason).toContain('workspace-containment');
		}
	});

	it('rejects workspace-escaping paths that arrive through gitDiff', async () => {
		const root = await makeWorkspace();
		const outside = await mkdtemp(
			join(tmpdir(), 'context-for-change-diff-external-'),
		);
		createdRoots.push(outside);
		await writeFile(
			join(outside, 'secret.ts'),
			'export const diffLeakedSymbol = true;',
			'utf8',
		);
		// Must be a path that really resolves onto the secret file, or the
		// assertion below would pass vacuously against vulnerable code.
		const escapingPaths = [
			relative(root, join(outside, 'secret.ts')),
			'../../etc/passwd',
		];

		for (const escapingPath of escapingPaths) {
			const result = await runContextForChange(
				{
					gitDiff: [
						`diff --git a/${escapingPath} b/${escapingPath}`,
						`+++ b/${escapingPath}`,
						'',
					].join('\n'),
					task: 'reject containment bypass through gitDiff',
				},
				{
					namespacePrefix: 'delendai',
					workspaceRootAbs: root,
					maxBytes: 3000,
					docsRoots: ['docs'],
				},
			);
			expect(JSON.stringify(result)).not.toContain('diffLeakedSymbol');
			expect(JSON.stringify(result)).not.toContain('root:x:0:0');
		}
	});

	it('follows a symlink that still resolves inside the workspace', async () => {
		const root = await makeWorkspace();
		const result = await runContextForChange(
			{ files: ['src/lib/link-inside.ts'], task: 'follow safe link' },
			{
				namespacePrefix: 'delendai',
				workspaceRootAbs: root,
				maxBytes: 3000,
				docsRoots: ['docs'],
			},
		);
		expect(result.isError).toBeUndefined();
	});

	it('rejects every generated absolute outside path in the bounded property loop', async () => {
		const root = await makeWorkspace();
		for (let index = 0; index < 16; index += 1) {
			const result = await runContextForChange(
				{
					files: [
						`/tmp/context-for-change-generated-${index}/secret.ts`,
					],
					task: 'property containment check',
				},
				{
					namespacePrefix: 'delendai',
					workspaceRootAbs: root,
					maxBytes: 3000,
					docsRoots: ['docs'],
				},
			);
			expect(result.isError).toBe(true);
		}
	});
});
