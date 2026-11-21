/**
 * f00046 S1 — git commands. One subcommand per `git_*` MCP tool exposed by
 * the `git` plugin. Every command is a 1:1 delegation: no domain logic in
 * the CLI, all options come from the public MCP `inputSchema`.
 *
 * Tools mapped:
 *   - `delendai_git_status`   (no args)
 *   - `delendai_git_changed`  (no args)
 *   - `delendai_git_diff`     ({ staged?, path? })
 *   - `delendai_git_log`      ({ limit? })
 *   - `delendai_git_blame`    ({ path, startLine?, endLine? })
 *   - `delendai_git_show`     ({ ref?, path? })
 *   - `delendai_git_worktree` (no args)
 */
import { EXIT_CODE } from '../../contracts/constants/exit-code.constant';
import type { ICliCommand } from '../../contracts/interfaces/cli-command.interface';
import { data, hasFlag, request, scalarArg } from './group-helpers';

export const gitStatusCommand: ICliCommand = {
	name: 'git status',
	summary: 'Working-tree status (branch + clean flag + entries).',
	async run(_args, ctx) {
		return data(await request(ctx, 'delendai_git_status', {}));
	},
};

export const gitChangedCommand: ICliCommand = {
	name: 'git changed',
	summary: 'List of changed file paths in the working tree.',
	async run(_args, ctx) {
		return data(await request(ctx, 'delendai_git_changed', {}));
	},
};

export const gitDiffCommand: ICliCommand = {
	name: 'git diff',
	summary: 'Diff --stat (optionally staged or scoped to a path).',
	async run(args, ctx) {
		const staged = hasFlag(args, 'staged');
		const path = scalarArg(args, 'path');
		return data(
			await request(ctx, 'delendai_git_diff', {
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
			await request(ctx, 'delendai_git_log', {
				...(limit !== undefined ? { limit: Number(limit) } : {}),
			}),
		);
	},
};

export const gitChangelogCommand: ICliCommand = {
	name: 'git changelog',
	summary:
		'Conventional-commit changelog + inferred semver bump for a range.',
	async run(args, ctx) {
		const range = scalarArg(args, 'range');
		const limit = scalarArg(args, 'limit');
		return data(
			await request(ctx, 'delendai_git_changelog', {
				...(range !== undefined ? { range } : {}),
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
			await request(ctx, 'delendai_git_blame', {
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
			await request(ctx, 'delendai_git_show', {
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
		return data(await request(ctx, 'delendai_git_worktree', {}));
	},
};

export const gitPrListCommand: ICliCommand = {
	name: 'git pr-list',
	summary:
		'List open pull requests via gh (opt-in via allowForge, read-only).',
	async run(_args, ctx) {
		return data(await request(ctx, 'delendai_git_pr_list', {}));
	},
};

export const gitPrViewCommand: ICliCommand = {
	name: 'git pr-view',
	summary:
		'View a pull request + CI check rollup via gh (number/branch/url, or current branch).',
	async run(args, ctx) {
		const pr =
			args.find((arg) => !arg.startsWith('-')) ?? scalarArg(args, 'pr');
		return data(
			await request(ctx, 'delendai_git_pr_view', {
				...(pr !== undefined ? { pr } : {}),
			}),
		);
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
	gitChangelogCommand,
	gitPrListCommand,
	gitPrViewCommand,
];
