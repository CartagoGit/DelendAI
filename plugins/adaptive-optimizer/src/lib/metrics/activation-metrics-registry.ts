import {
	createByteSamplePercentileRegistry,
	type IPayloadPercentile,
} from '@mcp-vertex/core/public';

export interface IActivationMetricsSnapshot {
	readonly activations: number;
	readonly responses: IPayloadPercentile;
}

/**
 * Per-process registry of `optimize_run` activations, read by
 * `activation_metrics`. Backs the metrics longitudinal gate's candidate
 * snapshot for this plugin instead of the gate calling a tool name that
 * was never registered.
 *
 * The sampling mechanics (push a byte size, derive a p95) are shared with
 * the `observability` plugin's runtime registry via
 * `createByteSamplePercentileRegistry` in `@mcp-vertex/core`; only the
 * vocabulary here (`activations`, `recordActivation`) is specific to this
 * plugin.
 */
export interface IActivationMetricsRegistry {
	recordActivation(responseBytes: number): void;
	snapshot(): IActivationMetricsSnapshot;
	reset(): void;
}

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
