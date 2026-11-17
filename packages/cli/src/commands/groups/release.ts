/**
 * `delendai release` — promotion and follow by each branch's own route
 * (f00801 S3). The decisions live in core; this file only shells out to
 * git and the forge's CLI.
 *
 *   release promote <branch>   open the promotion into <branch>
 *   release follow              make each following branch take in its source
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
	followBranches,
	promoteBranch,
	readWorkspacePolicy,
	type IBranchSyncPorts,
	type IBranchSyncResult,
} from '@delendai/core/cli';

import { EXIT_CODE } from '../../contracts/constants/exit-code.constant';
import type {
	ICliCommand,
	ICliCommandContext,
} from '../../contracts/interfaces/cli-command.interface';
import { positionalArg } from './group-helpers';

const REMOTE = 'origin';

const git = (cwd: string, args: readonly string[]): string =>
	execFileSync('git', [...args], { cwd, encoding: 'utf8' }).trim();

const tried = (run: () => string): { ok: boolean; detail: string } => {
	try {
		return { ok: true, detail: run() };
	} catch (error) {
		return {
			ok: false,
			detail: error instanceof Error ? error.message : String(error),
		};
	}
};

/** The effects, on the forge's copy of each branch. */
const portsAt = (cwd: string): IBranchSyncPorts => ({
	isAncestor: (ancestor, branch) =>
		tried(() =>
			git(cwd, [
				'merge-base',
				'--is-ancestor',
				`${REMOTE}/${ancestor}`,
				`${REMOTE}/${branch}`,
			]),
		).ok,
	openPullRequest: (base, head) =>
		tried(() => {
			const open = execFileSync(
				'gh',
				[
					'pr',
					'list',
					'--base',
					base,
					'--head',
					head,
					'--state',
					'open',
					'--json',
					'url',
					'--jq',
					'.[0].url // ""',
				],
				{ cwd, encoding: 'utf8' },
			).trim();
			if (open !== '') return `${open} is already open.`;
			return execFileSync(
				'gh',
				[
					'pr',
					'create',
					'--base',
					base,
					'--head',
					head,
					'--title',
					`chore(release): take ${head} into ${base}`,
					'--body',
					`Opened by \`delendai release\`: \`${base}\` takes in \`${head}\`.`,
				],
				{ cwd, encoding: 'utf8' },
			).trim();
		}),
	merge: (target, source) =>
		tried(() => {
			// A throwaway worktree: the checkout somebody edits never moves.
			const dir = mkdtempSync(join(tmpdir(), 'release-merge-'));
			try {
				git(cwd, [
					'worktree',
					'add',
					'--detach',
					'--quiet',
					dir,
					`${REMOTE}/${target}`,
				]);
				git(dir, [
					'merge',
					'--no-ff',
					'-m',
					`Merge ${source} into ${target}`,
					`${REMOTE}/${source}`,
				]);
				git(dir, ['push', REMOTE, `HEAD:refs/heads/${target}`]);
				return `merged \`${source}\` into \`${target}\`.`;
			} finally {
				tried(() => git(cwd, ['worktree', 'remove', '--force', dir]));
				rmSync(dir, { recursive: true, force: true });
			}
		}),
});

export const report = (results: readonly IBranchSyncResult[]) => ({
	code: results.some((r) => r.outcome === 'failed')
		? EXIT_CODE.VALIDATION
		: EXIT_CODE.OK,
	data: results,
	text: results
		.map(
			(r) =>
				`${r.kind} ${r.target} <- ${r.source}: ${r.outcome} — ${r.detail}`,
		)
		.join('\n'),
});

const rootOf = (ctx: ICliCommandContext): string =>
	ctx.globals.workspace.length > 0 ? ctx.globals.workspace : ctx.cwd;

export const releasePromoteCommand: ICliCommand = {
	name: 'release promote',
	summary:
		"Open the promotion into a branch from the branch its rule names, by the target branch's own route.",
	usage: 'release promote <branch> [--workspace=<path>]',
	async run(args, ctx) {
		const branch = positionalArg(args);
		if (branch === undefined) {
			return {
				code: EXIT_CODE.USAGE,
				error: 'usage: release promote <branch>',
			};
		}
		const root = rootOf(ctx);
		return report([
			promoteBranch(
				await readWorkspacePolicy(root),
				branch,
				portsAt(root),
			),
		]);
	},
};

export const releaseFollowCommand: ICliCommand = {
	name: 'release follow',
	summary:
		'Make each branch that follows another take in what it has moved on, by its own route.',
	usage: 'release follow [--workspace=<path>]',
	async run(_args, ctx) {
		const root = rootOf(ctx);
		return report(
			followBranches(await readWorkspacePolicy(root), portsAt(root)),
		);
	},
};
