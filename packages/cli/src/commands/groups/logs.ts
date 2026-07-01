/**
 * f00046 S4 — logs commands. One subcommand per `logs_*` MCP tool.
 * Pure 1:1 delegation over the redacted append-only MCP log store.
 *
 * Tools mapped:
 *   - `mcp-vertex_logs_query`       ({ since?, until?, kind?, agent?, taskId?, outcome?, limit?, cursor? })
 *   - `mcp-vertex_logs_tail`        ({ kindFilter?, outcomeFilter?, limit? })
 *   - `mcp-vertex_logs_subscribe`   ({ kindFilter?, outcomeFilter?, limit? })
 *   - `mcp-vertex_logs_correlate`   ({ taskId?, agent?, since?, until? })
 *   - `mcp-vertex_logs_redact_test` ({ text })
 */
import type { ICliCommand } from '../../contracts/interfaces/cli-command.interface';
import {
	data,
	numberArg,
	positionalArg,
	request,
	scalarArg,
	usage,
} from './group-helpers';

const logsQueryCommand: ICliCommand = {
	name: 'logs query',
	summary: 'Query redacted MCP log events with filters + cursor pagination.',
	async run(args, ctx) {
		const since = scalarArg(args, 'since');
		const until = scalarArg(args, 'until');
		const kind = scalarArg(args, 'kind');
		const agent = scalarArg(args, 'agent');
		const taskId = scalarArg(args, 'task') ?? scalarArg(args, 'taskId');
		const outcome = scalarArg(args, 'outcome');
		const limit = numberArg(args, 'limit') ?? numberArg(args, 'max');
		const cursor = scalarArg(args, 'cursor');
		return data(
			await request(ctx, 'mcp-vertex_logs_query', {
				...(since !== undefined ? { since } : {}),
				...(until !== undefined ? { until } : {}),
				...(kind !== undefined ? { kind } : {}),
				...(agent !== undefined ? { agent } : {}),
				...(taskId !== undefined ? { taskId } : {}),
				...(outcome !== undefined ? { outcome } : {}),
				...(limit !== undefined ? { limit } : {}),
				...(cursor !== undefined ? { cursor } : {}),
			}),
		);
	},
};

const logsTailCommand: ICliCommand = {
	name: 'logs tail',
	summary: 'Show the newest redacted MCP log events.',
	async run(args, ctx) {
		const kindFilter = scalarArg(args, 'kind');
		const outcomeFilter = scalarArg(args, 'outcome');
		const limit = numberArg(args, 'limit') ?? numberArg(args, 'max');
		return data(
			await request(ctx, 'mcp-vertex_logs_tail', {
				...(kindFilter !== undefined ? { kindFilter } : {}),
				...(outcomeFilter !== undefined ? { outcomeFilter } : {}),
				...(limit !== undefined ? { limit } : {}),
			}),
		);
	},
};

const logsSubscribeCommand: ICliCommand = {
	name: 'logs subscribe',
	summary: 'Return recent log events matching outcome/kind filters (poll).',
	async run(args, ctx) {
		const kindFilter = scalarArg(args, 'kind');
		const outcomeFilter = scalarArg(args, 'outcome');
		const limit = numberArg(args, 'limit') ?? numberArg(args, 'max');
		return data(
			await request(ctx, 'mcp-vertex_logs_subscribe', {
				...(kindFilter !== undefined ? { kindFilter } : {}),
				...(outcomeFilter !== undefined ? { outcomeFilter } : {}),
				...(limit !== undefined ? { limit } : {}),
			}),
		);
	},
};

const logsCorrelateCommand: ICliCommand = {
	name: 'logs correlate',
	summary:
		'Build a chronological chain for one taskId or agent (gap detection).',
	async run(args, ctx) {
		const taskId = scalarArg(args, 'task') ?? scalarArg(args, 'taskId');
		const agent = scalarArg(args, 'agent');
		const since = scalarArg(args, 'since');
		const until = scalarArg(args, 'until');
		return data(
			await request(ctx, 'mcp-vertex_logs_correlate', {
				...(taskId !== undefined ? { taskId } : {}),
				...(agent !== undefined ? { agent } : {}),
				...(since !== undefined ? { since } : {}),
				...(until !== undefined ? { until } : {}),
			}),
		);
	},
};

const logsRedactTestCommand: ICliCommand = {
	name: 'logs redact-test',
	summary:
		'Run the redactor against a sample and list detected secret patterns.',
	async run(args, ctx) {
		const text = positionalArg(args) ?? scalarArg(args, 'text');
		if (text === undefined) return usage('logs redact-test <text>');
		return data(
			await request(ctx, 'mcp-vertex_logs_redact_test', { text }),
		);
	},
};

export const logsCommands: readonly ICliCommand[] = [
	logsQueryCommand,
	logsTailCommand,
	logsSubscribeCommand,
	logsCorrelateCommand,
	logsRedactTestCommand,
];
