// capability-diff-views: the OUTPUT shape of the diff, split so each
// consumer only sees the fields it needs.
//
// SOLID — Interface Segregation. The view types below are narrow:
//   - `IReasonedEntry` carries only the fields the diff UI /
//     scaffolder / linter actually consumes (name + reason). The
//     heavy `IBlueprintArtifact` (with optional body/whenToUse) is
//     reachable via `tool` for the few callers that need it.
//   - Each view (`IPresentView`, `IMissingView`, `IMismatchedView`)
//     exposes only the entries for one bucket.
//   - `ICapabilityDiffViews` composes the four views so the
//     orchestrator can read all of them in one call.
//
// SOLID — Single Responsibility. The summary string is built here
// (not in the composer) so the format is unit-testable in isolation
// and the composer stays focused on the pipeline.

import type { IBlueprintArtifact } from './build-blueprint';
import type { ICanonicalToolId } from './capability-normalize';

/**
 * Narrow read-model for a single diff entry. Consumers (UI, linter,
 * scaffolder) only need `name` and `reason`; the full blueprint
 * artefact is reachable through `tool` for the rare caller that
 * needs the body / whenToUse.
 */
export interface IReasonedEntry {
	readonly name: string;
	readonly description: string;
	/** Why this tool is in this bucket (one short sentence). */
	readonly reason: string;
	/**
	 * The full blueprint artefact. Optional so narrow consumers
	 * can project the diff without pulling in the body/whenToUse
	 * payload. The composer (capability-diff.ts) keeps the
	 * reference; the UI may ignore it.
	 */
	readonly tool?: IBlueprintArtifact;
}

/**
 * @deprecated Use `IReasonedEntry`. Kept as a type alias for
 * backward compatibility with external consumers that imported
 * the old name; maps 1:1 to the new type.
 */
export type ICapabilityDiffEntry = IReasonedEntry;

export interface IPresentView {
	readonly present: readonly IReasonedEntry[];
}
export interface IMissingView {
	readonly missing: readonly IReasonedEntry[];
}
export interface IMismatchedView {
	readonly mismatched: readonly IReasonedEntry[];
}
export interface IExtraView {
	readonly extra: readonly ICanonicalToolId[];
}
export interface IDesiredView {
	readonly desired: readonly ICanonicalToolId[];
	readonly existing: readonly ICanonicalToolId[];
}

/**
 * The composite view returned to the orchestrator. Every field is
 * always present (no optionals); each is a *view* of the same diff
 * projected for a different consumer.
 */
export interface ICapabilityDiffViews
	extends IPresentView,
		IMissingView,
		IMismatchedView,
		IExtraView,
		IDesiredView {
	/** One-line human-readable summary. Always set. */
	readonly summary: string;
}

export interface IBuildViewsInput {
	readonly desired: readonly ICanonicalToolId[];
	readonly existing: readonly ICanonicalToolId[];
	readonly present: readonly ICapabilityDiffEntry[];
	readonly missing: readonly ICapabilityDiffEntry[];
	readonly mismatched: readonly ICapabilityDiffEntry[];
	readonly extra: readonly ICanonicalToolId[];
}

/**
 * Pure constructor for the composite view. Separated from the
 * summary formatter so each can be tested independently.
 */
export const buildCapabilityViews = (
	input: IBuildViewsInput,
): Omit<ICapabilityDiffViews, 'summary'> => ({
	desired: input.desired,
	existing: input.existing,
	present: input.present,
	missing: input.missing,
	mismatched: input.mismatched,
	extra: input.extra,
});

/**
 * Format a one-line coverage summary. Pure; easy to swap for i18n
 * later (pass the user's locale + an `ISummaryFormatter` strategy).
 */
export const formatCoverageSummary = (
	views: Pick<
		ICapabilityDiffViews,
		'present' | 'missing' | 'mismatched' | 'extra'
	>,
): string => {
	if (views.missing.length === 0) {
		return `Coverage complete: ${views.present.length} tools present, 0 missing.`;
	}
	return (
		`${views.missing.length} tool(s) missing, ` +
		`${views.mismatched.length} need review, ` +
		`${views.present.length} already present, ` +
		`${views.extra.length} extra.`
	);
};
