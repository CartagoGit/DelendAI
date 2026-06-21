import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { assembleCliConfig } from '@mcp-vertex/core/lib/cli/assemble';
import { createMcpProject } from '@mcp-vertex/core/lib/project/create-mcp-project';
import { parseCliArgs } from '@mcp-vertex/core/lib/plugins/parse-cli-args';
import memoryPlugin from '@mcp-vertex/memory';

describe('e2e: mcp.json launch path plugin parity', () => {
	let workspace = '';
	let client: Client;
	let close: () => Promise<void>;

	beforeEach(async () => {
		workspace = mkdtempSync(join(tmpdir(), 'mcp-json-parity-'));
		writeFileSync(
			join(workspace, 'mcp-vertex.config.json'),
			JSON.stringify({
				plugins: {
					memory: { options: {} },
				},
			}),
			'utf8',
		);
		const args = parseCliArgs([`--workspace=${workspace}`], workspace);
		const { config } = await assembleCliConfig(args, {
			import: async () => ({ default: memoryPlugin }),
		});
		const assembled = await createMcpProject(config);
		const [clientTransport, serverTransport] =
			InMemoryTransport.createLinkedPair();
		await assembled.server.connect(serverTransport);
		client = new Client(
			{ name: 'mcp-json-parity-test', version: '0.0.0' },
			{ capabilities: {} },
		);
		await client.connect(clientTransport);
		close = async () => {
			await client.close();
			await assembled.server.close();
		};
	});

	afterEach(async () => {
		await close();
		rmSync(workspace, { recursive: true, force: true });
	});

	it('loads config-declared plugins even when mcp.json passes only workspace', async () => {
		const { tools } = await client.listTools();
		const names = tools.map((tool) => tool.name);
		expect(names).toContain('memory_save');
		expect(names).toContain('memory_recall');

		const res = await client.callTool({
			name: 'mcp-vertex_overview',
			arguments: { compact: true },
		});
		const text = (res.content as Array<{ type: string; text: string }>)[0]
			?.text;
		const overview = JSON.parse(text ?? '{}') as {
			readonly plugins?: readonly string[];
			readonly pluginDiagnostic?: {
				readonly requested: readonly string[];
				readonly loaded: readonly string[];
				readonly missing: readonly string[];
				readonly configPlugins: readonly string[];
			};
		};
		expect(overview.plugins).toContain('memory');
		expect(overview.pluginDiagnostic).toEqual({
			requested: ['memory'],
			loaded: ['memory'],
			missing: [],
			configPlugins: ['memory'],
			errors: 0,
		});
	});
});
