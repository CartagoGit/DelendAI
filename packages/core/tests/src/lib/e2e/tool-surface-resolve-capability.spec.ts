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

describe('e2e: managed bootstrap exposes resolve_capability', async () => {
	let workspace = '';
	let client: Client;
	let close: (() => Promise<void>) | undefined;

	beforeEach(() => {
		workspace = mkdtempSync(join(tmpdir(), 'resolve-capability-surface-'));
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
				name: 'resolve-capability-test',
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

	it('lists delendai_resolve_capability exactly once in managed mode and can reach a hidden capability through it', async () => {
		await connect({
			argv: ['--plugins=memory', `--workspace=${workspace}`],
			clientInfo: { name: 'claude-code', version: '1.0.0' },
			capabilities: {},
		});

		const initial = await client.listTools();
		const names = initial.tools.map((tool) => tool.name);
		expect(
			names.filter((name) => name === 'delendai_resolve_capability'),
		).toHaveLength(1);
		expect(names).not.toContain('delendai_memory_list');

		const resolved = await client.callTool({
			name: 'delendai_resolve_capability',
			arguments: { domain: 'memory', action: 'list', args: {} },
		});
		expect(resolved.isError ?? false).toBe(false);
		expect(
			resolved.structuredContent as {
				status: string;
				toolName: string;
				qualifiedName: string;
				access: string;
			},
		).toMatchObject({
			status: 'ok',
			toolName: 'list',
			qualifiedName: 'delendai_memory_list',
			access: 'hidden',
		});
	});

	it('preserves administrative deactivation instead of re-activating the capability', async () => {
		await connect({
			argv: ['--plugins=memory', `--workspace=${workspace}`],
			clientInfo: { name: 'claude-code', version: '1.0.0' },
			capabilities: {},
		});

		await client.callTool({
			name: 'delendai_plugin_deactivate',
			arguments: { plugin: 'memory' },
		});

		const resolved = await client.callTool({
			name: 'delendai_resolve_capability',
			arguments: {
				domain: 'memory',
				action: 'save',
				args: { title: 'blocked', body: 'blocked' },
			},
		});
		expect(resolved.isError ?? false).toBe(false);
		expect(
			resolved.structuredContent as {
				status: string;
				reason?: string;
				capability?: string;
			},
		).toMatchObject({
			status: 'terminal',
			reason: 'policy_denied',
			capability: 'delendai_memory_save',
		});
	});
});
