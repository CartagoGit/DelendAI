/**
 * Dashboard-mock source adapter (`f00186` slice S1).
 *
 * Returns whatever value the existing dashboard would have produced for
 * a given tool, so the registry can replace the per-script measurements
 * without changing the values during migration (c00135).
 *
 * The "mock" is intentional: it documents the seam between
 * runtime-measured and registry-measured dashboards. Real adapters for
 * runtime telemetry will plug in here later.
 */

import type { IBudgetSource, TokenSurface } from '../types';

export interface IDashboardMockSourceOptions {
	/** Override the source id (defaults to `'dashboard-mock'`). */
	readonly id?: string;
	/**
	 * Hard-coded measurements, in the shape the legacy dashboard used.
	 * Keyed by `toolId#surface` (e.g. `proposals.get#schema`).
	 */
	readonly values?: Readonly<Record<string, number>>;
}

const keyFor = (surface: TokenSurface, toolId: string): string =>
	`${toolId}#${surface}`;

export const createDashboardMockSource = (
	options: IDashboardMockSourceOptions = {},
): IBudgetSource => {
	const id = options.id ?? 'dashboard-mock';
	const values = options.values ?? {};
	return {
		id,
		measure(surface: TokenSurface, toolId: string): number {
			return values[keyFor(surface, toolId)] ?? 0;
		},
	};
};
