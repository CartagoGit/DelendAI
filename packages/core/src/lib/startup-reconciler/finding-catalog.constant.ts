/**
 * Constants for `./finding-catalog`.
 *
 * Split out of the implementation module so the repo's "types and
 * constants live in contracts" convention holds: `finding-catalog.ts` keeps
 * the behaviour, this file keeps the constants. Re-exported from
 * `finding-catalog.ts`, so no import site changes.
 */

/**
 * Repairs the reconciler applies without asking. Each one is a function
 * of re-observable evidence, and re-running it converges.
 */
export const SAFE_FINDING_CODES = [
	/** A known, shipped schema migration was applied. */
	'state-database.migration-applied',
	/** The state DB did not exist and was created empty (fresh machine). */
	'state-database.created',
	/** A derived cache/index/projection was recomputed. */
	'state-database.projection-rebuilt',
	/** Integration branch and managed work refs were fetched. */
	'fetch.completed',
	/** A work unit known only to the forge was rebuilt from its ref. */
	'work-refs.work-unit-rebuilt',
	/** A checkpoint observed on a ref was recorded. */
	'work-refs.generation-recorded',
	/** A ref was unchanged since the last run and was not re-read. */
	'work-refs.unchanged',
	/** A pull request's state was mirrored from the forge. */
	'forge.pull-request-reconciled',
	/** A CI verdict was mirrored from the forge. */
	'forge.ci-reconciled',
	/** A journal event was replayed into the local view. */
	'journal.event-imported',
	/** A checkpoint is already contained in the integration branch. */
	'integration-evidence.checkpoint-integrated',
	/** A work ref is gone AND its content is proven merged. */
	'integration-evidence.merged-ref-absent',
	/** A lease whose TTL elapsed was reaped. */
	'leases.expired-reaped',
	/** Claims held by a reaped lease were released. */
	'leases.claims-released',
	/** Work whose owner disappeared became RECOVERABLE (never deleted). */
	'leases.work-recoverable',
	/** Governance was read and matches the policy. */
	'governance.verified',
	/** The visible checkout is on the integration branch. */
	'checkout.on-integration',
] as const;

/**
 * Conditions the reconciler must never resolve on its own. Every one of
 * these has at least two plausible repairs, and picking the wrong one
 * destroys work that exists nowhere else.
 */
export const AMBIGUOUS_FINDING_CODES = [
	/** Two refs claim the same (proposal, slice, generation). */
	'work-refs.duplicate-generation',
	/** A ref's history was rewritten under a checkpoint we recorded. */
	'work-refs.history-rewritten',
	/** A ref carries commits that map to no work unit identity. */
	'work-refs.unattributable',
	/** Two live owners claim overlapping paths. */
	'leases.overlapping-owners',
	/** A work ref vanished with no durable evidence of its merge. */
	'integration-evidence.ref-vanished',
	/** The database is present but unreadable / corrupt. */
	'state-database.corrupt',
	/** A migration exists whose effect on this data is not determined. */
	'state-database.ambiguous-migration',
	/** No database, and this run was not permitted to create one. */
	'state-database.absent',
	/** Live governance is weaker than policy in a destructive direction. */
	'governance.destructive-mismatch',
	/** HEAD is not on the integration branch (never fixed by resetting). */
	'checkout.head-moved',
	/** The policy itself does not resolve to a coherent model. */
	'environment.policy-invalid',
	/** The repository identity could not be determined. */
	'environment.repository-unknown',
] as const;

/**
 * Conditions that block READY without being dangerous: nothing to repair,
 * nothing to improvise, the run simply could not verify what it must.
 */
export const UNVERIFIED_FINDING_CODES = [
	'state-database.unverifiable',
	'fetch.failed',
	'forge.unavailable',
	'governance.unverifiable',
	'governance.drift',
	'mutex.busy',
] as const;
