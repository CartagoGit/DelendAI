import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import {
	buildProjectHealthToolRegistrations,
	ProjectHealthOutputSchema,
	runProjectHealth,
} from '../../src/public/index';
import * as depsPublic from '@delendai/deps/public';
import * as securityPublic from '@delendai/security/public';

const createdRoots: string[] = [];

const makeWorkspace = async (): Promise<string> => {
	const root = await mkdtemp(join(tmpdir(), 'project-health-'));
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
					test: 'echo test',
				},
			},
			null,
			2,
		)}\n`,
		'utf8',
	);
	await writeFile(join(root, 'bun.lock'), 'lockfile\n', 'utf8');
	await writeFile(join(root, 'biome.json'), '{"formatter":{}}\n', 'utf8');
	await writeFile(
		join(root, 'vitest.config.ts'),
		'export default {}\n',
		'utf8',
	);
	await writeFile(join(root, '.env'), 'DEMO=1\n', 'utf8');
	await writeFile(
		join(root, 'packages/demo/src/index.ts'),
		[
			'// TODO: tighten validation',
			'export const value = 1;',
			'// FIXME: remove temporary fallback',
		].join('\n'),
		'utf8',
	);
	await writeFile(
		join(root, 'packages/demo/tests/index.spec.ts'),
		[
			"import { describe, expect, it } from 'vitest';",
			"import { value } from '../src/index';",
			"describe('value', () => {",
			"\tit('stays defined', () => {",
			'\t\texpect(value).toBe(1);',
			'\t});',
			'});',
		].join('\n'),
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

describe('project_health', () => {
	it('returns a bounded summary with per-domain scores and next actions', async () => {
		const root = await makeWorkspace();
		const secretSpy = vi.spyOn(securityPublic, 'runSecretScan');
		const depsSpy = vi.spyOn(depsPublic, 'runDepsAudit');
		const registrations = buildProjectHealthToolRegistrations({
			namespacePrefix: 'mcp-vertex',
			workspaceRootAbs: root,
			maxBytes: 2000,
		});

		const registerTool = vi.fn();
		const server = { registerTool } as Pick<
			McpServer,
			'registerTool'
		> as McpServer;
		await registrations[0]!.register(server);

		const [, meta, handler] = registerTool.mock.calls[0] as [
			string,
			{ outputSchema: typeof ProjectHealthOutputSchema },
			(args: {
				domain?: 'summary';
			}) => Promise<{ structuredContent?: unknown }>,
		];
		const result = await handler({});
		const output = meta.outputSchema.parse(result.structuredContent);

		expect(Number.isInteger(output.score)).toBe(true);
		expect(output.score).toBeGreaterThanOrEqual(0);
		expect(output.score).toBeLessThanOrEqual(100);
		expect(output.security).toBeTypeOf('number');
		expect(output.deps).toBeTypeOf('number');
		expect(output.quality).toBeTypeOf('number');
		expect(output.debt).toBeTypeOf('number');
		expect(output.next?.length ?? 0).toBeGreaterThan(0);
		expect(
			output.next?.every(
				(item) => item.tool.length > 0 && item.reason.length > 0,
			),
		).toBe(true);
		expect(Number.isFinite(output.bytes)).toBe(true);
		expect(secretSpy).not.toHaveBeenCalled();
		expect(depsSpy).not.toHaveBeenCalled();
	});

	it('keeps domain details lazy and points at the real tool without executing heavy scans', async () => {
		const root = await makeWorkspace();
		const secretSpy = vi.spyOn(securityPublic, 'runSecretScan');
		const depsSpy = vi.spyOn(depsPublic, 'runDepsAudit');

		const result = await runProjectHealth(
			{ domain: 'security' },
			{
				namespacePrefix: 'mcp-vertex',
				workspaceRootAbs: root,
				maxBytes: 2000,
			},
		);
		const output = ProjectHealthOutputSchema.parse(
			result.structuredContent,
		);

		expect(output.domain).toBe('security');
		expect(output.tool).toBe('security_secrets_scan');
		expect(output.hint).toContain('Lazy detail only');
		expect(secretSpy).not.toHaveBeenCalled();
		expect(depsSpy).not.toHaveBeenCalled();
	});
});
