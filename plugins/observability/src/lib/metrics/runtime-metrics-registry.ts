import { createByteSamplePercentileRegistry } from '@delendai/core/public';

import type { IRuntimeMetricsRegistry } from '../contracts/interfaces/observability.interface';

export const createRuntimeMetricsRegistry = (): IRuntimeMetricsRegistry => {
	const samples = createByteSamplePercentileRegistry();
	return {
		recordResponseBytes(bytes) {
			samples.record(bytes);
		},
		snapshot() {
			return {
				calls: samples.sampleCount(),
				responses: samples.snapshotPercentile(),
			};
		},
		reset() {
			samples.reset();
		},
	};
};
