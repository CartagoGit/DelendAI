/**
 * client-identity-wiring.spec.ts — every plugin can tell which MCP client
 * drives it, with nothing configured.
 *
 * No host writes `commitAuthor.clientName` or passes `--agent-client`, so
 * `hostIdentity` was empty in Claude Code, Codex and Copilot alike and work
 * refs were named after the machine. The handshake already carries the
 * client's name; this proves it reaches the plugin context through a real
 * MCP connection.
 */
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { afterAll, describe, expect, it } from 'vitest';

import { assembleCliConfig } from '@delendai/core/lib/cli/assemble';
import { parseCliArgs } from '@delendai/core/lib/plugins/parse-cli-args';
import { createMcpProject } from '@delendai/core/lib/project/create-mcp-project';
import type { IMcpPluginContext } from '@delendai/core/public';
import { createTestWorkspace, removeTestWorkspace } from '../test-workspace';

const WORKSPACE = createTestWorkspace('delendai-client-identity-');
afterAll(() => removeTestWorkspace(WORKSPACE));

const assembleWithCapture = async () => {
	const sink: { ctx?: IMcpPluginContext } = {};
	const { config } = await assembleCliConfig(
		parseCliArgs(
			[
				`--workspace=${WORKSPACE}`,
				'--surface=native',
				'--plugins=capture',
			],
			WORKSPACE,
		),
		{
			readFile: async () => undefined,
			import: async () => ({
				default: {
					name: 'capture',
					register: (ctx: IMcpPluginContext) => {
						sink.ctx = ctx;
						return {};
					},
				},
			}),
		},
	);
	return { config, sink };
};

describe('clientIdentity — the MCP client name reaches every plugin', () => {
	it.each(['claude-code', 'codex-mcp-client', 'Visual Studio Code'])(
		'names %s after the handshake, with no identity configured',
		async (clientName) => {
			const { config, sink } = await assembleWithCapture();
			// Nothing declared: the configured identity stays absent...
			expect(sink.ctx?.hostIdentity).toBeUndefined();
			// ...and before the handshake the client is not known yet.
			expect(sink.ctx?.clientIdentity?.name()).toBeUndefined();

			const project = await createMcpProject(config);
			const [clientTransport, serverTransport] =
				InMemoryTransport.createLinkedPair();
			const client = new Client(
				{ name: clientName, version: '1.0.0' },
				{ capabilities: {} },
			);
			try {
				await project.server.connect(serverTransport);
				await client.connect(clientTransport);
				// `oninitialized` fires on the initialized notification, which
				// the client sends at the end of connect; let it be delivered.
				await new Promise((resolve) => setTimeout(resolve, 20));
				expect(sink.ctx?.clientIdentity?.name()).toBe(clientName);
			} finally {
				await client.close();
				await project.server.close();
			}
		},
	);
});
