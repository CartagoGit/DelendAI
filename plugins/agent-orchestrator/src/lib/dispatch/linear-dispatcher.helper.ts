/**
 * linear-dispatcher.helper.ts — the pure pieces of the linear dispatcher:
 * slot and subagent ids, the timeout that stops a subagent before the
 * caller rotates, dependency failure, and the shape of a failed step.
 */
import type { IPlanStep } from '../policy/types.js';
import type { IStepOutcome } from './contracts.js';

/** Generate a stable, deterministic, host-independent slot id. */
export function makeSlotId(order: number, role: string): string {
	return `slot-${order}-${role}`;
}

/** New subagent id inside a rotation slot. */
export function makeSubagentId(slotId: string, iter: number): string {
	return `${slotId}#${iter}`;
}

export async function withTimeout<T>(
	promise: Promise<T>,
	timeoutMs: number,
	controller: AbortController,
): Promise<T> {
	if (timeoutMs === 0) return promise;
	let timer: ReturnType<typeof setTimeout> | undefined;
	try {
		return await Promise.race([
			promise,
			new Promise<T>((_, reject) => {
				timer = setTimeout(() => {
					// Cancel the subagent first: the caller rotates to a new one
					// as soon as this rejects.
					controller.abort();
					reject(
						new Error(`dispatch timed out after ${timeoutMs}ms`),
					);
				}, timeoutMs);
			}),
		]);
	} finally {
		if (timer !== undefined) clearTimeout(timer);
	}
}

export function dependsOnFailedTransitively(
	order: number,
	failedOrders: ReadonlySet<number>,
	stepsByOrder: ReadonlyMap<number, IPlanStep>,
	visiting = new Set<number>(),
): boolean {
	if (failedOrders.has(order)) return true;
	if (visiting.has(order)) return false;
	const step = stepsByOrder.get(order);
	if (!step) return false;
	visiting.add(order);
	return (step.dependsOn ?? []).some((dependency) =>
		dependsOnFailedTransitively(
			dependency,
			failedOrders,
			stepsByOrder,
			visiting,
		),
	);
}

export function emptyStepOutcome(step: IPlanStep): IStepOutcome {
	return {
		order: step.order,
		kind: step.kind,
		slotId: makeSlotId(step.order, step.subagentRole ?? 'orchestrator'),
		subagentIds: [],
		result: null,
		rotations: [],
		ok: false,
	};
}

export function failure(
	step: IPlanStep,
	slotId: string,
	subagentIds: readonly string[],
	rotations: readonly { subagentId: string; reason: string }[],
): IStepOutcome {
	return {
		order: step.order,
		kind: step.kind,
		slotId,
		subagentIds: [...subagentIds],
		rotations: [...rotations],
		result: null,
		ok: false,
	};
}
