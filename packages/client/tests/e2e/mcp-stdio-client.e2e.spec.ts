import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, describe, expect, it } from 'vitest';

import { McpStdioClient, type IOverview } from '../../src/public/index';

describe('e2e: McpStdioClient over a real delendai stdio server', async () => {
	const workspaces: string[] = [];
	const coreCli = fileURLToPath(
		new URL('../../../core/src/cli.ts', import.meta.url),
	);

	afterEach(() => {
		for (const workspace of workspaces.splice(0)) {
			rmSync(workspace, { recursive: true, force: true });
		}
	});

	it('spawns the source CLI and calls overview', async () => {
		const workspace = mkdtempSync(join(tmpdir(), 'delendai-client-'));
		workspaces.push(workspace);
		const client = await McpStdioClient.connect({
			command: 'bun',
			args: [coreCli, '--plugins=', `--workspace=${workspace}`],
			// Silence the spawned CLI's stderr so its status banner
			// ("[delendai] wrote a project MCP server blueprint...")
			// does not leak into the validate output stream.
			stderr: 'ignore',
		});

		try {
			const tools = await client.listTools();
			expect(tools.map((tool) => tool.name)).toContain(
				'delendai_overview',
			);

			const overview = await client.request<{ compact: true }, IOverview>(
				'delendai_overview',
				{ compact: true },
			);
			// `DelendAI`, or `DelendAI:<project>` in a named workspace —
			// `deriveMcpServerName` (packages/cli/src/commands/init/init.command.ts)
			// brands the server so a host listing several MCP servers shows
			// the product, not a lowercase package id. The tool NAMES keep
			// the lowercase `delendai_` prefix (asserted above); only the
			// server's display identity is branded.
			expect(overview.server.name).toMatch(/^DelendAI(?::.+)?$/u);
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
