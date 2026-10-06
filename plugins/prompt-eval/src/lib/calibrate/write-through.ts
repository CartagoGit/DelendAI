import type {
	ICalibrationStore,
	IOutcomeRecord,
	IProviderWinRate,
} from '@delendai/auto-agent-selector/public';
import type { IEvalAttempt } from '../eval/eval-harness';

export const MIN_PROMPT_EVAL_CALIBRATION_SAMPLES = 5;

export interface IWriteOutcomesInput {
	readonly attempts: readonly IEvalAttempt[];
	readonly winner: string | null;
	readonly taskType?: string | null;
}

export interface IWriteOutcomesDeps {
	readonly store?: Pick<ICalibrationStore, 'append'>;
}

const normalizeTaskType = (taskType?: string | null): string | undefined => {
	const trimmed = taskType?.trim();
	return trimmed ? trimmed : undefined;
};

export const attemptsToOutcomeRecords = (input: {
	readonly attempts: readonly IEvalAttempt[];
	readonly winner: string | null;
	readonly taskType?: string | null;
}): readonly IOutcomeRecord[] => {
	if (input.winner === null) {
		return [];
	}
	const taskType = normalizeTaskType(input.taskType);
	return input.attempts
		.filter((attempt) => attempt.skipped === undefined)
		.map((attempt) => ({
			providerId: attempt.providerId,
			success: attempt.providerId === input.winner,
			...(taskType !== undefined ? { taskType } : {}),
		}));
};

export const writeOutcomes = async (
	input: IWriteOutcomesInput,
	deps: IWriteOutcomesDeps,
): Promise<void> => {
	if (deps.store === undefined) {
		return;
	}
	for (const record of attemptsToOutcomeRecords(input)) {
		await deps.store.append(record);
	}
};

export const summarizeWinRates = (
	records: readonly IOutcomeRecord[],
	taskType?: string,
	minSamples: number = MIN_PROMPT_EVAL_CALIBRATION_SAMPLES,
): readonly IProviderWinRate[] => {
	const taskFilter = normalizeTaskType(taskType);
	const agg = new Map<string, { success: number; total: number }>();
	for (const record of records) {
		if (taskFilter !== undefined && record.taskType !== taskFilter)
			continue;
		const entry = agg.get(record.providerId) ?? { success: 0, total: 0 };
		entry.total += 1;
		if (record.success) entry.success += 1;
		agg.set(record.providerId, entry);
	}
	const out: IProviderWinRate[] = [];
	for (const [providerId, entry] of agg) {
		if (entry.total < minSamples) continue;
		out.push({
			providerId,
			winRate: entry.success / entry.total,
			samples: entry.total,
		});
	}
	return out.sort(
		(left, right) =>
			right.winRate - left.winRate ||
			left.providerId.localeCompare(right.providerId),
	);
};
