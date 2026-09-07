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

describe('e2e: on-demand capability details', async () => {
	let workspace = '';
	let client: Client;
	let close: (() => Promise<void>) | undefined;

	beforeEach(() => {
		workspace = mkdtempSync(join(tmpdir(), 'capability-details-surface-'));
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
				name: 'capability-details-test',
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

	it('keeps capability schemas out of tools/list but exposes them on demand through detailsId and knowledge', async () => {
		await connect({
			argv: ['--plugins=memory', `--workspace=${workspace}`],
			clientInfo: { name: 'claude-code', version: '1.0.0' },
			capabilities: {},
		});

		const initial = await client.listTools();
		const names = initial.tools.map((tool) => tool.name);
		expect(names).not.toContain('delendai_memory_list');
		expect(names).not.toContain('delendai_knowledge');

		const searched = await client.callTool({
			name: 'delendai_tool_search',
			arguments: { plugin: 'memory' },
		});
		const entries = (
			searched.structuredContent as {
				entries: Array<{ name: string; detailsId: string; active: boolean }>;
			}
		).entries;
		const hiddenMemoryList = entries.find(
			(entry) => entry.name === 'delendai_memory_list',
		);
		expect(hiddenMemoryList?.active).toBe(false);
		expect(hiddenMemoryList?.detailsId).toContain('tool:');

		const details = await client.callTool({
			name: 'delendai_resolve_capability',
			arguments: {
				qualifiedName: 'delendai_knowledge',
				args: { id: hiddenMemoryList?.detailsId },
			},
		});
		expect(details.isError ?? false).toBe(false);
		const resolved = details.structuredContent as {
			status: string;
			toolName: string;
			access: string;
			result: {
				structuredContent: { id: string; title: string; body: string };
			};
		};
		expect(resolved.status).toBe('ok');
		expect(resolved.toolName).toBe('delendai_knowledge');
		expect(resolved.access).toBe('hidden');
		expect(resolved.result.structuredContent.id).toBe(
			hiddenMemoryList?.detailsId,
		);
		expect(resolved.result.structuredContent.body).toContain('Input schema:');
		expect(resolved.result.structuredContent.body).toContain('Output schema:');
		expect(resolved.result.structuredContent.body).toContain('"limit"');
		expect(resolved.result.structuredContent.body).toContain('"notes"');
	});
});