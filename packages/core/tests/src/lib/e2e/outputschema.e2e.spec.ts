import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { assembleCliConfig } from '@delendai/core/lib/cli/assemble';
import { createMcpProject } from '@delendai/core/lib/project/create-mcp-project';
import { parseCliArgs } from '@delendai/core/lib/plugins/parse-cli-args';

import proposalsPlugin from '@delendai/proposals';
import rulesPlugin from '@delendai/rules';
import memoryPlugin from '@delendai/memory';
import gitPlugin from '@delendai/git';
import qualityPlugin from '@delendai/quality';
import searchPlugin from '@delendai/search';
import notificationPlugin from '@delendai/notification';
import docsPlugin from '@delendai/docs';
import depsPlugin from '@delendai/deps';

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

const seedClosePlanFixture = (
	workspace: string,
	input: {
		readonly id: string;
		readonly status: 'in-progress' | 'done';
		readonly body?: string;
	},
) => {
	const proposalsDir = join(workspace, 'docs', 'delendai', 'proposals');
	const folder = input.status === 'done' ? 'done/plans' : 'in-progress';
	const file = `${folder}/${input.id}-fixture.md`;
	mkdirSync(join(proposalsDir, folder), { recursive: true });
	writeFileSync(
		join(proposalsDir, file),
		[
			'---',
			`id: ${input.id}`,
			'type: plan',
			`status: ${input.status}`,
			'shippedIn: 0.0.0-test',
			'---',
			'',
			'# fixture',
			'',
			input.body ?? '## Goal\n\nok\n',
		].join('\n'),
	);
	mkdirSync(join(workspace, '.cache', 'delendai', 'proposals'), {
		recursive: true,
	});
	writeFileSync(
		join(workspace, '.cache', 'delendai', 'proposals', 'index.json'),
		JSON.stringify({
			proposals: [
				{
					id: input.id,
					file,
					status: input.status,
					type: 'plan',
				},
			],
		}),
	);
};

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

		// r00026 (TOK-004): pin native — this suite validates every
		// registered tool's outputSchema directly by name, not surface
		// negotiation (adaptive is now the default for a plain client).
		const args = parseCliArgs(
			[
				'--plugins=proposals,rules,memory,git,quality,search,notification,docs,deps',
				`--workspace=${workspace}`,
				'--surface=native',
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
		{ name: 'delendai_overview' },
		{ name: 'delendai_overview', args: { compact: true } },
		{ name: 'delendai_knowledge' },
		{ name: 'delendai_get_validation_matrix' },
		{ name: 'delendai_status' },
		{ name: 'delendai_metrics' },
		{ name: 'delendai_analyze_project' },
		// r00002 S1: hardened outputSchemas — side-effect-free (returns files
		// for the agent to write; never touches disk itself).
		{ name: 'delendai_create_project', args: { kind: 'plugin' } },
		{ name: 'delendai_plan_mcp_project' },
		// r00002 S2: dryRun defaults true — returns files without writing.
		{ name: 'delendai_scaffold', args: { kind: 'tool', name: 'demo' } },
		{ name: 'delendai_git_status' },
		{ name: 'delendai_git_changed' },
		{ name: 'delendai_git_diff' },
		{ name: 'delendai_git_log' },
		{ name: 'delendai_quality_get_quality_scopes' },
		{ name: 'delendai_memory_list' },
		{ name: 'delendai_search_search', args: { query: 'e2e' } },
		{ name: 'delendai_notification_notify_status' },
		{ name: 'delendai_docs_docs_list' },
		{ name: 'delendai_docs_docs_read', args: { path: 'README.md' } },
		{ name: 'delendai_deps_deps_list' },
		{ name: 'delendai_deps_deps_check' },
		{ name: 'delendai_proposals_state_health' },
		{ name: 'delendai_proposals_proposal_board' },
		{ name: 'delendai_proposals_compact_status' },
		{
			name: 'delendai_proposals_compact_status',
			args: { fields: ['locks'] },
		},
		{ name: 'delendai_proposals_auto_work' },
		// action-multiplexed (read-only actions) — permissive object schema
		{ name: 'delendai_proposals_task_queue', args: { action: 'report' } },
		{ name: 'delendai_proposals_agent_names', args: { action: 'list' } },
		{ name: 'delendai_proposals_agent_lock', args: { action: 'status' } },
		{ name: 'delendai_proposals_round_context' },
		{ name: 'delendai_proposals_sync_proposals' },
		{ name: 'delendai_proposals_get_proposal_workflow' },
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
			name: 'delendai_overview',
			arguments: {},
		});
		const tools = (
			res.structuredContent as {
				tools: Array<{ name: string; effects?: string[] }>;
			}
		).tools;
		const effOf = (name: string) =>
			tools.find((t) => t.name === name)?.effects;
		expect(effOf('delendai_memory_save')).toContain('write');
		expect(effOf('delendai_memory_forget')).toEqual(
			expect.arrayContaining(['write', 'destructive']),
		);
		expect(effOf('delendai_quality_run_quality')).toContain('spawn');
		expect(effOf('delendai_proposals_create_proposal')).toContain('write');
		// genuinely read-only tools advertise no effects
		expect(effOf('delendai_git_status')).toBeUndefined();
		expect(effOf('delendai_search_search')).toBeUndefined();
		expect(effOf('delendai_overview')).toBeUndefined();
	});

	it('overview keeps the full payload in structuredContent and a compact summary in text', async () => {
		const res = await client.callTool({
			name: 'delendai_overview',
			arguments: {},
		});
		const text = (res.content as Array<{ text?: string }>)[0]?.text ?? '';
		expect(JSON.parse(text)).toMatch(
			/^overview: \d+ plugins, \d+ tools, \d+ knowledge ids/,
		);
		expect(text).not.toBe(JSON.stringify(res.structuredContent));
		expect(
			(res.structuredContent as { server?: unknown }).server,
		).toBeDefined();
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

	it('exposes proposals_close_plan with outputSchema on the native surface and validates a dry-run success over the protocol', async () => {
		seedClosePlanFixture(workspace, {
			id: 'q12345',
			status: 'in-progress',
		});
		const listed = await client.listTools();
		const closePlan = listed.tools.find(
			(tool) => tool.name === 'delendai_proposals_proposals_close_plan',
		) as { outputSchema?: unknown } | undefined;
		expect(closePlan?.outputSchema).toBeDefined();

		const result = await client.callTool({
			name: 'delendai_proposals_proposals_close_plan',
			arguments: { planId: 'q12345', dryRun: true },
		});
		expect(result.isError, 'close_plan dry-run').toBeFalsy();
		expect(
			result.structuredContent as {
				dryRun: boolean;
				wouldChange: Array<{ kind: string; summary: string }>;
			},
		).toMatchObject({
			dryRun: true,
			wouldChange: [
				{
					kind: 'rename',
					summary: 'move q12345 from in-progress to done',
				},
			],
		});
	});

	it('preserves proposals_close_plan outputSchema through managed lazy activation', async () => {
		const managedWorkspace = mkdtempSync(join(tmpdir(), 'e2e-os-managed-'));
		execFileSync('git', ['init', '-q'], { cwd: managedWorkspace });
		writeFileSync(join(managedWorkspace, 'README.md'), '# managed\n');
		seedClosePlanFixture(managedWorkspace, {
			id: 'q54321',
			status: 'in-progress',
		});
		const args = parseCliArgs(
			[
				'--plugins=proposals',
				`--workspace=${managedWorkspace}`,
				'--surface=managed',
			],
			managedWorkspace,
		);
		const { config } = await assembleCliConfig(args, {
			import: async () => ({ default: proposalsPlugin }),
			readFile: async () => undefined,
		});
		const assembled = await createMcpProject(config);
		const [ct, st] = InMemoryTransport.createLinkedPair();
		await assembled.server.connect(st);
		const managedClient = new Client(
			{ name: 'claude-code', version: '1.0.0' },
			{ capabilities: {} },
		);
		await managedClient.connect(ct);
		try {
			const initial = await managedClient.listTools();
			expect(initial.tools.map((tool) => tool.name)).not.toContain(
				'delendai_proposals_proposals_close_plan',
			);

			const activated = await managedClient.callTool({
				name: 'delendai_plugin_activate',
				arguments: { plugin: 'proposals' },
			});
			expect(activated.isError, 'plugin_activate proposals').toBeFalsy();

			const listed = await managedClient.listTools();
			const closePlan = listed.tools.find(
				(tool) =>
					tool.name === 'delendai_proposals_proposals_close_plan',
			) as { outputSchema?: unknown } | undefined;
			expect(closePlan?.outputSchema).toBeDefined();

			const result = await managedClient.callTool({
				name: 'delendai_proposals_proposals_close_plan',
				arguments: { planId: 'q54321', dryRun: true },
			});
			expect(result.isError, 'managed close_plan dry-run').toBeFalsy();
			expect(
				result.structuredContent as {
					dryRun: boolean;
					wouldChange: Array<{ kind: string; summary: string }>;
				},
			).toMatchObject({
				dryRun: true,
				wouldChange: [
					{
						kind: 'rename',
						summary: 'move q54321 from in-progress to done',
					},
				],
			});
		} finally {
			await managedClient.close();
			await assembled.server.close();
			rmSync(managedWorkspace, { recursive: true, force: true });
		}
	});

	it('coordinates proposals locks with notification await_lock over MCP', async () => {
		const claimed = await client.callTool({
			name: 'delendai_proposals_agent_lock',
			arguments: {
				action: 'claim',
				task_id: 'task-owner',
				agent: 'agent-owner',
				files: ['src/shared.ts'],
				onContention: 'fail',
			},
		});
		expect(claimed.isError, 'initial lock claim').toBeFalsy();
		expect((claimed.structuredContent as { ok?: boolean }).ok).toBe(true);

		const conflict = await client.callTool({
			name: 'delendai_proposals_agent_lock',
			arguments: {
				action: 'claim',
				task_id: 'task-waiter',
				agent: 'agent-waiter',
				files: ['src/shared.ts'],
				onContention: 'fail',
			},
		});
		expect(conflict.isError, 'lock conflict response').toBeFalsy();
		expect(
			(
				conflict.structuredContent as {
					blocked?: boolean;
					conflicting_task?: string;
				}
			).blocked,
		).toBe(true);
		expect(
			(conflict.structuredContent as { conflicting_task?: string })
				.conflicting_task,
		).toBe('task-owner');

		const waiting = client.callTool({
			name: 'delendai_notification_await_lock',
			arguments: { taskId: 'task-owner', timeoutMs: 2_000 },
		});
		await new Promise((resolve) => setTimeout(resolve, 50));

		const released = await client.callTool({
			name: 'delendai_proposals_agent_lock',
			arguments: {
				action: 'release',
				task_id: 'task-owner',
				agent: 'agent-owner',
			},
		});
		expect(released.isError, 'lock release response').toBeFalsy();
		expect((released.structuredContent as { ok?: boolean }).ok).toBe(true);

		const waited = await waiting;
		expect(waited.isError, 'await_lock response').toBeFalsy();
		expect(waited.structuredContent).toMatchObject({
			taskId: 'task-owner',
			released: true,
			timedOut: false,
			alreadyFree: false,
		});

		const retried = await client.callTool({
			name: 'delendai_proposals_agent_lock',
			arguments: {
				action: 'claim',
				task_id: 'task-waiter',
				agent: 'agent-waiter',
				files: ['src/shared.ts'],
				onContention: 'fail',
			},
		});
		expect(retried.isError, 'retry after await_lock').toBeFalsy();
		expect((retried.structuredContent as { ok?: boolean }).ok).toBe(true);

		const timedOut = await client.callTool({
			name: 'delendai_notification_await_lock',
			arguments: { taskId: 'task-waiter', timeoutMs: 1_000 },
		});
		expect(timedOut.isError, 'await_lock timeout response').toBeFalsy();
		expect(timedOut.structuredContent).toMatchObject({
			taskId: 'task-waiter',
			released: false,
			timedOut: true,
			alreadyFree: false,
		});

		const finalRelease = await client.callTool({
			name: 'delendai_proposals_agent_lock',
			arguments: {
				action: 'release',
				task_id: 'task-waiter',
				agent: 'agent-waiter',
			},
		});
		expect(finalRelease.isError, 'final lock release response').toBeFalsy();
		expect((finalRelease.structuredContent as { ok?: boolean }).ok).toBe(
			true,
		);
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
			'delendai_analyze_project',
			'delendai_create_project',
			'delendai_plan_mcp_project',
			'delendai_scaffold',
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
			name: 'delendai_proposals_create_proposal',
			arguments: {
				id: 'f00001',
				title: 'demo',
				slices: [{ sliceId: 's1', files: ['src/a.ts'] }],
			},
		});
		expect(created.isError, 'create_proposal').toBeFalsy();
		const cs = created.structuredContent as { ok: boolean; file: string };
		expect(cs.ok).toBe(true);
		expect(cs.file).toContain('f00001');

		const closed = await client.callTool({
			name: 'delendai_proposals_close_slice',
			arguments: { proposalId: 'f00001', sliceId: 's1', force: true },
		});
		expect(closed.isError, 'close_slice').toBeFalsy();
		expect((closed.structuredContent as { closed: boolean }).closed).toBe(
			true,
		);
	});
});
