import type {
	IMutexMetricsCollector,
	IMutexMetricsSnapshot,
} from '../contracts/interfaces/mutex-metrics.interface';

interface IMutableMutexMetricsTotals {
	waitMs: number;
	contentionCount: number;
	staleReclaims: number;
	failedAcquisitions: number;
}

const noopMutexMetricsCollector: IMutexMetricsCollector = {
	recordWaitMs: () => undefined,
	recordContention: () => undefined,
	recordStaleReclaim: () => undefined,
	recordFailedAcquisition: () => undefined,
};

export const getNoopMutexMetricsCollector = (): IMutexMetricsCollector =>
	noopMutexMetricsCollector;

export const createInMemoryMutexMetricsCollector = (): {
	readonly collector: IMutexMetricsCollector;
	readonly snapshot: () => IMutexMetricsSnapshot;
} => {
	const totals: IMutableMutexMetricsTotals = {
		waitMs: 0,
		contentionCount: 0,
		staleReclaims: 0,
		failedAcquisitions: 0,
	};

	return {
		collector: {
			recordWaitMs(waitMs) {
				totals.waitMs += Math.max(0, waitMs);
			},
			recordContention() {
				totals.contentionCount += 1;
			},
			recordStaleReclaim() {
				totals.staleReclaims += 1;
			},
			recordFailedAcquisition() {
				totals.failedAcquisitions += 1;
			},
		},
		snapshot: () => ({ ...totals }),
	};
};
