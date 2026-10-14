/**
 * delegation-rollup.service.ts — how much a manifest saves, measured: the
 * delegated steps the log holds, grouped by kind of task and by how they
 * were delegated, observed token figures kept apart from reported totals.
 */
import type { IDelegationRecord } from '@delendai/contracts';

import type {
	IDelegationRollup,
	IDelegationRollupRow,
} from '../contracts/delegation-rollup.interface';
import type { IInvocationRecordTelemetry } from '../contracts/invocation-record.interface';

const UNTAGGED = '(untagged)';

const mean = (values: readonly number[]): number | null =>
	values.length === 0
		? null
		: Math.round(values.reduce((sum, n) => sum + n, 0) / values.length);

const numbers = (values: readonly (number | undefined)[]): number[] =>
	values.filter((value): value is number => value !== undefined);

const rowOf = (
	task: string,
	steps: readonly IDelegationRecord[],
): IDelegationRollupRow => {
	const observed = steps.filter(
		(step) =>
			step.inputTokens !== undefined && step.outputTokens !== undefined,
	);
	return {
		task,
		delegation: steps[0]?.delegation ?? 'instruction-only',
		steps: steps.length,
		meanTokensUsed: mean(steps.map((step) => step.tokensUsed)) ?? 0,
		observed: {
			steps: observed.length,
			meanInputTokens: mean(numbers(observed.map((s) => s.inputTokens))),
			meanOutputTokens: mean(
				numbers(observed.map((s) => s.outputTokens)),
			),
		},
		meanManifestBytes: mean(numbers(steps.map((s) => s.manifestBytes))),
		contextRequested: steps.filter((step) => step.contextRequested === true)
			.length,
	};
};

/** The delegations of `records`, one row per kind of task and delegation. */
export const buildDelegationRollup = (
	records: readonly IInvocationRecordTelemetry[],
): IDelegationRollup => {
	const groups = new Map<string, IDelegationRecord[]>();
	for (const record of records) {
		for (const step of record.delegations ?? []) {
			const task =
				step.tags.length === 0
					? UNTAGGED
					: [...step.tags].sort().join(',');
			const key = `${task}\u0000${step.delegation}`;
			groups.set(key, [...(groups.get(key) ?? []), step]);
		}
	}
	return {
		rows: [...groups.entries()]
			.sort(([left], [right]) => (left < right ? -1 : 1))
			.map(([key, steps]) =>
				rowOf(key.split('\u0000')[0] ?? UNTAGGED, steps),
			),
	};
};
