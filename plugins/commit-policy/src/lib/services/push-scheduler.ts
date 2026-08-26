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

import type { IGitRunner } from '@mcp-vertex/core/public';

import { isBranchProtected } from '../contracts/branch';
import type { ICommitPolicyPush } from '../contracts/options';
import { gitCurrentBranch } from './git-extra';
import { runPushDriver, type IPushDriverResult } from './push-driver';

export interface IPushSchedulerOptions {
	readonly run: IGitRunner;
	readonly policy: ICommitPolicyPush;
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
	/** Tear down timers + clear state. Idempotent. */
	stop(): void;
}

const SCHEDULER_INTERVAL_MS = (minutes: number): number => minutes * 60_000;

export const createPushScheduler = (
	options: IPushSchedulerOptions,
): IPushScheduler => {
	let commitsSincePush = 0;
	let interval: ReturnType<typeof setInterval> | undefined;
	const onAttempt = options.onAttempt ?? (() => {});

	const isProtected = async (): Promise<boolean> => {
		const branch = await gitCurrentBranch(options.run);
		if (branch === undefined) return true; // detached HEAD → no push
		return isBranchProtected(branch, {
			protected: options.policy.protectedBranches,
			protectedPrefixes: options.policy.protectedPrefixes,
		});
	};

	const push = async (reason: string): Promise<IPushDriverResult> => {
		const result = await runPushDriver({}, options.policy, options.run);
		if (result.ok) {
			commitsSincePush = 0;
		}
		onAttempt(result);
		if (!result.ok) {
			// Surface the reason for log triage — never throw.
			console.warn(
				`[push-scheduler] push failed (${reason}): ${result.refusal}`,
			);
		}
		return result;
	};

	const tick = async (): Promise<void> => {
		// Window-based push. Only push when there is at least
		// one commit since the last push — otherwise the
		// scheduler would spam empty pushes every interval.
		if (commitsSincePush === 0) return;
		if (await isProtected()) return;
		await push(`everyNMinutes=${options.policy.everyNMinutes ?? 0}`);
	};

	return {
		async onCommitSucceeded() {
			commitsSincePush += 1;
			// Branch protection short-circuits everything.
			if (await isProtected()) return null;
			const everyN = options.policy.everyNCommits;
			const shouldPushByCount =
				everyN !== undefined && commitsSincePush >= everyN;
			const shouldPushByCommit = options.policy.onCommit === true;
			if (!shouldPushByCommit && !shouldPushByCount) return null;
			// x00266: when both modes are active, the engine fires
			// ONE push (not two). The counter is reset below.
			return push(
				shouldPushByCount ? `everyNCommits=${everyN}` : 'onCommit=true',
			);
		},
		async pushNow() {
			return push('manual');
		},
		start() {
			// The interval scheduler only runs when the host
			// explicitly opts in via `everyNMinutes`. The
			// slice/interval trigger in run-tool remains the
			// single-shot helper for `commit_policy_run`.
			if (options.policy.everyNMinutes === undefined) return;
			if (interval !== undefined) return;
			interval = setInterval(() => {
				void tick();
			}, SCHEDULER_INTERVAL_MS(options.policy.everyNMinutes));
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
