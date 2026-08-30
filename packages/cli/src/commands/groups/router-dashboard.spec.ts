/**
 * Unit tests for the `router dashboard` CLI command (f00140 S2).
 *
 * The command is a thin 1:1 projection: it pulls `auto_status` + one
 * `auto_recommend` per task type + `usage_report` (grouped by provider)
 * and pipes them through the shared `buildDashboard` view-model. `ctx.request`
 * is a recording stub — no MCP server, no fs.
 */
import { describe, expect, it } from 'vitest';

import type {
	ICliCommand,
	ICliCommandContext,
} from '../../contracts/interfaces/cli-command.interface';
import { routerDashboardCommands } from './router-dashboard';

const cheapProvider = {
	id: 'cheap',
	label: 'cheap',
	source: 'api',
	vendor: 'cheap',
	reach: 'CHEAP_KEY',
	costTier: 1,
};

const midProvider = {
	id: 'mid',
	label: 'mid',
	source: 'api',
	vendor: 'mid',
	reach: 'MID_KEY',
	costTier: 3,
};

const strongProvider = {
	id: 'strong',
	label: 'strong',
	source: 'cli',
	vendor: 'strong',
	reach: 'STRONG_BIN',
	costTier: 5,
};

const stubReplyFor = (tool: string, args: object): unknown => {
	if (tool === 'mcp-vertex_auto-agent-selector_auto_status') {
		return {
			available: [cheapProvider, midProvider, strongProvider],
			missing: [],
			availableCount: 3,
			persisted: true,
		};
	}
	if (tool === 'mcp-vertex_auto-agent-selector_auto_recommend') {
		const taskType = (args as { taskType?: string }).taskType ?? '';
		// mid is "best" for every task type — easiest deterministic ordering.
		return {
			ranked: [
				{
					candidate: midProvider,
					score: 10,
					rationale: `best value for task ${taskType}`,
					pinned: false,
				},
				{
					candidate: cheapProvider,
					score: 5,
					rationale: 'cheapest',
					pinned: false,
				},
				{
					candidate: strongProvider,
					score: 1,
					rationale: 'strongest',
					pinned: false,
				},
			],
		};
	}
	if (tool === 'mcp-vertex_usage-tracking_usage_report') {
		return {
			groupBy: 'provider',
			windowDays: 7,
			totals: {
				calls: 4,
				inputTokens: 0,
				outputTokens: 0,
				totalTokens: 0,
				costUsd: 0.18,
				tokensSaved: 0,
				savingsPercent: 0,
				errors: 0,
				autoBypassed: 0,
			},
			buckets: [
				{ key: 'cheap', calls: 2, costUsd: 0.08 },
				{ key: 'mid', calls: 1, costUsd: 0.1 },
				{ key: 'orphan', calls: 1, costUsd: 0.42 },
			],
			expensiveCalls: [],
		};
	}
	throw new Error(`unexpected tool call: ${tool} ${JSON.stringify(args)}`);
};

const buildStubContext = (): {
	ctx: ICliCommandContext;
	calls: { tool: string; args: object }[];
} => {
	const calls: { tool: string; args: object }[] = [];
	const ctx: ICliCommandContext = {
		cwd: '/workspace',
		globals: {
			workspace: '/workspace',
			json: false,
			format: 'text',
			lang: 'en',
			noColor: false,
			plugins: [],
		},
		request: async <TOut>(
			tool: string,
			args: object = {},
		): Promise<TOut> => {
			calls.push({ tool, args });
			return stubReplyFor(tool, args) as TOut;
		},
		listTools: async () => [],
		close: async () => {},
	};
	return { ctx, calls };
};

const find = (name: string): ICliCommand => {
	const command = routerDashboardCommands.find((c) => c.name === name);
	if (command === undefined) throw new Error(`missing command: ${name}`);
	return command;
};

describe('router dashboard group', () => {
	it('exposes only the dashboard command', () => {
		expect(routerDashboardCommands.map((c) => c.name)).toEqual([
			'router-dashboard',
		]);
	});

	it('text mode pulls auto_status + auto_recommend + usage_report and renders a table', async () => {
		const { ctx, calls } = buildStubContext();
		const result = await find('router-dashboard').run([], ctx);
		// 1 status + 4 default task types + 1 usage_report.
		expect(calls.length).toBe(6);
		expect(calls[0]?.tool).toBe(
			'mcp-vertex_auto-agent-selector_auto_status',
		);
		expect(
			calls.some(
				(c) => c.tool === 'mcp-vertex_usage-tracking_usage_report',
			),
		).toBe(true);
		expect(result.code).toBe(0);
		expect(result.text ?? '').toContain('mcp-vertex router-dashboard');
		expect(result.text ?? '').toContain('mid'); // best-ranked row label
		expect(result.text ?? '').toContain('orphan'); // spend-only provider appears
	});

	it('--task narrows the recommendation set', async () => {
		const { ctx, calls } = buildStubContext();
		await find('router-dashboard').run(['--task=code-edit'], ctx);
		// 1 status + 1 recommend + 1 usage.
		expect(
			calls.filter((c) => c.tool.endsWith('_auto_recommend')).length,
		).toBe(1);
	});

	it('defaults to 4 task types when --task is omitted', async () => {
		const { ctx, calls } = buildStubContext();
		await find('router-dashboard').run([], ctx);
		expect(
			calls.filter((c) => c.tool.endsWith('_auto_recommend')).length,
		).toBe(4);
	});

	it('--pin writes through auto_recommend', async () => {
		const { ctx, calls } = buildStubContext();
		await find('router-dashboard').run(['--pin=cheap'], ctx);
		const pinCall = calls.find((c) => {
			if (!c.tool.endsWith('_auto_recommend')) return false;
			return (c.args as { pin?: string }).pin === 'cheap';
		});
		expect(pinCall).toBeDefined();
	});

	it('json mode returns the view-model as data', async () => {
		const { ctx } = buildStubContext();
		const result = await find('router-dashboard').run(['--json'], ctx);
		expect(result.code).toBe(0);
		const data = result.data as {
			rows: { providerId: string }[];
			totalSpendUsd: number;
		};
		expect(data.rows.map((r) => r.providerId)).toEqual([
			'mid',
			'cheap',
			'strong',
			'orphan',
		]);
		expect(data.totalSpendUsd).toBeCloseTo(0.6);
	});

	it('surfaces spend-only providers with the right note', async () => {
		const { ctx } = buildStubContext();
		const result = await find('router-dashboard').run(['--json'], ctx);
		const data = result.data as {
			rows: { providerId: string; note: string }[];
		};
		const orphan = data.rows.find((r) => r.providerId === 'orphan');
		expect(orphan?.note).toBe('spend recorded but not in current roster');
	});
});
