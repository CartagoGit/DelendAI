/**
 * Static-bytes source adapter (`f00186` slice S1).
 *
 * Measures the JSON-byte size of an `outputSchema` or an arbitrary
 * payload synchronously. Used by the registry as one of the
 * `BudgetSource`s for the `'schema'` surface.
 *
 * This is a pure helper: no filesystem, no telemetry, no network.
 * Callers supply the schema (or payload); the adapter returns bytes.
 */

import type { IBudgetSource, TokenSurface } from '../types';

export interface IStaticBytesSourceOptions {
	/** Override the source id (defaults to `'static-bytes'`). */
	readonly id?: string;
	/**
	 * Map of `toolId -> payload` to measure. The registry looks up the
	 * payload here when `measure()` is called.
	 */
	readonly payloads?: Readonly<Record<string, unknown>>;
	/** Override bytes-per-token ratio (default 4). */
	readonly bytesPerEstimatedToken?: number;
}

export const createStaticBytesSource = (
	options: IStaticBytesSourceOptions = {},
): IBudgetSource => {
	const id = options.id ?? 'static-bytes';
	const payloads = options.payloads ?? {};
	const bytesPerToken = options.bytesPerEstimatedToken ?? 4;
	return {
		id,
		measure(surface: TokenSurface, toolId: string): number {
			const payload = payloads[toolId];
			if (payload === undefined) {
				return 0;
			}
			const bytes = JSON.stringify(payload, null, 0).length;
			// Use a deterministic rounding so dashboards match exactly.
			const _rounded =
				surface === 'native' ? bytes / bytesPerToken : bytes;
			return _rounded;
		},
	};
};
