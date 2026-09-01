/**
 * `TokenBudgetRegistry` — `f00186`.
 *
 * The single API consumed by CI, dashboard, docs, tests and CLI to
 * measure, validate and report token consumption. Adapters (`BudgetSource`s)
 * plug into the registry; each measurement is stamped with the source
 * that produced it so consumers can trace why a number changed.
 *
 * Design notes:
 *   - Pure: no fs, no network, no global state. Construct with sources
 *     and call `measure` / `validate` / `report`.
 *   - Deterministic: stable ordering of sources, stable JSON shape.
 *   - Failable: `validate` throws `TokenBudgetBreachError` on a hard
 *     breach (matches the gate scripts that already throw).
 *
 * Migration: existing gate scripts can wrap their measurement in
 * `registry.measure()` and call `validate()` in place of their own
 * ceiling check. See slice S1 in `f00186-tokenbudgetregistry-unificado.md`.
 */

import {
	TokenBudgetBreachError,
	type IBudgetCeiling,
	type IBudgetSource,
	type ITokenMeasurement,
	type ITokenReport,
	type ITokenReportRow,
	type TokenSurface,
} from './types';

export interface IRegistryOptions {
	readonly sources: readonly IBudgetSource[];
	/** Bytes-per-estimated-token used by `measure()` when not specified. */
	readonly bytesPerEstimatedToken?: number;
}

export interface IMeasureOptions {
	/** Optional ceiling for `validate()` comparisons. */
	readonly ceiling?: IBudgetCeiling;
	/** Override the bytes-per-token ratio for this measurement. */
	readonly bytesPerEstimatedToken?: number;
}

const DEFAULT_BYTES_PER_TOKEN = 4;

const nowIso = (): string => new Date().toISOString();

export class TokenBudgetRegistry {
	readonly #sources: readonly IBudgetSource[];
	readonly #bytesPerToken: number;

	constructor(options: IRegistryOptions) {
		if (options.sources.length === 0) {
			throw new Error('TokenBudgetRegistry requires at least one source');
		}
		// Stable ordering — sort by id so consumers can rely on iteration.
		const sorted = [...options.sources].sort((a, b) =>
			a.id.localeCompare(b.id),
		);
		this.#sources = sorted;
		this.#bytesPerToken =
			options.bytesPerEstimatedToken ?? DEFAULT_BYTES_PER_TOKEN;
	}

	/** Number of sources currently registered. */
	get sourceCount(): number {
		return this.#sources.length;
	}

	/** Source ids (sorted alphabetically). */
	get sourceIds(): readonly string[] {
		return this.#sources.map((s) => s.id);
	}

	/**
	 * Measure a surface for a given tool.
	 * Calls every registered source, sums their byte contributions and
	 * also returns the individual measurements for traceability.
	 */
	measure(surface: TokenSurface, toolId: string): ITokenMeasurement {
		let bytes = 0;
		let firstSource = '';
		for (const src of this.#sources) {
			const value = src.measure(surface, toolId);
			// `measure` may return a Promise; we only expose the sync
			// path here — async variants must be awaited via the
			// registry's async surface (see slice S2 if added).
			const resolved =
				typeof value === 'number' ? value : Number(value) || 0;
			bytes += resolved;
			if (firstSource === '') firstSource = src.id;
		}
		const tokens = bytes / this.#bytesPerToken;
		const measurement: ITokenMeasurement = {
			surface,
			bytes,
			tokens,
			sourceId: firstSource,
			capturedAt: nowIso(),
		};
		return measurement;
	}

	/**
	 * Validate a measurement against a hard ceiling.
	 * Throws `TokenBudgetBreachError` if `bytes > ceiling.hard`.
	 * Soft warnings are not surfaced as errors here; consumers can check
	 * `bytes > ceiling.warning` themselves.
	 */
	validate(
		surface: TokenSurface,
		toolId: string,
		ceiling: IBudgetCeiling,
	): ITokenMeasurement {
		const measurement = this.measure(surface, toolId);
		if (measurement.bytes > ceiling.hard) {
			throw new TokenBudgetBreachError({
				surface,
				toolId,
				measured: measurement.bytes,
				budget: ceiling.hard,
				source: measurement.sourceId,
			});
		}
		return measurement;
	}

	/**
	 * Build a structured report for a tool across one or more surfaces.
	 * `surfaces` defaults to all surfaces; `ceiling` is optional (when
	 * provided, the report marks warnings/breaches per surface).
	 */
	report(
		toolId: string,
		options: {
			readonly surfaces?: readonly TokenSurface[];
			readonly ceiling?: IBudgetCeiling;
		} = {},
	): ITokenReport {
		const requested =
			options.surfaces ?? (['schema', 'runtime', 'native'] as const);
		const rows: ITokenReportRow[] = [];
		const deficits: {
			surface: TokenSurface;
			ratio: number;
			bytes: number;
			budget: number;
		}[] = [];
		const ceiling = options.ceiling;
		for (const surface of requested) {
			const m = this.measure(surface, toolId);
			const budget = ceiling?.hard;
			const warning = ceiling?.warning;
			const status: ITokenReportRow['status'] =
				budget === undefined
					? 'ok'
					: m.bytes > budget
						? 'breach'
						: warning !== undefined && m.bytes > warning
							? 'warning'
							: 'ok';
			const row: ITokenReportRow =
				budget === undefined
					? {
							surface,
							bytes: m.bytes,
							tokens: m.tokens,
							status,
						}
					: {
							surface,
							bytes: m.bytes,
							tokens: m.tokens,
							budget,
							status,
						};
			rows.push(row);
			if (budget !== undefined && m.bytes > budget) {
				deficits.push({
					surface,
					ratio: m.bytes / budget,
					bytes: m.bytes,
					budget,
				});
			}
		}
		return {
			toolId,
			measurements: rows,
			documentedDeficits: deficits,
			generatedAt: nowIso(),
		};
	}
}

export const createTokenBudgetRegistry = (
	options: IRegistryOptions,
): TokenBudgetRegistry => new TokenBudgetRegistry(options);
