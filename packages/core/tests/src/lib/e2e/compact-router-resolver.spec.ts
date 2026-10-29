import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import type {
	ClientCapabilities,
	Implementation,
} from '@modelcontextprotocol/sdk/types.js';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { assembleCliConfig } from '@delendai/core/lib/cli/assemble';
import { createMcpProject } from '@delendai/core/lib/project/create-mcp-project';
import { parseCliArgs } from '@delendai/core/lib/plugins/parse-cli-args';

import memoryPlugin from '@delendai/memory';

describe('e2e: compact router via capability resolver', async () => {
	let workspace = '';
	let client: Client;
	let close: (() => Promise<void>) | undefined;

	beforeEach(() => {
		workspace = mkdtempSync(join(tmpdir(), 'compact-router-resolver-'));
		execFileSync('git', ['init', '-q'], { cwd: workspace });
		execFileSync('git', ['config', 'user.email', 't@t.t'], {
			cwd: workspace,
		});
		execFileSync('git', ['config', 'user.name', 'T'], { cwd: workspace });
		writeFileSync(join(workspace, 'README.md'), '# surface\n');
		execFileSync('git', ['add', '.'], { cwd: workspace });
		execFileSync('git', ['commit', '-q', '-m', 'init'], { cwd: workspace });
	});

	afterEach(async () => {
		await close?.();
		rmSync(workspace, { recursive: true, force: true });
	});

	const connect = async (input: {
		argv: readonly string[];
		clientInfo?: Implementation;
		capabilities?: ClientCapabilities;
	}) => {
		const args = parseCliArgs(input.argv, workspace);
		const { config } = await assembleCliConfig(args, {
			import: async (specifier: string) => {
				if (
					specifier.includes('mcp-memory') ||
					specifier.includes('delendai/memory')
				) {
					return { default: memoryPlugin };
				}
				return { default: undefined };
			},
			readFile: async () => undefined,
		});
		const assembled = await createMcpProject(config);
		const [clientTransport, serverTransport] =
			InMemoryTransport.createLinkedPair();
		await assembled.server.connect(serverTransport);
		client = new Client(
			input.clientInfo ?? {
				name: 'compact-router-resolver-test',
				version: '0.0.0',
			},
			{ capabilities: input.capabilities ?? {} },
		);
		await client.connect(clientTransport);
		close = async () => {
			await client.close();
			await assembled.server.close();
		};
	};

	it('reaches a hidden capability through the resolver and preserves the routed success envelope', async () => {
		await connect({
			argv: ['--plugins=memory', `--workspace=${workspace}`],
			clientInfo: { name: 'claude-code', version: '1.0.0' },
			capabilities: {},
		});

		const routed = await client.callTool({
			name: 'delendai_compact_router',
			arguments: {
				domain: 'memory',
				action: 'save',
				args: { title: 'through-router', body: 'reachable' },
			},
		});
		expect(routed.isError ?? false).toBe(false);
		expect(
			routed.structuredContent as {
				routed: boolean;
				tool: string;
				active: boolean;
				isError: boolean;
			},
		).toMatchObject({
			routed: true,
			tool: 'delendai_memory_save',
			active: false,
			isError: false,
		});
	});

	it('translates resolver policy_denied outcomes back to the existing router error envelope', async () => {
		await connect({
			argv: ['--plugins=memory', `--workspace=${workspace}`],
			clientInfo: { name: 'claude-code', version: '1.0.0' },
			capabilities: {},
		});

		await client.callTool({
			name: 'delendai_plugin_deactivate',
			arguments: { plugin: 'memory' },
		});

		const routed = await client.callTool({
			name: 'delendai_compact_router',
			arguments: {
				domain: 'memory',
				action: 'save',
				args: { title: 'blocked', body: 'blocked' },
			},
		});
		expect(routed.isError ?? false).toBe(true);
		expect(
			routed.structuredContent as {
				ok: boolean;
				error: { reason: string; nextAction?: string };
			},
		).toMatchObject({
			ok: false,
			error: {
				reason: 'Tool "delendai_memory_save" is deactivated and cannot be invoked. Call plugin_activate to re-authorize it.',
			},
		});
	});
});
