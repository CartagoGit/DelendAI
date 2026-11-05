import { relative } from 'node:path';
import { projectBranches, toolError } from '@delendai/core/public';
import { SafeWorkspaceReader } from '@delendai/core/runtime';
import { findDependentProposalStatuses } from '../../proposals/sync-proposal-registry';
import { createGitRunner } from '../../shared/git-runner';
import { recordPeerReviewBypass } from '../../shared/peer-review-bypass-log';
import {
	hasIndependentApprovalSinceLastReview,
	logHasAnyReviewVerdictFor,
} from '../../shared/peer-review-log';
import { collectSliceStatuses } from '../../services/proposal-completeness';
import { staleApprovals } from '../../services/review-verdict-evidence';
import { unapprovedSlices } from '../../shared/independent-approval';
import { STALE_HASH_LENGTH } from '../../contracts/constants/proposal-transition-schema.constant';
import { hasIndependentPeerApproval } from './validate-evidence.tool';
import { sliceBlockOf, buildCodeError } from './delivery-evidence.tool';

import type { IPeerReviewGateInput } from '../../contracts/interfaces/proposal-transition-tool.interface';

/**
 * The closing gates of a move to \`done\`: open dependents, an independent
 * approval for every finished slice, approvals not stale against a newer
 * delivery, and the peer-review log. Returns the refusal, or null to go on.
 */
export const runPeerReviewGate = async ({
	args,
	found,
	options,
	raw,
	from,
	finalTo,
}: IPeerReviewGateInput): Promise<ReturnType<typeof toolError> | null> => {
	if (from === 'review' && finalTo === 'done') {
		const openDependents = (
			await findDependentProposalStatuses(
				options.proposalsDirAbs,
				args.id,
			)
		).filter((dependent) => dependent.status !== 'done');
		if (openDependents.length > 0) {
			return toolError(
				`proposal ${args.id} cannot close before its dependents are done`,
				`Review and close dependent proposal(s) first: ${openDependents.map((dependent) => `${dependent.id} (${dependent.status})`).join(', ')}. Then retry proposal_transition for ${args.id}.`,
			);
		}
	}

	// Review → done requires an independent peer approve unless
	// the host disabled requirePeerReview or the caller passed force:true.
	// Force bypass is audited (reason already required + non-empty).
	const requirePeer = options.requirePeerReview !== false;
	// Whatever path leads to `done` and whatever flag is passed, every
	// finished slice carries an independent approval (x00718): `force`
	// used to skip it, and a jump to `done` from any other status never
	// met it. The close from `review` is judged here too, by the rule the
	// repository's own check applies to a closed proposal: left to the
	// log-based gate below alone, an approval of work nobody could be
	// named for closed its proposal, and the pack that carried it was
	// refused. A plan closes when its proposals have (`close_plan` sets
	// `skipDfaForPlanClosure`).
	if (
		requirePeer &&
		finalTo === 'done' &&
		args.skipDfaForPlanClosure !== true
	) {
		const unapproved = unapprovedSlices(raw, options.reviewIndependence);
		if (unapproved.length > 0) {
			const envelope = {
				ok: false as const,
				error: {
					code: 'peer-review-missing',
					blockerType: 'missing-peer-review',
					reason: `peer-review required before ${args.id} reaches done: ${unapproved.join('; ')} ha${unapproved.length === 1 ? 's' : 've'} no approval by someone other than the implementer. No flag skips this.`,
					nextAction: `A different agent approves each finished slice with ${options.namespacePrefix}_proposal_review { action: "approve" } first. Closing without a review is the owner's decision, made by merging by hand.`,
				},
			};
			return {
				content: [
					{ type: 'text' as const, text: JSON.stringify(envelope) },
				],
				structuredContent: envelope,
				isError: true,
			};
		}
	}
	// An approval is about one revision of a slice. One made before the
	// proposal delivered that slice again says nothing about what is now
	// there, and does not close it.
	if (
		requirePeer &&
		finalTo === 'done' &&
		args.skipDfaForPlanClosure !== true
	) {
		const run = options.gitRunner ?? createGitRunner(options.workspaceRoot);
		const integration = (await projectBranches(options.workspaceRoot))
			.integration;
		const hasIntegration = await run([
			'rev-parse',
			'-q',
			'--verify',
			`${integration}^{commit}`,
		]);
		const stale = hasIntegration.ok
			? await staleApprovals(
					run,
					integration,
					args.id,
					collectSliceStatuses(raw).map((slice) => ({
						id: slice.id,
						files: slice.files,
						block: sliceBlockOf(raw, slice.id),
					})),
				)
			: [];
		if (stale.length > 0) {
			return buildCodeError(
				'stale-verdict',
				`${args.id} cannot close on a verdict about an earlier revision: ${stale
					.map(
						(each) =>
							`${each.slice} was approved at ${each.judged.slice(0, STALE_HASH_LENGTH)} and delivered again by ${each.newer.slice(0, STALE_HASH_LENGTH)}`,
					)
					.join('; ')}.`,
				`A reviewer reads the newer delivery and records a verdict on it (${options.namespacePrefix}_proposal_review { action: "approve", evidence.commitHash: <the newer commit> }). The earlier approval stays in the document as history.`,
			);
		}
	}
	if (requirePeer && from === 'review' && finalTo === 'done') {
		if (args.force === true) {
			recordPeerReviewBypass({
				proposalId: args.id,
				reason: args.reason,
				via: 'force',
			});
		} else {
			// The JSONL log is authoritative wherever it has something to
			// say about this proposal. When it has NOTHING — a fresh
			// clone, a CI runner, a different worktree, a cleared cache —
			// fall back to the proposal document, which carries
			// `review-implementer:` and `review-log: approved by …` per
			// slice and is the committed, reviewable record.
			//
			// Without this fallback the gate was unreachable in exactly
			// those situations: `.cache/` is gitignored and disposable, and
			// `proposal_review` refuses to re-review a slice already marked
			// `review-state: done`, so nothing could ever repopulate the
			// log. A genuinely reviewed proposal could not be closed by
			// anyone who had not personally run the review in this very
			// worktree.
			const readProposalMarkdown = async (): Promise<string> =>
				new SafeWorkspaceReader(options.proposalsDirAbs)
					.readText(relative(options.proposalsDirAbs, found.absPath))
					.then((value) => value.content)
					.catch(() => '');
			const approved =
				typeof options.peerReviewLogPathAbs === 'string' &&
				(await logHasAnyReviewVerdictFor(
					options.peerReviewLogPathAbs,
					args.id,
				))
					? await hasIndependentApprovalSinceLastReview(
							options.peerReviewLogPathAbs,
							args.id,
							options.reviewIndependence,
						)
					: hasIndependentPeerApproval(
							await readProposalMarkdown(),
							options.reviewIndependence,
						);
			if (!approved) {
				const envelope = {
					ok: false as const,
					error: {
						code: 'peer-review-missing',
						blockerType: 'missing-peer-review',
						reason: 'proposal requires at least one independent peer-review entry in peer-review.jsonl after its latest transition to review before it can move to done',
						// Two calls, not one: moving a proposal into review/
						// does not open a review round, so an agent told only
						// to "approve" gets `missing-submit-identity` and
						// cannot fix it — submitting under its own name would
						// make it the implementer and bar it from approving.
						nextAction: `Open a review round, then have a DIFFERENT agent approve it: ${options.namespacePrefix}_proposal_review { action: "submit", proposalId: "${args.id}", sliceId: "<finished-slice>", agent: "<implementer>", note: "<what was built>" }, then ${options.namespacePrefix}_proposal_review { action: "approve", proposalId: "${args.id}", sliceId: "<finished-slice>", agent: "<reviewer≠implementer>", note: "<what was checked>" }. Then ${options.namespacePrefix}_proposal_transition { id: "${args.id}", to: "done", reason }.`,
					},
				};
				return {
					content: [
						{
							type: 'text' as const,
							text: JSON.stringify(envelope),
						},
					],
					structuredContent: envelope,
					isError: true,
				};
			}
		}
	}
	return null;
};
