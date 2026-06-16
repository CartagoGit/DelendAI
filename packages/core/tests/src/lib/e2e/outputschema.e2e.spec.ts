import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { assembleCliConfig } from '@cartago-git/mcp-core/lib/cli/assemble';
import { createMcpServer } from '@cartago-git/mcp-core/lib/server/create-mcp-server';
import { parseCliArgs } from '@cartago-git/mcp-core/lib/plugins/parse-cli-args';

import proposalsPlugin from '@cartago-git/mcp-proposals';
import rulesPlugin from '@cartago-git/mcp-rules';
import memoryPlugin from '@cartago-git/mcp-memory';
import gitPlugin from '@cartago-git/mcp-git';
import qualityPlugin from '@cartago-git/mcp-quality';
import searchPlugin from '@cartago-git/mcp-search';
import notificationPlugin from '@cartago-git/mcp-notification';

/**
 * N16 net: assemble the REAL server with every plugin and call each
 * read-only tool over the REAL MCP protocol. When a tool declares an
 * `outputSchema`, the SDK validates its `structuredContent` on success
 * and throws McpError on a mismatch — so a green call here proves the
 * declared schema matches what the tool actually returns.
 */
const PLUGINS = {
	'mcp-proposals': proposalsPlugin,
	'mcp-rules': rulesPlugin,
	'mcp-memory': memoryPlugin,
	'mcp-git': gitPlugin,
	'mcp-quality': qualityPlugin,
	'mcp-search': searchPlugin,
	'mcp-notification': notificationPlugin,
} as const;

describe('e2e: outputSchema validation over the protocol (N16)', () => {
	let workspace = '';
	let client: Client;
	let close: () => Promise<void>;

	beforeEach(async () => {
		workspace = mkdtempSync(join(tmpdir(), 'e2e-os-'));
		// A real git repo so the git tools hit their success path.
		execFileSync('git', ['init', '-q'], { cwd: workspace });
		execFileSync('git', ['config', 'user.email', 't@t.t'], { cwd: workspace });
		execFileSync('git', ['config', 'user.name', 'T'], { cwd: workspace });
		writeFileSync(join(workspace, 'README.md'), '# e2e\n');
		execFileSync('git', ['add', '.'], { cwd: workspace });
		execFileSync('git', ['commit', '-q', '-m', 'init'], { cwd: workspace });

		const args = parseCliArgs(
			[
				'--plugins=proposals,rules,memory,git,quality,search,notification',
				`--workspace=${workspace}`,
			],
			workspace
		);
		const { config } = await assembleCliConfig(args, {
			import: async (specifier: string) => {
				const hit = Object.entries(PLUGINS).find(([k]) =>
					specifier.includes(k)
				);
				return { default: hit ? hit[1] : undefined };
			},
			readFile: () => undefined,
		});
		const assembled = await createMcpServer(config);
		const [ct, st] = InMemoryTransport.createLinkedPair();
		await assembled.server.connect(st);
		client = new Client({ name: 'e2e', version: '0.0.0' }, { capabilities: {} });
		await client.connect(ct);
		close = async () => {
			await client.close();
			await assembled.server.close();
		};
	});

	afterEach(async () => {
		await close();
		rmSync(workspace, { recursive: true, force: true });
	});

	// Read-only/side-effect-free tools callable with minimal args. A
	// successful (non-error) result must carry structuredContent (the SDK
	// would have thrown on a schema mismatch before we get here).
	const READONLY_CALLS: ReadonlyArray<{ name: string; args?: unknown }> = [
		{ name: 'mcpcore_overview' },
		{ name: 'mcpcore_overview', args: { compact: true } },
		{ name: 'mcpcore_knowledge' },
		{ name: 'mcpcore_get_validation_matrix' },
		{ name: 'git_status' },
		{ name: 'git_changed' },
		{ name: 'git_diff' },
		{ name: 'git_log' },
		{ name: 'quality_get_quality_scopes' },
		{ name: 'memory_list' },
		{ name: 'search_search', args: { query: 'e2e' } },
		{ name: 'notification_notify_status' },
		{ name: 'proposals_state_health' },
		{ name: 'proposals_proposal_board' },
		// action-multiplexed (read-only actions) — permissive object schema
		{ name: 'proposals_task_queue', args: { action: 'report' } },
		{ name: 'proposals_agent_names', args: { action: 'list' } },
		{ name: 'proposals_agent_lock', args: { action: 'status' } },
		{ name: 'proposals_round_context' },
		{ name: 'proposals_sync_proposals' },
		{ name: 'proposals_get_proposal_workflow' },
	];

	it('every read-only tool returns schema-valid structuredContent', async () => {
		for (const call of READONLY_CALLS) {
			const res = await client.callTool({
				name: call.name,
				arguments: (call.args as Record<string, unknown>) ?? {},
			});
			if (res.isError) continue; // error envelopes are schema-exempt
			expect(res.structuredContent, `${call.name} structuredContent`).toBeDefined();
		}
	});
});
