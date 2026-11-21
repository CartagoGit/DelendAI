// existing-tools-source: where does the list of "what the existing
// server already exposes" come from?
//
// SOLID — Dependency Inversion. The diff pipeline depends on the
// `IExistingToolsSource` interface, not on a hardcoded array. Hosts
// can plug in a source that calls `<prefix>_list_tools` on a live
// server; tests can plug in a static list; both are first-class.

import { canonicalToolId } from './capability-normalize';
import type { ICanonicalToolId } from './capability-normalize';

/** A list of namespaced tool ids, e.g. `acme_run_test`. */
export type IRawToolName = string;

export interface IExistingToolsSource {
	/** Returns the canonical set (prefix-stripped, snake_case). */
	canonicalSet(): ReadonlySet<ICanonicalToolId>;
	/** Optional: returns the raw namespaced list (for diagnostics). */
	raw(): readonly IRawToolName[];
}

export interface IStaticSourceOptions {
	readonly raw: readonly IRawToolName[];
	readonly namespacePrefix?: string;
}

/**
 * Default source: wraps a fixed list and canonicalises it on demand.
 * `canonicalSet()` materialises the set once and reuses it across
 * matcher calls.
 */
export class StaticExistingToolsSource implements IExistingToolsSource {
	readonly #canonical: ReadonlySet<ICanonicalToolId>;
	readonly #raw: readonly IRawToolName[];

	constructor(options: IStaticSourceOptions) {
		this.#raw = options.raw;
		this.#canonical = new Set<ICanonicalToolId>(
			options.raw.map((name) =>
				canonicalToolId(name, options.namespacePrefix),
			),
		);
	}

	canonicalSet(): ReadonlySet<ICanonicalToolId> {
		return this.#canonical;
	}

	raw(): readonly IRawToolName[] {
		return this.#raw;
	}
}
