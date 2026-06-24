import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { assembleCliConfig } from '@mcp-vertex/core/lib/cli/assemble';
import { createMcpProject } from '@mcp-vertex/core/lib/project/create-mcp-project';
import { parseCliArgs } from '@mcp-vertex/core/lib/plugins/parse-cli-args';

import proposalsPlugin from '@mcp-vertex/proposals';
import rulesPlugin from '@mcp-vertex/rules';
import memoryPlugin from '@mcp-vertex/memory';
import gitPlugin from '@mcp-vertex/git';
import qualityPlugin from '@mcp-vertex/quality';
import searchPlugin from '@mcp-vertex/search';
import notificationPlugin from '@mcp-vertex/notification';
import docsPlugin from '@mcp-vertex/docs';
import depsPlugin from '@mcp-vertex/deps';

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
	'mcp-docs': docsPlugin,
	'mcp-deps': depsPlugin,
} as const;

describe('e2e: outputSchema validation over the protocol (N16)', async () => {
	let workspace = '';
	let client: Client;
	let close: () => Promise<void>;

	beforeEach(async () => {
		workspace = mkdtempSync(join(tmpdir(), 'e2e-os-'));
		// A real git repo so the git tools hit their success path.
		execFileSync('git', ['init', '-q'], { cwd: workspace });
		execFileSync('git', ['config', 'user.email', 't@t.t'], {
			cwd: workspace,
		});
		execFileSync('git', ['config', 'user.name', 'T'], { cwd: workspace });
		writeFileSync(join(workspace, 'README.md'), '# e2e\n');
		execFileSync('git', ['add', '.'], { cwd: workspace });
		execFileSync('git', ['commit', '-q', '-m', 'init'], { cwd: workspace });

		const args = parseCliArgs(
			[
				'--plugins=proposals,rules,memory,git,quality,search,notification,docs,deps',
				`--workspace=${workspace}`,
			],
			workspace,
		);
		const { config } = await assembleCliConfig(args, {
			import: async (specifier: string) => {
				const hit = Object.entries(PLUGINS).find(([k]) =>
					specifier.includes(k),
				);
				return { default: hit ? hit[1] : undefined };
			},
			readFile: async () => undefined,
		});
		const assembled = await createMcpProject(config);
		const [ct, st] = InMemoryTransport.createLinkedPair();
		await assembled.server.connect(st);
		client = new Client(
			{ name: 'e2e', version: '0.0.0' },
			{ capabilities: {} },
		);
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
		{ name: 'mcp-vertex_overview' },
		{ name: 'mcp-vertex_overview', args: { compact: true } },
		{ name: 'mcp-vertex_knowledge' },
		{ name: 'mcp-vertex_get_validation_matrix' },
		{ name: 'mcp-vertex_status' },
		{ name: 'mcp-vertex_metrics' },
		{ name: 'mcp-vertex_analyze_project' },
		// r00002 S1: hardened outputSchemas — side-effect-free (returns files
		// for the agent to write; never touches disk itself).
		{ name: 'mcp-vertex_create_project', args: { kind: 'plugin' } },
		{ name: 'mcp-vertex_plan_mcp_project' },
		// r00002 S2: dryRun defaults true — returns files without writing.
		{ name: 'mcp-vertex_scaffold', args: { kind: 'tool', name: 'demo' } },
		{ name: 'git_status' },
		{ name: 'git_changed' },
		{ name: 'git_diff' },
		{ name: 'git_log' },
		{ name: 'quality_get_quality_scopes' },
		{ name: 'memory_list' },
		{ name: 'search_search', args: { query: 'e2e' } },
		{ name: 'notification_notify_status' },
		{ name: 'docs_docs_list' },
		{ name: 'docs_docs_read', args: { path: 'README.md' } },
		{ name: 'deps_deps_list' },
		{ name: 'deps_deps_check' },
		{ name: 'proposals_state_health' },
		{ name: 'proposals_proposal_board' },
		{ name: 'proposals_compact_status' },
		{ name: 'proposals_compact_status', args: { fields: ['locks'] } },
		{ name: 'proposals_auto_work' },
		// action-multiplexed (read-only actions) — permissive object schema
		{ name: 'proposals_task_queue', args: { action: 'report' } },
		{ name: 'proposals_agent_names', args: { action: 'list' } },
		{ name: 'proposals_agent_lock', args: { action: 'status' } },
		{ name: 'proposals_round_context' },
		{ name: 'proposals_sync_proposals' },
		{ name: 'proposals_get_proposal_workflow' },
	];

	it('every read-only tool returns schema-valid structuredContent', async () => {
		const broken: string[] = [];
		for (const call of READONLY_CALLS) {
			const res = await client.callTool({
				name: call.name,
				arguments: (call.args as Record<string, unknown>) ?? {},
			});
			// These read-only calls must SUCCEED with structuredContent. A
			// tool with an outputSchema that returns no structuredContent
			// makes the SDK fail output validation → isError.
			if (res.isError || res.structuredContent === undefined) {
				const txt =
					(res.content as Array<{ text?: string }>)?.[0]?.text ?? '';
				broken.push(`${call.name}: ${txt.slice(0, 120)}`);
			}
		}
		expect(broken, 'tools whose outputSchema is unsatisfied').toEqual([]);
	});

	// M31: overview surfaces per-tool side effects; read-only tools have none.
	it('overview declares tool side-effects (write/spawn) and omits them for read-only tools', async () => {
		const res = await client.callTool({
			name: 'mcp-vertex_overview',
			arguments: {},
		});
		const tools = (
			res.structuredContent as {
				tools: Array<{ name: string; effects?: string[] }>;
			}
		).tools;
		const effOf = (name: string) =>
			tools.find((t) => t.name === name)?.effects;
		expect(effOf('memory_save')).toContain('write');
		expect(effOf('memory_forget')).toEqual(
			expect.arrayContaining(['write', 'destructive']),
		);
		expect(effOf('quality_run_quality')).toContain('spawn');
		expect(effOf('proposals_create_proposal')).toContain('write');
		// genuinely read-only tools advertise no effects
		expect(effOf('git_status')).toBeUndefined();
		expect(effOf('search_search')).toBeUndefined();
		expect(effOf('mcp-vertex_overview')).toBeUndefined();
	});

	// M24: every public tool must declare an outputSchema (a permissive
	// catchall object is allowed for action-multiplexed tools, but `undefined`
	// is not). This guard fails the build the moment a new tool ships without one.
	it('every registered tool declares an outputSchema', async () => {
		const { tools } = await client.listTools();
		const missing = tools
			.filter(
				(t) =>
					(t as { outputSchema?: unknown }).outputSchema ===
					undefined,
			)
			.map((t) => t.name);
		expect(missing, 'tools missing an outputSchema').toEqual([]);
		expect(tools.length).toBeGreaterThan(20);
	});

	// r00002 S1: the 3 bootstrap tools used to declare
	// `z.object({}).catchall(z.unknown())` (a00026-H3). Their outputSchema
	// is now derived from IProjectAnalysis/IServerPlan/IScaffoldedFile/
	// IServerBlueprint — assert the generated JSON Schema's root is no
	// longer a permissive catchall (no `additionalProperties: true`/`{}`
	// at the top level, and concrete `properties` are declared).
	it('hardened bootstrap tool outputSchemas are no longer permissive catchalls', async () => {
		const { tools } = await client.listTools();
		const HARDENED = [
			'mcp-vertex_analyze_project',
			'mcp-vertex_create_project',
			'mcp-vertex_plan_mcp_project',
			'mcp-vertex_scaffold',
		];
		for (const name of HARDENED) {
			const schema = tools.find((t) => t.name === name)?.outputSchema as
				| {
						properties?: Record<string, unknown>;
						additionalProperties?: unknown;
				  }
				| undefined;
			expect(schema, `${name} outputSchema`).toBeDefined();
			expect(
				Object.keys(schema?.properties ?? {}).length,
				`${name} outputSchema.properties should be concrete, not empty`,
			).toBeGreaterThan(0);
			expect(
				schema?.additionalProperties,
				`${name} outputSchema should not permit arbitrary extra properties`,
			).not.toBe(true);
		}
	});

	it('validates write-tool outputSchemas over the protocol (create_proposal → close_slice)', async () => {
		const created = await client.callTool({
			name: 'proposals_create_proposal',
			arguments: {
				id: 'p1',
				title: 'demo',
				slices: [{ sliceId: 's1', files: ['src/a.ts'] }],
			},
		});
		expect(created.isError, 'create_proposal').toBeFalsy();
		const cs = created.structuredContent as { ok: boolean; file: string };
		expect(cs.ok).toBe(true);
		expect(cs.file).toContain('p1');

		const closed = await client.callTool({
			name: 'proposals_close_slice',
			arguments: { proposalId: 'p1', sliceId: 's1' },
		});
		expect(closed.isError, 'close_slice').toBeFalsy();
		expect((closed.structuredContent as { closed: boolean }).closed).toBe(
			true,
		);
	});
});
