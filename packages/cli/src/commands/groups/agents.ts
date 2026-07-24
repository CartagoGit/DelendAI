/**
 * agents commands — the CLI surface for the auto-agent-selector router.
 * Each subcommand delegates 1:1 to an `auto_*` MCP tool so a human can see
 * which LLM/agent is recommended (and calibrate it) straight from the
 * terminal, without an MCP client.
 *
 * Tools mapped:
 *   - `mcp-vertex_auto-agent-selector_auto_status`    (no args)
 *   - `mcp-vertex_auto-agent-selector_auto_recommend` ({ costQualityTradeoff?, pin? })
 *   - `mcp-vertex_auto-agent-selector_auto_record`    ({ providerId, success, taskType? })
 */
import { EXIT_CODE } from '../../contracts/constants/exit-code.constant';
import type { ICliCommand } from '../../contracts/interfaces/cli-command.interface';
import { data, request, scalarArg } from './group-helpers';

const STATUS = 'mcp-vertex_auto-agent-selector_auto_status';
const RECOMMEND = 'mcp-vertex_auto-agent-selector_auto_recommend';
const RECORD = 'mcp-vertex_auto-agent-selector_auto_record';

const agentsStatusCommand: ICliCommand = {
	name: 'agents status',
	summary:
		'Show reachable LLM/agent providers (cheapest-first) and how to enable any that are missing.',
	async run(_args, ctx) {
		return data(await request(ctx, STATUS, {}));
	},
};

const agentsRecommendCommand: ICliCommand = {
	name: 'agents recommend',
	summary:
		'Recommend the best-value provider for a task (cost↔quality dial + measured win-rates). Advisory.',
	async run(args, ctx) {
		const dial =
			scalarArg(args, 'dial') ?? scalarArg(args, 'costQualityTradeoff');
		const pin = scalarArg(args, 'pin');
		const payload: Record<string, unknown> = {};
		if (
			dial !== undefined &&
			dial.trim() !== '' &&
			Number.isFinite(Number(dial))
		) {
			payload.costQualityTradeoff = Number(dial);
		}
		if (pin !== undefined) payload.pin = pin;
		return data(await request(ctx, RECOMMEND, payload));
	},
};

const agentsRecordCommand: ICliCommand = {
	name: 'agents record',
	summary:
		'Record a task outcome (success/failure) for a provider to calibrate future recommendations.',
	async run(args, ctx) {
		const providerId =
			scalarArg(args, 'provider') ?? scalarArg(args, 'providerId');
		if (providerId === undefined) {
			return {
				code: EXIT_CODE.USAGE,
				text: 'usage: agents record --provider=<id> --success=<true|false> [--task=<type>]\n',
			};
		}
		const successRaw = (
			scalarArg(args, 'success') ?? 'false'
		).toLowerCase();
		const success =
			successRaw === 'true' || successRaw === '1' || successRaw === 'yes';
		const taskType = scalarArg(args, 'task') ?? scalarArg(args, 'taskType');
		return data(
			await request(ctx, RECORD, {
				providerId,
				success,
				...(taskType !== undefined ? { taskType } : {}),
			}),
		);
	},
};

const agentsRunCommand: ICliCommand = {
	name: 'agents run',
	summary:
		'Plan the cheapest-capable → escalate-up route for a task (ordered ladder, within a cost ceiling).',
	async run(args, ctx) {
		const task = scalarArg(args, 'task');
		const dial =
			scalarArg(args, 'dial') ?? scalarArg(args, 'costQualityTradeoff');
		const ceiling =
			scalarArg(args, 'ceiling') ?? scalarArg(args, 'costCeiling');
		const maxDepth =
			scalarArg(args, 'max-depth') ?? scalarArg(args, 'maxDepth');
		const pin = scalarArg(args, 'pin');
		const num = (value: string | undefined): number | undefined =>
			value !== undefined && Number.isFinite(Number(value))
				? Number(value)
				: undefined;
		const payload: Record<string, unknown> = {};
		if (task !== undefined) payload.task = task;
		const dialN = num(dial);
		if (dialN !== undefined) payload.costQualityTradeoff = dialN;
		const ceilingN = num(ceiling);
		if (ceilingN !== undefined) payload.costCeiling = ceilingN;
		const depthN = num(maxDepth);
		if (depthN !== undefined) payload.maxDepth = depthN;
		if (pin !== undefined) payload.pin = pin;
		return data(
			await request(
				ctx,
				'mcp-vertex_auto-agent-selector_auto_run',
				payload,
			),
		);
	},
};

export const agentsCommands: readonly ICliCommand[] = [
	agentsStatusCommand,
	agentsRecommendCommand,
	agentsRecordCommand,
	agentsRunCommand,
];
