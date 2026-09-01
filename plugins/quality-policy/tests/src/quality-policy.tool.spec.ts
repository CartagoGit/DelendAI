import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { afterEach, describe, expect, it, vi } from 'vitest';

import * as qualityPublic from '@mcp-vertex/quality/public';
import * as testConventionPublic from '@mcp-vertex/test-convention/public';

import {
	buildQualityPolicyToolRegistrations,
	type QualityPolicyOutputSchema,
} from '../../src/public/index';

const createdRoots: string[] = [];

const makeWorkspace = async (): Promise<string> => {
	const root = await mkdtemp(join(tmpdir(), 'quality-policy-'));
	createdRoots.push(root);
	await mkdir(join(root, 'packages/demo/src'), { recursive: true });
	await mkdir(join(root, 'packages/demo/tests'), { recursive: true });
	await writeFile(
		join(root, 'package.json'),
		`${JSON.stringify(
			{
				name: 'demo-workspace',
				scripts: {
					lint: 'echo lint',
					typecheck: 'echo typecheck',
					test: 'vitest run',
				},
			},
			null,
			2,
		)}\n`,
		'utf8',
	);
	await writeFile(
		join(root, 'mcp-vertex.config.json'),
		`${JSON.stringify(
			{
				plugins: {
					'test-policy': {
						options: { mode: 'tests-after' },
					},
				},
			},
			null,
			2,
		)}\n`,
		'utf8',
	);
	await writeFile(
		join(root, 'vitest.config.ts'),
		'export default {}\n',
		'utf8',
	);
	await writeFile(
		join(root, 'tsconfig.base.json'),
		`${JSON.stringify(
			{
				compilerOptions: {
					strict: true,
					exactOptionalPropertyTypes: true,
					noUncheckedIndexedAccess: true,
					noImplicitOverride: true,
				},
			},
			null,
			2,
		)}\n`,
		'utf8',
	);
	await writeFile(
		join(root, 'tsconfig.json'),
		`${JSON.stringify(
			{
				extends: './tsconfig.base.json',
			},
			null,
			2,
		)}\n`,
		'utf8',
	);
	await writeFile(
		join(root, 'packages/demo/src/example.service.ts'),
		'export const exampleService = () => 1;\n',
		'utf8',
	);
	await writeFile(
		join(root, 'packages/demo/tests/example.spec.ts'),
		"import { describe, expect, it } from 'vitest';\n",
		'utf8',
	);
	return root;
};

afterEach(async () => {
	vi.restoreAllMocks();
	for (const root of createdRoots.splice(0)) {
		await rm(root, { recursive: true, force: true });
	}
});

describe('quality_policy', () => {
	it('returns the five policy areas without running heavy quality scanners', async () => {
		const root = await makeWorkspace();
		const runAllScopesSpy = vi.spyOn(qualityPublic, 'runAllScopes');
		const scanDriftSpy = vi.spyOn(testConventionPublic, 'scanDrift');
		const registrations = buildQualityPolicyToolRegistrations({
			namespacePrefix: 'mcp-vertex',
			workspaceRootAbs: root,
			maxBytes: 4000,
		});

		const registerTool = vi.fn();
		const server = { registerTool } as Pick<
			McpServer,
			'registerTool'
		> as McpServer;
		await registrations[0]!.register(server);

		const [, meta, handler] = registerTool.mock.calls[0] as [
			string,
			{ outputSchema: typeof QualityPolicyOutputSchema },
			(
				args: Record<string, never>,
			) => Promise<{ structuredContent?: unknown }>,
		];
		const result = await handler({});
		const output = meta.outputSchema.parse(result.structuredContent);

		expect(output.tests?.summary.length ?? 0).toBeGreaterThan(0);
		expect(output.conventions?.summary.length ?? 0).toBeGreaterThan(0);
		expect(output.lint?.summary.length ?? 0).toBeGreaterThan(0);
		expect(output.types?.summary.length ?? 0).toBeGreaterThan(0);
		expect(output.coverage?.summary.length ?? 0).toBeGreaterThan(0);
		expect(output.dependsOn).toEqual([
			'@mcp-vertex/quality',
			'@mcp-vertex/rules',
			'@mcp-vertex/test-policy',
			'@mcp-vertex/test-convention',
			'@mcp-vertex/conventions',
		]);
		expect(Number.isFinite(output.bytes)).toBe(true);
		expect(runAllScopesSpy).not.toHaveBeenCalled();
		expect(scanDriftSpy).not.toHaveBeenCalled();
	});

	it('returns only the requested area when area=tests', async () => {
		const root = await makeWorkspace();
		const registrations = buildQualityPolicyToolRegistrations({
			namespacePrefix: 'mcp-vertex',
			workspaceRootAbs: root,
			maxBytes: 4000,
		});

		const registerTool = vi.fn();
		const server = { registerTool } as Pick<
			McpServer,
			'registerTool'
		> as McpServer;
		await registrations[0]!.register(server);

		const [, meta, handler] = registerTool.mock.calls[0] as [
			string,
			{ outputSchema: typeof QualityPolicyOutputSchema },
			(args: {
				area: 'tests';
			}) => Promise<{ structuredContent?: unknown }>,
		];
		const result = await handler({ area: 'tests' });
		const output = meta.outputSchema.parse(result.structuredContent);

		expect(output.tests?.mode).toBe('tests-after');
		expect(output.conventions).toBeUndefined();
		expect(output.lint).toBeUndefined();
		expect(output.types).toBeUndefined();
		expect(output.coverage).toBeUndefined();
	});
});
