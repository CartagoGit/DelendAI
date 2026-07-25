import { join } from 'node:path';

import { joinRel } from '@mcp-vertex/core/public';

import { computeWinRates } from '../../../../auto-agent-selector/src/lib/calibrate/win-rates';
import { realCalibrationStore } from '../../../../auto-agent-selector/src/lib/calibrate/store';
import type {
	ICalibrationStore,
	IOutcomeRecord,
	IProviderWinRate,
} from '../../../../auto-agent-selector/src/lib/contracts/interfaces/calibration.interface';
import type { IEvalAttempt } from '../eval/eval-harness';

export interface ICalibrationWriteInput {
	readonly attempts: readonly IEvalAttempt[];
	readonly taskType?: string;
}

export interface ICalibrationWriteResult {
	readonly recorded: number;
	readonly taskType: string | null;
	readonly winRates: readonly IProviderWinRate[];
}

export const AUTO_AGENT_SELECTOR_RESULTS_DIR = join(
	'results',
	'auto-agent-selector',
);

export const resolveAutoAgentSelectorCalibrationDir = (
	cacheDir: string,
): string => joinRel(cacheDir, AUTO_AGENT_SELECTOR_RESULTS_DIR);

export const attemptsToOutcomeRecords = (
	input: ICalibrationWriteInput,
): readonly IOutcomeRecord[] =>
	input.attempts
		.filter((attempt) => attempt.skipped === undefined)
		.map((attempt) => ({
			providerId: attempt.providerId,
			success: attempt.passed,
			...(input.taskType !== undefined
				? { taskType: input.taskType }
				: {}),
		}));

export const readCalibrationWinRates = async (options: {
	readonly store: ICalibrationStore;
	readonly taskType?: string;
	readonly minSamples?: number;
}): Promise<readonly IProviderWinRate[]> => {
	const records = await options.store.readAll();
	return computeWinRates(records, options.minSamples ?? 1, options.taskType);
};

export const writeCalibration = async (
	input: ICalibrationWriteInput,
	options: {
		readonly store: ICalibrationStore;
		readonly minSamples?: number;
	},
): Promise<ICalibrationWriteResult> => {
	const records = attemptsToOutcomeRecords(input);
	for (const record of records) {
		await options.store.append(record);
	}
	const winRates = await readCalibrationWinRates({
		store: options.store,
		...(options.minSamples !== undefined
			? { minSamples: options.minSamples }
			: {}),
		...(input.taskType !== undefined ? { taskType: input.taskType } : {}),
	});
	return {
		recorded: records.length,
		taskType: input.taskType ?? null,
		winRates,
	};
};

export const realPromptEvalCalibrationStore = (
	cacheDir: string,
): ICalibrationStore =>
	realCalibrationStore(resolveAutoAgentSelectorCalibrationDir(cacheDir));
