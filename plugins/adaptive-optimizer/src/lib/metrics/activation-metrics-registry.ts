import { createByteSamplePercentileRegistry } from '@delendai/core/public';

import type { IActivationMetricsRegistry } from '../contracts/interfaces/adaptive-optimizer.interface';

export const createActivationMetricsRegistry =
	(): IActivationMetricsRegistry => {
		const samples = createByteSamplePercentileRegistry();
		return {
			recordActivation(bytes) {
				samples.record(bytes);
			},
			snapshot() {
				return {
					activations: samples.sampleCount(),
					responses: samples.snapshotPercentile(),
				};
			},
			reset() {
				samples.reset();
			},
		};
	};
