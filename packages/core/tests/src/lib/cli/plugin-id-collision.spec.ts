/**
 * plugin-id-collision.spec.ts
 *
 * R12: two distinct plugins may each ship a tool with the same internal
 * id (e.g. `status`). Their MCP names are namespaced (`a_status`,
 * `b_status`) and never collide, so assembly must succeed — the
 * registration-order uniqueness check runs on the qualified id.
 */

import { afterAll, describe, expect, it } from 'vitest';

import { assembleCliConfig } from '@delendai/core/lib/cli/assemble';
import { createMcpProject } from '@delendai/core/lib/project/create-mcp-project';
import { parseCliArgs } from '@delendai/core/lib/plugins/parse-cli-args';
import { createTestWorkspace, removeTestWorkspace } from '../test-workspace';

const WRITABLE_WORKSPACE = createTestWorkspace('mcp-vertex-collision-');
afterAll(() => removeTestWorkspace(WRITABLE_WORKSPACE));

const pluginWithPingTool = (name: string) => ({
	name,
	version: '1.0.0',
	describe: `${name} plugin`,
	register: () => ({
		tools: [
			{
				id: 'ping',
				summary: `${name} ping`,
				register: async () => {},
			},
		],
	}),
});

const assembleTwoPlugins = () => {
	const args = parseCliArgs(
		[
			'--plugins=alpha,beta',
			`--workspace=${WRITABLE_WORKSPACE}`,
			'--surface=native',
		],
		WRITABLE_WORKSPACE,
	);
	return assembleCliConfig(args, {
		readFile: async () => undefined,
		import: async (specifier: string) => ({
			default: specifier.includes('beta')
				? pluginWithPingTool('beta')
				: pluginWithPingTool('alpha'),
		}),
	});
};

describe('R12 — same internal tool id across plugins', async () => {
	it('assembles without an id collision and qualifies each id by namespace', async () => {
		const { config, loadResult } = await assembleTwoPlugins();
		expect(loadResult.errors).toEqual([]);

		const ids = config.extraTools!.map((t) => t.id);
		expect(ids).toContain('mcp-vertex_alpha_ping');
		expect(ids).toContain('mcp-vertex_beta_ping');
		// The raw, ambiguous id must not survive into the global sequence.
		expect(ids).not.toContain('ping');
		expect(ids).not.toContain('alpha_ping');
		expect(ids).not.toContain('beta_ping');
	});

	it('builds the real MCP server without throwing a duplicate-id error', async () => {
		const { config } = await assembleTwoPlugins();
		const assembled = await createMcpProject(config);
		expect(assembled.registrationOrder).toContain('mcp-vertex_alpha_ping');
		expect(assembled.registrationOrder).toContain('mcp-vertex_beta_ping');
	});
});
