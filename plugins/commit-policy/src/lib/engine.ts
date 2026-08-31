/**
 * engine.ts — the central orchestrator for every commit-policy
 * trigger. f00182 lifts the scattered checks (selector,
 * branchPolicy, conventional, staging, idempotency, push) into
 * a single `handle()` pipeline.
 *
 * Trigger factories (slice / threshold / interval / manual)
 * only emit `IEngineEvent`s; the engine owns the decision of
 * "what gets staged, committed, and pushed".
 *
 * Pipeline order (each step is independently testable; the
 * engine composes them):
 *
 *   1. selector  — slice events require proposalId + sliceId (x00262)
 *   2. branch    — refuse protected branches uniformly (x00267)
 *   3. message   — requireConventional check (x00265)
 *   4. files     — slice must declare non-empty files (x00263)
 *   5. stage     — git add -- <paths>, with subset check (x00263/x00264)
 *   6. commit    — git commit -m (via core)
 *   7. push      — push scheduler decides (x00266)
 *
 * Idempotency is delegated to f00183 (a later slice); the
 * engine records the in-memory `seen` set as a placeholder so
 * the interface is stable.
 */

import { appendAuditTrailer } from './audit/trailer';
import {
	branchProtectedRefusal,
	isBranchProtected,
	type IBranchPolicy,
} from './contracts/branch';
import { resolveAuthor } from './identity/resolver';
import {
	computeIdempotencyKey,
	ProcessedEventsStoreReadError,
	type IProcessedEventsStore,
} from './processed-events';
import {
	buildScopedMessage,
	commitWithGuard,
	type ICommitDriverInput,
	type ICommitDriverOptions,
} from './services/commit-driver';
import type { IPushDriverResult } from './services/push-driver';
import {
	gitDirtyFilePaths,
	validateConventionalHeader,
	type ConventionalHeaderStatus,
} from './services/git-extra';
import { withGitWriteLock } from './services/git-write-lock';
import type { ITriggerEvent } from './triggers/trigger-types';

/**
 * Discriminated event the engine accepts. Mirrors the trigger
 * types but is intentionally narrower — the engine is the
 * source of truth, not the triggers.
 */
export type IEngineEvent =
	| {
			readonly kind: 'slice';
			readonly proposalId: string;
			readonly sliceId: string;
			readonly files: readonly string[];
			readonly eventId: string;
	  }
	| {
			readonly kind: 'threshold';
			readonly files: readonly string[];
			readonly dirtyCount: number;
			readonly eventId: string;
	  }
	| {
			readonly kind: 'interval';
			readonly files: readonly string[];
			readonly dirtyCount: number;
			readonly eventId: string;
	  }
	| {
			readonly kind: 'manual';
			readonly message: string;
			readonly files?: readonly string[] | undefined;
			readonly slice?:
				| {
						readonly proposalId: string;
						readonly sliceId: string;
						readonly files: readonly string[];
				  }
				| undefined;
			readonly eventId: string;
	  };

/**
 * Refusal codes the engine can return. Each maps to a single
 * slice in the proposal family (x00262 / x00263 / x00265 /
 * x00267); the umbrella `NON_CONVENTIONAL_MESSAGE` keeps
 * backward compatibility with the driver-level refusal.
 */
export type IEngineRefusalCode =
	| 'SELECTOR_REQUIRED'
	| 'INCOMPLETE_SELECTOR'
	| 'SLICE_NOT_FOUND'
	| 'SLICE_NOT_IN_CONFIGURED_STATUS'
	| 'SLICE_HAS_NO_FILES'
	| 'WORKSPACE_HAS_NO_FILES'
	| 'BRANCH_PROTECTED'
	| 'EMPTY_HEADER'
	| 'MALFORMED_HEADER'
	| 'UNKNOWN_TYPE'
	| 'NON_CONVENTIONAL_MESSAGE'
	| 'CROSS_AGENT_CONTAMINATION'
	| 'TRIGGER_HAS_NO_FILES'
	| 'STORE_READ_ERROR'
	| 'PUSH_FAILED';

export const ENGINE_REFUSAL_CODES = [
	'SLICE_NOT_FOUND',
	'INCOMPLETE_SELECTOR',
	'SELECTOR_REQUIRED',
	'BRANCH_PROTECTED',
	'NON_CONVENTIONAL_MESSAGE',
	'SLICE_HAS_NO_FILES',
	'CROSS_AGENT_CONTAMINATION',
	'ALREADY_PROCESSED',
] as const;

export type IEngineResult =
	| {
			readonly ack: 'OK';
			readonly committed: boolean;
			readonly pushed: boolean;
			readonly commitCreated: boolean;
			readonly headMoved: boolean;
			readonly commitSha?: string | undefined;
			readonly warnings?: readonly string[] | undefined;
			readonly refusal?: string | undefined;
	  }
	| {
			readonly ack: 'ALREADY_PROCESSED';
			readonly key: string;
	  }
	| {
			readonly ack: 'ERR';
			readonly code: IEngineRefusalCode;
			readonly reason: string;
			readonly committed?: boolean;
			readonly pushed?: boolean;
			readonly commitCreated?: boolean;
			readonly headMoved?: boolean;
			readonly commitSha?: string | undefined;
	  };

const err = (
	code: IEngineRefusalCode,
	reason: string,
	metadata?: {
		readonly committed?: boolean;
		readonly pushed?: boolean;
		readonly commitCreated?: boolean;
		readonly headMoved?: boolean;
		readonly commitSha?: string | undefined;
	},
): IEngineResult => ({
	ack: 'ERR',
	code,
	reason,
	...(metadata ?? {}),
});

const PIPELINE_STEPS = [
	'selector',
	'branch',
	'conventional',
	'idempotency',
	'stage',
	'commit',
	'push',
] as const;

type IPipelineStep = (typeof PIPELINE_STEPS)[number];
type IPipelineOutcome = 'OK' | 'ERR' | 'SKIP';

const logPipelineStep = (
	event: IEngineEvent,
	step: IPipelineStep,
	outcome: IPipelineOutcome,
	details?: Record<string, unknown>,
): void => {
	console.info(
		JSON.stringify({
			event: 'pipeline.step',
			trigger: event.kind,
			eventId: event.eventId,
			step,
			outcome,
			...(details ?? {}),
		}),
	);
};

export interface IEngineOptions {
	readonly driver: ICommitDriverOptions;
	readonly branchPolicy: IBranchPolicy;
	/** Hook fired after a successful commit so the push scheduler can act. */
	readonly onCommitSucceeded?:
		| (() => Promise<IPushDriverResult | null>)
		| undefined;
	/**
	 * f00183 (AUD-CP-012): idempotency store. When provided,
	 * the engine checks `has(key)` BEFORE staging and adds the
	 * key AFTER a successful commit. When undefined, the engine
	 * is replay-vulnerable (only acceptable for tests).
	 */
	readonly processedEvents?: IProcessedEventsStore | undefined;
	readonly onDispose?: readonly (() => void)[] | undefined;
}

export interface ICommitPolicyEngine {
	handle(event: IEngineEvent | ITriggerEvent): Promise<IEngineResult>;
	dispose(): void;
}

/**
 * Create a fresh engine. Pure factory — no module-level state.
 * `dispose()` releases the in-memory `seen` set so multiple
 * plugin reloads (x00261) don't leak.
 */
export const createCommitPolicyEngine = (
	options: IEngineOptions,
): ICommitPolicyEngine => {
	const seen = new Set<string>();
	let handleTail = Promise.resolve();
	let generatedEventSequence = 0;
	const normalizeEvent = (
		event: IEngineEvent | ITriggerEvent,
	): IEngineEvent => {
		if ('eventId' in event) return event;
		generatedEventSequence += 1;
		const eventId = `trigger-${event.kind}-${generatedEventSequence}`;
		if (event.kind === 'slice') {
			return {
				kind: 'slice',
				proposalId: event.proposalId,
				sliceId: event.sliceId,
				files: event.files.paths,
				eventId,
			};
		}
		if (event.kind === 'threshold' || event.kind === 'interval') {
			return {
				kind: event.kind,
				files: event.files.paths,
				dirtyCount: event.dirtyCount,
				eventId,
			};
		}
		return {
			kind: 'manual',
			message: 'chore: manual commit-policy snapshot',
			eventId,
		};
	};
	const handleEvent = async (event: IEngineEvent): Promise<IEngineResult> => {
		const completedSteps = new Set<IPipelineStep>();
		const completeStep = (
			step: IPipelineStep,
			outcome: IPipelineOutcome,
			details?: Record<string, unknown>,
		): void => {
			completedSteps.add(step);
			logPipelineStep(event, step, outcome, details);
		};
		const finish = (result: IEngineResult): IEngineResult => {
			for (const step of PIPELINE_STEPS) {
				if (!completedSteps.has(step)) {
					logPipelineStep(event, step, 'SKIP');
				}
			}
			return result;
		};
		const failAt = (
			step: IPipelineStep,
			code: IEngineRefusalCode,
			reason: string,
			metadata?: {
				readonly committed?: boolean;
				readonly pushed?: boolean;
				readonly commitCreated?: boolean;
				readonly headMoved?: boolean;
				readonly commitSha?: string | undefined;
			},
		): IEngineResult => {
			completeStep(step, 'ERR', { code, reason });
			return finish(err(code, reason, metadata));
		};

		// Step 1 — slice selector (x00262). Slice events carry
		// proposalId + sliceId from the trigger; manual events
		// may or may not carry them. Threshold / interval
		// never carry a slice selector.
		if (event.kind === 'slice') {
			if (event.proposalId.length === 0 || event.sliceId.length === 0) {
				return failAt(
					'selector',
					'INCOMPLETE_SELECTOR',
					'slice selector missing',
				);
			}
		} else if (event.kind === 'manual' && event.slice !== undefined) {
			if (
				event.slice.proposalId.length === 0 ||
				event.slice.sliceId.length === 0
			) {
				return failAt(
					'selector',
					'INCOMPLETE_SELECTOR',
					'slice selector missing',
				);
			}
		}
		completeStep('selector', 'OK');

		// Step 2 — branch policy (x00267). Unified check; works
		// for any trigger that could land on a protected
		// branch. The driver also enforces this, but doing
		// the check here means we can short-circuit BEFORE
		// staging and before the post-stage subset test.
		const branch = await options.driver.run([
			'rev-parse',
			'--abbrev-ref',
			'HEAD',
		]);
		const branchName =
			branch.ok && branch.output.trim() !== 'HEAD'
				? branch.output.trim()
				: undefined;
		if (isBranchProtected(branchName, options.branchPolicy)) {
			return failAt(
				'branch',
				'BRANCH_PROTECTED',
				branchProtectedRefusal(
					branchName ?? '(detached)',
					options.branchPolicy,
				),
			);
		}
		completeStep(
			'branch',
			'OK',
			branchName !== undefined ? { branch: branchName } : undefined,
		);

		// Step 3 — message composition + conventional check
		// (x00265). Threshold / interval use a generic message
		// that is already conventional; slice events use the
		// proposal scope; manual events use the caller-supplied
		// message verbatim.
		const baseMessage = composeMessage(event);
		const verdict = validateConventionalHeader(baseMessage);
		const conventionalMessage =
			verdict.status === 'OK'
				? undefined
				: conventionalRefusal(verdict.status, verdict.first);
		if (
			verdict.status !== 'OK' &&
			options.driver.policy.commit.requireConventional
		) {
			return failAt(
				'conventional',
				verdict.status,
				conventionalMessage ?? verdict.status,
			);
		}
		completeStep('conventional', 'OK');

		// Step 4 — files (x00263). Slice events must declare
		// non-empty files; threshold / interval carry the
		// dirty set; manual events may pass files or let the
		// caller pre-stage.
		if (event.kind === 'slice' && event.files.length === 0) {
			completeStep('idempotency', 'SKIP');
			return failAt(
				'stage',
				'SLICE_HAS_NO_FILES',
				`slice ${event.proposalId}-${event.sliceId} declared no files`,
			);
		}
		if (
			(event.kind === 'threshold' || event.kind === 'interval') &&
			event.files.length === 0
		) {
			completeStep('idempotency', 'SKIP');
			return failAt(
				'stage',
				'TRIGGER_HAS_NO_FILES',
				`${event.kind} fired with zero dirty paths`,
			);
		}

		// Step 4.5 — idempotency check (f00183). The store is
		// consulted BEFORE staging so a replay never wastes
		// work on `git add --`.
		if (options.processedEvents !== undefined) {
			const key = computeIdempotencyKey(event);
			try {
				if (await options.processedEvents.has(key)) {
					completeStep('idempotency', 'OK', {
						key,
						ack: 'ALREADY_PROCESSED',
					});
					return finish({ ack: 'ALREADY_PROCESSED', key });
				}
			} catch (error) {
				if (error instanceof ProcessedEventsStoreReadError) {
					return failAt(
						'idempotency',
						'STORE_READ_ERROR',
						error.message,
					);
				}
				throw error;
			}
		}
		completeStep('idempotency', 'OK');

		// Step 5 + 6 — run the guarded commit path. It stages
		// the allow-list, enforces the post-stage subset check,
		// and commits through the isolated index flow when the
		// workspace metadata is available.
		const driverInput = toDriverInput(
			event,
			baseMessage,
			options.driver.policy.cadence.sliceScoping &&
				options.driver.policy.cadence.allowForeignChanges !== true,
		);
		const result = await executeGuardedCommit(
			driverInput,
			options.driver,
			branchName,
		);

		if (result.refusal !== undefined) {
			const refusal = refusalToEngine(result.refusal, {
				committed: result.committed,
				pushed: result.pushed,
				commitCreated: result.commitCreated,
				headMoved: result.headMoved,
				...(result.hash !== undefined
					? { commitSha: result.hash }
					: {}),
			});
			if (refusal.ack !== 'ERR') {
				return finish(refusal);
			}
			completeStep('stage', 'ERR', {
				code: refusal.code,
				reason: refusal.reason,
			});
			return finish(refusal);
		}
		completeStep('stage', 'OK');
		completeStep(
			'commit',
			'OK',
			result.hash !== undefined ? { commitSha: result.hash } : undefined,
		);

		// Step 7 — push (x00266). Wait for the scheduler so
		// callers never observe a premature success.
		const pushed = result.pushed;
		if (options.onCommitSucceeded !== undefined && result.commitCreated) {
			try {
				const pushResult = await options.onCommitSucceeded();
				if (
					pushResult !== null &&
					pushResult !== undefined &&
					!isPushSuccess(pushResult)
				) {
					return failAt(
						'push',
						pushFailureCode(pushResult),
						pushFailureReason(pushResult),
						{
							committed: true,
							pushed: false,
							commitCreated: result.commitCreated,
							headMoved: result.headMoved,
							...(result.hash !== undefined
								? { commitSha: result.hash }
								: {}),
						},
					);
				}
				if (pushResult !== null && pushResult !== undefined) {
					completeStep('push', 'OK');
					return finish({
						ack: 'OK',
						committed: true,
						pushed: true,
						commitCreated: result.commitCreated,
						headMoved: result.headMoved,
						...(result.hash !== undefined
							? { commitSha: result.hash }
							: {}),
						...(conventionalMessage !== undefined
							? { warnings: [conventionalMessage] }
							: {}),
					});
				}
			} catch (error) {
				return failAt(
					'push',
					'PUSH_FAILED',
					`push failed: ${error instanceof Error ? error.message : String(error)}`,
					{
						committed: true,
						pushed: false,
						commitCreated: result.commitCreated,
						headMoved: result.headMoved,
						...(result.hash !== undefined
							? { commitSha: result.hash }
							: {}),
					},
				);
			}
		}
		completeStep('push', 'SKIP');

		const commitSha = result.hash;
		seen.add(event.eventId);
		// Persist the key AFTER a successful commit so a
		// replay sees the marker on the next poll.
		if (options.processedEvents !== undefined && result.commitCreated) {
			await options.processedEvents.add(
				computeIdempotencyKey(event),
				commitSha ?? 'unknown',
			);
		}
		return finish({
			ack: 'OK',
			committed: result.commitCreated,
			pushed,
			commitCreated: result.commitCreated,
			headMoved: result.headMoved,
			...(commitSha !== undefined ? { commitSha } : {}),
			...(conventionalMessage !== undefined
				? { warnings: [conventionalMessage] }
				: {}),
		});
	};

	return {
		handle(event) {
			const normalizedEvent = normalizeEvent(event);
			const handleQueuedEvent = () =>
				withGitWriteLock(
					options.driver.workspaceRoot,
					options.driver.pluginCacheDir,
					() => handleEvent(normalizedEvent),
				);
			const queued = handleTail.then(handleQueuedEvent);
			handleTail = queued.then(
				() => undefined,
				() => undefined,
			);
			return queued;
		},
		async dispose() {
			seen.clear();
			for (const callback of options.onDispose ?? []) callback();
			if (options.processedEvents !== undefined) {
				await options.processedEvents.dispose();
			}
		},
	};
};

const isPushSuccess = (value: unknown): boolean =>
	typeof value === 'object' &&
	value !== null &&
	'ok' in value &&
	(value as { readonly ok?: unknown }).ok === true;

const pushFailureReason = (value: unknown): string => {
	if (typeof value === 'object' && value !== null && 'refusal' in value) {
		const refusal = (value as { readonly refusal?: unknown }).refusal;
		if (typeof refusal === 'string') return refusal;
	}
	return 'push failed';
};

const pushFailureCode = (value: unknown): IEngineRefusalCode => {
	const reason = pushFailureReason(value);
	if (
		reason.includes('BRANCH_PROTECTED') ||
		reason.includes('protectedBranches')
	) {
		return 'BRANCH_PROTECTED';
	}
	return 'PUSH_FAILED';
};

const conventionalRefusal = (
	status: ConventionalHeaderStatus,
	first: string,
): string =>
	first.length > 0
		? `NON_CONVENTIONAL_MESSAGE: ${status}: ${first}`
		: `NON_CONVENTIONAL_MESSAGE: ${status}`;

export const buildTriggerCommitMessage = (event: {
	readonly kind: 'threshold' | 'interval';
	readonly dirtyCount: number;
	readonly files?: readonly string[] | undefined;
}): string => {
	const files = event.files ?? [];
	if (files.length === 0) {
		const noun = event.dirtyCount === 1 ? 'file' : 'files';
		return `chore(snapshot): preserve concurrent agent work (${event.dirtyCount} ${noun})`;
	}
	const displayed = files.slice(0, 3);
	const suffix =
		files.length > displayed.length
			? ` +${files.length - displayed.length} more`
			: '';
	return `chore: update ${displayed.join(', ')}${suffix}`;
};

const composeMessage = (event: IEngineEvent): string => {
	switch (event.kind) {
		case 'slice':
			return buildScopedMessage(
				`feat(${event.proposalId}): commit via slice ${event.sliceId}`,
				event.proposalId,
				true,
			);
		case 'threshold':
		case 'interval':
			return buildTriggerCommitMessage({ ...event, files: event.files });
		case 'manual':
			return event.message;
	}
};

const toDriverInput = (
	event: IEngineEvent,
	message: string,
	sliceScoping: boolean,
): ICommitDriverInput => {
	switch (event.kind) {
		case 'slice':
			return {
				message,
				sliceContext: {
					proposalId: event.proposalId,
					sliceId: event.sliceId,
					files: sliceScoping ? event.files : [],
				},
			};
		case 'threshold':
		case 'interval':
			return {
				message,
				triggerContext: {
					kind: event.kind,
					files: event.files,
				},
			};
		case 'manual':
			return {
				message,
				...(event.files !== undefined ? { files: event.files } : {}),
				...(event.slice !== undefined
					? {
							sliceContext: {
								proposalId: event.slice.proposalId,
								sliceId: event.slice.sliceId,
								files: event.slice.files,
							},
						}
					: {}),
			};
	}
};

const executeGuardedCommit = async (
	input: ICommitDriverInput,
	options: ICommitDriverOptions,
	branchName: string | undefined,
): Promise<{
	readonly committed: boolean;
	readonly pushed: false;
	readonly commitCreated: boolean;
	readonly headMoved: boolean;
	readonly hash?: string | undefined;
	readonly refusal?: string | undefined;
}> => {
	const scopeSliceCommit =
		options.policy.cadence.sliceScoping &&
		options.policy.cadence.allowForeignChanges !== true;
	if (!options.policy.commit.enabled) {
		return {
			committed: false,
			pushed: false,
			commitCreated: false,
			headMoved: false,
			refusal: 'commit.enabled is false in plugins.commit-policy.options',
		};
	}

	const identity = await resolveAuthor(
		options.policy.identity,
		options.identityCtx,
	);
	if (!identity.ok) {
		return {
			committed: false,
			pushed: false,
			commitCreated: false,
			headMoved: false,
			refusal: identity.reason,
		};
	}

	if (branchName === undefined) {
		return {
			committed: false,
			pushed: false,
			commitCreated: false,
			headMoved: false,
			refusal:
				'commit refused: HEAD is detached. Check out a branch first.',
		};
	}
	if (
		isBranchProtected(branchName, {
			protected: options.policy.push.protectedBranches,
			protectedPrefixes: options.policy.push.protectedPrefixes,
		})
	) {
		return {
			committed: false,
			pushed: false,
			commitCreated: false,
			headMoved: false,
			refusal: branchProtectedRefusal(branchName, {
				protected: options.policy.push.protectedBranches,
				protectedPrefixes: options.policy.push.protectedPrefixes,
			}),
		};
	}

	const message =
		input.sliceContext !== undefined
			? buildScopedMessage(
					input.message,
					input.sliceContext.proposalId,
					options.policy.commit.autoScopeFromProposal,
				)
			: input.message;
	const finalMessage = appendAuditTrailer(
		message,
		options.policy.audit.trailer,
		options.policy.audit.agentFormat,
		options.auditAgent,
	);

	const allowList =
		input.sliceContext !== undefined && scopeSliceCommit
			? input.sliceContext.files
			: (input.files ??
				(input.triggerContext !== undefined
					? input.triggerContext.files
					: input.sliceContext !== undefined
						? await gitDirtyFilePaths(options.run)
						: []));

	if (
		input.sliceContext !== undefined &&
		scopeSliceCommit &&
		allowList.length === 0
	) {
		return {
			committed: false,
			pushed: false,
			commitCreated: false,
			headMoved: false,
			refusal: `SLICE_HAS_NO_FILES: ${input.sliceContext.proposalId}-${input.sliceContext.sliceId}`,
		};
	}
	if (
		input.sliceContext !== undefined &&
		!options.policy.cadence.sliceScoping &&
		allowList.length === 0
	) {
		return {
			committed: false,
			pushed: false,
			commitCreated: false,
			headMoved: false,
			refusal: `WORKSPACE_HAS_NO_FILES: ${input.sliceContext.proposalId}-${input.sliceContext.sliceId}`,
		};
	}
	if (input.triggerContext !== undefined && allowList.length === 0) {
		return {
			committed: false,
			pushed: false,
			commitCreated: false,
			headMoved: false,
			refusal: `TRIGGER_HAS_NO_FILES: ${input.triggerContext.kind} fired with zero dirty paths`,
		};
	}

	const result = await commitWithGuard({
		run: options.run,
		message: finalMessage,
		authorFlag: identity.author.authorFlag,
		allowList,
		enforceSubset:
			input.triggerContext !== undefined ||
			(scopeSliceCommit && input.sliceContext !== undefined),
		...(options.workspaceRoot !== undefined
			? { workspaceRoot: options.workspaceRoot }
			: {}),
		branch: branchName,
		gitTimeoutMs: options.policy.gitTimeoutMs,
	});
	if (!result.committed) {
		return result;
	}

	return {
		committed: result.commitCreated,
		pushed: false,
		commitCreated: result.commitCreated,
		headMoved: result.headMoved,
		...(result.hash !== undefined ? { hash: result.hash } : {}),
	};
};

/**
 * Map driver-level refusal strings back to engine refusal codes.
 * Keeps the driver as a pure adapter while letting the engine
 * expose typed codes to callers / tests.
 */
const refusalToEngine = (
	refusal: string,
	metadata?: {
		readonly committed?: boolean;
		readonly pushed?: boolean;
		readonly commitCreated?: boolean;
		readonly headMoved?: boolean;
		readonly commitSha?: string | undefined;
	},
): IEngineResult => {
	if (refusal.includes('BRANCH_PROTECTED')) {
		return err('BRANCH_PROTECTED', refusal, metadata);
	}
	if (refusal.includes('SLICE_HAS_NO_FILES')) {
		return err('SLICE_HAS_NO_FILES', refusal, metadata);
	}
	if (refusal.includes('TRIGGER_HAS_NO_FILES')) {
		return err('TRIGGER_HAS_NO_FILES', refusal, metadata);
	}
	if (refusal.includes('CROSS_AGENT_CONTAMINATION')) {
		return err('CROSS_AGENT_CONTAMINATION', refusal, metadata);
	}
	if (refusal.includes('WORKSPACE_HAS_NO_FILES')) {
		return err('WORKSPACE_HAS_NO_FILES', refusal, metadata);
	}
	if (refusal.includes('NON_CONVENTIONAL_MESSAGE')) {
		if (refusal.includes('EMPTY_HEADER')) {
			return err('EMPTY_HEADER', refusal, metadata);
		}
		if (refusal.includes('MALFORMED_HEADER')) {
			return err('MALFORMED_HEADER', refusal, metadata);
		}
		if (refusal.includes('UNKNOWN_TYPE')) {
			return err('UNKNOWN_TYPE', refusal, metadata);
		}
		return err('NON_CONVENTIONAL_MESSAGE', refusal, metadata);
	}
	// Fallback: surface the raw refusal under BRANCH_PROTECTED
	// slot (engine has no generic code; callers see the reason).
	return err('BRANCH_PROTECTED', refusal, metadata);
};
