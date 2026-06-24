/**
 * Shared e2e harness for the @mcp-vertex/proposals plugin.
 *
 * Mirrors the pattern at
 * `packages/core/tests/src/lib/e2e/server-client.e2e.spec.ts`: spin up
 * a real `mcp-vertex` server (core meta-tools + the proposals plugin)
 * and drive it through the REAL MCP protocol from a real `Client` over
 * an in-memory transport pair — not by calling handlers directly. This
 * proves the full assembly (registration, request routing, output
 * shaping, `outputSchema` parity) works over the wire, complementing
 * the unit specs that exercise `runXxxTool` directly with fakes.
 *
 * Each `it` gets a fresh `mkdtempSync` workspace; the harness
 * resolves the proposals plugin from `@mcp-vertex/proposals` and
 * injects it into `assembleCliConfig` (no dynamic plugin resolution
 * from disk). The `cacheDir` / `docsDir` defaults resolve under the
 * tmpdir, so the `afterEach(rmSync(workspace))` cleans the whole
 * plugin state — no proposals, locks, queue, or git state survives
 * the test.
 *
 * Slice S1 of f00044.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { Client as McpClient } from '@modelcontextprotocol/sdk/client/index.js';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import { assembleCliConfig } from '@mcp-vertex/core/lib/cli/assemble';
import { createMcpProject } from '@mcp-vertex/core/lib/project/create-mcp-project';
import { parseCliArgs } from '@mcp-vertex/core/lib/plugins/parse-cli-args';

import proposalsPlugin from '@mcp-vertex/proposals';

/**
 * Parsed `callTool` response. The MCP SDK gives us a discriminated
 * union (`content` always present, `structuredContent` present when
 * the tool declares an `outputSchema`). Every proposals tool that
 * declares an `outputSchema` must satisfy the invariant
 * `structuredContent === parsed(content[0].text)`. The harness
 * exposes `structuredContent` directly so the calling spec can assert
 * on it without re-parsing.
 */
export interface IAssembledToolResult<T = unknown> {
	readonly ok: boolean;
	readonly raw: Awaited<ReturnType<McpClient['callTool']>>;
	readonly structured: T;
	readonly text: string;
}

export interface IAssembledProposalsServer {
	/** Real MCP `Client` connected to the in-memory transport. */
	readonly client: McpClient;
	/** Real MCP `McpServer` (the assembled project). Exposed for assertions. */
	readonly server: McpServer;
	/** Absolute path of the throwaway workspace. */
	readonly workspace: string;
	/** Call a proposals tool over the real protocol and parse its response. */
	callTool<T = unknown>(
		name: string,
		args?: Record<string, unknown>,
	): Promise<IAssembledToolResult<T>>;
	/** Tear down the client, the server, and the workspace. */
	close: () => Promise<void>;
}

/**
 * Assemble a real mcp-vertex server with the proposals plugin, attach
 * a real `Client` over an in-memory transport, and return a tiny
 * helper API. Each call creates a fresh tmpdir; the caller is
 * responsible for awaiting `close()` to release the transport and
 * the tmpdir contents.
 */
export interface ICreateAssembledProposalsServerOptions {
	/**
	 * f00052: opt into the host-scoped `agent_worktree` capability by
	 * forwarding `--agent-worktree=true`. Default `false` mirrors the real
	 * runtime, where the tool is registered but disabled until a host
	 * enables it.
	 */
	readonly enableAgentWorktree?: boolean;
}

export const createAssembledProposalsServer = async (
	options: ICreateAssembledProposalsServerOptions = {},
): Promise<IAssembledProposalsServer> => {
	const workspace = mkdtempSync(join(tmpdir(), 'proposals-e2e-'));
	const args = parseCliArgs(
		[
			'--plugins=proposals',
			`--workspace=${workspace}`,
			...(options.enableAgentWorktree ? ['--agent-worktree=true'] : []),
		],
		workspace,
	);
	const { config } = await assembleCliConfig(args, {
		// Inject the real proposals plugin (no dynamic resolution in tests).
		import: async () => ({ default: proposalsPlugin }),
		// No on-disk config file: the harness owns the workspace, the
		// plugin receives pure defaults from ctx.corePaths.
		readFile: async () => undefined,
	});
	const assembled = await createMcpProject(config);
	const [clientTransport, serverTransport] =
		InMemoryTransport.createLinkedPair();
	await assembled.server.connect(serverTransport);
	const client = new McpClient(
		{ name: 'proposals-e2e-test', version: '0.0.0' },
		{ capabilities: {} },
	);
	await client.connect(clientTransport);

	const callTool = async <T = unknown>(
		name: string,
		toolArgs: Record<string, unknown> = {},
	): Promise<IAssembledToolResult<T>> => {
		const raw = await client.callTool({ name, arguments: toolArgs });
		const first = (
			raw.content as Array<{ type: string; text?: string }>
		)[0];
		const text = first?.text ?? '{}';
		const structured = (raw.structuredContent ?? JSON.parse(text)) as T;
		return {
			ok: raw.isError !== true,
			raw,
			structured,
			text,
		};
	};

	return {
		client,
		server: assembled.server,
		workspace,
		callTool,
		close: async () => {
			await client.close();
			await assembled.server.close();
			rmSync(workspace, { recursive: true, force: true });
		},
	};
};
