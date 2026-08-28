#!/usr/bin/env bun
/**
 * measure-bootstrap CI job (AUD-B04 / x00284).
 *
 * Before this, the job measured `{name, toolId, summary}` per static
 * descriptor — a shape that never included `inputSchema`/`outputSchema`
 * at all, so it could never see the number it reported change when a
 * tool's `outputSchema` grew (the audit's own estimate: 75% of real
 * bootstrap cost). It now drives a REAL in-memory MCP connection per
 * mode and measures the actual `tools/list` response a client would
 * receive on connect, via the single shared `measureBootstrapBytes` /
 * `measureToolWireBytes` basis in `packages/core/src/lib/surface/bootstrap.ts`.
 */
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';

import {
	assembleCliConfig,
	createMcpProject,
	measureBootstrapBytes,
	parseCliArgs,
} from '@mcp-vertex/core/public';

const MODES = ['native', 'adaptive', 'compact'] as const;

const measureMode = async (
	mode: (typeof MODES)[number],
	workspace: string,
): Promise<{
	readonly mode: (typeof MODES)[number];
	readonly tools: number;
	readonly bytes: number;
	readonly estimatedTokens: number;
}> => {
	const args = parseCliArgs(
		[`--surface=${mode}`, `--workspace=${workspace}`],
		workspace,
	);
	const { config } = await assembleCliConfig(args);
	const project = await createMcpProject(config);
	const [clientTransport, serverTransport] =
		InMemoryTransport.createLinkedPair();
	await project.server.connect(serverTransport);
	const client = new Client(
		{ name: 'measure-bootstrap', version: '0.0.0' },
		{ capabilities: {} },
	);
	await client.connect(clientTransport);
	try {
		// The explicit `--surface` override above pins the mode
		// regardless of this client's own capabilities, so the very
		// first `tools/list` IS the bootstrap surface for that mode —
		// no polling for a post-connect renegotiation needed.
		const listed = await client.listTools();
		const measurement = measureBootstrapBytes(
			listed.tools.map((tool) => ({
				name: tool.name,
				description: tool.description,
				inputSchema: tool.inputSchema,
				outputSchema: tool.outputSchema,
				annotations: tool.annotations,
				execution: tool.execution,
			})),
		);
		return { mode, ...measurement };
	} finally {
		await client.close();
		await project.dispose();
		await project.server.close();
	}
};

const main = async (): Promise<number> => {
	const workspace = process.cwd();
	const rows = [];
	for (const mode of MODES) {
		rows.push(await measureMode(mode, workspace));
	}

	console.log('Bootstrap bytes by surface mode (real tools/list):');
	for (const row of rows) {
		console.log(
			`${row.mode}: ${row.tools} tools, ${row.bytes} B, ~${row.estimatedTokens} tokens`,
		);
	}

	const adaptive = rows.find((row) => row.mode === 'adaptive');
	if (adaptive !== undefined && adaptive.bytes > 50_000) {
		console.error(`Adaptive bootstrap exceeds 50 KB: ${adaptive.bytes} B`);
		return 1;
	}

	return 0;
};

const exitCode = await main();
process.exit(exitCode);
