import { landedPath } from '../../services/transition-landing.service';
import { join, relative } from 'node:path';
import {
	callerCheckout,
	projectBranches,
	toolError,
} from '@delendai/core/public';
import { SafeWorkspaceReader, writeFileAtomic } from '@delendai/core/runtime';
import type { IProposalStatus } from '../../contracts/constants/proposal-glossary.constant';
import {
	extractYamlBlock,
	parseFrontmatterBlock,
} from '../../proposals/frontmatter-parser';
import { locateProposal } from '../../proposals/locate';
import {
	readFrontmatterField,
	setFrontmatterField,
} from '../../proposals/proposal-frontmatter-writer';
import { createGitRunner } from '../../shared/git-runner';
import { prepareReviewEntry } from '../../services/review-entry.service';
import { recordPlanClosureBypass } from '../../shared/plan-closure-bypass-log';
import { recordProposalEnteredReview } from '../../shared/peer-review-log';
import {
	buildForcedRegressionCaller,
	gatesSkippedByForce,
	isCiEnvironment,
	guardDoneToReviewRegression,
	guardShippedInPresent,
	logForcedTransition,
} from '../../services/proposal-state';
import { checkTransitionEvidence } from '../../services/transition-evidence';
import { guardTransitionToDone } from '../../services/proposal-completeness';
import { withShippedInFromSlices } from '../../services/shipped-in-from-slices.service';
import { openReviewRounds } from '../../services/review-handoff';
import {
	alreadyClosedOutcome,
	lifecycleEntity,
} from '../../services/lifecycle-outcome';
import { journalProposalTransition } from '../proposal-work-events';
import { recordMeasuredTransition } from '../proposal-transition-duration';
import type { IProposalTransitionArgs } from '../../contracts/proposal-transition-input.contract';
import type { IProposalTransitionToolOptions } from '../../contracts/interfaces/proposal-transition-tool.interface';
import {
	resolveRecentValidateEvidence,
	diagnoseValidateEvidence,
	buildValidateRequiredEnvelope,
} from './validate-evidence.tool';
import {
	isKnownStatus,
	validateTransitionArgs,
	validateCurrentStatus,
	validateTransition,
} from './dfa.tool';
import {
	resolveTransitionMetadata,
	readStoredTransitionMetadata,
	buildIdempotentReplayResult,
} from './idempotency.tool';
import {
	buildCodeError,
	hasProposalCiEvidence,
	hasExactCiCommitEvidence,
	certifiedDelivery,
} from './delivery-evidence.tool';
import { withLandedPath, movedPathOf, applyTransition } from './move.tool';
import { maybeApplyPlanClosureGuard } from './plan-closure.tool';
import { runPeerReviewGate } from './peer-review-gate.tool';

const ISO_DATE_LENGTH = 10;

export const runProposalTransition = async (
	args: IProposalTransitionArgs,
	serverOptions: IProposalTransitionToolOptions,
) => {
	const rejection = validateTransitionArgs(args);
	if (rejection !== null) return rejection;
	// The move belongs in the caller's working tree, not in the
	// one the server was started from. Everything below reads `options`,
	// so resolving the checkout here is the only place that has to know.
	const forCheckout = callerCheckout.writeRoot({
		root: 'caller-checkout',
		serverRoot: serverOptions.workspaceRoot,
		requested: args.checkout,
	});
	if (!forCheckout.ok) {
		return toolError(
			forCheckout.refusal,
			'Pass the absolute path of a working tree of this repository, or omit `checkout` to write in the server\u2019s own root.',
		);
	}
	const options =
		forCheckout.source === 'request'
			? callerCheckout.scopePaths(serverOptions, forCheckout.root, [
					'proposalsDirAbs',
					'indexPathAbs',
				])
			: serverOptions;
	// After `validateTransitionArgs` succeeded, `args.to` is one of
	// the 7 known statuses. The `as IProposalStatus` cast is the
	// explicit narrow — TypeScript cannot infer the type narrowing
	// across the early-return boundary, so we re-state it.
	const to: IProposalStatus = isKnownStatus(args.to)
		? args.to
		: (args.to as IProposalStatus);

	const found = await locateProposal(args.id, {
		indexPathAbs: options.indexPathAbs ?? '',
		proposalsDirAbs: options.proposalsDirAbs,
	});
	if (found === null) {
		return toolError(
			`no proposal with id "${args.id}" found under ${options.proposalsDirAbs}`,
			'Check the id, or run sync_proposals first.',
		);
	}
	const explicitProposalState =
		(await options.proposalLifecycleStateReader?.getProposalState({
			proposalId: args.id,
			path: found.absPath,
		})) ?? null;
	if (explicitProposalState?.status === 'done') {
		if (to === 'done') {
			const sourcePath =
				explicitProposalState.sourcePath ?? found.absPath;
			const transitionMetadata = resolveTransitionMetadata(args);
			const envelope = {
				ok: true as const,
				...alreadyClosedOutcome({
					entity: lifecycleEntity({
						id: args.id,
						entity: 'proposal',
						status: 'done',
						path: sourcePath,
					}),
					reason: 'close retried against SQL-backed state after the proposal had already closed',
					currentStatus: 'done',
				}),
				id: args.id,
				from: 'done',
				to,
				reason: args.reason,
				transitionId: transitionMetadata.transitionId,
				correlationId: transitionMetadata.correlationId,
				idempotencyKey: transitionMetadata.idempotencyKey,
				idempotentReplay: false,
				movedTo:
					typeof sourcePath === 'string'
						? sourcePath
						: relative(options.proposalsDirAbs, found.absPath),
			};
			return {
				content: [
					{ type: 'text' as const, text: JSON.stringify(envelope) },
				],
				structuredContent: envelope,
			};
		}
	}

	const from = validateCurrentStatus(args.id, found);
	if (typeof from !== 'string') return from;
	let missingInitialRead = false;
	const raw = await new SafeWorkspaceReader(options.proposalsDirAbs)
		.readText(relative(options.proposalsDirAbs, found.absPath))
		.then((value) => value.content)
		.catch(() => {
			missingInitialRead = true;
			return '';
		});
	if (missingInitialRead && to === 'done') {
		const relocated = await locateProposal(args.id, {
			indexPathAbs: options.indexPathAbs ?? '',
			proposalsDirAbs: options.proposalsDirAbs,
		});
		if (relocated !== null && relocated.status === 'done') {
			const transitionMetadata = resolveTransitionMetadata(args);
			const envelope = {
				ok: true as const,
				...alreadyClosedOutcome({
					entity: lifecycleEntity({
						id: args.id,
						entity: 'proposal',
						status: relocated.status,
						path: relative(
							options.proposalsDirAbs,
							relocated.absPath,
						),
					}),
					reason: 'close retried from a stale read after the proposal had already moved to done',
					currentStatus: relocated.status,
				}),
				id: args.id,
				from,
				to,
				reason: args.reason,
				transitionId: transitionMetadata.transitionId,
				correlationId: transitionMetadata.correlationId,
				idempotencyKey: transitionMetadata.idempotencyKey,
				idempotentReplay: false,
				movedTo: relative(options.proposalsDirAbs, relocated.absPath),
			};
			return {
				content: [
					{ type: 'text' as const, text: JSON.stringify(envelope) },
				],
				structuredContent: envelope,
			};
		}
	}
	const transitionMetadata = resolveTransitionMetadata(args);
	const storedTransitionMetadata = readStoredTransitionMetadata(raw);

	let finalTo = to;
	let depId: string | undefined;

	// A pause is given its reason by whoever asks for it, and that reason
	// becomes the document's. It turns into a block only when the proposal
	// is already blocked by something, or the reason says outright what it
	// is blocked by. The reason used to be searched for any proposal id,
	// and one that merely named another proposal ("recorded in c00530")
	// blocked this one on it.
	let pauseReason: string | undefined;
	if (to === 'paused') {
		const pausedReason = readFrontmatterField(raw, 'paused-reason');
		if (!pausedReason || pausedReason.trim() === '') {
			const dependency =
				/\bblocked[- ]by\s+([a-z]\d{5})/iu.exec(args.reason)?.[1] ??
				/[a-z]\d{5}/u.exec(
					readFrontmatterField(raw, 'blocked-by') ?? '',
				)?.[0];
			if (dependency !== undefined) {
				finalTo = 'blocked';
				depId = dependency;
			} else {
				pauseReason = args.reason.trim();
			}
		}
	}

	if (
		transitionMetadata.idempotencyKey !== undefined &&
		storedTransitionMetadata.idempotencyKey ===
			transitionMetadata.idempotencyKey
	) {
		if (found.status === finalTo) {
			return buildIdempotentReplayResult({
				proposalId: args.id,
				currentStatus: found.status,
				targetStatus: finalTo,
				reason: args.reason,
				relativePath: relative(options.proposalsDirAbs, found.absPath),
				metadata: storedTransitionMetadata,
			});
		}
		return buildCodeError(
			'idempotency-key-conflict',
			`idempotencyKey "${transitionMetadata.idempotencyKey}" was already applied to ${args.id} and cannot be reused for a different target status`,
			undefined,
			undefined,
			lifecycleEntity({
				id: args.id,
				entity: 'proposal',
				status: found.status,
				path: relative(options.proposalsDirAbs, found.absPath),
			}),
		);
	}

	if (from === 'done' && finalTo === 'done') {
		const envelope = {
			ok: true as const,
			...alreadyClosedOutcome({
				entity: lifecycleEntity({
					id: args.id,
					entity: 'proposal',
					status: found.status,
					path: relative(options.proposalsDirAbs, found.absPath),
				}),
				reason: 'proposal is already closed',
				currentStatus: found.status,
			}),
			id: args.id,
			from,
			to: finalTo,
			reason: args.reason,
			transitionId: transitionMetadata.transitionId,
			correlationId: transitionMetadata.correlationId,
			idempotencyKey: transitionMetadata.idempotencyKey,
			idempotentReplay: false,
			movedTo: relative(options.proposalsDirAbs, found.absPath),
		};
		return {
			content: [
				{ type: 'text' as const, text: JSON.stringify(envelope) },
			],
			structuredContent: envelope,
		};
	}

	const regressionGuard = guardDoneToReviewRegression({
		from,
		to: finalTo,
		force: args.force,
		reason: args.reason,
	});
	if (!regressionGuard.ok) {
		return buildCodeError(regressionGuard.code, regressionGuard.reason);
	}
	if (
		args.reason.trim() === '' &&
		!(from === 'done' && finalTo === 'review' && args.force === true)
	) {
		return toolError(
			'reason is required',
			'Call proposal_transition with a non-empty reason (audit trail).',
		);
	}
	if (args.force === true && options.forceTransitions === 'people') {
		return buildCodeError(
			'force-reserved-to-people',
			`This project reserves force to people: no tool call moves ${args.id} past its gates.`,
			`Move it without force, and fix what the refusal names. Skipping a gate is the owner's decision, made by moving the file and merging by hand.`,
		);
	}

	const isZeroWorkShortcut =
		(from === 'ready' || from === 'pending') && finalTo === 'done';
	const skipsDfa =
		(from === 'done' && finalTo === 'review' && args.force === true) ||
		isZeroWorkShortcut ||
		args.skipDfaForPlanClosure === true;
	// Plan-closure shortcut: every skip is audited with the
	// proposal id, caller reason, and `via: 'plan-closure-shortcut'`
	// marker — same shape as `recordPeerReviewBypass`. Only the
	// `proposals_close_plan` wrapper sets this flag (after a successful
	// closure preflight); the compat layer strips it from MCP callers,
	// so only audited wrapper invocations ever reach this branch.
	if (args.skipDfaForPlanClosure === true) {
		recordPlanClosureBypass({
			proposalId: args.id,
			reason: args.reason,
			...(args.agent !== undefined ? { agent: args.agent } : {}),
		});
	}
	if (!skipsDfa) {
		const dfaRejection = validateTransition(
			args.id,
			from === 'pending' ? 'ready' : from,
			finalTo,
		);
		if (dfaRejection !== null) return dfaRejection;
	}

	if (isZeroWorkShortcut) {
		if (args.validationScope === 'scoped') {
			return buildCodeError(
				'invalid-evidence',
				'validationScope must be global when transitioning a proposal to done',
			);
		}
		const evidenceCheck = await checkTransitionEvidence(
			args.validateEvidence,
			undefined,
			'global',
		);
		if (!evidenceCheck.ok) {
			return buildCodeError(evidenceCheck.code, evidenceCheck.reason);
		}
	}
	// Every slice must be `Status: done` and every
	// `Files:` declared in done slices must resolve on disk. Originally
	// gated to the ready/pending→done shortcut only, on the theory that
	// `review → done` already has the peer-review gate as its strong
	// signal — but peer review only ever sees the proposal's MARKDOWN
	// TEXT, never the filesystem; an approving reviewer has no way to
	// notice that a `Files:` entry doesn't exist or a slice is still
	// `rework`. Now runs on every transition that lands on `done`,
	// regardless of which prior state it came from. `force: true` still
	// bypasses it — same precedent as the validate-evidence check below —
	// an explicit, audited (required `reason`) override, not a new gap.
	if (finalTo === 'done' && args.force !== true) {
		const completenessGuard = await guardTransitionToDone({
			proposalPath: found.absPath,
			markdown: raw,
			workspaceRoot: options.workspaceRoot,
		});
		if (!completenessGuard.ok) {
			return buildCodeError(
				completenessGuard.code,
				`slice-completeness gate: ${completenessGuard.code}; ` +
					`pendingSlices=[${completenessGuard.pendingSlices.join(',')}] ` +
					`missingFiles=${JSON.stringify(completenessGuard.missingFiles.slice(0, 5))}`,
			);
		}
	}

	// A proposal enters review only in a state a reviewer can act on: its
	// declared files exist, and each slice names the commit that delivered
	// it, recorded now from the branch being handed over (x00745).
	if (finalTo === 'review' && from !== 'done' && args.force !== true) {
		const branches = await projectBranches(options.workspaceRoot);
		const entry = await prepareReviewEntry({
			markdown: raw,
			workspaceRoot: options.workspaceRoot,
			run: options.gitRunner ?? createGitRunner(options.workspaceRoot),
			integration: branches.integration,
			refShape: branches,
		});
		if (!entry.ok) {
			return buildCodeError(entry.code, entry.reason, entry.nextAction);
		}
		if (entry.recorded.length > 0) {
			await writeFileAtomic(found.absPath, entry.markdown);
		}
	}

	if (
		!isZeroWorkShortcut &&
		args.force !== true &&
		args.skipDfaForPlanClosure !== true &&
		options.requireValidateEvidence !== false &&
		finalTo === 'done'
	) {
		// A green local validate, or the integration branch's certified
		// full run containing every commit the proposal shipped in.
		const validateEvidence =
			(await resolveRecentValidateEvidence({
				workspaceRoot: options.workspaceRoot,
				validateEvidence: args.validateEvidence,
				deps: options.validateEvidenceDeps,
			})) ??
			(await certifiedDelivery(
				raw,
				options.workspaceRoot,
				options.gitRunner,
			));
		if (validateEvidence === null) {
			const envelope = buildValidateRequiredEnvelope(
				await diagnoseValidateEvidence({
					workspaceRoot: options.workspaceRoot,
					...(options.validateEvidenceDeps !== undefined
						? { deps: options.validateEvidenceDeps }
						: {}),
				}),
			);
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

	if (
		isCiEnvironment() &&
		args.force !== true &&
		args.skipDfaForPlanClosure !== true &&
		(finalTo === 'review' || finalTo === 'done') &&
		!hasProposalCiEvidence(raw)
	) {
		return buildCodeError(
			'missing-ci-evidence',
			`CI requires frontmatter evidence.commit and at least one evidence.ci-runs entry before moving a proposal to ${finalTo}`,
		);
	}

	if (
		isCiEnvironment() &&
		args.force !== true &&
		args.skipDfaForPlanClosure !== true &&
		(finalTo === 'review' || finalTo === 'done') &&
		!hasExactCiCommitEvidence(raw)
	) {
		return buildCodeError(
			'ci-evidence-sha-mismatch',
			`CI requires evidence.commit to match GITHUB_SHA before moving a proposal to ${finalTo}`,
		);
	}

	const peerReviewRejection = await runPeerReviewGate({
		args,
		found,
		options,
		raw,
		from,
		finalTo,
	});
	if (peerReviewRejection !== null) return peerReviewRejection;

	if (finalTo === 'done') {
		// What delivered the proposal is taken from its slices when the
		// frontmatter does not repeat it: written before the move below,
		// which reads the document again.
		const closing = withShippedInFromSlices(raw);
		if (closing !== raw) await writeFileAtomic(found.absPath, closing);
		const yamlBlock = extractYamlBlock(closing);
		const frontmatter =
			yamlBlock === null
				? {}
				: (parseFrontmatterBlock(yamlBlock) as Record<string, unknown>);
		const shippedInGuard = guardShippedInPresent(frontmatter);
		if (!shippedInGuard.ok) {
			return buildCodeError(
				shippedInGuard.code,
				shippedInGuard.reason,
				shippedInGuard.nextAction,
				shippedInGuard.fix,
			);
		}
	}

	const guardRejection = await maybeApplyPlanClosureGuard(
		args,
		found,
		options,
	);
	if (guardRejection !== null) return guardRejection;

	if (args.force === true) {
		await logForcedTransition({
			workspaceRoot: options.workspaceRoot,
			proposalId: args.id,
			from,
			to: finalTo,
			reason: args.reason.trim(),
			ts: new Date().toISOString(),
			caller: buildForcedRegressionCaller(args.agent),
			via: 'force',
			skippedGates: gatesSkippedByForce({
				from,
				to: finalTo,
				via: 'force',
				requireValidateEvidence:
					options.requireValidateEvidence !== false &&
					args.skipDfaForPlanClosure !== true,
				requirePeerReview: options.requirePeerReview !== false,
				inCi: isCiEnvironment() && args.skipDfaForPlanClosure !== true,
			}),
		});
	}

	// Written before the move below, which reads the document again.
	if (pauseReason !== undefined && pauseReason.length > 0) {
		await writeFileAtomic(
			found.absPath,
			setFrontmatterField(
				raw,
				'paused-reason',
				JSON.stringify(
					`Paused ${new Date((options.now ?? Date.now)()).toISOString().slice(0, ISO_DATE_LENGTH)}: ${pauseReason}`,
				),
			),
		);
	}
	// ApplyTransition rewrites self-`**Files**` paths and
	// regenerates the index (when indexPathAbs is set) before returning.
	const result = await applyTransition(
		{
			id: args.id,
			from,
			to: finalTo,
			reason: args.reason,
			transitionId: transitionMetadata.transitionId,
			correlationId: transitionMetadata.correlationId,
			idempotencyKey: transitionMetadata.idempotencyKey,
		},
		found,
		options,
		depId,
	);
	if (result.isError !== true) {
		await journalProposalTransition(
			options.workspaceRoot,
			args.id,
			from,
			finalTo,
			args.agent,
		);
		recordMeasuredTransition(options.durationRecorder, {
			previousMarkdown: raw,
			to: finalTo,
			agent: args.agent,
			nowMs: (options.now ?? Date.now)(),
		});
	}
	if (
		result.isError !== true &&
		finalTo === 'review' &&
		typeof options.peerReviewLogPathAbs === 'string'
	) {
		// Await (not fire-and-forget): the audit line must land before the
		// tool returns so tests and hosts can tear down the workspace
		// without racing the `withFileMutex` sidecar write (ENOTEMPTY on
		// `rm -rf .cache`). Failures are swallowed — the transition result
		// must never fail because a best-effort log append failed.
		await recordProposalEnteredReview({
			logPathAbs: options.peerReviewLogPathAbs,
			proposalId: args.id,
			from,
		}).catch(() => undefined);
	}
	// The sync after the move may have renamed the file to its canonical
	// slug (x00676): everything after this point, and the answer, use the
	// file that exists.
	const reported = movedPathOf(result);
	const landed =
		result.isError === true || reported === undefined
			? reported
			: await landedPath(options.proposalsDirAbs, reported, args.id);
	// The hand-off is the one moment the implementer is certainly
	// present, so it opens the rounds the reviewer will act on.
	if (
		result.isError !== true &&
		finalTo === 'review' &&
		options.requirePeerReview !== false &&
		args.agent !== undefined &&
		landed !== undefined
	) {
		await openReviewRounds({
			docPathAbs: join(options.proposalsDirAbs, landed),
			proposalId: args.id,
			implementer: args.agent,
			workspaceRoot: options.workspaceRoot,
		});
	}
	return landed === reported || landed === undefined
		? result
		: withLandedPath(result, landed);
};
