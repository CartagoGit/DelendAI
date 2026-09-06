/**
 * push-scheduler.ts — orchestrates pushes after commits so the
 * three configurable modes (`onCommit`, `everyNCommits`,
 * `everyNMinutes`) interact correctly.
 *
 * x00266 (AUD-CP-008/009): unifies what was previously three
 * independent triggers (commit-side, threshold-side, interval-side)
 * into a single scheduler that:
 *
 *   1. Counts commits since the last push.
 *   2. Decides whether to push on the next commit
 *      (`onCommit` and `everyNCommits` together).
 *   3. Schedules a periodic push when `everyNMinutes` is set.
 *   4. Refuses pushes onto protected branches
 *      (delegates to `runPushDriver`, which already enforces it).
 *   5. Disposes cleanly via `stop()` so the plugin can clean up
 *      on host reload (x00261 contract).
 *
 * The scheduler holds NO knowledge of MCP or triggers. It exposes
 * a single `onCommitSucceeded()` entry point and a `stop()` for
 * teardown. The plugin wires `onCommitSucceeded` from the
 * commit-tool handler and from any future engine wrapper.
 */

import type { IGitRunner } from '@delendai/core/public';

import { branchProtectedRefusal, isBranchProtected } from '../contracts/branch';
import { classifyRefusal } from '../contracts/branch';
import { resolveProtectedBranches } from '../contracts/constants/protected-branches';
import type { ICommitPolicyPush } from '../contracts/options';
import { gitCurrentBranch, gitUnpushedCommitCount } from './git-extra';
import { runPushDriver, type IPushDriverResult } from './push-driver';
import { withGitWriteLock } from './git-write-lock';
import { buildPushCircuitNotice, createPushCircuit } from './push-circuit';

export interface IPushSchedulerOptions {
	readonly run: IGitRunner;
	readonly policy: ICommitPolicyPush;
	readonly workspaceRoot?: string | undefined;
	readonly pluginCacheDir?: string | undefined;
	/**
	 * Optional hook the host can use to observe each push attempt
	 * (success, refusal, or runtime error). Defaults to a no-op.
	 */
	readonly onAttempt?: ((result: IPushDriverResult) => void) | undefined;
}

export interface IPushScheduler {
	/**
	 * Start the periodic reconciler. It runs whenever push is enabled
	 * and any automatic push mode was asked for; `everyNMinutes` sets
	 * the cadence, and its absence no longer means "never". A no-op
	 * when push is off or no automatic mode was requested. Idempotent.
	 * The plugin calls this once after register().
	 */
	start(): void;
	/**
	 * Notify the scheduler that a commit succeeded. Returns the
	 * push result if the scheduler decided to push, otherwise
	 * `null`. Idempotent in the sense that the counter is only
	 * incremented once per call — never twice for the same
	 * commit (the plugin wires this from one handler per
	 * commit, never multiple).
	 */
	onCommitSucceeded(): Promise<IPushDriverResult | null>;
	/**
	 * Run a push now, regardless of the schedule. Used by the
	 * explicit `commit_policy_push` tool (which still wins over
	 * the scheduler — the scheduler is for the AUTOMATIC path).
	 */
	pushNow(): Promise<IPushDriverResult>;
	/** Wait for the currently running periodic push, if any. */
	flush(): Promise<void>;
	/** Tear down timers + clear state. Idempotent. */
	stop(): void;
}

const SCHEDULER_INTERVAL_MS = (minutes: number): number => minutes * 60_000;

/**
 * How often to reconcile when a host enabled push but never said how
 * often — x00427 S2.
 *
 * Five minutes is chosen to be boring: long enough that the check is
 * free next to a real push, short enough that a branch does not sit
 * behind for a working session. It only ever runs
 * `gitUnpushedCommitCount`, and pushes nothing when the branch is level.
 */
const DEFAULT_RECONCILE_MINUTES = 5;

/**
 * The interval the automatic path should actually run at, and why.
 *
 * `everyNMinutes` used to mean two things at once: how often to
 * reconcile, and whether to reconcile at all. That conflation is the
 * whole bug. A host that turned push on and asked for `onCommit` or
 * `everyNCommits` has said it wants the remote in sync; leaving foreign
 * commits behind forever is not a policy anyone selected, it is what
 * happens when nobody declared a field. `everyNMinutes` now means only
 * "how often".
 *
 * Nothing runs when push is disabled, and nothing runs when no push mode
 * was requested at all — that host really did opt out.
 */
export const resolveReconcileMinutes = (
	policy: ICommitPolicyPush,
): number | undefined => {
	if (!policy.enabled) return undefined;
	if (policy.everyNMinutes !== undefined) return policy.everyNMinutes;
	const wantsAutomaticPush =
		policy.onCommit || policy.everyNCommits !== undefined;
	return wantsAutomaticPush ? DEFAULT_RECONCILE_MINUTES : undefined;
};

export const createPushScheduler = (
	options: IPushSchedulerOptions,
): IPushScheduler => {
	let commitsSincePush = 0;
	// Stops the automatic path from retrying a refusal that cannot
	// change. Observed: a config asking for a push the repo's own
	// pre-push discipline blocks, retried identically once a minute for
	// twelve hours.
	const circuit = createPushCircuit();
	let interval: ReturnType<typeof setInterval> | undefined;
	let pendingTick: Promise<void> | undefined;
	let writeTail = Promise.resolve();
	const onAttempt = options.onAttempt ?? (() => {});

	const enqueueWrite = <T>(operation: () => Promise<T>): Promise<T> => {
		const queued = writeTail.then(operation);
		writeTail = queued.then(
			() => undefined,
			() => undefined,
		);
		return queued;
	};

	const branchRefusal = async (): Promise<string | null> => {
		const branch = await gitCurrentBranch(options.run);
		if (branch === undefined) {
			return 'push refused: HEAD is detached; check out a branch before pushing';
		}
		if (
			isBranchProtected(branch, {
				protected: resolveProtectedBranches(
					options.policy.protectedBranches,
				),
				protectedPrefixes: options.policy.protectedPrefixes,
			})
		) {
			return branchProtectedRefusal(branch, {
				protected: resolveProtectedBranches(
					options.policy.protectedBranches,
				),
				protectedPrefixes: options.policy.protectedPrefixes,
			});
		}
		return null;
	};

	const push = async (reason: string): Promise<IPushDriverResult> => {
		let result: IPushDriverResult;
		try {
			result = await withGitWriteLock(
				options.workspaceRoot,
				options.pluginCacheDir,
				() => runPushDriver({}, options.policy, options.run),
			);
		} catch (error) {
			result = {
				ok: false,
				refusal: `push failed: ${error instanceof Error ? error.message : String(error)}`,
				code: 'PUSH_FAILED',
			};
		}
		if (result.ok) {
			commitsSincePush = 0;
		}
		onAttempt(result);
		const decision = circuit.record(result);
		if (!result.ok) {
			// Surface the reason for log triage — never throw. Once the
			// breaker is open the per-attempt line stops too: repeating
			// an unchanging message every minute is the same noise the
			// breaker exists to end.
			if (!decision.open) {
				console.warn(
					`[push-scheduler] push failed (${reason}): ${result.refusal}`,
				);
			}
			if (decision.announce) {
				console.warn(
					buildPushCircuitNotice({
						refusal: decision.refusal ?? String(result.refusal),
						attempts: decision.identicalFailures,
					}),
				);
			}
		}
		return result;
	};

	const hasPendingAutomaticPush = async (): Promise<boolean> => {
		if (commitsSincePush > 0) return true;
		return (await gitUnpushedCommitCount(options.run)) > 0;
	};

	const tick = async (): Promise<void> => {
		await enqueueWrite(async () => {
			// Re-check inside the serialized lane so a timer tick
			// queued behind a successful push observes the reset
			// state and does not emit a duplicate push.
			if (!circuit.shouldAttempt()) return;
			if (!(await hasPendingAutomaticPush())) return;
			if ((await branchRefusal()) !== null) return;
			await push(`everyNMinutes=${options.policy.everyNMinutes ?? 0}`);
		});
	};

	const scheduleTick = (): void => {
		if (pendingTick !== undefined) return;
		pendingTick = tick().finally(() => {
			pendingTick = undefined;
		});
	};

	return {
		onCommitSucceeded() {
			return enqueueWrite(async () => {
				commitsSincePush += 1;
				const refusal = await branchRefusal();
				if (refusal !== null) {
					const result: IPushDriverResult = {
						ok: false,
						refusal,
						code: classifyRefusal(refusal),
					};
					onAttempt(result);
					return result;
				}
				const everyN = options.policy.everyNCommits;
				const shouldPushByCount =
					everyN !== undefined && commitsSincePush >= everyN;
				const shouldPushByCommit =
					options.policy.onCommit === true && everyN === undefined;
				if (!shouldPushByCommit && !shouldPushByCount) return null;
				// The breaker gates the automatic path only. This is the
				// branch that actually looped: `onCommit: true` plus a
				// commit every few minutes meant one guaranteed-to-fail
				// push per commit, forever.
				if (!circuit.shouldAttempt()) return null;
				// when both modes are active, the engine fires
				// ONE push (not two). The counter is reset below.
				return push(
					shouldPushByCount
						? `everyNCommits=${everyN}`
						: 'onCommit=true',
				);
			});
		},
		pushNow() {
			// An explicit push always gets a real attempt. Someone asking
			// for one deserves the current answer, not a cached refusal,
			// and a success is exactly the signal that whatever was
			// blocking has been fixed.
			circuit.reset();
			return enqueueWrite(() => push('manual'));
		},
		async flush() {
			await pendingTick;
		},
		start() {
			// the reconciling tick is what covers commits this
			// process did not make. `onCommit` cannot: it fires under
			// `commitCreated`, so the moment another agent commits and
			// leaves the tree clean, this engine creates nothing and
			// never pushes again. The branch then sits ahead of its
			// upstream while the plugin reports itself healthy, which is
			// exactly what was observed on this repository.
			const minutes = resolveReconcileMinutes(options.policy);
			if (minutes === undefined) return;
			if (interval !== undefined) return;
			interval = setInterval(
				scheduleTick,
				SCHEDULER_INTERVAL_MS(minutes),
			);
			if (typeof interval.unref === 'function') interval.unref();
		},
		stop() {
			if (interval !== undefined) {
				clearInterval(interval);
				interval = undefined;
			}
			commitsSincePush = 0;
		},
	};
};
