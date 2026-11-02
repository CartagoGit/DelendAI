/**
 * store.ts — the calibration store, read and written through core's one
 * store of model outcomes (`modelOutcomeStoreAt`), so the selector, the
 * runner and every learner reason from the same history. A calibration
 * outcome is an accepted or rejected result for a task kind.
 */
import { modelOutcomeStoreAt } from '@delendai/core/runtime';

import type {
	ICalibrationStore,
	IOutcomeRecord,
} from '../contracts/interfaces/calibration.interface';

/** The calibration view of the outcome store under `cacheDirAbs`. */
export const realCalibrationStore = (
	cacheDirAbs: string,
): ICalibrationStore => {
	const outcomes = modelOutcomeStoreAt(cacheDirAbs);
	return {
		append: (record) =>
			outcomes.append({
				providerId: record.providerId,
				...(record.taskType !== undefined
					? { taskKind: record.taskType }
					: {}),
				outcome: record.success ? 'accepted' : 'rejected',
				...(record.ts !== undefined ? { at: record.ts } : {}),
			}),
		// Only judged outcomes calibrate: a hop that merely ended, or failed
		// before anything could be judged, says nothing about quality.
		readAll: async (): Promise<readonly IOutcomeRecord[]> =>
			(await outcomes.readAll()).flatMap((outcome) =>
				outcome.outcome === 'accepted' || outcome.outcome === 'rejected'
					? [
							{
								providerId: outcome.providerId,
								success: outcome.outcome === 'accepted',
								...(outcome.taskKind !== undefined
									? { taskType: outcome.taskKind }
									: {}),
								ts: outcome.at,
							},
						]
					: [],
			),
	};
};
