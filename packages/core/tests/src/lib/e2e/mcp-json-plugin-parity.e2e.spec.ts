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

describe('e2e: mcp.json launch path plugin parity', async () => {
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

	it('surfaces a structured diagnostic when a config-declared plugin fails to load', async () => {
		// A second workspace declares two plugins, but the importer only
		// resolves one of them — this is the "silent mismatch" the proposal
		// calls out: the host must boot (memory's tools still load) AND the
		// divergence must be explicit in the diagnostic, not swallowed.
		const badWorkspace = mkdtempSync(
			join(tmpdir(), 'mcp-json-parity-bad-'),
		);
		try {
			writeFileSync(
				join(badWorkspace, 'mcp-vertex.config.json'),
				JSON.stringify({
					plugins: {
						memory: { options: {} },
						'does-not-exist': { options: {} },
					},
				}),
				'utf8',
			);
			const args = parseCliArgs(
				[`--workspace=${badWorkspace}`],
				badWorkspace,
			);
			const { config } = await assembleCliConfig(args, {
				import: async (specifier: string) => {
					if (specifier.includes('does-not-exist')) {
						throw new Error('module not found');
					}
					return { default: memoryPlugin };
				},
			});
			const assembled = await createMcpProject(config);
			const [badClientTransport, badServerTransport] =
				InMemoryTransport.createLinkedPair();
			await assembled.server.connect(badServerTransport);
			const badClient = new Client(
				{ name: 'mcp-json-parity-bad-test', version: '0.0.0' },
				{ capabilities: {} },
			);
			await badClient.connect(badClientTransport);
			try {
				const { tools } = await badClient.listTools();
				const names = tools.map((tool) => tool.name);
				// The host still boots and the plugin that DID resolve is fully
				// usable — a missing plugin must not take down the surface.
				expect(names).toContain('memory_save');

				const res = await badClient.callTool({
					name: 'mcp-vertex_overview',
					arguments: { compact: true },
				});
				const text = (
					res.content as Array<{ type: string; text: string }>
				)[0]?.text;
				const overview = JSON.parse(text ?? '{}') as {
					readonly pluginDiagnostic?: {
						readonly requested: readonly string[];
						readonly loaded: readonly string[];
						readonly missing: readonly string[];
						readonly missingReasons?: Readonly<
							Record<string, string>
						>;
						readonly configPlugins: readonly string[];
						readonly errors: number;
					};
				};
				// The divergence is explicit: the configured-but-unresolved
				// plugin shows up in `missing` with a `missingReasons` entry
				// explaining why, and `errors` is non-zero — an agent never
				// has to reverse-engineer why a tool is absent.
				const { missingReasons, ...rest } =
					overview.pluginDiagnostic ?? {};
				expect(rest).toEqual({
					requested: ['memory', 'does-not-exist'],
					loaded: ['memory'],
					missing: ['does-not-exist'],
					configPlugins: ['memory', 'does-not-exist'],
					errors: 1,
				});
				expect(missingReasons?.['does-not-exist']).toContain(
					'could not load plugin "does-not-exist"',
				);
			} finally {
				await badClient.close();
				await assembled.server.close();
			}
		} finally {
			rmSync(badWorkspace, { recursive: true, force: true });
		}
	});
});
