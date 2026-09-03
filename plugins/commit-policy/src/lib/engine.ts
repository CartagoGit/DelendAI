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

import { createHash } from 'node:crypto';

import {
	branchProtectedRefusal,
	isBranchProtected,
	type IBranchPolicy,
} from './contracts/branch';
import {
	computeIdempotencyKey,
	ProcessedEventsStoreReadError,
	type IProcessedEventsStore,
} from './processed-events';
import {
	buildScopedMessage,
	runCommitDriver,
	type ICommitDriverInput,
	type ICommitDriverOptions,
	type ICommitDriverResult,
} from './services/commit-driver';
import type { IPushDriverResult } from './services/push-driver';
import {
	gitDirtyFilePaths,
	validateConventionalHeader,
	type ConventionalHeaderStatus,
} from './services/git-extra';
import { withGitWriteLock } from './services/git-write-lock';
import { resolveCommitScope } from './services/resolve-scope';
import {
	getPositiveOwnership,
	type IPositiveOwnership,
} from './services/agent-lock-positive-ownership';
import type { ILockExpiryPolicy } from '@mcp-vertex/core/lib/contracts/interfaces/lock-entry-expiry.interface';
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
	| 'CAUSALITY_VIOLATION'
	| 'TRIGGER_HAS_NO_FILES'
	| 'STORE_READ_ERROR'
	| 'PUSH_FAILED'
	| 'NOTHING_TO_COMMIT'
	| 'SLICE_FILES_MISSING'
	| 'SLICE_FILES_IGNORED'
	| 'UNKNOWN_REFUSAL'
	| 'SETTLEMENT_IN_PROGRESS';

/**
 * Every refusal code, as a runtime value.
 *
 * This array and `IEngineRefusalCode` used to be maintained
 * separately, and had silently drifted apart: the union carried
 * sixteen codes while the array carried eight, one of which
 * (`ALREADY_PROCESSED`) is not a refusal at all. Anything validating
 * against the array accepted a different set from anything typed
 * against the union — the same reader/writer mismatch that has cost
 * this project several days elsewhere.
 *
 * `satisfies` makes the compiler enforce that they stay one set:
 * a code added to the union and not to this array no longer
 * compiles.
 */
export const ENGINE_REFUSAL_CODES = [
	'SELECTOR_REQUIRED',
	'INCOMPLETE_SELECTOR',
	'SLICE_NOT_FOUND',
	'SLICE_NOT_IN_CONFIGURED_STATUS',
	'SLICE_HAS_NO_FILES',
	'WORKSPACE_HAS_NO_FILES',
	'BRANCH_PROTECTED',
	'EMPTY_HEADER',
	'MALFORMED_HEADER',
	'UNKNOWN_TYPE',
	'NON_CONVENTIONAL_MESSAGE',
	'CROSS_AGENT_CONTAMINATION',
	'CAUSALITY_VIOLATION',
	'TRIGGER_HAS_NO_FILES',
	'STORE_READ_ERROR',
	'PUSH_FAILED',
	'NOTHING_TO_COMMIT',
	'SLICE_FILES_MISSING',
	'SLICE_FILES_IGNORED',
	'UNKNOWN_REFUSAL',
	'SETTLEMENT_IN_PROGRESS',
] as const satisfies readonly IEngineRefusalCode[];

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

/**
 * r00418 / UX request 2026-09-02: stop flooding stderr with one
 * JSON line per pipeline step. The `OK` / `SKIP` steps are
 * observable through the final `pipeline.summary` line below,
 * which the host sees on stderr/stdout exactly once per event.
 * `ERR` and `CAUSALITY_VIOLATION` / `WORKSPACE_HAS_NO_FILES`
 * still surface as `console.warn` because those are actionable.
 *
 * Hosts that want per-step telemetry (debugging the engine,
 * writing the audit pipeline) can pass `MCP_COMMIT_POLICY_DEBUG=1`
 * in the env — it forces the per-step stream back to
 * `console.debug`.
 */
const LOG_PIPELINE_DEBUG = process.env.MCP_COMMIT_POLICY_DEBUG === '1';

/**
 * Render an event id for a LOG LINE — never for identity.
 *
 * A slice's `eventId` is the whole event serialised: kind, proposal,
 * slice, status and every declared path. That is deliberate, because
 * the idempotency key is derived from it and any two events with the
 * same content must dedupe. It is also completely unreadable in a log,
 * and it is emitted twice per event (`pipeline.step` and
 * `pipeline.summary`). A slice declaring twenty files produced several
 * kilobytes of stderr per attempt, and the operator's console became
 * unusable during a replay — the flood the user reported on 2026-09-03.
 *
 * So the log gets a short, stable digest instead. Identical events
 * still produce identical digests, so lines remain groupable and
 * greppable, and the storm detector keeps working. The full event is
 * still available in the processed-events store when it is genuinely
 * needed.
 */
const logEventId = (eventId: string): string =>
	eventId.length <= 64
		? eventId
		: `sha256:${createHash('sha256').update(eventId).digest('hex').slice(0, 16)}`;

const logPipelineStep = (
	event: IEngineEvent,
	step: IPipelineStep,
	outcome: IPipelineOutcome,
	details?: Record<string, unknown>,
): void => {
	const line = JSON.stringify({
		event: 'pipeline.step',
		trigger: event.kind,
		eventId: logEventId(event.eventId),
		step,
		outcome,
		...(details ?? {}),
	});
	if (LOG_PIPELINE_DEBUG) {
		console.debug(line);
		return;
	}
	if (outcome === 'ERR') {
		console.warn(line);
	}
	// OK / SKIP go to stderr at debug level only — the summary line
	// below is the operator's single-line audit signal.
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
	/**
	 * q00013 S2: optional hook that returns the current
	 * settlement phase. When the phase is `settling`, the engine
	 * refuses new slice commits with `SETTLEMENT_IN_PROGRESS`.
	 * Hosts that don't yet wire the settlement gate leave this
	 * undefined; behaviour matches the pre-q00013 default.
	 */
	readonly settlementRead?:
		| (() => Promise<'active' | 'settling' | 'stable'>)
		| undefined;
	readonly onDispose?: readonly (() => void)[] | undefined;
}

export interface ICommitPolicyEngine {
	handle(event: IEngineEvent | ITriggerEvent): Promise<IEngineResult>;
	dispose(): void;
}

/**
 * f00417: read the agent-lock store and return positive ownership
 * for the agent/task pair on this slice event. The slice trigger
 * does not yet emit agentId/taskId — that wiring lands with
 * q00013 (S4, repair agent) and the proposals-event enrichment
 * from f00417 S1+. Until then we return `undefined` and the
 * resolver falls back to declared-only canonical files, which is
 * the safe default.
 */
const readSliceOwnership = async (input: {
	readonly event: IEngineEvent & { readonly kind: 'slice' };
	readonly options: IEngineOptions;
}): Promise<IPositiveOwnership | undefined> => {
	if (input.options.driver.workspaceRoot === undefined) return undefined;
	const event = input.event as IEngineEvent & {
		readonly kind: 'slice';
	} & {
		readonly agentId?: string;
		readonly taskId?: string;
	};
	const agentId =
		'agentId' in event && typeof event.agentId === 'string'
			? event.agentId
			: (input.options.driver.selfAgent ?? undefined);
	if (agentId === undefined) return undefined;
	const taskId =
		'transitionId' in event && typeof event.transitionId === 'string'
			? event.transitionId
			: `${input.event.proposalId}-${input.event.sliceId}`;
	const owned = await getPositiveOwnership({
		workspaceRoot: input.options.driver.workspaceRoot,
		agentId,
		taskId,
		policy: DEFAULT_LOCK_EXPIRY_POLICY,
	});
	if (owned.length === 0) return undefined;
	return { agentId, taskId, ownedFiles: owned };
};

/**
 * Default expiry used for the agent-lock reader — 1 minute of staleness
 * is the same window proposals uses, so positive-ownership never
 * blocks on a dead holder.
 */
const DEFAULT_LOCK_EXPIRY_POLICY: ILockExpiryPolicy = {
	staleAfterMinutes: 1,
};

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
				// Same reasoning as the `files ?? []` guards below:
				// a trigger arriving without a `files` envelope must
				// become a refusal, not a crash out of `handle()`.
				files: event.files?.paths ?? [],
				eventId,
			};
		}
		if (event.kind === 'threshold' || event.kind === 'interval') {
			return {
				kind: event.kind,
				files: event.files?.paths ?? [],
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
			// r00418: emit one single-line summary so the operator can
			// see the event's outcome without grepping through 8
			// pipeline.step JSON blobs. ERR-only if there's an error,
			// else debug (or nothing when LOG_PIPELINE_DEBUG is on,
			// in which case the per-step stream already covers this).
			const summaryLine = JSON.stringify({
				event: 'pipeline.summary',
				trigger: event.kind,
				eventId: logEventId(event.eventId),
				outcome: result.ack,
				...(result.ack === 'OK'
					? {
							committed: result.committed,
							sha: result.commitSha,
							files: result.commitSha
								? (result.warnings?.length ?? 0)
								: 0,
						}
					: result.ack === 'ALREADY_PROCESSED'
						? { key: result.key }
						: { code: result.code, reason: result.reason }),
			});
			if (LOG_PIPELINE_DEBUG) {
				console.debug(summaryLine);
			} else if (result.ack === 'ERR') {
				console.warn(summaryLine);
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

		// Step 1.5 — settlement gate (q00013 S2). When the swarm
		// is in SETTLING, no new slice commits are accepted.
		// We surface SETTLEMENT_IN_PROGRESS so the listener knows
		// to retry once the round completes (or DEAD_LETTER if
		// the round times out — covered by f00418 retry taxonomy).
		if (event.kind === 'slice' && options.settlementRead !== undefined) {
			const phase = await options.settlementRead();
			if (phase === 'settling') {
				return failAt(
					'branch',
					'SETTLEMENT_IN_PROGRESS',
					`slice ${event.proposalId}-${event.sliceId} arrived during settlement; the host will retry once the round completes`,
				);
			}
		}

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
		// `files` is typed non-optional, but this engine is fed by a
		// plugin listener over a JSON event stream, where a malformed
		// or older-schema event really can arrive without it. Reading
		// `.length` off `undefined` threw out of `handleEvent` — the
		// caller got a stack trace instead of a refusal, the event
		// stayed pending, and the listener retried it forever. A
		// missing file list is the same situation as an empty one:
		// refuse it, say so, and let it be terminal.
		if (event.kind === 'slice' && (event.files ?? []).length === 0) {
			completeStep('idempotency', 'SKIP');
			return failAt(
				'stage',
				'SLICE_HAS_NO_FILES',
				`slice ${event.proposalId}-${event.sliceId} declared no files`,
			);
		}
		if (
			(event.kind === 'threshold' || event.kind === 'interval') &&
			(event.files ?? []).length === 0
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
		//
		// f00417: before composing the driver input, resolve the
		// slice's machine-readable commit scope. The resolver
		// classifies every declared entry as either canonical
		// git-path or unresolved (recorded in WARN, never
		// refusal). For slice events we then force the driver
		// to use the resolved scope and force `enforceSubset`
		// regardless of `sliceScoping`/`allowForeignChanges`.
		let resolvedSliceScope:
			| {
					readonly proposalId: string;
					readonly sliceId: string;
					readonly files: readonly string[];
			  }
			| undefined;
		if (event.kind === 'slice') {
			const workspaceDirty = await gitDirtyFilePaths(options.driver.run);
			const ownership = await readSliceOwnership({
				event,
				options,
			});
			const scope = resolveCommitScope({
				proposalId: event.proposalId,
				sliceId: event.sliceId,
				declaredFiles: event.files,
				...(ownership !== undefined ? { ownership } : {}),
				workspaceDirty,
			});
			if (scope.unresolvedEntries.length > 0) {
				console.warn(
					JSON.stringify({
						event: 'commit-policy.scope.unresolved',
						proposalId: event.proposalId,
						sliceId: event.sliceId,
						count: scope.unresolvedEntries.length,
						sample: scope.unresolvedEntries.slice(0, 3),
					}),
				);
			}
			if (scope.foreignDirtyExcluded.length > 0) {
				// `console.debug`, not `console.warn`. This list is
				// documented in the resolver as purely informational —
				// declared paths that were not dirty when the slice
				// fired, which is the NORMAL case for a slice whose
				// files are already committed. Emitting it as a warning
				// put one alarming line on the operator's console for
				// essentially every slice, which is how a healthy
				// system ends up looking broken and how real warnings
				// stop being read.
				console.debug(
					JSON.stringify({
						event: 'commit-policy.scope.foreignDirtyExcluded',
						proposalId: event.proposalId,
						sliceId: event.sliceId,
						count: scope.foreignDirtyExcluded.length,
						sample: scope.foreignDirtyExcluded.slice(0, 5),
					}),
				);
			}
			resolvedSliceScope = {
				proposalId: scope.proposalId,
				sliceId: scope.sliceId,
				files: scope.files,
			};
			if (scope.files.length === 0) {
				// No canonical, agent-owned, dirty paths.
				// f00417 S2: terminal NO_CHANGE, persisted.
				completeStep('idempotency', 'SKIP');
				const reason =
					scope.unresolvedEntries.length > 0
						? `NO_CHANGE: declared files unresolvable (${scope.unresolvedEntries.length} entries)`
						: 'NO_CHANGE: scope resolved to zero files';
				if (options.processedEvents !== undefined) {
					await options.processedEvents.recordTerminal(
						computeIdempotencyKey(event),
						'NO_CHANGE',
						reason,
					);
				}
				return finish({
					ack: 'OK',
					committed: false,
					pushed: false,
					commitCreated: false,
					headMoved: false,
					refusal: reason,
				});
			}
		}
		const driverInput = toDriverInput(
			event,
			baseMessage,
			resolvedSliceScope,
		);
		// f00417: thread the resolved slice scope into the driver
		// so the post-stage subset check can upgrade
		// CROSS_AGENT_CONTAMINATION to CAUSALITY_VIOLATION. Manual
		// events carrying a sliceContext still go through the older
		// path; only auto slice events get the new code.
		if (event.kind === 'slice' && resolvedSliceScope !== undefined) {
			(
				driverInput as { resolvedSliceScope?: unknown }
			).resolvedSliceScope = resolvedSliceScope;
		}
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
			// Two refusals are FINAL ANSWERS, not failures, and
			// retrying them can only produce the same answer again:
			//
			//   NOTHING_TO_COMMIT   the slice's files already match
			//                       HEAD — the work IS persisted.
			//   CAUSALITY_VIOLATION something outside the resolved
			//                       scope reached the index. Staging
			//                       is already rolled back; running
			//                       it again re-stages the same extras.
			//
			// Both were falling through as `ack: 'ERR'`, which leaves
			// the event pending in the listener and schedules another
			// attempt — a single-slice retry loop. Record them as
			// terminal so the event is never replayed, and answer OK
			// so the caller stops.
			const terminal = TERMINAL_REFUSAL_OUTCOMES[refusal.code];
			if (terminal !== undefined) {
				if (options.processedEvents !== undefined) {
					await options.processedEvents.recordTerminal(
						computeIdempotencyKey(event),
						terminal,
						refusal.reason,
					);
				}
				completeStep('stage', 'SKIP', {
					code: refusal.code,
					reason: refusal.reason,
				});
				return finish({
					ack: 'OK',
					committed: false,
					pushed: false,
					commitCreated: false,
					headMoved: false,
					refusal: refusal.reason,
				});
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
	resolvedSliceScope:
		| {
				readonly proposalId: string;
				readonly sliceId: string;
				readonly files: readonly string[];
		  }
		| undefined,
): ICommitDriverInput => {
	switch (event.kind) {
		case 'slice':
			// f00417: slice events ALWAYS commit only the
			// machine-resolved scope. `sliceScoping`/`allowForeignChanges`
			// no longer control this path; they still apply to
			// threshold/interval/manual. The subset check
			// (`enforceSubset`) is also forced for slice events
			// — see `executeGuardedCommit` and the driver.
			return {
				message,
				sliceContext: {
					proposalId: event.proposalId,
					sliceId: event.sliceId,
					// Prefer the machine-resolved scope. When the
					// resolver did not run, fall back to the files the
					// slice DECLARED — never to an empty list (which the
					// driver rightly refuses as SLICE_HAS_NO_FILES) and
					// never to workspace dirt.
					files:
						resolvedSliceScope !== undefined
							? resolvedSliceScope.files
							: event.files,
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

/**
 * Run the guarded commit for an engine event.
 *
 * This used to be a full second copy of the commit driver, living
 * privately in this file: it re-resolved identity, re-checked branch
 * protection, and — critically — re-derived the commit scope from
 * `sliceScoping` / `allowForeignChanges`, falling back to
 * `gitDirtyFilePaths()` for a slice. The consequence was that the
 * AUTOMATIC slice listener (the only caller of this function) ran
 * different code from `runCommitDriver`, which is what every commit
 * test in this plugin exercises. The causality tests passed while the
 * path that actually fires on every slice event kept the bug, and no
 * e2e test covered it, because both were "the commit driver" by name.
 *
 * There is now exactly one implementation. `runCommitDriver` already
 * resolves the branch itself, applies the foreign-lock filter, and
 * threads `resolvedSliceScope` through to the post-stage subset check,
 * so this is a straight delegation. `branchName` is kept in the
 * signature only for the caller's logging.
 */
const executeGuardedCommit = async (
	input: ICommitDriverInput,
	options: ICommitDriverOptions,
	_branchName: string | undefined,
): Promise<{
	readonly committed: boolean;
	readonly pushed: false;
	readonly commitCreated: boolean;
	readonly headMoved: boolean;
	readonly hash?: string | undefined;
	readonly refusal?: string | undefined;
}> => {
	const result: ICommitDriverResult = await runCommitDriver(input, options);
	// The driver leaves `commitCreated` / `headMoved` optional for the
	// early refusals that never reach git; the engine's pipeline
	// reports booleans. Absent means "it did not happen".
	return {
		committed: result.committed,
		pushed: false,
		commitCreated: result.commitCreated ?? false,
		headMoved: result.headMoved ?? false,
		...(result.hash !== undefined ? { hash: result.hash } : {}),
		...(result.refusal !== undefined ? { refusal: result.refusal } : {}),
	};
};

/**
 * Refusal codes that are terminal: replaying the event cannot change
 * the answer, so the listener must stop rather than retry. Maps each
 * to the outcome recorded in the processed-events store.
 */
export const TERMINAL_REFUSAL_OUTCOMES: Partial<
	Record<
		IEngineRefusalCode,
		'NO_CHANGE' | 'CAUSALITY_VIOLATION' | 'PERMANENT_REFUSAL'
	>
> = {
	NOTHING_TO_COMMIT: 'NO_CHANGE',
	CAUSALITY_VIOLATION: 'CAUSALITY_VIOLATION',
	SLICE_FILES_MISSING: 'PERMANENT_REFUSAL',
	SLICE_FILES_IGNORED: 'PERMANENT_REFUSAL',
};

/**
 * Map driver-level refusal strings back to engine refusal codes.
 * Keeps the driver as a pure adapter while letting the engine
 * expose typed codes to callers / tests.
 *
 * Exported so a test can assert the mapping a REAL refusal string gets,
 * rather than only that a code exists somewhere in a list. Every loop
 * this repo has hit came from a refusal string reaching a classifier
 * that did not recognise it — so the string is the thing worth pinning.
 */
export const refusalToEngine = (
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
	if (refusal.includes('CAUSALITY_VIOLATION')) {
		return err('CAUSALITY_VIOLATION', refusal, metadata);
	}
	if (refusal.includes('CROSS_AGENT_CONTAMINATION')) {
		return err('CROSS_AGENT_CONTAMINATION', refusal, metadata);
	}
	// A slice naming files that do not exist in this repository can
	// NEVER succeed: `git add -- <path>` fails with "did not match any
	// files" every single time. Retrying is a loop by construction, and
	// that is exactly what an adopter project hit on 2026-09-03 — eight
	// slices from an older repo layout re-emitted about once a second,
	// indefinitely.
	//
	// This is a real problem the operator has to fix (the proposal's
	// `Files:` list is stale), so it is reported rather than swallowed —
	// but it is reported ONCE, as a terminal outcome, instead of
	// forever.
	if (/did not match any files/u.test(refusal)) {
		return err('SLICE_FILES_MISSING', refusal, metadata);
	}
	// A slice naming a gitignored path can NEVER be committed: `git add`
	// refuses it, and no amount of retrying changes .gitignore. Observed
	// live on 2026-09-03 — a slice declared `.cache/...` in its `Files:`
	// and the refusal fell through to UNKNOWN_REFUSAL, which is not
	// terminal, so the event was re-emitted indefinitely.
	//
	// The remedy belongs to the proposal author, not to the engine, so
	// this is a permanent refusal that names what to change.
	if (/paths are ignored by one of your .gitignore files/u.test(refusal)) {
		return err('SLICE_FILES_IGNORED', refusal, metadata);
	}
	// A slice whose files already match HEAD is DONE, not failed.
	// Without this the refusal fell through to the generic
	// `BRANCH_PROTECTED` fallback with `ack: 'ERR'`, the listener
	// left the event pending, and it retried forever — the same
	// shape of loop as the one we removed from the replay path,
	// just one slice at a time instead of eighty-three.
	if (/nothing to commit|no changes added/u.test(refusal)) {
		return err('NOTHING_TO_COMMIT', refusal, metadata);
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
	// Anything we do not recognise gets its OWN code, not
	// `BRANCH_PROTECTED`.
	//
	// The old fallback reused the branch-protection slot for every
	// unclassified failure, so a log full of `code: BRANCH_PROTECTED`
	// was really a log full of "we have no idea" — and a reader chasing
	// a branch-protection problem that did not exist. A refusal must
	// never name a cause it has not established; saying "unknown" is
	// more useful than saying something false.
	return err('UNKNOWN_REFUSAL', refusal, metadata);
};
