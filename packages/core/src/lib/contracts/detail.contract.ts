/**
 * `detail: compact | normal | full` — transversal contract (`f00187`,
 * adopted across more plugins by `f00271`).
 *
 * The pattern `r00031` and `r00032` apply to `proposal_get` and the
 * orchestrator-runner hotspot is promoted here as a shared, importable
 * contract. Every tool that opts in gets:
 *
 *   - the same input field (`detail?: Detail`),
 *   - the same default behaviour (`'normal'`),
 *   - a tiny helper (`projectDetail`) that picks the right projection
 *     for the requested level.
 *
 * The contract is pure (no runtime dependencies) so it can be imported
 * from `@mcp-vertex/core/public` without pulling in heavy machinery.
 */

/** Closed set of detail levels accepted by every adopting tool. */
export const DETAIL_LEVELS = ['compact', 'normal', 'full'] as const;

/** Detail-level literal. */
export type Detail = (typeof DETAIL_LEVELS)[number];

/**
 * Optional `detail` field on an input schema. When omitted, the tool
 * MUST default to `'normal'` (which is strictly smaller than the
 * legacy full payload — see r00031).
 */
export interface WithDetail {
	readonly detail?: Detail;
}

/**
 * Error thrown when a caller asks for a detail level that the tool does
 * not implement. Surfaces as a typed refusal so consumers can fall back
 * to `'full'` without guessing.
 */
export class UnknownDetailLevelError extends Error {
	readonly level: string;
	readonly knownLevels: readonly Detail[];
	constructor(level: string, knownLevels: readonly Detail[]) {
		super(
			`unknown detail level '${level}'; known: ${knownLevels.join(', ')}`,
		);
		this.name = 'UnknownDetailLevelError';
		this.level = level;
		this.knownLevels = knownLevels;
	}
}

/** Map from `Detail` to the projection function for that level. */
export type DetailProjections<TFull> = {
	readonly [K in Detail]: (full: TFull) => unknown;
};

/** Convenience alias — single-level projection function. */
export type DetailProjection<TFull> = (full: TFull) => unknown;

/**
 * Pure projection dispatcher. Looks up the level in `levels` and
 * applies the matching function. Default level is `'normal'`.
 *
 * @throws `UnknownDetailLevelError` if `levels` is missing a key for
 * the requested level.
 */
export const projectDetail = <TFull>(
	full: TFull,
	levels: DetailProjections<TFull>,
	requested?: Detail,
): unknown => {
	const level: Detail = requested ?? 'normal';
	const fn = levels[level];
	if (fn === undefined) {
		throw new UnknownDetailLevelError(level, DETAIL_LEVELS);
	}
	return fn(full);
};

/**
 * Compose a zod-friendly `WithDetail` extension. Useful when a tool wants
 * to spread `WithDetail` into its own `inputSchema` while keeping the
 * strong typing.
 */
export const withDetail = <T extends Record<string, unknown>>(
	base: T,
): T & WithDetail => base;
