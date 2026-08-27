import {
	createByteSamplePercentileRegistry,
	type IPayloadPercentile,
} from '@mcp-vertex/core/public';

export interface IRuntimeMetricsSnapshot {
	readonly calls: number;
	readonly responses: IPayloadPercentile;
}

/**
 * Per-process registry of `obs_trace` / `obs_release_health` response
 * sizes, read by `obs_runtime_metrics`. This is what actually backs the
 * "metrics" half of the plugin manifest's summary ("Observability surface
 * (metrics, errors, telemetry)") — before this, that surface didn't exist.
 *
 * The sampling mechanics (push a byte size, derive a p95) are shared with
 * `adaptive-optimizer`'s activation registry via
 * `createByteSamplePercentileRegistry` in `@mcp-vertex/core`; only the
 * vocabulary here (`calls`, `recordResponseBytes`) is specific to this
 * plugin.
 */
export interface IRuntimeMetricsRegistry {
	recordResponseBytes(bytes: number): void;
	snapshot(): IRuntimeMetricsSnapshot;
	reset(): void;
}

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
