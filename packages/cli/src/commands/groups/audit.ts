/**
 * f00046 S4 — audit commands. One subcommand per `audit_*` MCP tool.
 * Pure 1:1 delegation.
 *
 * Tools mapped:
 *   - `audit_audit_plan`        ({ scope? })
 *   - `audit_audit_consolidate` ({ auditDir?, topActions? })
 */
import type { ICliCommand } from '../../contracts/interfaces/cli-command.interface';
import { data, numberArg, request, scalarArg } from './group-helpers';

const auditPlanCommand: ICliCommand = {
	name: 'audit plan',
	summary: 'Get the canonical audit brief for a scope (paste into a model).',
	async run(args, ctx) {
		// The tool's parameter is `scope`; accept `--kind` as an alias since
		// the proposal documents `audit plan --kind=security`.
		const scope = scalarArg(args, 'scope') ?? scalarArg(args, 'kind');
		return data(
			await request(ctx, 'audit_audit_plan', {
				...(scope !== undefined ? { scope } : {}),
			}),
		);
	},
};

const auditConsolidateCommand: ICliCommand = {
	name: 'audit consolidate',
	summary: 'Deduplicate + average audit reports into one master document.',
	async run(args, ctx) {
		const auditDir = scalarArg(args, 'dir') ?? scalarArg(args, 'auditDir');
		const topActions =
			numberArg(args, 'top') ?? numberArg(args, 'topActions');
		return data(
			await request(ctx, 'audit_audit_consolidate', {
				...(auditDir !== undefined ? { auditDir } : {}),
				...(topActions !== undefined ? { topActions } : {}),
			}),
		);
	},
};

export const auditCommands: readonly ICliCommand[] = [
	auditPlanCommand,
	auditConsolidateCommand,
];
