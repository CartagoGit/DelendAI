import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { assembleCliConfig } from '@mcp-vertex/core/lib/cli/assemble';
import { createMcpProject } from '@mcp-vertex/core/lib/project/create-mcp-project';
import { parseCliArgs } from '@mcp-vertex/core/lib/plugins/parse-cli-args';
import memoryPlugin from '@mcp-vertex/memory';

/**
 * End-to-end: assemble the REAL server (core meta-tools + a real plugin)
 * and drive it through the REAL MCP protocol from a real Client over an
 * in-memory transport pair — not by calling handlers directly. This
 * proves the whole assembly (registration, request routing, result
 * shaping) works over the wire, complementing the unit tests. [N23]
 */
describe('e2e: real MCP client ↔ assembled server', () => {
	let workspace = '';
	let client: Client;
	let close: () => Promise<void>;

	beforeEach(async () => {
		workspace = mkdtempSync(join(tmpdir(), 'e2e-'));
		const args = parseCliArgs(
			['--plugins=memory', `--workspace=${workspace}`],
			workspace,
		);
		const { config } = await assembleCliConfig(args, {
			// Inject the real memory plugin (no dynamic resolution in tests).
			import: async () => ({ default: memoryPlugin }),
			readFile: () => undefined,
		});
		const assembled = await createMcpProject(config);
		const [clientTransport, serverTransport] =
			InMemoryTransport.createLinkedPair();
		await assembled.server.connect(serverTransport);
		client = new Client(
			{ name: 'e2e-test', version: '0.0.0' },
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

	it('lists the core + plugin tools over the protocol', async () => {
		const { tools } = await client.listTools();
		const names = tools.map((t) => t.name);
		expect(names).toContain('mcp-vertex_overview');
		expect(names).toContain('memory_save');
		expect(names).toContain('memory_recall');
	});

	it('overview (callTool) maps the loaded memory plugin', async () => {
		const res = await client.callTool({
			name: 'mcp-vertex_overview',
			arguments: {},
		});
		const text = (res.content as Array<{ type: string; text: string }>)[0]
			?.text;
		const snap = JSON.parse(text ?? '{}');
		expect(snap.plugins.map((p: { name: string }) => p.name)).toContain(
			'memory',
		);
	});

	it('round-trips a note through save → recall over the protocol', async () => {
		const saved = await client.callTool({
			name: 'memory_save',
			arguments: {
				title: 'E2E decision',
				body: 'we ship via in-memory',
				tags: ['e2e'],
			},
		});
		// N16: memory_save declares an outputSchema, so the SDK validated the
		// structuredContent on the way out, and a modern client reads it
		// directly. A wrong schema would have thrown McpError here.
		const savedStructured = saved.structuredContent as {
			ok: boolean;
			saved: { title: string };
		};
		expect(savedStructured.ok).toBe(true);
		expect(savedStructured.saved.title).toBe('E2E decision');

		const res = await client.callTool({
			name: 'memory_recall',
			arguments: { query: 'in-memory' },
		});
		const text = (res.content as Array<{ type: string; text: string }>)[0]
			?.text;
		const recalled = JSON.parse(text ?? '{}');
		expect(recalled.notes[0]?.title).toBe('E2E decision');
		expect(
			(res.structuredContent as { notes: Array<{ title: string }> })
				.notes[0]?.title,
		).toBe('E2E decision');
	});

	it('validates core meta-tool outputSchemas over the protocol (N16)', async () => {
		// A wrong outputSchema would make the SDK throw on these calls.
		const vm = await client.callTool({
			name: 'mcp-vertex_get_validation_matrix',
			arguments: {},
		});
		expect(
			(vm.structuredContent as { scopes: unknown }).scopes,
		).toBeDefined();

		const kn = await client.callTool({
			name: 'mcp-vertex_knowledge',
			arguments: {},
		});
		expect(
			Array.isArray(
				(kn.structuredContent as { entries: unknown }).entries,
			),
		).toBe(true);
	});

	it('reports an unknown tool as a protocol error', async () => {
		const res = await client.callTool({
			name: 'mcp-vertex_does_not_exist',
			arguments: {},
		});
		expect(res.isError).toBe(true);
		const text = (res.content as Array<{ type: string; text: string }>)[0]
			?.text;
		expect(text).toContain('not found');
	});
});
