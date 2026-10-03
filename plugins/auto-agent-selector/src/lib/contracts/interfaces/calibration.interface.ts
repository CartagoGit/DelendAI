/**
 * calibration.interface.ts — data contracts for empirical calibration (S4).
 *
 * SRP: shapes only. The router learns which provider actually wins each task
 * from recorded outcomes; these types are the shared vocabulary between the
 * store, the win-rate computation and the ranking blend.
 */

/** An append-only record of one task outcome for a provider. */
export interface IOutcomeRecord {
	readonly providerId: string;
	readonly success: boolean;
	/** Optional task-type label (e.g. "implement", "review"). */
	readonly taskType?: string;
	/** ISO timestamp; the store fills it in when absent. */
	readonly ts?: string;
}

/** A provider's measured win-rate over enough samples to count. */
export interface IProviderWinRate {
	readonly providerId: string;
	/** Success ratio in [0, 1]. */
	readonly winRate: number;
	/** How many outcomes it is based on. */
	readonly samples: number;
}

/** Injected persistence seam for calibration outcomes (append-only log). */
export interface ICalibrationStore {
	readonly append: (record: IOutcomeRecord) => Promise<void>;
	readonly readAll: () => Promise<readonly IOutcomeRecord[]>;
}
