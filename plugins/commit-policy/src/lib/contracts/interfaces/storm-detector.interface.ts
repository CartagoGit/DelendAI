/**
 * storm-detector.interface.ts — the shapes the storm detector reads and
 * reports.
 *
 * Split out of `services/storm-detector.ts` so the `types-in-contracts`
 * convention holds: a consumer that only needs the shape of a storm
 * does not have to import the detector itself.
 */

export interface IStormDetectorOptions {
	/** Sliding window in seconds. Default 30. */
	readonly windowSeconds?: number;
	/** Threshold for `count >= threshold` flag. Default 5. */
	readonly threshold?: number;
	/** Cap on sampleProposalIds collected per storm. Default 5. */
	readonly maxSamplesPerStorm?: number;
	/** Cap on active keys kept in memory. Default 256. */
	readonly maxTrackedKeys?: number;
}

/** The shape of an event the detector cares about. */
export interface IStormEvent {
	readonly timestamp: number; // ms since epoch
	readonly code: string; // e.g. 'WORKSPACE_HAS_NO_FILES'
	readonly trigger: string; // 'slice' | 'manual' | 'threshold' | 'interval' | ...
	readonly proposalId?: string;
	readonly sliceId?: string;
	/** Optional short hint from the producer. */
	readonly suggestedFix?: string;
}

/**
 * Persisted detector state for one (trigger, code) bucket.
 *
 * `firstSeenAt` is lifetime-scoped identity, while `timestamps` are the
 * currently retained window samples that define `count`.
 */
export interface IHydratedStormBucket {
	readonly code: string;
	readonly trigger: string;
	readonly firstSeenAt: number;
	readonly timestamps: readonly number[];
	readonly sampleProposalIds: readonly string[];
	readonly suggestedFix?: string;
}

/**
 * Replay target contract for storm persistence.
 *
 * Legacy consumers can implement `observe()` only. Targets that also support
 * `hydrate()` can restore detector identity and retained samples exactly.
 */
export interface IStormReplayTarget {
	observe(event: IStormEvent): void;
	hydrate?(bucket: IHydratedStormBucket): void;
}

export interface IStorm {
	readonly code: string;
	readonly trigger: string;
	readonly count: number;
	readonly windowSeconds: number;
	readonly sampleProposalIds: readonly string[];
	/**
	 * When this storm was first seen EVER, across the detector's whole
	 * life — not when the current window opened. It is deliberately
	 * stable: `repair-proposer` derives a repair id from it, and an id
	 * that slid forward as the window moved would file a fresh repair
	 * for the same ongoing storm every few minutes.
	 *
	 * Because it is lifetime-scoped, it does NOT bound `count`. Use
	 * `windowStartedAt` for that.
	 */
	readonly firstSeenAt: number;
	/**
	 * The oldest event still inside the window — the one `count`
	 * actually starts from. Every other number on this record
	 * (`count`, `lastSeenAt`, `windowSeconds`) is window-scoped, so
	 * reading `firstSeenAt` as the start of the burst overstates its
	 * age, sometimes by hours.
	 */
	readonly windowStartedAt: number;
	readonly lastSeenAt: number;
	readonly suggestedFix?: string;
	readonly exceedsThreshold: boolean;
}

export interface IStormSnapshot {
	readonly storms: readonly IStorm[];
	readonly totalEventsInWindow: number;
	readonly windowSeconds: number;
	readonly threshold: number;
}
