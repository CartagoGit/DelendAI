/**
 * win-rates.ts — the pure calibration core: fold recorded outcomes into a
 * per-provider win-rate, keeping only providers with enough samples to be
 * meaningful. No I/O, no clock. The ranking blend consumes `winRateMap`.
 */
import { MIN_CALIBRATION_SAMPLES } from '../contracts/constants/calibration.constant';
import type {
	IOutcomeRecord,
	IProviderWinRate,
} from '../contracts/interfaces/calibration.interface';

/**
 * Compute each provider's win-rate from the outcome log, dropping providers
 * below `minSamples`. Sorted highest win-rate first (ties by id) so the
 * output is stable and readable.
 */
export const computeWinRates = (
	records: readonly IOutcomeRecord[],
	minSamples: number = MIN_CALIBRATION_SAMPLES,
	taskType?: string,
): IProviderWinRate[] => {
	const agg = new Map<string, { success: number; total: number }>();
	for (const record of records) {
		if (taskType !== undefined && record.taskType !== taskType) continue;
		const entry = agg.get(record.providerId) ?? { success: 0, total: 0 };
		entry.total += 1;
		if (record.success) entry.success += 1;
		agg.set(record.providerId, entry);
	}
	const out: IProviderWinRate[] = [];
	for (const [providerId, entry] of agg) {
		if (entry.total >= minSamples) {
			out.push({
				providerId,
				winRate: entry.success / entry.total,
				samples: entry.total,
			});
		}
	}
	return out.sort(
		(a, b) =>
			b.winRate - a.winRate || a.providerId.localeCompare(b.providerId),
	);
};

/** A `providerId → winRate` map for the ranking blend (only counted providers). */
export const winRateMap = (
	records: readonly IOutcomeRecord[],
	minSamples: number = MIN_CALIBRATION_SAMPLES,
	taskType?: string,
): Map<string, number> => {
	const map = new Map<string, number>();
	for (const rate of computeWinRates(records, minSamples, taskType)) {
		map.set(rate.providerId, rate.winRate);
	}
	return map;
};
