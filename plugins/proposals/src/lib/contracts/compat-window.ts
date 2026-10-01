/**
 * compat-window.ts — f00152 S3/S4 (L2 — compat window).
 *
 * The compat-window is the layer that lets consumers keep using the
 * previous shape of a facade tool while the implementation migrates
 * to the next shape. It does NOT translate behavior — it translates
 * the input shape, runs the new handler, and emits a structured
 * `deprecatedShapeUsed` warning so the consumer knows it should
 * migrate.
 *
 * SOLID notes:
 *   - **OCP**: a tool joins the compat window by calling
 *     `withCompatWindow()` in its handler; the window itself never
 *     knows about specific tools.
 *   - **SRP**: this file owns the parsing + translation + warning.
 *     Per-tool schemas live next to the tools that own them.
 *   - **DIP**: the window operates on a small typed contract
 *     (`ICompatWindowPair`); the caller supplies the v1→v2
 *     translator function.
 */
import type { ZodTypeAny } from 'zod';

/**
 * A single shape in the compat window. `version` is the canonical
 * name (`'v1'`, `'v2'`, ...) the consumer and the docs use; the
 * `sinceVersion` and `removedIn` fields are surfaced in the warning
 * payload so the consumer can plan its migration.
 */
export interface ICompatShapeDescriptor<T> {
	readonly version: 'v1' | 'v2' | string;
	readonly schema: ZodTypeAny;
	readonly sinceVersion: string;
	readonly removedIn: string;
	readonly migrationHint: string;
	/**
	 * Pure translator from the old shape to the new. Receives the
	 * parsed (and safe-typed) old payload, returns the new payload.
	 */
	readonly translate: (old: unknown) => T;
}

/**
 * A compat-window pair: v2 (newest) + v1 (legacy). The window tries
 * v2 first, falls back to v1 with translation, and emits a warning
 * if v1 was used.
 */
export interface ICompatWindowPair<T> {
	readonly v2: ICompatShapeDescriptor<T>;
	readonly v1: ICompatShapeDescriptor<T>;
}

/**
 * The result of parsing through the compat window.
 */
export type CompatParseResult<T> =
	| {
			readonly ok: true;
			readonly value: T;
			readonly shapeUsed: 'v2' | 'v1';
			readonly warning: IDeprecatedShapeUsed | null;
	  }
	| {
			readonly ok: false;
			readonly error: { readonly issues: ReadonlyArray<unknown> };
	  };

/** The structured warning the tool handler attaches to its response. */
export interface IDeprecatedShapeUsed {
	readonly version: string;
	readonly sinceVersion: string;
	readonly removedIn: string;
	readonly migrationHint: string;
}

/**
 * Pure helper: try v2 first, fall back to v1 + translation, build
 * the warning if v1 was used. Returns a `CompatParseResult` so the
 * caller can either pass `value` to the new handler or surface the
 * `error` as a structured tool error.
 *
 * Never throws. Both schemas are guaranteed to be safe-parsed
 * individually; if BOTH fail, the caller receives the v2 issues
 * (the "newest" failure is the more useful one for the consumer).
 */
export const parseWithCompatWindow = <T>(
	pair: ICompatWindowPair<T>,
	input: unknown,
): CompatParseResult<T> => {
	const v2Result = pair.v2.schema.safeParse(input);
	if (v2Result.success) {
		return {
			ok: true,
			value: v2Result.data as T,
			shapeUsed: 'v2',
			warning: null,
		};
	}
	const v1Result = pair.v1.schema.safeParse(input);
	if (v1Result.success) {
		const translated = pair.v1.translate(v1Result.data);
		return {
			ok: true,
			value: translated,
			shapeUsed: 'v1',
			warning: {
				version: 'v1',
				sinceVersion: pair.v1.sinceVersion,
				removedIn: pair.v1.removedIn,
				migrationHint: pair.v1.migrationHint,
			},
		};
	}
	return { ok: false, error: { issues: v2Result.error?.issues ?? [] } };
};

/**
 * Factory for the typed schema pair — keeps the handler boundary
 * one-line per tool.
 */
export const defineCompatWindow = <T>(
	pair: ICompatWindowPair<T>,
): ICompatWindowPair<T> => pair;
