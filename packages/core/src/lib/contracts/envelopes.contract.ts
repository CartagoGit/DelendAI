/**
 * envelopes.contract.ts — r00033 (Track M / q00006 §46).
 *
 * Shared, type-only envelopes for the values that flow through MCP
 * tools/resources/prompts. Plugins adopt these shapes gradually so
 * the LLM (and downstream UIs) can recognise a small set of result
 * shapes instead of having to memorise one per plugin.
 *
 * PURE TYPES — no runtime values, no Node imports. Plugins and
 * external consumers import these from `@delendai/core/contracts`
 * to stay free of the runtime weight of `@delendai/core/public`.
 *
 * Privacy (R1.1–R1.10): the envelopes themselves carry no PII.
 * Callers that put values inside `value` / `after` / `content`
 * are responsible for redaction.
 */

/** Generic entity pointer. Plugins mint concrete `kind` strings
 *  (`'proposal'`, `'plugin'`, `'slice'`, `'tool'`, …). */
export interface EntityRef<
	TKind extends string = string,
	TId extends string = string,
> {
	readonly kind: TKind;
	readonly id: TId;
	/** Optional canonical URI (`delendai://…` when minted by core). */
	readonly href?: string;
	/** Human-readable label for UI surfaces. */
	readonly displayName?: string;
}

/** Stable refusal shape returned inside `OperationResult.error`.
 *  Callers may extend with plugin-specific `details`. */
export interface Refusal {
	readonly code: string;
	readonly message: string;
	/** Optional diagnostic envelope — same shape as a tool
	 *  diagnostic but typed at the refusal level for narrowing. */
	readonly diagnostic?: DiagnosticResult;
	/** Free-form details, plugin-specific. Must be JSON-safe. */
	readonly details?: Readonly<Record<string, unknown>>;
}

/** Cross-cutting metadata attached to any envelope. Plugins are
 *  free to omit it; core routers stamp it before returning the
 *  result to the MCP transport. */
export interface EnvelopeMeta {
	/** Plugin id that produced the result (`'core'` for core). */
	readonly source: string;
	/** Schema version of the envelope (semver). Bump when fields
	 *  are added or semantics change. */
	readonly schemaVersion: `0.${number}.${number}`;
	/** Monotonic per-session invocation counter. */
	readonly sequenceId?: number;
	/** Wall-clock ISO timestamp at envelope mint time. */
	readonly emittedAt?: string;
}

/** Discriminated union on `ok`. Use the `OperationResult.success`
 *  / `.failure` helpers below to narrow without re-checking `ok`. */
export type OperationResult<T = unknown, E = Refusal> =
	| OperationSuccess<T, E>
	| OperationFailure<T, E>;

export interface OperationSuccess<T = unknown, _E = Refusal> {
	readonly ok: true;
	readonly value: T;
	readonly error?: never;
	readonly envelope?: EnvelopeMeta;
}

export interface OperationFailure<_T = unknown, E = Refusal> {
	readonly ok: false;
	readonly value?: never;
	readonly error: E;
	readonly envelope?: EnvelopeMeta;
}

/** Page of items. `total` is the unpaginated count (for UI hints),
 *  `cursor` is opaque (the caller decides the encoding). */
export interface PagedResult<T> {
	readonly items: readonly T[];
	readonly total: number;
	readonly pageSize: number;
	readonly cursor?: string;
}

/** Result of a mutation. `before` / `after` are optional because
 *  some plugins do not capture snapshots. */
export interface MutationResult<T = unknown> {
	readonly changed: EntityRef;
	readonly before?: T;
	readonly after?: T;
	readonly dryRun?: boolean;
}

/** Severity-ordered diagnostic. `source` is the plugin id (or
 *  `'core'`). Codes are namespaced (`'AUDIT-46'`, `'LOAD-IO'`, …)
 *  so dashboards can group by code without parsing messages. */
export type DiagnosticSeverity = 'info' | 'warn' | 'error' | 'fatal';

export interface DiagnosticResult {
	readonly severity: DiagnosticSeverity;
	readonly code: string;
	readonly message: string;
	readonly source: string;
	/** Optional structured details. JSON-safe only. */
	readonly details?: Readonly<Record<string, unknown>>;
}

/** Generic resource envelope: a URI, a MIME type, and either
 *  UTF-8 text or raw bytes. Mirrors the MCP `Resource` shape but
 *  usable in any return value (not just `resources/read`). */
export interface ResourceResult {
	readonly uri: string;
	readonly mime: string;
	readonly content: string | Uint8Array;
}

// ---------------------------------------------------------------------------
// Narrowing helpers — call these instead of re-checking `ok` so the
// discriminated union never silently loses its narrowing.
// ---------------------------------------------------------------------------

export const isOperationSuccess = <T, E>(
	r: OperationResult<T, E>,
): r is OperationSuccess<T, E> => r.ok === true;

export const isOperationFailure = <T, E>(
	r: OperationResult<T, E>,
): r is OperationFailure<T, E> => r.ok === false;

/** Build a success envelope. The `value` is required; `meta` is
 *  optional. Returns a frozen object so callers cannot mutate
 *  the envelope after minting (helps with R1.3 / R1.6). */
export const success = <T>(
	value: T,
	meta?: EnvelopeMeta,
): OperationSuccess<T> => {
	const base: { ok: true; value: T; envelope?: EnvelopeMeta } = {
		ok: true,
		value,
	};
	return meta === undefined
		? (Object.freeze(base) as OperationSuccess<T>)
		: (Object.freeze({ ...base, envelope: meta }) as OperationSuccess<T>);
};

/** Build a failure envelope. `code` and `message` are required;
 *  `diagnostic` / `details` are optional. */
export const failure = <E extends Refusal = Refusal>(
	refusal: E,
	meta?: EnvelopeMeta,
): OperationFailure<never, E> => {
	const base: { ok: false; error: E; envelope?: EnvelopeMeta } = {
		ok: false,
		error: refusal,
	};
	return meta === undefined
		? (Object.freeze(base) as OperationFailure<never, E>)
		: (Object.freeze({ ...base, envelope: meta }) as OperationFailure<
				never,
				E
			>);
};
