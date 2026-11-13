/**
 * cost-per-correct.helper.ts — what a correct result costs, by task class
 * and model.
 *
 * A call counts toward a row only when a gate set its outcome; calls with
 * no outcome (old records, ungated calls) are left out rather than guessed.
 */
import type {
	IGateResult,
	IInvocationRecordTelemetry,
	ITaskOutcome,
} from '../contracts/invocation-record.interface';
import type { ICostPerCorrectRow } from '../contracts/usage-rollup.interface';
import { compareCodeUnits } from '@delendai/state';

import { telemetryTotalTokensOf } from './usage-rollup-buckets.helper';

const OUTCOME_OF_GATE: Readonly<Record<IGateResult, ITaskOutcome>> = {
	pass: 'correct',
	fail: 'failed',
	blocked: 'blocked',
};

/** The outcome a gate result stands for; undefined when no gate ran. */
export const taskOutcomeFromGate = (
	gate: IGateResult | undefined,
): ITaskOutcome | undefined =>
	gate === undefined ? undefined : OUTCOME_OF_GATE[gate];

const modelOf = (record: IInvocationRecordTelemetry): string =>
	record.model?.modelId ?? record.dimensions?.model ?? 'unattributed';

/** Group gated calls by task class and model; cheapest-per-correct first. */
export const buildCostPerCorrect = (
	records: readonly IInvocationRecordTelemetry[],
): ICostPerCorrectRow[] => {
	const groups = new Map<
		string,
		{
			taskClass: string;
			model: string;
			samples: number;
			correct: number;
			costUsd: number;
			totalTokens: number;
		}
	>();
	for (const record of records) {
		if (record.taskOutcome === undefined) continue;
		const taskClass = record.taskClass ?? 'unclassified';
		const model = modelOf(record);
		const key = `${taskClass}\u0000${model}`;
		const row = groups.get(key) ?? {
			taskClass,
			model,
			samples: 0,
			correct: 0,
			costUsd: 0,
			totalTokens: 0,
		};
		row.samples += 1;
		row.correct += record.taskOutcome === 'correct' ? 1 : 0;
		row.costUsd += record.costUsd ?? 0;
		row.totalTokens += telemetryTotalTokensOf(record);
		groups.set(key, row);
	}
	return [...groups.values()]
		.map((row) => ({
			...row,
			costPerCorrectUsd:
				row.correct === 0 ? null : row.costUsd / row.correct,
			tokensPerCorrect:
				row.correct === 0 ? null : row.totalTokens / row.correct,
		}))
		.sort(
			(left, right) =>
				compareCodeUnits(left.taskClass, right.taskClass) ||
				compareCodeUnits(left.model, right.model),
		);
};
