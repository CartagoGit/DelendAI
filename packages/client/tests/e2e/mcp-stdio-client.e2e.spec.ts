import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
	McpStdioClient,
	type McpVertexToolOutputs,
} from '../../src/public/index';

describe('e2e: McpStdioClient over a real mcp-vertex stdio server', async () => {
	const workspaces: string[] = [];

	afterEach(() => {
		for (const workspace of workspaces.splice(0)) {
			rmSync(workspace, { recursive: true, force: true });
		}
	});

	it('spawns the source CLI and calls overview', async () => {
		const workspace = mkdtempSync(join(tmpdir(), 'mcp-vertex-client-'));
		workspaces.push(workspace);
		const client = await McpStdioClient.connect({
			command: 'bun',
			args: [
				resolve('packages/core/src/cli.ts'),
				'--plugins=',
				`--workspace=${workspace}`,
			],
			// Silence the spawned CLI's stderr so its status banner
			// ("[mcp-vertex] wrote a project MCP server blueprint...")
			// does not leak into the validate output stream.
			stderr: 'ignore',
		});

		try {
			const tools = await client.listTools();
			expect(tools.map((tool) => tool.name)).toContain(
				'mcp-vertex_overview',
			);

			const overview = await client.request<
				{ compact: true },
				McpVertexToolOutputs['mcp-vertex_overview']
			>('mcp-vertex_overview', { compact: true });
			expect(overview.server.name).toBe('mcp-vertex');
			expect(overview.tools.length).toBeGreaterThan(0);
		} finally {
			await client.close();
		}
	});
});
