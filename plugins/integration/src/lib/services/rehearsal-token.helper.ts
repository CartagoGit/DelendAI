/**
 * rehearsal-token.helper.ts — what the workflow token wrote to a head, read
 * from the commit its run pushed. The fact is the run's concluded success and
 * the commit it added after the head the label found, taken from the branch's
 * history, so a later move of the head (the integrator bringing the pull
 * request forward, a merge) cannot erase it.
 */
import {
	REHEARSAL_POLL_MS,
	REHEARSAL_TOKEN_RUN_NAME,
	REHEARSAL_TOKEN_WAIT_SECONDS,
} from '../contracts/constants/rehearsal.constant';
import type {
	IRehearsalPullState,
	IRehearsalRun,
	IRehearsalRunContext,
} from '../contracts/interfaces/rehearsal.interface';

const tokenRunOf = (
	runs: readonly IRehearsalRun[],
): IRehearsalRun | undefined =>
	runs
		.filter(
			(run) =>
				run.workflow === REHEARSAL_TOKEN_RUN_NAME &&
				run.event === 'pull_request',
		)
		.sort((left, right) =>
			right.createdAt.localeCompare(left.createdAt),
		)[0];

/** The commit pushed on `pull`'s head after `from`: the one right above `from` in the branch's first-parent history. */
const commitAfter = async (
	ctx: IRehearsalRunContext,
	branch: string,
	from: string,
): Promise<string | undefined> => {
	const shas = await ctx.forge.history(branch, from);
	const at = shas.indexOf(from);
	return at > 0 ? shas[at - 1] : undefined;
};

/**
 * Waits, within the bounded wait, for the token workflow's run on the head to
 * conclude, then names the commit it pushed. A run that concluded red, or
 * without a commit, or never concluded, is a failure that names it.
 */
export const tokenPush = async (
	ctx: IRehearsalRunContext,
	pull: IRehearsalPullState,
): Promise<{ readonly sha: string } | { readonly failure: string }> => {
	const started = ctx.clock.now();
	let run: IRehearsalRun | undefined;
	for (;;) {
		run = tokenRunOf(await ctx.forge.runs(pull.head));
		if (run?.status === 'completed') break;
		if (ctx.clock.now() - started >= REHEARSAL_TOKEN_WAIT_SECONDS * 1000)
			return {
				failure:
					run === undefined
						? `no ${REHEARSAL_TOKEN_RUN_NAME} run started for ${pull.head} within ${String(REHEARSAL_TOKEN_WAIT_SECONDS)} s`
						: `run ${String(run.id)} still ${run.status} after ${String(REHEARSAL_TOKEN_WAIT_SECONDS)} s`,
			};
		await ctx.clock.wait(REHEARSAL_POLL_MS);
	}
	if (run.conclusion !== 'success')
		return {
			failure: `run ${String(run.id)} concluded ${run.conclusion ?? 'without a conclusion'}`,
		};
	const sha = await commitAfter(ctx, pull.head, pull.headSha);
	return sha === undefined
		? {
				failure: `the workflow token pushed nothing to ${pull.head} (run ${String(run.id)} concluded success)`,
			}
		: { sha };
};
