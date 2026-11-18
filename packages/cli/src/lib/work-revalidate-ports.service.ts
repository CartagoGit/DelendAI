/**
 * work-revalidate-ports.service.ts — the ports `work revalidate` runs on,
 * wired to the unit engine and the proposals tool. Loaded only when the
 * subcommand runs.
 */
import { readWorkspacePolicy, runWorkUnit } from '@delendai/core/cli';
import { runGitCommand } from '@delendai/core/runtime';
import { REVALIDATION_UNIT_FLAGS } from '../contracts/constants/work-revalidate.constant';

import type { ICliCommandContext } from '../contracts/interfaces/cli-command.interface';
import type { IGitInCheckout } from '../contracts/interfaces/git-in-checkout.interface';
import type { IWorkRevalidatePorts } from '../contracts/interfaces/work-revalidate.interface';
import { isRecord, request } from './helpers/cli-command.helper';
import { answerOf } from './work-deliver.service';
import {
	answerCommittingWrites,
	toolCommitSubject,
} from './work-deliver-commit.service';
import { readReadyProposals } from './work-revalidate.service';

/** The ports `revalidateBatch` runs on, wired to the unit engine and the proposals tool. */
export const revalidatePortsOf = (
	ctx: ICliCommandContext,
	agent: string | undefined,
	transitionTool: string,
	gitIn: (where: string) => IGitInCheckout = (where) => (gitArgs) =>
		runGitCommand(where, gitArgs),
): IWorkRevalidatePorts => {
	return {
		proposals: () => readReadyProposals(ctx.cwd),
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
		transition: ({ id, to, reason, worktree }) =>
			answerCommittingWrites(
				gitIn(worktree),
				toolCommitSubject(transitionTool, `${id} ${to}`),
				() =>
					answerOf(
						request(ctx, transitionTool, {
							id,
							to,
							reason,
							...(agent === undefined ? {} : { agent }),
							checkout: worktree,
						}),
					),
			),
	};
};
