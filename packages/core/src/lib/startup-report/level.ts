/**
 * startup-report/level.ts — q00009 / f00256.
 *
 * Single source of truth for the five canonical `startupReport.level`
 * values: `off`, `compact`, `medium`, `high`, `full`.
 *
 * The spec requires that the **default** is `medium`. When a host, CLI
 * flag or `delendai.config.json` is silent about the level, the
 * resolver MUST return `medium`. There must be exactly one place where
 * that default lives, and it must be the function exported below.
 *
 * Aliases are tolerated for backwards compatibility with older configs:
 * `extended` → `high` (q00009 / d00016 migration matrix). Aliases are
 * normalised once, here, so downstream code never has to think about
 * them.
 *
 * This module is pure: no I/O, no fs, no clock. It can be imported from
 * any layer (core, plugin, scaffold, build script).
 */

export const STARTUP_REPORT_LEVELS = [
	'off',
	'compact',
	'medium',
	'high',
	'full',
] as const;

export type IStartupReportLevel = (typeof STARTUP_REPORT_LEVELS)[number];

/** Accepted input values, including the pre-q00009 compatibility alias. */
export const STARTUP_REPORT_LEVEL_INPUTS = [
	...STARTUP_REPORT_LEVELS,
	'extended',
] as const;

export type IStartupReportLevelInput =
	(typeof STARTUP_REPORT_LEVEL_INPUTS)[number];

/**
 * Default when the operator says nothing about the level. The spec
 * (q00009 §8.1) marks this as a non-negotiable acceptance criterion:
 * "Si no se especifica nivel, el default efectivo es `medium`."
 */
export const STARTUP_REPORT_DEFAULT_LEVEL: IStartupReportLevel = 'medium';

const STARTUP_REPORT_LEVEL_ALIASES: Readonly<
	Record<string, IStartupReportLevel>
> = {
	extended: 'high',
};

/**
 * Resolve an alias to a canonical level. Returns `undefined` for
 * canonical values (use the input directly) and for unknown strings.
 */
export const resolveStartupReportLevelAlias = (
	value: string,
): IStartupReportLevel | undefined => STARTUP_REPORT_LEVEL_ALIASES[value];

/**
 * Coerce any user-supplied string into a canonical level. Returns
 * `undefined` for `undefined`, `null`, empty string or unknown values
 * — the caller decides what to do with the absence.
 *
 * Use {@link resolveStartupReportLevel} instead when you want the
 * defaulting behaviour in one call.
 */
export const coerceStartupReportLevel = (
	value: string | undefined | null,
): IStartupReportLevel | undefined => {
	if (typeof value !== 'string') return undefined;
	const trimmed = value.trim();
	if (trimmed.length === 0) return undefined;
	if ((STARTUP_REPORT_LEVELS as readonly string[]).includes(trimmed)) {
		return trimmed as IStartupReportLevel;
	}
	return resolveStartupReportLevelAlias(trimmed);
};

export interface IResolveStartupReportLevelInput {
	/** Value from `delendai.config.json#startupReport.level`. */
	readonly configLevel?: string | undefined;
	/** Value from CLI override (`--startup-report=...`). */
	readonly cliLevel?: string | undefined;
	/** Environment variable override (e.g. CI / dogfooding). */
	readonly envLevel?: string | undefined;
}

export interface IResolveStartupReportLevelResult {
	readonly level: IStartupReportLevel;
	readonly source: 'default' | 'config' | 'cli' | 'env' | 'alias';
	readonly requested?: string | undefined;
}

/**
 * Resolve the effective startup report level. Precedence (highest
 * first):
 *
 * 1. CLI override (when present and non-empty).
 * 2. Environment variable.
 * 3. Config file value.
 * 4. Default: `medium`.
 *
 * When a non-canonical value is supplied (alias or unknown), the
 * result includes `requested` so the caller can log a warning, but
 * the resolved level is the canonical mapping. Unknown strings fall
 * back to the default (with `source: 'default'`) so a typo never
 * blocks startup.
 */
export const resolveStartupReportLevel = (
	input: IResolveStartupReportLevelInput = {},
): IResolveStartupReportLevelResult => {
	const tryLayer = (
		raw: string | undefined,
		source: 'config' | 'cli' | 'env',
	): IResolveStartupReportLevelResult | undefined => {
		const coerced = coerceStartupReportLevel(raw);
		if (coerced === undefined) {
			return raw === undefined || raw === null || raw.trim() === ''
				? undefined
				: {
						// Unknown string: fall back to default but record what
						// the user asked for so callers can warn.
						level: STARTUP_REPORT_DEFAULT_LEVEL,
						source: 'default',
						requested: raw,
					};
		}
		if (coerced !== raw?.trim()) {
			// Alias used (`extended` → `high`).
			return {
				level: coerced,
				source: 'alias',
				requested: raw,
			};
		}
		return { level: coerced, source };
	};

	const cli = tryLayer(input.cliLevel, 'cli');
	if (cli !== undefined) return cli;

	const env = tryLayer(input.envLevel, 'env');
	if (env !== undefined) return env;

	const config = tryLayer(input.configLevel, 'config');
	if (config !== undefined) return config;

	return {
		level: STARTUP_REPORT_DEFAULT_LEVEL,
		source: 'default',
	};
};

/**
 * Predicate: does this level render any startup report at all?
 * `off` means we skip the report entirely; every other level produces
 * some output.
 */
export const isStartupReportLevelVisible = (
	level: IStartupReportLevel,
): boolean => level !== 'off';

/**
 * Predicate: does this level include the per-plugin cost breakdown
 * table? Spec (q00009 §8.1) marks this as a hard requirement for
 * `medium` and above.
 */
export const levelIncludesPluginCostTable = (
	level: IStartupReportLevel,
): boolean => level === 'medium' || level === 'high' || level === 'full';
