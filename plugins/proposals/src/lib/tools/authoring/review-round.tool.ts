import { ANOTHER_INSTANCE_MARK } from '../../contracts/constants/review-attribution.constant';
import { isSameModel, isSelfApproval } from '../../shared/independent-approval';
import { toolError } from '@delendai/core/public';
import { withFileMutex, writeFileAtomic } from '@delendai/core/runtime';
import { createGitRunner } from '../../shared/git-runner';
import {
	approvalNote,
	deliveredCommitOf,
} from '../../services/review-verdict-evidence';
import { readTextOrNull } from '../../proposals/index-reader';
import { parseProposalSlicePlan } from '../../swarm/proposal-slice-plan';
import {
	parseReviewState,
	renderReviewLines,
	withClosingLines,
	flipSliceStatusDone,
	flipSliceStatusReview,
	reviewTransition,
} from '../../swarm/proposal-review';
import {
	describeApprovalOutcome,
	quorumForReview,
	shouldAutoTransitionOnReviewState,
} from '../../swarm/proposal-review-tool-quorum';
import {
	buildReviewIdentity,
	checkApproveIdentity,
	recordReviewSubmitIdentity,
} from '../../services/review-identity';
import {
	attributeDelivery,
	checkAttributedApprover,
	everySliceReviewed,
	reviewStanding,
	needsAttributedRound,
	openAttributedRound,
	renderAttributionLine,
	unrecordedAttribution,
	withShippedIn,
} from '../../services/review-attribution';
import { readFrontmatterField } from '../../proposals/proposal-frontmatter-writer';
import { everySliceHandedOver } from '../review-verdict-lifecycle';
import {
	requireProposalReviewEvidence,
	unintegratedEvidenceError,
	citedRunOf,
	supersededEvidenceError,
	appendPeerReviewLog,
} from './review-evidence.tool';
import { sliceIdPattern, flipSliceStatusPending } from './slice-block.tool';
import { makerOfCarriedWork } from './review-verdict-support.tool';

import type {
	IReviewRoundContext,
	IReviewRoundOutcome,
} from '../../contracts/interfaces/review-round.interface';

export const newReviewRoundOutcome = (): IReviewRoundOutcome => ({
	anotherInstance: false,
	citedRun: undefined,
	nextStatus: 'none',
	nextImplementer: null,
	nextReviewer: null,
	nextRounds: [],
	autoTransitionRequested: false,
	reopenRequested: false,
	handOverRequested: false,
	attribution: undefined,
	approvalOutcome: undefined,
});

/**
 * The write half of a verdict or submission: reads the slice, decides the
 * next review round under the proposal's file mutex, and records the result
 * in `outcome` for the caller to settle (locks, registry, lifecycle).
 */
export const runReviewRound = async (
	ctx: IReviewRoundContext,
): Promise<void> => {
	const {
		options,
		scoped,
		entry,
		docPath,
		args,
		redactedNote,
		peerReviewLogPathAbs,
		outcome,
	} = ctx;
	await withFileMutex(docPath, async () => {
		const md = await readTextOrNull(docPath);
		if (md === null) throw new Error(`proposal file missing: ${docPath}`);

		const blockRe = new RegExp(
			`(^### ${sliceIdPattern(args.sliceId)}\\s+—[^\\n]*\\n)([\\s\\S]*?)(?=^### |^## (?!#)|\\n*$(?![\\s\\S]))`,
			'm',
		);
		const m = md.match(blockRe);
		if (m === null) {
			throw new Error(
				`slice "${args.sliceId}" not found in ${entry.file}`,
			);
		}
		const body = m[2] ?? '';
		const slicePlan = parseProposalSlicePlan(entry.id, md)?.slices.find(
			(slice) => {
				const parsedSliceId = slice.sliceId.toLowerCase();
				const requestedSliceId = args.sliceId.toLowerCase();
				return (
					parsedSliceId === requestedSliceId ||
					parsedSliceId.endsWith(`.${requestedSliceId}`)
				);
			},
		);
		const acceptanceCriteria = slicePlan?.acceptanceCriteria ?? [];
		let state = parseReviewState(body);
		// A proposal handed to review with no round open for
		// this slice: the implementer never submitted and is
		// gone. Open the round under the name Git gives the
		// delivery — the reviewer names a commit, not a person.
		if (args.action !== 'submit' && needsAttributedRound(state, md)) {
			const derived = await attributeDelivery({
				run: scoped.run ?? createGitRunner(scoped.workspaceRoot),
				proposalId: entry.id,
				declaredFiles: slicePlan?.files ?? [],
				commitHash: args.commitHash ?? args.evidence?.commitHash ?? '',
				integration:
					scoped.developmentPolicy?.branches.integration ?? 'HEAD',
				refShape: scoped.developmentPolicy?.branches,
			});
			const namedNoCommit =
				args.commitHash === undefined &&
				args.evidence?.commitHash === undefined;
			const deliveredAt =
				!derived.ok &&
				args.action === 'request_changes' &&
				namedNoCommit
					? await deliveredCommitOf(
							scoped.run ?? createGitRunner(scoped.workspaceRoot),
							scoped.developmentPolicy?.branches.integration ??
								'HEAD',
							entry.id,
						)
					: undefined;
			if (deliveredAt !== undefined) {
				// The work is in the integration branch: an
				// objection to it names the commit it is about.
				throw Object.assign(
					new Error('change request names no commit'),
					{
						toolError: toolError(
							`${entry.id} was delivered in ${deliveredAt}, and this change request names no commit: an objection is about what landed.`,
							`Read that commit, run the slice's declared gate, and pass commitHash: "${deliveredAt}" with the objection. If you could not inspect it, record no verdict: give the claim back with ${options.namespacePrefix}_review_claim { release: "<what stopped you>" }.`,
						),
					},
				);
			}
			if (
				!derived.ok &&
				args.action === 'request_changes' &&
				namedNoCommit
			) {
				// Sending work back needs no delivering commit —
				// the objection may be that nothing was delivered.
				outcome.attribution = unrecordedAttribution(
					'',
					`no delivering commit was named for ${entry.id} ${args.sliceId}`,
				);
			} else if (!derived.ok) {
				throw Object.assign(new Error(derived.reason), {
					toolError: toolError(
						`no review round is open for ${entry.id} ${args.sliceId}, and ${derived.reason}`,
						`Pass commitHash: the commit that delivered the slice, so the implementer is derived from Git. Missing: ${derived.missing}. Never submit on the implementer's behalf.`,
					),
				});
			} else {
				outcome.attribution = derived.attribution;
			}
			state = openAttributedRound(state, outcome.attribution);
		}
		if (args.action === 'approve') {
			const sameAgentNameAsImplementer =
				outcome.attribution === undefined &&
				isSelfApproval(
					state.implementer ?? undefined,
					args.agent,
					scoped.reviewIndependence,
				);
			const approver = buildReviewIdentity(
				args.agent,
				scoped.reviewIdentityDeps ?? {
					hostname: () => require('node:os').hostname(),
					pid: () => process.pid,
					envHost: () => process.env.MCP_HOST,
				},
			);
			const identityCheck =
				outcome.attribution === undefined
					? await checkApproveIdentity({
							workspaceRoot: scoped.workspaceRoot,
							proposalId: entry.id,
							sliceId: args.sliceId,
							approver,
							recordedImplementer: state.implementer ?? undefined,
							independence: scoped.reviewIndependence,
							...(scoped.reviewIdentityDeps !== undefined
								? {
										deps: scoped.reviewIdentityDeps,
									}
								: {}),
						})
					: checkAttributedApprover(
							outcome.attribution,
							args.agent,
							scoped.reviewIndependence,
						);
			const submittedBy =
				identityCheck.ok && 'submitter' in identityCheck
					? (identityCheck.submitter as {
							readonly agent?: string;
						} | null)
					: null;
			outcome.anotherInstance =
				typeof submittedBy?.agent === 'string' &&
				isSameModel(submittedBy.agent, args.agent);
			if (!identityCheck.ok) {
				if (
					sameAgentNameAsImplementer &&
					identityCheck.reason === 'self-approve'
				) {
					throw Object.assign(
						new Error(
							'reviewer must be a different agent from the implementer',
						),
						{
							toolError: toolError(
								'reviewer must be a different agent from the implementer',
							),
						},
					);
				}
				throw Object.assign(new Error(identityCheck.reason), {
					toolError: toolError(
						identityCheck.reason,
						identityCheck.nextAction,
					),
				});
			}
			const evidenceError =
				requireProposalReviewEvidence(
					args.evidence,
					acceptanceCriteria,
				) ??
				(await unintegratedEvidenceError(
					scoped.run ?? createGitRunner(scoped.workspaceRoot),
					scoped.developmentPolicy?.branches.integration,
					args.evidence?.commitHash,
				)) ??
				(await supersededEvidenceError(
					scoped.run ?? createGitRunner(scoped.workspaceRoot),
					scoped.developmentPolicy?.branches.integration,
					entry.id,
					slicePlan?.files ?? [],
					args.evidence?.commitHash,
				));
			if (evidenceError !== null) {
				throw Object.assign(new Error('missing empirical evidence'), {
					toolError: evidenceError,
				});
			}
			const cited = await citedRunOf(
				scoped.workspaceRoot,
				args.evidence?.runId,
			);
			if (cited.error !== undefined)
				throw Object.assign(new Error('cited run not recorded'), {
					toolError: cited.error,
				});
			outcome.citedRun = cited.run;
		}

		// `args.action === 'status'` already returned
		// above, but that narrowing does not cross the
		// `withFileMutex(docPath, async () => { ... })` closure
		// boundary this code runs inside — TS re-widens `args`
		// back to its full declared union inside any nested
		// function. Re-proving it here (rather than an `as
		// any` cast) keeps the check real: if this callback
		// is ever reached with `action: 'status'`, it throws
		// instead of silently mismatching `IReviewAction`.
		if (args.action === 'status' || args.action === 'attest') {
			throw new Error(
				`unreachable: action "${args.action}" already returned above`,
			);
		}
		// the quorum the panel policy resolved,
		// not the implicit 1 this call used to pass. With
		// nothing configured it IS 1, so the pre-panel flow
		// is the same code path rather than a parallel one.
		const quorum = quorumForReview(scoped.reviewPanel);
		const result = reviewTransition(
			state,
			args.action,
			args.agent,
			args.action === 'approve' && args.evidence !== undefined
				? `${approvalNote(args.evidence, redactedNote.text, outcome.citedRun)}${outcome.anotherInstance ? ` ${ANOTHER_INSTANCE_MARK}` : ''}`
				: redactedNote.text,
			args.action === 'approve'
				? { enforceDistinctAgentName: false, quorum }
				: { quorum },
		);
		if (!result.ok || result.next === undefined) {
			// Two DIFFERENT rules both phrase their refusal
			// with "different agent": reviewer ≠ implementer,
			// and reviewer ≠ the previous round's reviewer
			// (the x00056 chain rule). Matching the shared
			// phrase collapsed them into the first message,
			// so an agent refused for reviewing two rounds in
			// a row was told it was the implementer — and the
			// fix that message names does not resolve the gate
			// that actually fired. Only the implementer rule
			// gets the implementer wording; anything else is
			// reported verbatim, because the reason a caller
			// is refused has to be the reason it was refused.
			if (result.reason?.toLowerCase().includes('than the implementer')) {
				throw Object.assign(new Error(result.reason), {
					toolError: toolError(
						'reviewer must be a different agent from the implementer',
					),
				});
			}
			throw Object.assign(
				new Error(result.reason ?? 'invalid review transition'),
				{
					toolError: toolError(
						result.reason ?? 'invalid review transition',
						'Call proposal_board to list slices.',
					),
				},
			);
		}
		// Work another agent made and this one carried in keeps
		// its maker as the implementer; the round says who
		// carried it.
		const maker =
			args.action === 'submit' && scoped.developmentPolicy !== undefined
				? await makerOfCarriedWork(
						scoped.run ?? createGitRunner(scoped.workspaceRoot),
						scoped.workspaceRoot,
						scoped.developmentPolicy.branches,
						args.agent,
					)
				: undefined;
		const next =
			maker === undefined
				? result.next
				: {
						...result.next,
						implementer: maker,
						rounds: [
							...result.next.rounds,
							{
								verdict: 'resubmitted' as const,
								agent: args.agent,
								note: `carried for ${maker}: every commit it brings was made in ${maker}'s unit before ${args.agent}'s was entered`,
							},
						],
					};
		outcome.nextStatus = next.status;
		outcome.nextImplementer = next.implementer;
		outcome.nextReviewer = next.reviewer;
		outcome.nextRounds = next.rounds;

		// Rewrite the slice block: replace the review lines, and on approval
		// also flip `- status: done`.
		let block = body.replace(
			/^[-*]\s*review-(?:state|implementer|reviewer|log):.*$\n?/gm,
			'',
		);
		block = withClosingLines(
			block,
			[
				...renderReviewLines(next),
				...(outcome.attribution === undefined
					? []
					: [renderAttributionLine(outcome.attribution, args.agent)]),
			],
			md.slice((m.index ?? 0) + m[0].length),
		);
		const inReview =
			readFrontmatterField(md, 'status')?.toLowerCase() === 'review';
		if (next.status === 'done') {
			block = flipSliceStatusDone(block);
		} else if (args.action === 'submit') {
			// Handed in: the slice waits for its verdict, and
			// says so. Left reading `in-progress`, a proposal
			// whose every slice had been resubmitted stayed
			// out of the review queue until somebody moved it.
			block = flipSliceStatusReview(block);
		} else if (next.status === 'changes_requested') {
			// The slice is work to do again, with its finding;
			// the proposal stays in review while its review
			// goes on, and moves once it is over (below).
			block = flipSliceStatusPending(block);
		}
		let updated = md.replace(blockRe, () => `${m[1]}${block}`);
		const verifiedCommit =
			args.action === 'approve'
				? (args.evidence?.commitHash ?? outcome.attribution?.commit)
				: undefined;
		if (verifiedCommit !== undefined) {
			updated = withShippedIn(updated, verifiedCommit);
		}
		// Only an approval that actually CLOSED the slice may
		// transition the proposal. This ran on every approval,
		// which was indistinguishable while a quorum could
		// only be 1; with a panel, the first of two approvals
		// would have marked the whole proposal done while the
		// slice was still waiting for its second reviewer.
		//
		// The close itself is the normal transition, run once
		// the document is written: frontmatter, folder and
		// index move together, under the same gates as any
		// other `review → done`.
		outcome.autoTransitionRequested =
			args.action === 'approve' &&
			inReview &&
			shouldAutoTransitionOnReviewState(next) &&
			everySliceReviewed(entry.id, updated);
		// The review is over once no slice waits for a
		// verdict: with any slice sent back, the proposal is
		// ready for its next implementer, findings and all.
		const standing = reviewStanding(updated);
		outcome.reopenRequested =
			(args.action === 'approve' || args.action === 'request_changes') &&
			inReview &&
			standing.waiting === 0 &&
			standing.sentBack > 0;
		// The mirror of the reopening: the submission that leaves
		// no slice to do hands the proposal back to review.
		outcome.handOverRequested =
			args.action === 'submit' &&
			readFrontmatterField(md, 'status')?.toLowerCase() ===
				'in-progress' &&
			everySliceHandedOver(updated);
		if (args.action === 'approve') {
			outcome.approvalOutcome = describeApprovalOutcome(next, quorum);
		}
		await writeFileAtomic(docPath, updated);
		if (args.action === 'submit') {
			await recordReviewSubmitIdentity({
				workspaceRoot: scoped.workspaceRoot,
				proposalId: entry.id,
				sliceId: args.sliceId,
				agent: args.agent,
				...(scoped.reviewIdentityDeps !== undefined
					? { deps: scoped.reviewIdentityDeps }
					: {}),
			});
		}
		if (args.action === 'approve' || args.action === 'request_changes') {
			await appendPeerReviewLog(peerReviewLogPathAbs, {
				ts: new Date().toISOString(),
				proposal_id: entry.id,
				slice_id: args.sliceId,
				agent: args.agent,
				verdict:
					args.action === 'approve' ? 'approved' : 'request_changes',
				...(redactedNote.text !== ''
					? { note: redactedNote.text }
					: {}),
			});
		}
	});
};
