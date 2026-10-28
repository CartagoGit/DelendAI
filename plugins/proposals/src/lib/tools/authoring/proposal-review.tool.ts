import { scopeToCaller } from '../../services/scope-to-caller.service';
import { journalReviewSubmission } from '../proposal-work-events';
import { languageRefusal } from '../../services/documentation-language.service';
import { join } from 'node:path';
import { describeOffRoster } from '@delendai/core/cli';
import type { IToolRegistration } from '@delendai/core/contracts';
import {
	redactSecrets,
	sharedCheckout,
	toolError,
	toolOk,
	resolveWorkAgentId,
} from '@delendai/core/public';
import { withFileMutex, writeFileAtomic } from '@delendai/core/runtime';
import { attestImplementer } from '../../services/attested-implementer.service';
import { createGitRunner } from '../../shared/git-runner';
import {
	reviewUnitAgent,
	verdictClaimRefusal,
} from '../../services/review-claim.service';
import { canonicalRoleOf } from '../../shared/agent-conventions';
import { PEER_REVIEW_LOG_RELATIVE_PATH } from '../../contracts/constants/proposal-paths.constant';
import { syncProposalRegistry } from '../../proposals/sync-proposal-registry';
import { readTextOrNull } from '../../proposals/index-reader';
import { parseReviewState } from '../../swarm/proposal-review';
import { quorumForReview } from '../../swarm/proposal-review-tool-quorum';
import { recordProposalReviewAction } from '../../shared/peer-review-log';
import type { IValidateEvidenceDeps } from '../proposal-transition.tool';
import {
	moveProposalAfterVerdict,
	verdictGatePolicy,
} from '../review-verdict-lifecycle';
import { movesStayOutOfTheIndex } from '../../shared/index-free-git-runner';
import {
	resolveIndexedDoc,
	type IAuthoringToolOptions,
} from '../authoring-options';
import { isToolErrorCarryingError } from './review-evidence.tool';
import type { IProposalReviewEvidence } from '../../contracts/interfaces/authoring-tool.interface';
import {
	REVIEW_INPUT_SCHEMA,
	REVIEW_OUTPUT_SCHEMA,
} from '../../contracts/constants/review-tool-schema.constant';
import { sliceIdPattern } from './slice-block.tool';
import {
	releaseSliceLock,
	releaseSliceAssignment,
} from './close-slice-support.tool';
import {
	verdictWouldBeRefused,
	deliveringAuthorOf,
} from './review-verdict-support.tool';

import { newReviewRoundOutcome, runReviewRound } from './review-round.tool';

export const buildReviewRegistration = (
	options: IAuthoringToolOptions & {
		readonly validateEvidenceDeps?: IValidateEvidenceDeps;
	},
): IToolRegistration => ({
	id: 'proposal_review',
	effects: ['write'],
	writeRoot: 'caller-checkout',
	// `status` reads the round and changes nothing.
	readsOnly: (input) =>
		(input as { readonly action?: unknown } | undefined)?.action ===
		'status',
	summary:
		'Peer-review a slice: submit for review, approve, or request changes — until a reviewer has no objection.',
	tags: ['proposals'],
	register: async (server) => {
		server.registerTool(
			`${options.namespacePrefix}_proposal_review`,
			{
				description:
					'Peer-review loop for a slice. action=submit: an implementer marks a finished slice ready for review (not done yet). action=approve: a DIFFERENT agent verifies and approves it → slice is set done + lock released, and must attach empirical evidence (commit hash, passing validate exit code, and passing test counts). action=request_changes (note required): a different agent records an objection → slice becomes reworkable + lock released; the fixer re-submits and another agent reviews the fix. Never use it for a slice you could not verify (its gate could not run, the machine was busy, a tool was missing): that is no objection, and the implementer would get nothing to change. Give the claim back instead, with review_claim { release: "<what stopped you>" }: it is recorded as could not verify, and the slice stays in the queue for the next reviewer. action=status: read current state. Enforces reviewer ≠ implementer (independent verification). action=attest: name who delivered a slice Git cannot name (`implementer`, with `note` saying where the name comes from); closing over it needs the owner’s label.',
				inputSchema: REVIEW_INPUT_SCHEMA,
				outputSchema: REVIEW_OUTPUT_SCHEMA,
			},
			async (rawArgs: {
				proposalId: string;
				sliceId: string;
				action:
					| 'submit'
					| 'approve'
					| 'request_changes'
					| 'status'
					| 'attest';
				agent: string;
				note?: string | undefined;
				implementer?: string | undefined;
				evidence?: IProposalReviewEvidence | undefined;
				commitHash?: string | undefined;
			}) => {
				const args = { ...rawArgs };
				const scoped = scopeToCaller(options);
				const offRoster =
					args.action === 'approve' ||
					args.action === 'request_changes'
						? describeOffRoster(
								args.agent,
								scoped.developmentPolicy?.coordination.roster ??
									[],
							)
						: undefined;
				if (offRoster !== undefined) {
					return toolError(
						`No verdict under \`${args.agent}\`.`,
						offRoster,
					);
				}
				// same one-shot self-heal as close_slice.
				const resolved = await resolveIndexedDoc(
					scoped,
					args.proposalId,
				);
				if (!resolved.ok) {
					return toolError(resolved.reason, resolved.nextAction);
				}
				const { entry, docPath } = resolved;
				const missingSliceNextAction = `Call ${options.namespacePrefix}_proposal_get { view: "slices", proposalId: "${entry.id}" } and retry with a declared sliceId. If this historical proposal is already done, do not submit a review: run ${options.namespacePrefix}_proposal_reconcile_folder { id: "${entry.id}", reason: "repair historical proposal state" }. If the done state still needs repair after that, report it to the owner; closing without a review is not a reviewer's step.`;
				// redact the reviewer note...
				const redactedNote = args.note
					? redactSecrets(args.note)
					: { text: '', redactions: 0 };

				if (args.action === 'status') {
					const md = await readTextOrNull(docPath);
					if (md === null)
						return toolError(`proposal file missing: ${docPath}`);
					const blockRe = new RegExp(
						`(^### ${sliceIdPattern(args.sliceId)}\\s+—[^\\n]*\\n)([\\s\\S]*?)(?=^### |^## (?!#)|\\n*$(?![\\s\\S]))`,
						'm',
					);
					const m = md.match(blockRe);
					if (m === null) {
						return toolError(
							`slice "${args.sliceId}" not found in ${entry.file}`,
							missingSliceNextAction,
						);
					}
					const body = m[2] ?? '';
					const state = parseReviewState(body);
					return toolOk({
						proposalId: entry.id,
						sliceId: args.sliceId,
						action: 'status',
						status: state.status,
						implementer: state.implementer,
						reviewer: state.reviewer,
						rounds: state.rounds,
						lockReleased: false,
						assignmentReleased: false,
						redactedSecrets: 0,
					});
				}

				if (args.action === 'attest') {
					// Its own short path: it names who delivered work Git
					// cannot name, and moves no round. It changes the
					// proposal all the same, so its unit claims it first, as
					// a verdict does: a pack that changed a proposal it never
					// claimed was refused by the governance check after it
					// was published.
					const unclaimed = await verdictClaimRefusal(
						scoped.run ?? createGitRunner(scoped.workspaceRoot),
						scoped.developmentPolicy?.branches,
						entry.id,
						scoped.developmentPolicy?.branches.integration ??
							'HEAD',
						options.namespacePrefix,
					);
					if (unclaimed !== undefined) {
						return toolError(
							unclaimed.reason,
							unclaimed.nextAction,
						);
					}
					return withFileMutex(docPath, async () => {
						const md = await readTextOrNull(docPath);
						if (md === null)
							return toolError(
								`proposal file missing: ${docPath}`,
							);
						const attested = attestImplementer(md, args.sliceId, {
							implementer: args.implementer ?? '',
							attestedBy: args.agent,
							evidence: redactedNote.text,
							deliveredBy: await deliveringAuthorOf(
								scoped.workspaceRoot,
								md,
								args.sliceId,
							),
						});
						if (!attested.ok) {
							return toolError(
								attested.reason,
								`Pass implementer=<who delivered it> and note=<where that name comes from>. A proposal closed over an attestation needs the owner's label on its pull request.`,
								'attestation-refused',
							);
						}
						await writeFileAtomic(docPath, attested.markdown);
						const body =
							attested.markdown.match(
								new RegExp(
									`(^### ${sliceIdPattern(args.sliceId)}\\s+—[^\\n]*\\n)([\\s\\S]*?)(?=^### |^## (?!#)|\\n*$(?![\\s\\S]))`,
									'm',
								),
							)?.[2] ?? '';
						const state = parseReviewState(body);
						return toolOk({
							proposalId: entry.id,
							sliceId: args.sliceId,
							action: 'attest',
							status: state.status,
							implementer: state.implementer,
							reviewer: state.reviewer,
							rounds: state.rounds,
							lockReleased: false,
							assignmentReleased: false,
							redactedSecrets: redactedNote.redactions,
						});
					});
				}

				if (
					args.action === 'approve' ||
					args.action === 'request_changes'
				) {
					const wrongLanguage = languageRefusal(
						args.note ?? '',
						scoped.documentationLanguage,
					);
					if (wrongLanguage !== undefined) {
						return toolError(
							wrongLanguage,
							'Record the same verdict with its note in English. Nothing was written.',
						);
					}
					const role = canonicalRoleOf(args.agent);
					if (role !== undefined) {
						return toolError(
							`"${args.agent}" is a role, not a reviewer: a verdict is signed by the model that reached it.`,
							'Record the verdict under the model id you run as (for example `glm-5.3-max`), the same one your review unit is named after.',
						);
					}
					const branches = scoped.developmentPolicy?.branches;
					// A pack is one reviewer's: a verdict in a review unit is
					// signed by the agent the unit is named after, never by a
					// name chosen at the call.
					const unitAgent = await reviewUnitAgent(
						scoped.run ?? createGitRunner(scoped.workspaceRoot),
						branches,
					);
					if (unitAgent !== undefined) {
						if (
							unitAgent !==
							resolveWorkAgentId({ model: args.agent }).id
						) {
							return toolError(
								`"${args.agent}" is not the reviewer of this review unit, which is ${unitAgent}'s.`,
								`Record the verdict as ${unitAgent}, the model this unit was entered as, or enter a review unit of your own.`,
							);
						}
						// One agent, one spelling: the verdict is signed the
						// way its unit's ref names the agent (`GPT-5.4` and
						// `gpt-5.4` were two reviewers to every reader).
						args.agent = unitAgent;
					}
					// A verdict the review rules will refuse claims nothing:
					// claimed first, it left the refused reviewer holding the
					// proposal, so the reviewer it was refused FOR could not
					// take it. The refusal itself comes from the path below,
					// with its own reason.
					const refusal = await verdictClaimRefusal(
						scoped.run ?? createGitRunner(scoped.workspaceRoot),
						branches,
						entry.id,
						branches?.integration ?? 'HEAD',
						options.namespacePrefix,
						{
							claim: !(await verdictWouldBeRefused(
								docPath,
								{
									sliceId: args.sliceId,
									action: args.action,
									agent: args.agent,
								},
								quorumForReview(scoped.reviewPanel),
							)),
						},
					);
					if (refusal !== undefined) {
						return toolError(refusal.reason, refusal.nextAction);
					}
				}

				const outcome = newReviewRoundOutcome();
				// One journal per repository, whichever worktree reviews.
				const peerReviewLogPathAbs = join(
					sharedCheckout(scoped.workspaceRoot) ??
						scoped.workspaceRoot,
					PEER_REVIEW_LOG_RELATIVE_PATH,
				);

				try {
					await runReviewRound({
						options,
						scoped,
						entry,
						docPath,
						args,
						redactedNote,
						peerReviewLogPathAbs,
						outcome,
					});
				} catch (rawErr: unknown) {
					if (!isToolErrorCarryingError(rawErr)) throw rawErr;
					if (rawErr.toolError !== undefined) return rawErr.toolError;
					const nextAction =
						rawErr.message.includes('slice "') &&
						rawErr.message.includes('not found')
							? missingSliceNextAction
							: 'Call proposal_board to list slices.';
					return toolError(rawErr.message, nextAction);
				}

				// approve/request_changes free the slice (done, or reworkable).
				let lockReleased = false;
				let assignmentReleased = false;
				if (
					outcome.nextStatus === 'done' ||
					outcome.nextStatus === 'changes_requested'
				) {
					lockReleased = await releaseSliceLock(
						scoped,
						entry.id,
						args.sliceId,
					);
					assignmentReleased = await releaseSliceAssignment(
						scoped,
						entry.id,
						args.sliceId,
					);
				}
				await syncProposalRegistry(
					scoped.workspaceRoot,
					scoped.layout,
					scoped.extraFolders ?? [],
				);
				// Recorded BEFORE the close below: `review → done` reads this
				// log for the independent approval it requires.
				if (scoped.peerReviewLogPathAbs !== undefined) {
					await recordProposalReviewAction({
						logPathAbs: scoped.peerReviewLogPathAbs,
						proposalId: entry.id,
						sliceId: args.sliceId,
						action: args.action,
						implementer: outcome.nextImplementer,
						reviewer: outcome.nextReviewer,
						...(args.action === 'approve'
							? { verdict: 'approved' as const }
							: args.action === 'request_changes'
								? { verdict: 'requested_changes' as const }
								: {}),
					}).catch(() => undefined);
				}
				const lifecycle = await moveProposalAfterVerdict({
					close: outcome.autoTransitionRequested,
					reopen: outcome.reopenRequested,
					handOver: outcome.handOverRequested,
					proposalId: entry.id,
					sliceId: args.sliceId,
					agent: args.agent,
					options: {
						namespacePrefix: scoped.namespacePrefix,
						workspaceRoot: scoped.workspaceRoot,
						proposalsDirAbs: scoped.proposalsDirAbs,
						indexPathAbs: scoped.indexPathAbs,
						indexFreeMoves: movesStayOutOfTheIndex(
							scoped.developmentPolicy,
						),
						...(scoped.run === undefined
							? {}
							: { gitRunner: scoped.run }),
						...verdictGatePolicy({
							peerReviewLogPathAbs: scoped.peerReviewLogPathAbs,
							requirePeerReview: scoped.requirePeerReview,
							reviewIndependence: scoped.reviewIndependence,
							requireValidateEvidence:
								scoped.requireValidateEvidence,
							folderPolicy: scoped.folderPolicy,
							validateEvidenceDeps: options.validateEvidenceDeps,
						}),
					},
				});
				if (args.action === 'submit') {
					await journalReviewSubmission(
						scoped.workspaceRoot,
						entry.id,
						args.sliceId,
						args.agent,
					);
				}
				return toolOk({
					proposalId: entry.id,
					sliceId: args.sliceId,
					action: args.action,
					status: outcome.nextStatus,
					implementer: outcome.nextImplementer,
					reviewer: outcome.nextReviewer,
					rounds: outcome.nextRounds,
					lockReleased,
					assignmentReleased,
					redactedSecrets: redactedNote.redactions,
					...(outcome.attribution === undefined
						? {}
						: { attributedTo: outcome.attribution.implementer }),
					...lifecycle,
					// Only present on approve, and only ever says "done"
					// when the slice actually closed. An approval that
					// completes nothing must not read like one that does,
					// or the round stalls with everyone believing it ended.
					...(outcome.approvalOutcome === undefined
						? {}
						: {
								quorum: outcome.approvalOutcome.quorum,
								approvalsStanding:
									outcome.approvalOutcome.approvedBy,
								quorumMessage: outcome.approvalOutcome.message,
							}),
				});
			},
		);
	},
});
