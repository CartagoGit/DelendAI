/**
 * storm-log.interface.ts — the shapes the storm log persists and returns.
 */

export interface IStormLogEntry {
	readonly trigger: string;
	readonly code: string;
	readonly firstSeenAt: number;
	readonly lastSeenAt: number;
	readonly timestamps: readonly number[];
	readonly sampleProposalIds: readonly string[];
	readonly suggestedFix?: string;
}

export interface IStormLogOptions {
	readonly cacheDir: string;
	readonly maxAgeMs?: number;
}
