/**
 * f00046 S3 — rules commands. One subcommand per `rules_*` MCP tool.
 * Pure 1:1 delegation; the tools are advisory (you run the commands they
 * return — they never execute or modify anything).
 *
 * Tools mapped:
 *   - `rules_get_rules`   ({ area? })
 *   - `rules_check_rules` ({ area?, compact? })
 *   - `rules_apply_rules` ({ area?, files? })
 */
import type { ICliCommand } from '../../contracts/interfaces/cli-command.interface';
import { data, hasFlag, listArg, request, scalarArg } from './group-helpers';

const rulesGetCommand: ICliCommand = {
	name: 'rules get',
	summary: 'Show the lint/type rules map (optionally for one area).',
	async run(args, ctx) {
		const area = scalarArg(args, 'area');
		return data(
			await request(ctx, 'rules_get_rules', {
				...(area !== undefined ? { area } : {}),
			}),
		);
	},
};

const rulesCheckCommand: ICliCommand = {
	name: 'rules check',
	summary:
		'Show how to check an area against its rules (resolved configs + command).',
	async run(args, ctx) {
		const area = scalarArg(args, 'area');
		const compact = hasFlag(args, 'compact');
		return data(
			await request(ctx, 'rules_check_rules', {
				...(area !== undefined ? { area } : {}),
				...(compact ? { compact: true } : {}),
			}),
		);
	},
};

const rulesApplyCommand: ICliCommand = {
	name: 'rules apply',
	summary: 'Show a plan to bring an area into rule compliance (advisory).',
	async run(args, ctx) {
		const area = scalarArg(args, 'area');
		const files = listArg(args, 'files');
		return data(
			await request(ctx, 'rules_apply_rules', {
				...(area !== undefined ? { area } : {}),
				...(files !== undefined ? { files } : {}),
			}),
		);
	},
};

export const rulesCommands: readonly ICliCommand[] = [
	rulesGetCommand,
	rulesCheckCommand,
	rulesApplyCommand,
];
