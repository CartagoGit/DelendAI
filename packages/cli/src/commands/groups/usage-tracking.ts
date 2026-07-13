/**
 * f00067 S9 — usage-tracking commands. One subcommand per `usage_*` MCP
 * tool exposed by the opt-in `usage-tracking` plugin. Pure 1:1 delegation.
 *
 * Tools mapped:
 *   - `mcp-vertex_usage-tracking_usage_report`
 *       ({ groupBy?, windowDays? })
 *   - `mcp-vertex_usage-tracking_usage_clear`
 *       ({ confirm })  — destructive, guarded by --confirm
 *
 * The plugin is not part of any preset, so these commands only resolve when
 * the user has loaded `usage-tracking` (via `--plugins` or a
 * `plugins.usage-tracking` block in `mcp-vertex.config.json`).
 */
import type { ICliCommand } from '../../contracts/interfaces/cli-command.interface';
import {
	data,
	hasFlag,
	numberArg,
	request,
	scalarArg,
	usage,
} from './group-helpers';

const usageReportCommand: ICliCommand = {
	name: 'usage-tracking report',
	summary:
		'Report recorded tool usage/cost grouped by provider, plugin, agent or extension.',
	usage: 'usage-tracking report [--group-by=provider|plugin|agent|extension] [--window-days=N]',
	async run(args, ctx) {
		const groupBy = scalarArg(args, 'group-by');
		const windowDays = numberArg(args, 'window-days');
		return data(
			await request(ctx, 'mcp-vertex_usage-tracking_usage_report', {
				...(groupBy !== undefined ? { groupBy } : {}),
				...(windowDays !== undefined ? { windowDays } : {}),
			}),
		);
	},
};

const usageClearCommand: ICliCommand = {
	name: 'usage-tracking clear',
	summary:
		'Clear the recorded usage log + summary (destructive; requires --confirm).',
	usage: 'usage-tracking clear --confirm',
	async run(args, ctx) {
		if (!hasFlag(args, 'confirm')) {
			return usage('usage-tracking clear --confirm');
		}
		return data(
			await request(ctx, 'mcp-vertex_usage-tracking_usage_clear', {
				confirm: true,
			}),
		);
	},
};

export const usageTrackingCommands: readonly ICliCommand[] = [
	usageReportCommand,
	usageClearCommand,
];
