import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import {
	buildImpactAnalysisToolRegistrations,
	type ImpactAnalyzeOutputSchema,
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
			namespacePrefix: 'mcp-vertex',
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
				namespacePrefix: 'mcp-vertex',
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
});
