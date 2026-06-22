/**
 * f00046 S1 — git commands. One subcommand per `git_*` MCP tool exposed by
 * the `git` plugin. Every command is a 1:1 delegation: no domain logic in
 * the CLI, all options come from the public MCP `inputSchema`.
 *
 * Tools mapped:
 *   - `git_status`   (no args)
 *   - `git_changed`  (no args)
 *   - `git_diff`     ({ staged?, path? })
 *   - `git_log`      ({ limit? })
 *   - `git_blame`    ({ path, startLine?, endLine? })
 *   - `git_show`     ({ ref?, path? })
 *   - `git_worktree` (no args)
 */
import { EXIT_CODE } from '../../contracts/constants/exit-code.constant';
import type {
	ICliCommand,
	ICliCommandContext,
	ICliCommandResult,
} from '../../contracts/interfaces/cli-command.interface';

const data = (
	value: unknown,
	code: ICliCommandResult['code'] = EXIT_CODE.OK,
): ICliCommandResult => ({
	code,
	data: value,
});

const scalarArg = (
	args: readonly string[],
	name: string,
): string | undefined => {
	const inline = args.find((arg) => arg.startsWith(`--${name}=`));
	if (inline !== undefined) return inline.slice(name.length + 3);
	const index = args.indexOf(`--${name}`);
	return index >= 0 ? args[index + 1] : undefined;
};

const hasFlag = (args: readonly string[], name: string): boolean =>
	args.includes(`--${name}`);

const request = <TOut>(
	ctx: ICliCommandContext,
	tool: string,
	args: object = {},
): Promise<TOut> => ctx.request<TOut>(tool, args);

export const gitStatusCommand: ICliCommand = {
	name: 'git status',
	summary: 'Working-tree status (branch + clean flag + entries).',
	async run(_args, ctx) {
		return data(await request(ctx, 'git_status', {}));
	},
};

export const gitChangedCommand: ICliCommand = {
	name: 'git changed',
	summary: 'List of changed file paths in the working tree.',
	async run(_args, ctx) {
		return data(await request(ctx, 'git_changed', {}));
	},
};

export const gitDiffCommand: ICliCommand = {
	name: 'git diff',
	summary: 'Diff --stat (optionally staged or scoped to a path).',
	async run(args, ctx) {
		const staged = hasFlag(args, 'staged');
		const path = scalarArg(args, 'path');
		return data(
			await request(ctx, 'git_diff', {
				...(staged ? { staged: true } : {}),
				...(path !== undefined ? { path } : {}),
			}),
		);
	},
};

export const gitLogCommand: ICliCommand = {
	name: 'git log',
	summary: 'Recent commits (hash + subject).',
	async run(args, ctx) {
		const limit = scalarArg(args, 'limit') ?? scalarArg(args, 'max');
		return data(
			await request(ctx, 'git_log', {
				...(limit !== undefined ? { limit: Number(limit) } : {}),
			}),
		);
	},
};

export const gitBlameCommand: ICliCommand = {
	name: 'git blame',
	summary:
		'Per-line authorship for a tracked file (optionally a line range).',
	async run(args, ctx) {
		const positional = args.find((arg) => !arg.startsWith('-'));
		if (positional === undefined) {
			return {
				code: EXIT_CODE.USAGE,
				error: 'usage: git blame <path> [--start-line=N --end-line=N]',
			};
		}
		const startLine =
			scalarArg(args, 'start-line') ?? scalarArg(args, 'startLine');
		const endLine =
			scalarArg(args, 'end-line') ?? scalarArg(args, 'endLine');
		return data(
			await request(ctx, 'git_blame', {
				path: positional,
				...(startLine !== undefined
					? { startLine: Number(startLine) }
					: {}),
				...(endLine !== undefined ? { endLine: Number(endLine) } : {}),
			}),
		);
	},
};

export const gitShowCommand: ICliCommand = {
	name: 'git show',
	summary: 'Commit metadata + --stat summary for a ref (no full patch).',
	async run(args, ctx) {
		const positional = args.find((arg) => !arg.startsWith('-'));
		const path = scalarArg(args, 'path');
		return data(
			await request(ctx, 'git_show', {
				...(positional !== undefined ? { ref: positional } : {}),
				...(path !== undefined ? { path } : {}),
			}),
		);
	},
};

export const gitWorktreeCommand: ICliCommand = {
	name: 'git worktree',
	summary: 'List existing git worktrees for this repo (read-only).',
	async run(_args, ctx) {
		return data(await request(ctx, 'git_worktree', {}));
	},
};

export const gitCommands: readonly ICliCommand[] = [
	gitStatusCommand,
	gitChangedCommand,
	gitDiffCommand,
	gitLogCommand,
	gitBlameCommand,
	gitShowCommand,
	gitWorktreeCommand,
];
