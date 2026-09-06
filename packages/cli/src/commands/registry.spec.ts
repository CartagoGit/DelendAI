import { describe, expect, it } from 'vitest';

import type { ICliCommandContext } from '../contracts/interfaces/cli-command.interface';
import { registerAllCommands } from './registry';

/** Minimal fake context: `request` answers with a canned `delendai_overview`
 * snapshot regardless of the tool name, matching how every command here
 * only ever calls `overview()` for plugin/tool introspection. */
const fakeOverviewCtx = (
	overrides: Partial<ICliCommandContext['globals']> = {},
): ICliCommandContext => ({
	cwd: '/workspace',
	globals: {
		workspace: '/workspace',
		json: true,
		format: 'json',
		lang: 'en',
		noColor: true,
		plugins: [],
		...overrides,
	},
	request: async () =>
		({
			namespacePrefix: 'delendai',
			plugins: [
				{ name: 'core' },
				{ name: 'proposals' },
				{ name: 'search' },
			],
			tools: [
				{ name: 'delendai_overview' },
				{ name: 'delendai_status' },
				{ name: 'delendai_proposals_agent_lock' },
				{ name: 'delendai_proposals_close_slice' },
				{ name: 'delendai_search_search' },
			],
		}) as never,
	listTools: async () => [],
	close: async () => {},
});

const EXPECTED_COMMANDS = [
	'status',
	'overview',
	'plugin list',
	'plugin inspect',
	'alias',
	'metrics',
	'validate-matrix',
	'validate',
	'config schema',
	'config show',
	'config get',
	'config doctor',
	'config set',
	'init',
	'init:default',
	'init:global',
	'search',
	'docs list',
	'docs read',
	'scaffold',
	'git status',
	'git changed',
	'git diff',
	'git log',
	'git blame',
	'git show',
	'git worktree',
	'git changelog',
	'git pr-list',
	'git pr-view',
	'agents status',
	'agents recommend',
	'agents record',
	'agents run',
	'memory save',
	'memory recall',
	'memory list',
	'memory forget',
	'memory export',
	'memory import',
	'deps list',
	'deps check',
	'deps polyglot',
	'deps licenses',
	'deps audit',
	'rules get',
	'rules check',
	'rules apply',
	'test-convention get',
	'test-convention suggest',
	'test-convention scan',
	'quality scopes',
	'quality run',
	'quality cancel',
	'quality run-all',
	'audit plan',
	'audit consolidate',
	'logs query',
	'logs tail',
	'logs errors-tail',
	'logs subscribe',
	'logs correlate',
	'logs redact-test',
	'fs read',
	'fs write',
	'knowledge',
	'adopt',
	'project analyze',
	'project plan',
	'project create',
	'plugin new',
	'docs search',
	'proposals auto-work',
	'proposals continue',
	'proposals create',
	'proposals close-slice',
	'proposals transition',
	'proposals board',
	'proposals status',
	'proposals health',
	'proposals agent-names',
	'proposals lock',
	'proposals worktree',
	'proposals stale-list',
	'proposals round-context',
	'proposals workflow',
	'proposals diagnose',
	'proposals adopt',
	'proposals force-transition',
	'proposals reconcile-folder',
	'proposals state-repair',
	'proposals release-orphan',
	'proposals review',
	'proposals sync',
	'proposals task-queue',
	'proposals delegate',
	'proposals plan',
	'plugin search',
	'plugin add',
	'project-plugin create',
	'project-plugin inspect',
	'project-plugin repair',
	'notification status',
	'notification await-lock',
	'kpis',
	'web-fetch',
	'status-marker close',
	'status-marker validate',
	'status-marker ping',
	'conventions check',
	'conventions plan',
	'conventions apply',
	'doctor',
	'completion',
	'usage-tracking report',
	'usage-tracking clear',
	'security secrets',
	'security audit',
	'router-dashboard',
] as const;

describe('CLI command registry', async () => {
	it('registers the complete public command surface', async () => {
		const names = (await registerAllCommands()).map(
			(command) => command.name,
		);
		expect(names).toEqual(EXPECTED_COMMANDS);
	});

	it('keeps every command documented with a summary', async () => {
		for (const command of await registerAllCommands()) {
			expect(command.summary.trim().length).toBeGreaterThan(0);
		}
	});

	it('does not register duplicate command names', async () => {
		const names = (await registerAllCommands()).map(
			(command) => command.name,
		);
		expect(new Set(names).size).toBe(names.length);
	});
});

// a00087: `plugin inspect <name>` used to filter tools by
// `tool.name.startsWith(\`${pluginName}_\`)`, but every real tool name is
// `${namespacePrefix}_${plugin}_${tool}` (core tools:
// `${namespacePrefix}_${tool}`, no plugin infix) — that prefix never
// matched a single real tool, so every plugin returned `tools: []`.
describe('plugin inspect (a00087)', async () => {
	const inspect = async (pluginName: string) => {
		const commands = await registerAllCommands();
		const command = commands.find((c) => c.name === 'plugin inspect');
		if (command === undefined)
			throw new Error('plugin inspect not registered');
		return command.run([pluginName], fakeOverviewCtx());
	};

	it("finds a namespaced plugin's tools by the real prefix convention", async () => {
		const result = await inspect('proposals');
		const data = result.data as { plugin: string; tools: unknown[] };
		expect(data.plugin).toBe('proposals');
		expect(data.tools).toHaveLength(2);
		expect(
			(data.tools as Array<{ name: string }>).map((t) => t.name),
		).toEqual([
			'delendai_proposals_agent_lock',
			'delendai_proposals_close_slice',
		]);
	});

	it('finds only core tools for "core", never another plugin\'s tools', async () => {
		const result = await inspect('core');
		const data = result.data as { tools: Array<{ name: string }> };
		expect(data.tools.map((t) => t.name)).toEqual([
			'delendai_overview',
			'delendai_status',
		]);
	});

	it('returns NOT_FOUND for a plugin with no matching tools', async () => {
		const result = await inspect('does-not-exist');
		expect(result.code).not.toBe(0);
		const data = result.data as { tools: unknown[] };
		expect(data.tools).toEqual([]);
	});
});

// a00087: `status`/`overview`/`metrics`/`validate-matrix`/`config *`/
// `search`/`docs *`/`scaffold`/`plugin inspect` returned bare `data(...)`
// with no bespoke human formatter — completely silent (exit 0, zero
// stdout/stderr) whenever `--json` was not passed. `dataOrText` fixes
// this by routing through the always-emitted `.text` channel instead.
describe('dataOrText fallback (a00087)', async () => {
	it('emits .data (not .text) in --json mode', async () => {
		const commands = await registerAllCommands();
		const status = commands.find((c) => c.name === 'status');
		if (status === undefined) throw new Error('status not registered');
		const result = await status.run([], fakeOverviewCtx({ json: true }));
		expect(result.data).toBeDefined();
		expect(result.text).toBeUndefined();
	});

	it('emits .text (never silently nothing) outside --json mode', async () => {
		const commands = await registerAllCommands();
		const status = commands.find((c) => c.name === 'status');
		if (status === undefined) throw new Error('status not registered');
		const result = await status.run(
			[],
			fakeOverviewCtx({ json: false, format: 'text' }),
		);
		expect(result.data).toBeUndefined();
		expect(result.text).toBeDefined();
		expect(result.text?.trim().length).toBeGreaterThan(0);
	});
});
