/**
 * publish-proposal.ts — get a newly written proposal onto a ref, so it
 * exists for everyone rather than only for whoever wrote it.
 *
 * WHY this exists. `create_proposal` used to write a file and return the
 * publication step as a sentence for the agent to follow. Twice in one
 * week the sentence was not followed: another agent left `f00539`-`f00546`
 * untracked in a shared checkout, and then this one did the same with
 * `f00547`-`f00550`. Both times the work was invisible — not on a ref,
 * not on the forge, not in the index that answers "what is there to work
 * on?". `lint:proposals-tracked` now refuses that state, but a gate only
 * fires when someone pushes; an agent that simply stops never trips it.
 *
 * So publication stops being advice and becomes something the tool does.
 *
 * WHAT IT DOES, and deliberately no more: build a commit that is the
 * integration branch head plus ONLY the proposal file, and push it to
 * the publication ref. The commit is built through the WIP engine's
 * private index and `commit-tree` (x00645): the first version ran
 * `git add` + `git commit` in the caller's checkout, which under a
 * shared checkout means onto the integration branch — the hook refused
 * it every time, and the file stayed staged in the shared index for the
 * next agent's commit to sweep in. It is
 * git-only on purpose — a plugin's single effect capability is
 * `ctx.effects.git`, so opening the pull request stays with the host's
 * configured `publishCommand`, which is where forge access already
 * lives. Getting the file to the remote is the half that was actually
 * being lost.
 *
 * WHAT IT REFUSES: pushing to the integration or release branch. The
 * publication ref is derived from the project's own
 * `branches.publicationRefPrefix`, never hard-coded, and a policy that
 * integrates directly (no pull request) publishes nothing here — that
 * host's proposals reach the integration branch by its own route, and
 * inventing a ref for it would be this module deciding someone else's
 * workflow.
 *
 * Every failure is returned, never thrown: a proposal that was written
 * but not published is still a proposal, and the caller reports both
 * facts. Losing the authored document because a push failed would be a
 * worse outcome than the one this module exists to prevent.
 */
import { randomUUID } from 'node:crypto';

import { createWipEngine, UNANCHORED } from '@delendai/core/public';

import type {
	IProposalCommitPort,
	IProposalPublicationPolicy,
	IPublishProposalOutcome,
	IPublishProposalRequest,
} from '../contracts/interfaces/publish-proposal.interface';

export type {
	IProposalCommitInput,
	IProposalCommitPort,
	IProposalCommitResult,
	IProposalPublicationPolicy,
	IPublishProposalOutcome,
	IPublishProposalRequest,
} from '../contracts/interfaces/publish-proposal.interface';

/**
 * The ref a proposal is published on, from the project's own prefix.
 *
 * `delendai/pr/` is this repository's default, not a law: a host that
 * declares another prefix gets its own, and the id keeps the ref
 * recognisable to a human scanning `git branch -r`.
 */
export const publicationRefFor = (
	prefix: string,
	proposalId: string,
): string => {
	// A blank prefix would produce `/proposal-x`, a ref git refuses. Fall
	// back to the default rather than emit something unpushable.
	const chosen = prefix.trim().length === 0 ? 'delendai/pr/' : prefix;
	const normalised = chosen.endsWith('/') ? chosen : `${chosen}/`;
	return `${normalised}proposal-${proposalId}`;
};

/**
 * Whether this project publishes a proposal on its own ref at all.
 *
 * Only a workflow that integrates through a pull request does. A
 * direct-integration host commits to its integration branch by its own
 * route, and a module that pushed a ref anyway would be imposing a
 * workflow rather than following one.
 */
export const shouldPublishOnRef = (
	policy: IProposalPublicationPolicy | undefined,
): boolean => policy?.requiresPullRequest === true;

/**
 * A push target that would land straight on a protected branch.
 *
 * Returned rather than thrown so the caller reports it as a publication
 * that did not happen, with the branch named.
 */
export const protectedPushTarget = (
	ref: string,
	policy: IProposalPublicationPolicy | undefined,
): string | undefined => {
	const protectedBranches = [policy?.integration, policy?.release].filter(
		(branch): branch is string =>
			typeof branch === 'string' && branch.length > 0,
	);
	return protectedBranches.find(
		(branch) => ref === branch || ref.endsWith(`/${branch}`),
	);
};

/**
 * A git step that failed, phrased for a tool result.
 *
 * The ref travels with the failure: an agent whose push was rejected
 * still needs to know which ref the work is owed on, and reporting only
 * "push failed" leaves it guessing.
 */
const failed = (
	step: string,
	reason: string | undefined,
	ref: string,
): IPublishProposalOutcome => ({
	published: false,
	ref,
	reason: `${step} failed${reason === undefined || reason.length === 0 ? '' : `: ${reason}`}`,
});

/**
 * A commit port over the WIP engine: the proposal file on top of
 * `baseSha`, staged through a temporary index. The engine needs a ref to
 * write; a transient one is used and deleted, so the only ref this
 * publication leaves is the one it pushes.
 */
export const createPrivateIndexCommitPort =
	(workspaceRoot: string): IProposalCommitPort =>
	async (input) => {
		const engine = await createWipEngine(workspaceRoot, UNANCHORED);
		if (engine === undefined) {
			return {
				ok: false,
				reason: `${workspaceRoot} is not a git working tree`,
			};
		}
		const transient = `refs/delendai/publish/${randomUUID()}`;
		const result = await engine.createOrUpdateWipRef({
			baseSha: input.baseSha,
			paths: [input.relativePath],
			ref: transient,
			message: input.message,
		});
		await engine.context.run(['update-ref', '-d', transient]);
		return result.status === 'created'
			? { ok: true, sha: result.commit }
			: {
					ok: false,
					reason: result.reason ?? `checkpoint ${result.status}`,
				};
	};

/**
 * Publish one proposal file on its own ref.
 *
 * The commit is built off to the side of the checkout (see the port
 * above) and pushed by SHA, so neither `HEAD`, the checked-out branch
 * nor the shared index changes, and nothing else in a dirty tree can
 * enter the commit.
 */
export const publishProposalOnRef = async (
	request: IPublishProposalRequest,
): Promise<IPublishProposalOutcome> => {
	if (!shouldPublishOnRef(request.policy)) {
		return {
			published: false,
			reason: 'this project does not publish proposals on their own ref',
		};
	}

	const ref = publicationRefFor(
		request.policy?.publicationRefPrefix ?? 'delendai/pr/',
		request.proposalId,
	);

	const protectedBranch = protectedPushTarget(ref, request.policy);
	if (protectedBranch !== undefined) {
		return {
			published: false,
			ref,
			reason: `refusing to publish onto the protected branch "${protectedBranch}"`,
		};
	}

	const run = request.git;

	// The base is the integration branch, not HEAD: a proposal is
	// proposed against what everyone integrates into.
	const integration = request.policy?.integration ?? 'HEAD';
	const base = await run([
		'rev-parse',
		'--verify',
		`${integration}^{commit}`,
	]);
	if (!base.ok) return failed('git rev-parse', base.reason, ref);

	const committed = await request.commit({
		baseSha: base.output.trim(),
		relativePath: request.relativePath,
		message: request.message,
	});
	if (!committed.ok) return failed('commit', committed.reason, ref);

	const pushed = await run([
		'push',
		request.remote ?? 'origin',
		`${committed.sha}:refs/heads/${ref}`,
	]);
	if (!pushed.ok) return failed('git push', pushed.reason, ref);

	return { published: true, ref, sha: committed.sha };
};
