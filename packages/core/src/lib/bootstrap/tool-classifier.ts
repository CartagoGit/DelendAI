// tool-classifier: "given a desired tool and the existing set, which
// bucket does it land in?".
//
// SOLID — Open/Closed. New buckets ("deprecated", "experimental", …)
// are added by composing a new `IExistingToolsMatcher`, NOT by
// editing the existing classifier body. The default matcher handles
// the three buckets the rest of the bootstrap pipeline cares about:
// present (exact-or-alias match), mismatched (head-alias match),
// missing (no match at all).
//
// SOLID — Interface Segregation. The matcher returns a discriminated
// union so callers branch on a tag, not on truthiness of optional
// fields.

import type { IBlueprintArtifact } from './build-blueprint';
import type { ICanonicalToolId } from './capability-normalize';
import type { IAliasStrategy } from './alias-strategy';

/**
 * Discriminated result of classifying a single desired tool against
 * the existing set. Each variant carries only the fields its
 * consumers need — no nullable `present?: string` soup.
 */
export type IToolClassification =
	| { readonly kind: 'present'; readonly matchedAs: ICanonicalToolId }
	| {
			readonly kind: 'mismatched';
			/** The existing tool id the classifier matched against. */
			readonly existingHead: ICanonicalToolId;
	  }
	| { readonly kind: 'missing' };

export interface IClassificationContext {
	readonly tool: IBlueprintArtifact;
	readonly canonical: ICanonicalToolId;
	readonly raw: string;
	readonly aliases: readonly ICanonicalToolId[];
	readonly existing: ReadonlySet<ICanonicalToolId>;
}

/**
 * Strategy: takes a desired tool's aliases + the existing id set and
 * decides which bucket the tool lands in.
 *
 * Implementations MUST be pure and allocation-free in the common path
 * (the default matcher iterates the alias list once).
 */
export interface IExistingToolsMatcher {
	classify(context: IClassificationContext): IToolClassification;
}

/**
 * Default matcher: an alias matches the existing set when it equals
 * an existing id OR is a prefix of an existing id. The first such
 * alias is the `matchedAs`. If no exact/prefix match exists, the
 * matcher falls back to "mismatched" when at least one alias is
 * itself an existing id (covers `run_test` vs. `test_runner` —
 * the prefix match fails, but `test` is a real existing id), and
 * `missing` otherwise.
 */
export class DefaultExistingToolsMatcher implements IExistingToolsMatcher {
	classify(context: IClassificationContext): IToolClassification {
		const { aliases, existing, canonical } = context;
		const exact = aliases.find((alias) => existing.has(alias));
		if (exact !== undefined) {
			return { kind: 'present', matchedAs: exact };
		}
		const prefixHit = aliases.find((alias) =>
			[...existing].some((existingId) =>
				existingId.startsWith(`${alias}_`),
			),
		);
		if (prefixHit !== undefined) {
			return { kind: 'present', matchedAs: prefixHit };
		}
		// No exact/prefix match. Look for a head-alias that is itself
		// an existing id — "mismatched" means the surface overlaps but
		// the names diverge.
		const headHit = aliases.find(
			(alias) => alias !== canonical && existing.has(alias),
		);
		if (headHit !== undefined) {
			return { kind: 'mismatched', existingHead: headHit };
		}
		return { kind: 'missing' };
	}
}
