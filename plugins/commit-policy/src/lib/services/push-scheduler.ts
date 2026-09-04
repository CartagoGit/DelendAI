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
	 * Start the periodic scheduler (no-op when `everyNMinutes`
	 * is unset). Idempotent. The plugin calls this once after
	 * register().
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
				// x00266: when both modes are active, the engine fires
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
			// The interval scheduler only runs when the host
			// explicitly opts in via `everyNMinutes`. The
			// slice/interval trigger in run-tool remains the
			// single-shot helper for `commit_policy_run`.
			if (options.policy.everyNMinutes === undefined) return;
			if (interval !== undefined) return;
			interval = setInterval(
				scheduleTick,
				SCHEDULER_INTERVAL_MS(options.policy.everyNMinutes),
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
