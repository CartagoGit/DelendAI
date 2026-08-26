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

import { commitAndPush, type IGitRunner } from '@mcp-vertex/core/public';

import {
	branchProtectedRefusal,
	isBranchProtected,
	type IBranchPolicy,
} from './contracts/branch';
import {
	computeIdempotencyKey,
	type IProcessedEventsStore,
} from './processed-events';
import {
	buildScopedMessage,
	runCommitDriver,
	type ICommitDriverInput,
	type ICommitDriverOptions,
} from './services/commit-driver';
import { validateConventionalHeader } from './services/git-extra';

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
	| 'BRANCH_PROTECTED'
	| 'NON_CONVENTIONAL_MESSAGE'
	| 'CROSS_AGENT_CONTAMINATION'
	| 'TRIGGER_HAS_NO_FILES';

export type IEngineResult =
	| {
			readonly ack: 'OK';
			readonly committed: boolean;
			readonly pushed: boolean;
			readonly commitSha?: string | undefined;
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
	  };

const err = (code: IEngineRefusalCode, reason: string): IEngineResult => ({
	ack: 'ERR',
	code,
	reason,
});

export interface IEngineOptions {
	readonly driver: ICommitDriverOptions;
	readonly branchPolicy: IBranchPolicy;
	/** Hook fired after a successful commit so the push scheduler can act. */
	readonly onCommitSucceeded?: (() => Promise<unknown>) | undefined;
	/**
	 * f00183 (AUD-CP-012): idempotency store. When provided,
	 * the engine checks `has(key)` BEFORE staging and adds the
	 * key AFTER a successful commit. When undefined, the engine
	 * is replay-vulnerable (only acceptable for tests).
	 */
	readonly processedEvents?: IProcessedEventsStore | undefined;
}

export interface ICommitPolicyEngine {
	handle(event: IEngineEvent): Promise<IEngineResult>;
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

	return {
		async handle(event) {
			// Step 1 — slice selector (x00262). Slice events carry
			// proposalId + sliceId from the trigger; manual events
			// may or may not carry them. Threshold / interval
			// never carry a slice selector.
			if (event.kind === 'slice') {
				if (
					event.proposalId.length === 0 ||
					event.sliceId.length === 0
				) {
					return err('INCOMPLETE_SELECTOR', 'slice selector missing');
				}
			} else if (event.kind === 'manual' && event.slice !== undefined) {
				if (
					event.slice.proposalId.length === 0 ||
					event.slice.sliceId.length === 0
				) {
					return err('INCOMPLETE_SELECTOR', 'slice selector missing');
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
				return err(
					'BRANCH_PROTECTED',
					branchProtectedRefusal(
						branchName ?? '(detached)',
						options.branchPolicy,
					),
				);
			}

			// Step 3 — message composition + conventional check
			// (x00265). Threshold / interval use a generic message
			// that is already conventional; slice events use the
			// proposal scope; manual events use the caller-supplied
			// message verbatim.
			const baseMessage = composeMessage(event);
			const verdict = validateConventionalHeader(baseMessage);
			if (
				verdict.status !== 'OK' &&
				options.driver.policy.commit.requireConventional
			) {
				return err(
					'NON_CONVENTIONAL_MESSAGE',
					`${verdict.status}: ${verdict.first}`,
				);
			}

			// Step 4 — files (x00263). Slice events must declare
			// non-empty files; threshold / interval carry the
			// dirty set; manual events may pass files or let the
			// caller pre-stage.
			if (event.kind === 'slice' && event.files.length === 0) {
				return err(
					'SLICE_HAS_NO_FILES',
					`slice ${event.proposalId}-${event.sliceId} declared no files`,
				);
			}
			if (
				(event.kind === 'threshold' || event.kind === 'interval') &&
				event.files.length === 0
			) {
				return err(
					'TRIGGER_HAS_NO_FILES',
					`${event.kind} fired with zero dirty paths`,
				);
			}

			// Step 4.5 — idempotency check (f00183). The store is
			// consulted BEFORE staging so a replay never wastes
			// work on `git add --`.
			if (options.processedEvents !== undefined) {
				const key = computeIdempotencyKey(event);
				if (await options.processedEvents.has(key)) {
					return { ack: 'ALREADY_PROCESSED', key };
				}
			}

			// Step 5 + 6 — delegate to the existing driver. It
			// owns the staging + post-stage subset check + commit
			// call; the engine is a pure router. f00183 will swap
			// the driver for an idempotency-aware variant.
			const driverInput = toDriverInput(event, baseMessage);
			const result = await runCommitDriver(driverInput, options.driver);

			if (result.refusal !== undefined) {
				return refusalToEngine(result.refusal);
			}

			// Step 7 — push (x00266). Best-effort; never blocks
			// the engine result. Errors swallowed.
			if (options.onCommitSucceeded !== undefined && result.committed) {
				void options.onCommitSucceeded().catch(() => {
					// best-effort
				});
			}

			const commitSha = result.hash;
			seen.add(event.eventId);
			// Persist the key AFTER a successful commit so a
			// replay sees the marker on the next poll.
			if (options.processedEvents !== undefined && result.committed) {
				await options.processedEvents.add(
					computeIdempotencyKey(event),
					commitSha ?? 'unknown',
				);
			}
			return {
				ack: 'OK',
				committed: result.committed,
				pushed: result.pushed,
				...(commitSha !== undefined ? { commitSha } : {}),
			};
		},
		async dispose() {
			seen.clear();
			if (options.processedEvents !== undefined) {
				await options.processedEvents.dispose();
			}
		},
	};
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
			return `chore: commit via threshold (${event.dirtyCount} dirty)`;
		case 'interval':
			return `chore: commit via interval (${event.dirtyCount} dirty)`;
		case 'manual':
			return event.message;
	}
};

const toDriverInput = (
	event: IEngineEvent,
	message: string,
): ICommitDriverInput => {
	switch (event.kind) {
		case 'slice':
			return {
				message,
				sliceContext: {
					proposalId: event.proposalId,
					sliceId: event.sliceId,
					files: event.files,
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
 * Map driver-level refusal strings back to engine refusal codes.
 * Keeps the driver as a pure adapter while letting the engine
 * expose typed codes to callers / tests.
 */
const refusalToEngine = (refusal: string): IEngineResult => {
	if (refusal.includes('BRANCH_PROTECTED')) {
		return err('BRANCH_PROTECTED', refusal);
	}
	if (refusal.includes('SLICE_HAS_NO_FILES')) {
		return err('SLICE_HAS_NO_FILES', refusal);
	}
	if (refusal.includes('TRIGGER_HAS_NO_FILES')) {
		return err('TRIGGER_HAS_NO_FILES', refusal);
	}
	if (refusal.includes('CROSS_AGENT_CONTAMINATION')) {
		return err('CROSS_AGENT_CONTAMINATION', refusal);
	}
	if (refusal.includes('NON_CONVENTIONAL_MESSAGE')) {
		return err('NON_CONVENTIONAL_MESSAGE', refusal);
	}
	// Fallback: surface the raw refusal under BRANCH_PROTECTED
	// slot (engine has no generic code; callers see the reason).
	return err('BRANCH_PROTECTED', refusal);
};

// Re-export the underlying `commitAndPush` so the plugin can
// compose the same primitives (and tests can verify nothing
// leaks through an unexpected path).
export { commitAndPush };
