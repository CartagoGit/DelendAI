import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
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
			namespacePrefix: 'mcp-vertex',
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
				namespacePrefix: 'mcp-vertex',
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
});
