/**
 * delegation-records.helper.ts — what each delegated step was given and
 * cost leaves the outcome the orchestrator reads, and travels in the
 * result's `_meta`, where usage-tracking records it. The outcome stays as
 * small as the receipts made it.
 */
import type { IDelegationRecord } from '@delendai/contracts';

import type { IPlanOutcome } from './contracts.js';

/** `outcome` without its steps' delegation records, and those records. */
export const takeDelegations = <
	T extends { readonly steps: IPlanOutcome['steps'] },
>(
	outcome: T,
	tags: readonly string[],
): { readonly outcome: T; readonly records: readonly IDelegationRecord[] } => {
	const records: IDelegationRecord[] = [];
	const steps = outcome.steps.map((step) => {
		if (step.result?.delegation === undefined) return step;
		const { delegation, ...result } = step.result;
		records.push({ tags, ...delegation });
		return { ...step, result };
	});
	return { outcome: { ...outcome, steps }, records };
};
