import { isLockEntryExpired } from '@delendai/core/lib/shared/lock-entry-expiry';
import { waitsBackOnto as coreWaitsBackOnto } from '@delendai/core/lib/shared/wait-for-graph';

import type { IWaitForEdge } from '@delendai/core/lib/contracts/interfaces/wait-for-graph.interface';

import { lockExpiryPolicyFor } from './lock-expiry-policy';

import type {
	ILockEntrySnapshot,
	ILockSnapshot,
	IRegisteredWait,
	IWaitDiagnosis,
	IWaitHolderInfo,
	IWaitVerdict,
} from '../contracts/interfaces/wait-diagnosis.interface';
import type { ILockExpiryPolicy } from '@delendai/core/lib/contracts/interfaces/lock-entry-expiry.interface';

/**
 * Turn "the wait timed out" into an answer an agent can act on.
 *
 * `awaitLockRelease` deliberately knows nothing about why it failed: it
 * watches a file and gives up on a deadline. That is the right shape for
 * the waiter, and the wrong thing to hand back to a model. Returning
 * `{released:false, timedOut:true}` and nothing else makes waiting again
 * the only rational move, and two agents doing that to each other never
 * make progress — the loop this repo exists to make impossible.
 *
 * So the diagnosis is computed from the same snapshot the wait was
 * reading, and it always resolves to a next call that is NOT the one
 * that just failed:
 *
 * - the entry is gone            → the files are free; claim them now
 * - the entry is past its window → the engine evicts on next claim;
 *                                  claim, do not wait
 * - the holder waits on us       → mutual wait; one side gives way, and
 *                                  it is deterministically the caller
 * - the holder is alive          → real work in progress; go do a
 *                                  different slice, do not park again
 *
 * Pure by construction: callers pass the parsed lock file, so this is
 * fully testable without a filesystem and cannot itself block.
 */

const describeHolder = (
	entry: ILockEntrySnapshot,
	nowMs: number,
): IWaitHolderInfo => {
	const lastSeenMs = Date.parse(entry.last_seen ?? '');
	return {
		taskId: entry.task_id ?? 'unknown',
		agent: entry.agent ?? 'unknown',
		files: entry.ownership ?? [],
		lastSeen: entry.last_seen,
		heldForMs: Number.isFinite(lastSeenMs)
			? Math.max(0, nowMs - lastSeenMs)
			: undefined,
	};
};

/** Which agent currently holds a given task's claim, if anyone does. */
const holderAgentOf = (
	snapshot: ILockSnapshot,
	taskId: string,
): string | undefined =>
	snapshot.in_flight.find((entry) => entry.task_id === taskId)?.agent;

/**
 * Does the holder's wait chain lead back to this waiter?
 *
 * Registered waits give agent → task edges; the lock file resolves each
 * task to the agent holding it, which is the agent edge core's graph
 * walk needs. The walk itself lives in core so that this plugin and
 * `agents_lock_diagnose` cannot disagree about what counts as a
 * deadlock.
 */
const waitsBackOnto = (
	input: {
		readonly snapshot: ILockSnapshot;
		readonly waits: readonly IRegisteredWait[];
		readonly waiter: string;
	},
	startAgent: string,
): boolean => {
	const edges: IWaitForEdge[] = [];
	for (const wait of input.waits) {
		const holder = holderAgentOf(input.snapshot, wait.waitingOnTaskId);
		if (holder !== undefined) {
			edges.push({ waiter: wait.waiter, holder });
		}
	}
	return coreWaitsBackOnto({
		edges,
		start: startAgent,
		target: input.waiter,
	});
};

const NEXT_ACTION: Record<IWaitVerdict, string> = {
	'free-now':
		'Claim it now — retry `agent_lock action:"claim"` with the same files. Do NOT call await_lock again; there is nothing left to wait for.',
	'holder-gone':
		'Claim it now — retry `agent_lock action:"claim"`. The stale entry is evicted by the claim itself. Do NOT call await_lock again; waiting on an entry nobody is refreshing can only time out again.',
	'mutual-wait':
		'Deadlock: release your own claims with `agent_lock action:"release"`, then pick a different slice and claim again later. You give way because you are the one that detected it — if both sides wait again, neither ever proceeds.',
	'holder-alive':
		'Another agent is genuinely working on these files. Pick a different slice whose files nobody holds (`agent_lock action:"status"` lists what is claimed) and come back to this one afterwards. Do NOT park on it again — a second wait tells you nothing the first did not.',
};

/**
 * Diagnose a wait that ended without the lock coming free.
 *
 * `waits` and `waiterAgent` are optional: without them every verdict
 * except `mutual-wait` is still decided, so a caller that cannot supply
 * its identity still gets a real next step rather than a bare timeout.
 */
export const diagnoseWaitTimeout = (input: {
	readonly snapshot: ILockSnapshot;
	readonly taskId: string;
	readonly waiterAgent?: string | undefined;
	readonly waits?: readonly IRegisteredWait[] | undefined;
	readonly policy?: ILockExpiryPolicy | undefined;
	readonly nowMs?: number | undefined;
}): IWaitDiagnosis => {
	const nowMs = input.nowMs ?? Date.now();
	const entry = input.snapshot.in_flight.find(
		(candidate) => candidate.task_id === input.taskId,
	);
	if (entry === undefined) {
		return {
			verdict: 'free-now',
			holder: undefined,
			reason: `No in-flight claim for "${input.taskId}" remains in the lock file; it was released while the wait was settling.`,
			nextAction: NEXT_ACTION['free-now'],
		};
	}
	const holder = describeHolder(entry, nowMs);
	const policy = input.policy ?? {
		...lockExpiryPolicyFor(input.snapshot.stale_after_minutes),
		nowMs,
	};
	if (isLockEntryExpired(entry, policy)) {
		return {
			verdict: 'holder-gone',
			holder,
			reason: `"${input.taskId}" is still listed but its owner (${holder.agent}) stopped heartbeating; the lock engine treats the claim as expired and will evict it on the next claim.`,
			nextAction: NEXT_ACTION['holder-gone'],
		};
	}
	const waiterAgent = input.waiterAgent;
	if (
		waiterAgent !== undefined &&
		holder.agent !== waiterAgent &&
		waitsBackOnto(
			{
				snapshot: input.snapshot,
				waits: input.waits ?? [],
				waiter: waiterAgent,
			},
			holder.agent,
		)
	) {
		return {
			verdict: 'mutual-wait',
			holder,
			reason: `${holder.agent} holds "${input.taskId}" and is itself waiting, directly or through other agents, on a claim held by ${waiterAgent}. Neither side can proceed by waiting.`,
			nextAction: NEXT_ACTION['mutual-wait'],
		};
	}
	return {
		verdict: 'holder-alive',
		holder,
		reason: `${holder.agent} still holds "${input.taskId}" and is heartbeating${holder.heldForMs === undefined ? '' : ` (last seen ${Math.round(holder.heldForMs / 1000)}s ago)`}; the work is genuinely in progress.`,
		nextAction: NEXT_ACTION['holder-alive'],
	};
};
