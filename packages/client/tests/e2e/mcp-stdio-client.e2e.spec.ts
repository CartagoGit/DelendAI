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
			// compact `tools` is grouped by plugin ({ core: [...], … }); assert
			// the groups exist and carry stems (the flat count comes via
			// client.listTools() above).
			expect(Array.isArray(overview.tools)).toBe(false);
			const toolGroups = overview.tools as Record<string, string[]>;
			expect(Object.keys(toolGroups).length).toBeGreaterThan(0);
			expect(toolGroups.core).toContain('overview');
		} finally {
			await client.close();
		}
	});
});
