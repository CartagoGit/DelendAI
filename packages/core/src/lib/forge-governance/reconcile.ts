/**
 * reconcile.ts — the one entry point a caller should reach for: inspect,
 * apply when the policy permits it, then verify from a fresh read.
 *
 * It exists so nobody has to remember the ordering. The dangerous
 * shortcut in this subsystem is calling `applyDesiredState` and treating
 * its success as the answer; wiring the sequence up once, here, means the
 * verdict a gate consumes always comes from a post-write re-read.
 */

import { applyDesiredState } from './apply-desired-state';
import { inspectDesiredVsLive } from './inspect-desired-vs-live';
import { verifyDesiredState } from './verify-desired-state';

import type { IReconcileInput, IReconcileResult } from './reconcile.interface';

export type {
	IReconcileInput,
	IReconcileResult,
} from './reconcile.interface';

/** Inspect, apply, then verify. Never throws. */
export const reconcileForgeGovernance = async (
	input: IReconcileInput,
): Promise<IReconcileResult> => {
	const live = await input.adapter.readLiveState({
		target: input.target,
		branches: input.desired.branches.map((rule) => rule.branch),
	});
	const before = inspectDesiredVsLive({
		desired: input.desired,
		live,
		target: input.target,
	});
	const applied = await applyDesiredState({
		adapter: input.adapter,
		desired: input.desired,
		target: input.target,
		diff: before,
	});
	const verification = await verifyDesiredState({
		adapter: input.adapter,
		desired: input.desired,
		target: input.target,
		applied,
	});
	return { before, applied, verification };
};
