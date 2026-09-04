/**
 * v00131 (AUD-B01) regression pin: `quality_policy` used to declare its
 * full, exported `QualityPolicyOutputSchema` as the wire `outputSchema`
 * (~7.9 KB in the `vertex` preset). It now declares `compactOutputSchema()`
 * instead. `QualityPolicyOutputSchema` is not used as a runtime response
 * validator anywhere in `quality-policy.tool.ts` (no `.parse()`/
 * `.safeParse()` of it against the handler's return value there), so this
 * suite parses the handler's `structuredContent` against the exported
 * schema directly (not against `meta.outputSchema`) and separately asserts
 * the declared schema stays compact. This fails the day the declared
 * schema regrows.
 */
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { afterEach, describe, expect, it, vi } from 'vitest';

import * as qualityPublic from '@delendai/quality/public';
import * as testConventionPublic from '@delendai/test-convention/public';

import {
	buildQualityPolicyToolRegistrations,
	QualityPolicyOutputSchema,
} from '../../src/public/index';

const jsonSchemaBytesOf = (schema: unknown): number => {
	const candidate = schema as { toJSONSchema?: () => unknown };
	const json =
		typeof candidate?.toJSONSchema === 'function'
			? candidate.toJSONSchema()
			: schema;
	return Buffer.byteLength(JSON.stringify(json), 'utf8');
};

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
			{ outputSchema: unknown },
			(
				args: Record<string, never>,
			) => Promise<{ structuredContent?: unknown }>,
		];
		const result = await handler({});
		const output = QualityPolicyOutputSchema.parse(
			result.structuredContent,
		);

		expect(jsonSchemaBytesOf(meta.outputSchema)).toBeLessThanOrEqual(200);
		expect(output.tests?.summary.length ?? 0).toBeGreaterThan(0);
		expect(output.conventions?.summary.length ?? 0).toBeGreaterThan(0);
		expect(output.lint?.summary.length ?? 0).toBeGreaterThan(0);
		expect(output.types?.summary.length ?? 0).toBeGreaterThan(0);
		expect(output.coverage?.summary.length ?? 0).toBeGreaterThan(0);
		expect(output.dependsOn).toEqual([
			'@delendai/quality',
			'@delendai/rules',
			'@delendai/test-policy',
			'@delendai/test-convention',
			'@delendai/conventions',
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

		const [, , handler] = registerTool.mock.calls[0] as [
			string,
			{ outputSchema: unknown },
			(args: {
				area: 'tests';
			}) => Promise<{ structuredContent?: unknown }>,
		];
		const result = await handler({ area: 'tests' });
		const output = QualityPolicyOutputSchema.parse(
			result.structuredContent,
		);

		expect(output.tests?.mode).toBe('tests-after');
		expect(output.conventions).toBeUndefined();
		expect(output.lint).toBeUndefined();
		expect(output.types).toBeUndefined();
		expect(output.coverage).toBeUndefined();
	});
});
