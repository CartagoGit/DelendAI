/**
 * work-revalidate-ports.service.ts — the ports `work revalidate` runs on,
 * wired to the unit engine and the proposals tool. Loaded only when the
 * subcommand runs.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import {
	readWorkspacePolicy,
	runWorkUnit,
	proposalsHeldByUnits,
} from '@delendai/core/cli';
import { runGitCommand } from '@delendai/core/runtime';
import { REVALIDATION_UNIT_FLAGS } from '../contracts/constants/work-revalidate.constant';

import type { ICliCommandContext } from '../contracts/interfaces/cli-command.interface';
import type { IGitInCheckout } from '../contracts/interfaces/git-in-checkout.interface';
import type { IWorkRevalidatePorts } from '../contracts/interfaces/work-revalidate.interface';
import { isRecord, request } from './helpers/cli-command.helper';
import { answerOf, refusalOf } from './work-deliver.service';
import {
	answerCommittingWrites,
	toolCommitSubject,
} from './work-deliver-commit.service';
import {
	readRevalidationProposals,
	rewriteDeclaredPath,
} from './work-revalidate.service';

/** The ports `revalidateBatch` runs on, wired to the unit engine and the proposals tool. */
export const revalidatePortsOf = (
	ctx: ICliCommandContext,
	agent: string | undefined,
	transitionTool: string,
	gitIn: (where: string) => IGitInCheckout = (where) => (gitArgs) =>
		runGitCommand(where, gitArgs),
): IWorkRevalidatePorts => {
	return {
		proposals: () => readRevalidationProposals(ctx.cwd),
		handoverRefusal: async (id) =>
			refusalOf(
				await answerOf(
					request(ctx, transitionTool, {
						id,
						to: 'review',
						reason: 'Preflight of the revalidation hand-over.',
						preflight: true,
						...(agent === undefined ? {} : { agent }),
						checkout: ctx.cwd,
					}),
				),
			),
		heldByUnits: async () => {
			const policy = await readWorkspacePolicy(ctx.cwd).catch(
				() => undefined,
			);
			if (policy === undefined) return new Set<string>();
			const here = gitIn(ctx.cwd);
			const names = (args: readonly string[]): readonly string[] => {
				const listed = here(args);
				return listed.ok
					? listed.out.split('\n').filter((line) => line !== '')
					: [];
			};
			return proposalsHeldByUnits(policy, [
				...names([
					'for-each-ref',
					'--format=%(refname:short)',
					'refs/heads',
				]),
				...names(['ls-remote', '--heads', '--', 'origin']).map(
					(line) =>
						line.split('\t')[1]?.replace('refs/heads/', '') ?? '',
				),
			]);
		},
		print: (line) => process.stdout.write(`${line}\n`),
		enter: async () => {
			const entered = await runWorkUnit(
				[
					'enter',
					...REVALIDATION_UNIT_FLAGS,
					...(agent === undefined ? [] : [`--agent=${agent}`]),
				],
				{ ...ctx, globals: { ...ctx.globals, json: true } },
			);
			const path = isRecord(entered.data) ? entered.data.path : undefined;
			if (entered.code !== 0 || typeof path !== 'string' || path === '') {
				throw new Error(
					entered.error ??
						'work enter answered without a worktree path',
				);
			}
			return path;
		},
		developSha: async (worktree) => {
			const policy = await readWorkspacePolicy(ctx.cwd).catch(
				() => undefined,
			);
			if (policy === undefined) return undefined;
			const sha = gitIn(worktree)([
				'rev-parse',
				`origin/${policy.branches.integration}`,
			]);
			return sha.ok ? sha.out.trim() : undefined;
		},
		mark: (worktree) => {
			const head = gitIn(worktree)(['rev-parse', 'HEAD']);
			return head.ok ? head.out.trim() : undefined;
		},
		undo: (worktree, mark) => {
			gitIn(worktree)(['reset', '--hard', mark]);
		},
		publish: () =>
			runWorkUnit(
				[
					'publish',
					...REVALIDATION_UNIT_FLAGS,
					...(agent === undefined ? [] : [`--agent=${agent}`]),
				],
				ctx,
			),
		exists: (worktree, path) => existsSync(join(worktree, path)),
		git: (worktree, args) => gitIn(worktree)(args),
		rewriteDeclared: ({ worktree, file, sliceId, from, to }) => {
			const absolute = join(worktree, file);
			const next = rewriteDeclaredPath(
				readFileSync(absolute, 'utf8'),
				sliceId,
				from,
				to,
			);
			if (next === undefined) {
				return `${file} ${sliceId} does not declare ${from}`;
			}
			writeFileSync(absolute, next);
			const git = gitIn(worktree);
			const staged = git(['add', '--', file]);
			if (!staged.ok) return staged.out || 'git add failed';
			const committed = git([
				'commit',
				'-q',
				'-m',
				`chore(delendai): ${transitionTool} ${sliceId} follows ${from} to ${to}`,
				'--',
				file,
			]);
			return committed.ok
				? undefined
				: committed.out || 'git commit failed';
		},
		transition: ({ id, to, reason, worktree, supersededBy }) =>
			answerCommittingWrites(
				gitIn(worktree),
				toolCommitSubject(transitionTool, `${id} ${to}`),
				() =>
					answerOf(
						request(ctx, transitionTool, {
							id,
							to,
							// The transition tool has no superseded_by field: the id leads the reason.
							reason:
								supersededBy === undefined
									? reason
									: `superseded_by ${supersededBy}: ${reason}`,
							...(agent === undefined ? {} : { agent }),
							checkout: worktree,
						}),
					),
			),
	};
};
