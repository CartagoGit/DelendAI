/**
 * assemble.spec.ts — f00052 S4
 *
 * `assembleCliConfig` resolves the host-scoped `agent_worktree` gate
 * with precedence host CLI > config file > `false` default, surfaces the
 * resolved value on `IMcpVertexHostConfig.agentWorktreeEnabled` (audit
 * summary), and projects it onto every plugin's `IMcpPluginContext` as
 * `agentWorktreeEnabled`.
 */
import { describe, expect, it } from 'vitest';

import { assembleCliConfig } from '@mcp-vertex/core/lib/cli/assemble';
import type { IMcpPluginContext } from '@mcp-vertex/core/public';
import { parseCliArgs } from '@mcp-vertex/core/lib/plugins/parse-cli-args';

/**
 * A capture plugin: records the context it was registered with so the
 * test can assert what the loader projected onto it.
 */
const captureImport = (sink: { ctx?: IMcpPluginContext }) => {
	return async (_specifier: string): Promise<{ default: unknown }> => ({
		default: {
			name: 'capture',
			register: (ctx: IMcpPluginContext) => {
				sink.ctx = ctx;
				return {};
			},
		},
	});
};

const fileReader =
	(file: string | undefined) =>
	async (_path: string): Promise<string | undefined> =>
		file;

const baseArgs = (extra: readonly string[] = []) =>
	parseCliArgs(['--workspace=/ws', '--plugins=capture', ...extra], '/ws');

describe('assembleCliConfig — agentWorktree gate (f00052 S4)', async () => {
	it('defaults to false when neither CLI nor file specifies it', async () => {
		const sink: { ctx?: IMcpPluginContext } = {};
		const { config } = await assembleCliConfig(baseArgs(), {
			readFile: fileReader(undefined),
			import: captureImport(sink),
		});
		expect(config.agentWorktreeEnabled).toBe(false);
		expect(sink.ctx?.agentWorktreeEnabled).toBe(false);
	});

	it('uses the file config value when no CLI flag is present', async () => {
		const sink: { ctx?: IMcpPluginContext } = {};
		const { config } = await assembleCliConfig(baseArgs(), {
			readFile: fileReader('{"agentWorktree": true}'),
			import: captureImport(sink),
		});
		expect(config.agentWorktreeEnabled).toBe(true);
		expect(sink.ctx?.agentWorktreeEnabled).toBe(true);
	});

	it('lets the CLI flag override the file config (true over false)', async () => {
		const sink: { ctx?: IMcpPluginContext } = {};
		const { config } = await assembleCliConfig(
			baseArgs(['--agent-worktree=true']),
			{
				readFile: fileReader('{"agentWorktree": false}'),
				import: captureImport(sink),
			},
		);
		expect(config.agentWorktreeEnabled).toBe(true);
		expect(sink.ctx?.agentWorktreeEnabled).toBe(true);
	});

	it('lets the CLI flag override the file config (false over true)', async () => {
		const sink: { ctx?: IMcpPluginContext } = {};
		const { config } = await assembleCliConfig(
			baseArgs(['--agent-worktree=false']),
			{
				readFile: fileReader('{"agentWorktree": true}'),
				import: captureImport(sink),
			},
		);
		expect(config.agentWorktreeEnabled).toBe(false);
		expect(sink.ctx?.agentWorktreeEnabled).toBe(false);
	});
});
