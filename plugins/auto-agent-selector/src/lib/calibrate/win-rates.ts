/**
 * win-rates.ts — the selector's view of core's one win-rate fold
 * (`winRatesOf`): accepted over judged outcomes, per provider, kept only
 * with enough samples to mean something.
 */
import type { IModelWinRate } from '@delendai/core/contracts';
import { winRatesOf } from '@delendai/core/runtime';

import { MIN_CALIBRATION_SAMPLES } from '../contracts/constants/calibration.constant';
import type {
	IOutcomeRecord,
	IProviderWinRate,
} from '../contracts/interfaces/calibration.interface';

const asOutcomes = (records: readonly IOutcomeRecord[]) =>
	records.map((record) => ({
		providerId: record.providerId,
		outcome: record.success ? ('accepted' as const) : ('rejected' as const),
		...(record.taskType !== undefined ? { taskKind: record.taskType } : {}),
		at: record.ts ?? '',
	}));

/**
 * Each provider's win-rate, highest first (ties by id) so the output is
 * stable and readable.
 */
export const computeWinRates = (
	records: readonly IOutcomeRecord[],
	minSamples: number = MIN_CALIBRATION_SAMPLES,
	taskType?: string,
): IProviderWinRate[] =>
	[...winRatesOf(asOutcomes(records), taskType, minSamples)]
		.map(([providerId, rate]) => ({ providerId, ...rate }))
		.sort(
			(a, b) =>
				b.winRate - a.winRate ||
				a.providerId.localeCompare(b.providerId),
		);

/** The win rates the ranking reads, by provider id (only counted providers). */
export const winRateMap = (
	records: readonly IOutcomeRecord[],
	minSamples: number = MIN_CALIBRATION_SAMPLES,
	taskType?: string,
): ReadonlyMap<string, IModelWinRate> =>
	winRatesOf(asOutcomes(records), taskType, minSamples);
