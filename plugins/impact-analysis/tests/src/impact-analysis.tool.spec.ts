import { mkdtemp, mkdir, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import {
	buildImpactAnalysisToolRegistrations,
	type ImpactAnalyzeOutputSchema,
	runImpactAnalyze,
	runTestsForChange,
	TestsForChangeOutputSchema,
} from '../../src/public/index';

const createdRoots: string[] = [];

const makeWorkspace = async (): Promise<string> => {
	const root = await mkdtemp(join(tmpdir(), 'impact-analysis-'));
	createdRoots.push(root);
	await mkdir(join(root, 'packages/core/src/lib'), { recursive: true });
	await mkdir(join(root, 'packages/core/tests/src/lib'), {
		recursive: true,
	});
	await mkdir(join(root, 'plugins/demo/src'), { recursive: true });
	await mkdir(join(root, 'plugins/demo/tests/src'), { recursive: true });
	await writeFile(
		join(root, 'packages/core/src/lib/foo.ts'),
		[
			'export function foo(value: string): string {',
			'\treturn `${value}-ok`;',
			'}',
		].join('\n'),
		'utf8',
	);
	await writeFile(
		join(root, 'packages/core/tests/src/lib/foo.spec.ts'),
		[
			"import { describe, expect, it } from 'vitest';",
			"import { foo } from '../../../../src/lib/foo';",
			"describe('foo', () => {",
			"\tit('formats the value', () => {",
			"\t\texpect(foo('a')).toBe('a-ok');",
			'\t});',
			'});',
		].join('\n'),
		'utf8',
	);
	await writeFile(
		join(root, 'plugins/demo/src/index.ts'),
		[
			"import { foo } from '../../../packages/core/src/lib/foo';",
			"export const linked = () => foo('demo');",
		].join('\n'),
		'utf8',
	);
	await writeFile(
		join(root, 'plugins/demo/tests/src/demo.spec.ts'),
		[
			"import { describe, expect, it } from 'vitest';",
			"import { linked } from '../index';",
			"describe('linked', () => {",
			"\tit('uses foo', () => {",
			"\t\texpect(linked()).toBe('demo-ok');",
			'\t});',
			'});',
		].join('\n'),
		'utf8',
	);
	await writeFile(
		join(root, 'plugins/demo/tests/src/unrelated.spec.ts'),
		[
			"import { describe, expect, it } from 'vitest';",
			"describe('unrelated', () => {",
			"\tit('stays unrelated', () => {",
			'\t\texpect(1 + 1).toBe(2);',
			'\t});',
			'});',
		].join('\n'),
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
	const outside = await mkdtemp(join(tmpdir(), 'impact-analysis-outside-'));
	createdRoots.push(outside);
	await writeFile(
		join(outside, 'secret.ts'),
		'export const secret = true;',
		'utf8',
	);
	await symlink(
		join(outside, 'secret.ts'),
		join(root, 'plugins/demo/src/link-outside.ts'),
	);
	await symlink(
		join(root, 'packages/core/src/lib/foo.ts'),
		join(root, 'plugins/demo/src/link-inside.ts'),
	);
	return root;
};

afterEach(async () => {
	for (const root of createdRoots.splice(0)) {
		await rm(root, { recursive: true, force: true });
	}
});

describe('impact-analysis tools', () => {
	it('returns changed symbols, affected packages, recommended tests and a valid risk', async () => {
		const root = await makeWorkspace();
		const registrations = buildImpactAnalysisToolRegistrations({
			namespacePrefix: 'delendai',
			workspaceRootAbs: root,
			maxBytes: 3000,
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
			{ outputSchema: typeof ImpactAnalyzeOutputSchema },
			(args: {
				files: string[];
			}) => Promise<{ structuredContent?: unknown }>,
		];
		const result = await handler({
			files: ['packages/core/src/lib/foo.ts'],
		});
		const output = meta.outputSchema.parse(result.structuredContent);

		expect(output.changedSymbols).toContain('foo');
		expect(output.affectedPackages).toContain('packages/core');
		expect(output.recommendedTests).toContain(
			'packages/core/tests/src/lib/foo.spec.ts',
		);
		expect(['low', 'medium', 'high']).toContain(output.risk);
		expect(output.dependsOn).toEqual([
			'git',
			'search',
			'refactor',
			'test-policy',
		]);
		expect(output.bytes).toBeGreaterThan(0);
		expect(output.bytes).toBeLessThanOrEqual(3000);
	});

	it('selects matching tests to run and samples skipped tests', async () => {
		const root = await makeWorkspace();
		const result = await runTestsForChange(
			{ files: ['packages/core/src/lib/foo.ts'] },
			{
				namespacePrefix: 'delendai',
				workspaceRootAbs: root,
				maxBytes: 3000,
			},
		);
		const output = TestsForChangeOutputSchema.parse(
			result.structuredContent,
		);

		expect(output.run).toContain('packages/core/tests/src/lib/foo.spec.ts');
		expect(output.skip.length).toBeGreaterThan(0);
		expect(output.skip).not.toContain(
			'packages/core/tests/src/lib/foo.spec.ts',
		);
		expect(output.coverageFocus).toContain('packages/core');
		expect(output.likelyRelatedFailures).toContain(
			'packages/core/tests/src/lib/foo.spec.ts',
		);
		expect(Number.isFinite(output.bytes)).toBe(true);
		expect(output.bytes).toBeLessThanOrEqual(3000);
	});

	it('returns a structured containment error for outside, reserved and symlink-escape paths', async () => {
		const root = await makeWorkspace();
		const outside = await mkdtemp(
			join(tmpdir(), 'impact-analysis-external-'),
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
			'plugins/demo/src/link-outside.ts',
			'tests/../../outside.ts',
			'./../outside.ts',
			'.././outside.ts',
			'../../outside.ts',
			'../../../outside.ts',
			'../../../../outside.ts',
			'../outside.ts/../secret.ts',
		];

		for (const file of adversarialPaths) {
			const result = await runTestsForChange(
				{ files: [file] },
				{
					namespacePrefix: 'delendai',
					workspaceRootAbs: root,
					maxBytes: 3000,
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

	it('returns a structured containment error from impact_analyze too', async () => {
		const root = await makeWorkspace();
		const outside = await mkdtemp(
			join(tmpdir(), 'impact-analyze-external-'),
		);
		createdRoots.push(outside);
		await writeFile(
			join(outside, 'secret.ts'),
			'export const analyzeLeakedSymbol = true;',
			'utf8',
		);
		const adversarialPaths = [
			join(outside, 'secret.ts'),
			`${root}-secret/file.ts`,
			'../outside.ts',
			'../../etc/passwd',
			'plugins/demo/src/link-outside.ts',
			'.env',
		];

		for (const file of adversarialPaths) {
			const result = await runImpactAnalyze(
				{ files: [file] },
				{
					namespacePrefix: 'delendai',
					workspaceRootAbs: root,
					maxBytes: 3000,
				},
			);
			expect(result.isError).toBe(true);
			const containmentError = result.structuredContent?.error as
				| { reason: string }
				| undefined;
			expect(containmentError?.reason).toContain('workspace-containment');
			expect(JSON.stringify(result)).not.toContain('analyzeLeakedSymbol');
		}
	});

	it('rejects workspace-escaping paths that arrive through gitDiff', async () => {
		const root = await makeWorkspace();
		const outside = await mkdtemp(
			join(tmpdir(), 'impact-analysis-diff-external-'),
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
			const result = await runImpactAnalyze(
				{
					gitDiff: [
						`diff --git a/${escapingPath} b/${escapingPath}`,
						`+++ b/${escapingPath}`,
						'',
					].join('\n'),
				},
				{
					namespacePrefix: 'delendai',
					workspaceRootAbs: root,
					maxBytes: 3000,
				},
			);
			expect(JSON.stringify(result)).not.toContain('diffLeakedSymbol');
			expect(JSON.stringify(result)).not.toContain('root:x:0:0');
		}
	});

	it('accepts a symlink that still resolves inside the workspace', async () => {
		const root = await makeWorkspace();
		const result = await runTestsForChange(
			{ files: ['plugins/demo/src/link-inside.ts'] },
			{
				namespacePrefix: 'delendai',
				workspaceRootAbs: root,
				maxBytes: 3000,
			},
		);
		expect(result.isError).toBeUndefined();
	});

	it('rejects every generated absolute outside path in the bounded property loop', async () => {
		const root = await makeWorkspace();
		for (let index = 0; index < 16; index += 1) {
			const result = await runTestsForChange(
				{
					files: [
						`/tmp/impact-analysis-generated-${index}/secret.ts`,
					],
				},
				{
					namespacePrefix: 'delendai',
					workspaceRootAbs: root,
					maxBytes: 3000,
				},
			);
			expect(result.isError).toBe(true);
		}
	});
});
