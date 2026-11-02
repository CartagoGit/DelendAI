// alias-strategy: "what other ids should THIS id match against?".
//
// SOLID — Dependency Inversion. The capability-diff classifier
// depends on the `IAliasStrategy` interface, not on a concrete
// implementation. Hosts can plug in their own matcher (e.g. a
// data-pipeline project might match `ingest_*` to `load_*`); the
// default implementation covers the common verb-prefix case
// (`run_test` matches `test_runner`).
//
// SOLID — Open/Closed. New alias rules are added by composing
// strategies, not by editing the default.

import type { ICanonicalToolId } from './capability-normalize';

/**
 * Returns the list of aliases (in priority order) for a given
 * canonical id. The first alias is always the id itself, so a
 * caller can use the result uniformly.
 */
export interface IAliasStrategy {
	/**
	 * @param canonical - the canonicalised id (snake_case, prefix stripped).
	 * @param context - free-form metadata the strategy may need
	 *                  (e.g. the original raw name to detect casing
	 *                  conventions). Strategies that don't need it may
	 *                  ignore it.
	 */
	aliasesFor(
		canonical: ICanonicalToolId,
		context: IAliasContext,
	): readonly ICanonicalToolId[];
}

export interface IAliasContext {
	/** The raw, pre-normalisation name. */
	readonly raw: string;
}

/** The set of verb prefixes that should be stripped when matching. */
export const COMMON_VERB_PREFIXES: ReadonlySet<string> = new Set([
	'run',
	'get',
	'fetch',
	'list',
	'show',
	'check',
	'render',
	'do',
	'make',
	'create',
	'delete',
	'update',
	'open',
	'close',
]);

/**
 * Default alias strategy. Produces three families of aliases, in
 * priority order:
 *   1. The canonical id itself.
 *   2. The leading segment (`run_test` → `run`).
 *   3. The id with a common verb prefix stripped (`run_test` → `test`).
 *
 * The verb-stripping step is the one that lets `run_test` match an
 * existing `test_runner` or `test_exec`.
 */
export class DefaultAliasStrategy implements IAliasStrategy {
	aliasesFor(
		canonical: ICanonicalToolId,
		_context: IAliasContext,
	): readonly ICanonicalToolId[] {
		const out: ICanonicalToolId[] = [canonical];
		const parts = canonical.split('_');
		const head = parts[0];
		if (head !== undefined && head !== canonical) {
			if (!out.includes(head)) out.push(head);
		}
		if (
			parts.length > 1 &&
			head !== undefined &&
			COMMON_VERB_PREFIXES.has(head)
		) {
			const rest = parts.slice(1).join('_');
			if (rest !== canonical && !out.includes(rest)) out.push(rest);
		}
		return out;
	}
}

/**
 * Compose multiple strategies into one. The first match wins. Used
 * by hosts that want to layer a domain-specific strategy on top of
 * the default.
 */
export class CompositeAliasStrategy implements IAliasStrategy {
	constructor(private readonly strategies: readonly IAliasStrategy[]) {}

	aliasesFor(
		canonical: ICanonicalToolId,
		context: IAliasContext,
	): readonly ICanonicalToolId[] {
		const seen = new Set<ICanonicalToolId>();
		const out: ICanonicalToolId[] = [];
		for (const strategy of this.strategies) {
			for (const alias of strategy.aliasesFor(canonical, context)) {
				if (!seen.has(alias)) {
					seen.add(alias);
					out.push(alias);
				}
			}
		}
		return out;
	}
}
