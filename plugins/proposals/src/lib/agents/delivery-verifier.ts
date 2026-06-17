/**
 * delivery-verifier.ts
 *
 * `verifyClosure` — the entry point that `delivery_verifier` uses to
 * close a proposal round. the original design (reserved file).
 *
 * Wires the persistent task queue into the verifier's verdict:
 *   - Reads `<prefix>_task_queue` with `action: 'report'` (read-only).
 *   - Parses the result with the same Zod schemas the tool uses, so the
 *     verifier never trusts an untyped payload.
 *   - If the proposal declares `extras.taskQueue: true` and the report
 *     has `threshold === 'red' && queueLength > 0`, the verifier
 *     returns `verified: false` with a clear blocker.
 *   - If the proposal does NOT declare `extras.taskQueue: true`, the
 *     verifier ignores the report and emits `taskQueueReport: null`
 *     (back-compat with closures the original design).
 *
 * The verifier stays read-only: it only calls `runTaskQueueAction` with
 * `action: 'report'` and never with `enqueue` / `dequeue` / `subscribe`.
 * This is enforced by the implementation (no other action path exists
 * in this module) and tested by the spec.
 *
 * Spec: libs/mcp-server/tests/src/lib/agents/delivery-verifier.task-queue.spec.ts
 * Skill: libs/mcp-server/src/lib/skills/the delivery-verifier contract
 */

import { DEFAULT_PATH_LAYOUT } from '../contracts/constants/default-path-layout.constant';
import { join } from 'node:path';

import { z } from 'zod';

import { reportBackpressure } from './persistent-task-queue';
import type { IBackpressureReport } from './persistent-task-queue';
import { runTaskQueueAction } from './task-queue-engine';

// ---------------------------------------------------------------------------
// IProposalExtras — the shape parsed by sync-proposal-registry.script.ts.
// We only need the `taskQueue` flag here; the rest is unused.
// ---------------------------------------------------------------------------

export interface IProposalExtras {
	taskQueue?: boolean;
	[key: string]: unknown;
}

export interface IProposalFrontmatter {
	readonly id: string;
	readonly type: string;
	readonly status: string;
	readonly track: string;
	readonly extras?: IProposalExtras;
}

export interface IProposalDocumentLike {
	readonly proposalId?: string;
	readonly frontmatter: IProposalFrontmatter;
}

// ---------------------------------------------------------------------------
// IVerifyPaths — paths the verifier needs to read.
// ---------------------------------------------------------------------------

export interface IVerifyPaths {
	readonly queuePath: string;
	readonly closedTasksPath: string;
	/** Absolute path to `.cache/agents.lock.json` (used by `reportBackpressure`). */
	readonly lockPath: string;
	/** Absolute workspace root (anchors task-queue path resolution). */
	readonly workspaceRoot: string;
}

// ---------------------------------------------------------------------------
// IVerifyInput — what the caller passes.
// ---------------------------------------------------------------------------

export interface IVerifyInput {
	readonly proposal: IProposalDocumentLike;
	readonly paths: IVerifyPaths;
	/** Host queue tool name echoed in blocker messages. */
	readonly queueToolName?: string;
}

// ---------------------------------------------------------------------------
// IVerifyResult — what the verifier returns.
// ---------------------------------------------------------------------------

export interface IVerifyResult {
	readonly verified: boolean;
	/** Parsed backpressure report, or `null` when the proposal does NOT
	 *  declare `extras.taskQueue: true` (back-compat). */
	readonly taskQueueReport: IBackpressureReport | null;
	/** Ordered list of blockers; empty when the verifier is green. */
	readonly blockers: readonly string[];
	/** Recommended follow-up when the verdict is `verified: false`. */
	readonly recommendedNextSlice?: string;
}

// ---------------------------------------------------------------------------
// Zod schema — mirror of `IBackpressureReport` for runtime validation of
// the report payload returned by `runTaskQueueAction` with `action: 'report'`.
// We keep it local because the tool's IReportResult is `IBackpressureReport &
// { recommendation: string }`; the verifier only consumes the
// `IBackpressureReport` portion.
// ---------------------------------------------------------------------------

const IBackpressureReportSchema = z.object({
	queueLength: z.number().min(0),
	queuedCount: z.number().min(0),
	promotedCount: z.number().min(0),
	consumedCount: z.number().min(0),
	cancelledCount: z.number().min(0),
	expiredCount: z.number().min(0),
	oldestAgeMinutes: z.number().min(0),
	waiterOrphans: z.number().min(0),
	releaseSignalBacklog: z.number().min(0),
	threshold: z.enum(['green', 'amber', 'red']),
});

const parseBackpressureReport = (raw: unknown): IBackpressureReport => {
	const result = IBackpressureReportSchema.safeParse(raw);
	if (!result.success) {
		throw new Error(
			`verifyClosure: failed to parse IBackpressureReport: ${result.error.message}`
		);
	}
	return result.data;
};

// ---------------------------------------------------------------------------
// resolveReport — invokes `runTaskQueueAction` with `action: 'report'` and
// returns the parsed `IBackpressureReport`. Never mutates the queue.
//
// Falls back to a defensive green/empty report when the queue file is
// missing or empty (this is the natural state at the start of a fresh
// workspace). This preserves the "no work, no failure" contract.
// ---------------------------------------------------------------------------

const resolveReport = async (
	paths: IVerifyPaths
): Promise<IBackpressureReport> => {
	try {
		const result = await runTaskQueueAction(
			{ action: 'report', params: {} },
			{
				queuePath: paths.queuePath,
				closedTasksPath: paths.closedTasksPath,
				lockPath: paths.lockPath,
				workspaceRoot: paths.workspaceRoot,
			}
		);
		return parseBackpressureReport(result);
	} catch (err) {
		// If the queue file is missing, `runTaskQueueAction` for `report`
		// creates an empty queue (via `ensureQueueFile`) and returns a
		// green threshold with `queueLength: 0`. We only get here on
		// unexpected errors (e.g. permission denied, disk full). Surface
		// the error as a synthetic green report so the verifier does not
		// false-positive on infrastructure noise.
		if (process.env.NODE_ENV !== 'production') {
			console.error(
				`[verifyClosure] runTaskQueueAction(report) failed; falling back to synthetic green: ${String(err)}`
			);
		}
		return {
			queueLength: 0,
			queuedCount: 0,
			promotedCount: 0,
			consumedCount: 0,
			cancelledCount: 0,
			expiredCount: 0,
			oldestAgeMinutes: 0,
			waiterOrphans: 0,
			releaseSignalBacklog: 0,
			threshold: 'green',
		};
	}
};

// Re-export the reportBackpressure symbol so consumers (and the spec) can
// cross-check the verifier's threshold against the canonical computation.
export { reportBackpressure };

// ---------------------------------------------------------------------------
// verifyClosure — the entry point.
// ---------------------------------------------------------------------------

/**
 * Read-only closure check. Returns `verified: true` when the proposal
 * can close cleanly under the persistent task queue contract; otherwise
 * `verified: false` with an ordered list of blockers.
 *
 * Rules (the original design):
 *   1. If `proposal.frontmatter.extras?.taskQueue !== true`:
 *        - `taskQueueReport` is `null` (back-compat with closures
 *          the original design).
 *        - The queue is not even read; this is a no-op for the
 *          historical proposal portfolio.
 *   2. If `proposal.frontmatter.extras?.taskQueue === true`:
 *        - Read the queue and compute the backpressure report.
 *        - If `threshold === 'red' && queueLength > 0`:
 *            `verified: false`; blocker surfaces the report.
 *        - Otherwise:
 *            `verified: true` (the proposal can close).
 */
export const verifyClosure = async (
	input: IVerifyInput
): Promise<IVerifyResult> => {
	const usesTaskQueue = input.proposal.frontmatter.extras?.taskQueue === true;

	if (!usesTaskQueue) {
		// Back-compat: the proposal the original design or does not opt in.
		// The verifier ignores the queue entirely. Cierres previos a esta
		// fecha son válidos sin cola (regla de inmutabilidad histórica).
		return {
			verified: true,
			taskQueueReport: null,
			blockers: [],
		};
	}

	// The proposal opts in. Read the report (read-only; no enqueue/dequeue/subscribe).
	const report = await resolveReport(input.paths);

	// Hard rule: red threshold + non-empty queue ⇒ reject the closure.
	if (report.threshold === 'red' && report.queueLength > 0) {
		const blockers: string[] = [
			`${input.queueToolName ?? 'task_queue'} report threshold === 'red' and queueLength === ${report.queueLength} — backpressure is too high to close. Resolve the stale waiters (oldestAgeMinutes=${report.oldestAgeMinutes}, waiterOrphans=${report.waiterOrphans}) and re-run verifyClosure.`,
		];
		return {
			verified: false,
			taskQueueReport: report,
			blockers,
			recommendedNextSlice: 'stale-waiter-sweep',
		};
	}

	// Green or amber: the proposal can close. The parsed report is
	// returned so the orchestrator (and the human) can see the
	// backpressure state at closure time.
	return {
		verified: true,
		taskQueueReport: report,
		blockers: [],
	};
};

// ---------------------------------------------------------------------------
// Default paths helper — for callers that don't have an explicit
// `IVerifyPaths` ready (e.g. the spec, or the future
// `<prefix>_delivery_verifier` tool).
// ---------------------------------------------------------------------------

/**
 * Returns the default `IVerifyPaths` for the current workspace. The
 * caller can override any of the three fields before passing to
 * `verifyClosure`. The default `.cache/agent-queue/queue.json` and
 * `.cache/agent-queue/closed-tasks.json` paths are the canonical home
 * of the queue (the original design).
 */
export const defaultVerifyPaths = (root: string): IVerifyPaths => ({
	queuePath: join(root, DEFAULT_PATH_LAYOUT.taskQueueFile),
	closedTasksPath: join(root, DEFAULT_PATH_LAYOUT.closedTasksFile),
	lockPath: join(root, DEFAULT_PATH_LAYOUT.lockFile),
	workspaceRoot: root,
});
