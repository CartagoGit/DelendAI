/**
 * Functional smoke (M30): drive the COMPILED core CLI over stdio under plain Node
 * and call a real tool. The `--check` smoke only validates config and exits; this
 * actually connects an MCP client, lists tools and calls `mcp-vertex_overview`,
 * proving the published artifact serves the protocol under `node` (not just bun)
 * — the #1 adoption risk. Run after `bun run build`.
 *
 *   bun scripts/smoke-cli.ts
 *
 * Note: this loads core-only (`--plugins=`). Verifying that the published PLUGIN
 * packages resolve under node needs a real install (the workspace layout isn't
 * node-resolvable in the repo) — that is the tarball-install e2e, a follow-up.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const CLI = resolve('packages/core/dist/cli.js');

const main = async (): Promise<void> => {
	const workspace = mkdtempSync(join(tmpdir(), 'mcp-smoke-'));
	const transport = new StdioClientTransport({
		command: 'node',
		args: [CLI, '--plugins=', `--workspace=${workspace}`],
	});
	const client = new Client(
		{ name: 'smoke', version: '0.0.0' },
		{ capabilities: {} },
	);
	try {
		await client.connect(transport);

		const { tools } = await client.listTools();
		const names = new Set(tools.map((t) => t.name));
		if (!names.has('mcp-vertex_overview')) {
			throw new Error(
				`mcp-vertex_overview not registered (got ${tools.length} tools)`,
			);
		}

		const res = (await client.callTool({
			name: 'mcp-vertex_overview',
			arguments: { compact: true },
		})) as { content?: Array<{ text?: string }>; isError?: boolean };
		const text = res.content?.[0]?.text ?? '';
		if (res.isError || text.length === 0) {
			throw new Error('mcp-vertex_overview returned no payload');
		}

		console.log(
			`✓ smoke: node serves the compiled CLI over stdio — ${tools.length} core tools, ` +
				`overview ${Buffer.byteLength(text, 'utf8')} bytes.`,
		);
	} finally {
		await client.close().catch(() => undefined);
		rmSync(workspace, { recursive: true, force: true });
	}
};

main().catch((err: unknown) => {
	console.error(
		`✖ smoke failed: ${err instanceof Error ? err.message : String(err)}`,
	);
	process.exit(1);
});
