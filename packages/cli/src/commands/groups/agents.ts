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

export const agentsCommands: readonly ICliCommand[] = [
	agentsStatusCommand,
	agentsRecommendCommand,
	agentsRecordCommand,
];
