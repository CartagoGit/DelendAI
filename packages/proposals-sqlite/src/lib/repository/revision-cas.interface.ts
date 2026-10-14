/**
 * Contract shapes and constants for `./revision-cas`.
 *
 * Split out of the implementation module so the repo's "types and
 * constants live in contracts" convention holds: `revision-cas.ts` keeps
 * the behaviour, this file keeps the shapes. Re-exported from
 * `revision-cas.ts`, so no import site changes.
 */

/** Tables that carry a `revision` column. */
export const REVISION_TABLES = ['proposals', 'plans', 'slices'] as const;
export type IRevisionTable = (typeof REVISION_TABLES)[number];

/** The verdict of one compare-and-swap attempt. */
export type IRevisionCasOutcome =
	| { readonly kind: 'updated'; readonly revision: number }
	| { readonly kind: 'conflict'; readonly currentRevision: number }
	| { readonly kind: 'missing' };

/**
 * Columns a caller may patch, per table.
 *
 * An allowlist rather than "whatever keys the patch has": column names
 * cannot be bound as parameters, so they are interpolated into the SQL,
 * and interpolating a caller-supplied string is how an injection gets
 * in. `revision` and `uid` are deliberately absent — the first is the
 * primitive's own business and the second identifies the row.
 */
export const WRITABLE_COLUMNS: Readonly<
	Record<IRevisionTable, readonly string[]>
> = {
	proposals: [
		'slug',
		'kind',
		'status',
		'title',
		'source_path',
		'source_blob_sha',
		'content_hash',
		'updated_at',
		'closed_at',
	],
	// Verified against `PRAGMA table_info`, not against the migration
	// prose: `plans` and `slices` carry no `content_hash`.
	plans: [
		'slug',
		'status',
		'title',
		'source_path',
		'updated_at',
		'closed_at',
	],
	slices: [
		'slug',
		'status',
		'title',
		'source_path',
		'updated_at',
		'closed_at',
	],
};

export interface IRevisionCasInput {
	readonly table: IRevisionTable;
	readonly uid: string;
	readonly expectedRevision: number;
	/** Column → value. Every key must be writable for this table. */
	readonly patch: Readonly<Record<string, string | number | null>>;
}
