export interface IMutexMetricsCollector {
	recordWaitMs(waitMs: number): void;
	recordContention(): void;
	recordStaleReclaim(): void;
	recordFailedAcquisition(): void;
}

export interface IMutexMetricsSnapshot {
	readonly waitMs: number;
	readonly contentionCount: number;
	readonly staleReclaims: number;
	readonly failedAcquisitions: number;
}
