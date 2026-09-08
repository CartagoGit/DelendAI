/**
 * vocabulary.ts — x00539 S1.
 *
 * The single module that owns the accepted vocabulary for
 * `proposals.kind` and for the lifecycle `status` of proposals, plans
 * and slices, plus the normalisation from raw frontmatter / markdown
 * prose to that vocabulary.
 *
 * ## Why this exists
 *
 * `ProposalRepo.upsertProjection` used to write the raw frontmatter
 * `kind` and `status` straight into CHECK-constrained columns. Three
 * real files in this repository carry `kind: infra`, which was not in
 * the 0001 enum, so the projection died with `CHECK constraint failed`
 * and the WHOLE run ended with zero rows after 547 of 895 proposals.
 * The vocabulary now lives in exactly one place and every writer goes
 * through it.
 *
 * ## `infra` — the decision (x00539 S1 acceptance)
 *
 * `infra` is ADDED to the canonical vocabulary; it is NOT mapped onto
 * an existing value. The reason is that the proposals plugin already
 * treats it as a first-class family, not as a synonym: it owns the
 * `i` filename prefix in `PROPOSAL_KINDS` (`i00002`, `i00003`,
 * `i00004` on disk), it has its own `done/infras/` sub-folder, its own
 * glyph, and its own slot in the cascade priority order. Mapping it to
 * `chore` (its conventional-commit type is `chore(infra)`) would make
 * `SELECT … WHERE kind = 'infra'` permanently return nothing and would
 * bake a divergence between the authoring ontology and the projection
 * — exactly the drift this module exists to prevent.
 *
 * `repair` (prefix `e`) is added for the same reason: it is a
 * first-class kind in the plugin's ontology, no file uses it yet, and
 * the first one that does must not repeat this failure. With those two
 * the DB enum and the plugin's `IProposalKind` are the same 15 values.
 *
 * ## No drift with the column enum
 *
 * `readColumnVocabularyFromMigrations` re-reads the effective CHECK
 * enum out of the migration SQL (the last `CREATE TABLE` that defines
 * the table wins, which is how SQLite sees it too). `vocabulary.spec`
 * asserts the TS vocabulary and the SQL enum are the same set in both
 * directions, so neither can change alone.
 */
import { MIGRATION_FILES, readMigrationSource } from './migrations';

/**
 * Canonical `proposals.kind` vocabulary. Mirrors the proposals
 * plugin's `IProposalKind` (15 values) and the CHECK enum installed by
 * migration 0011.
 */
export const PROPOSAL_KIND_VOCABULARY = [
	'feat',
	'breaking',
	'fix',
	'refactor',
	'perf',
	'audit',
	'chore',
	'docs',
	'test',
	'infra',
	'spike',
	'plan',
	'resume',
	'repair',
	'legacy',
] as const;

export type TProposalKind = (typeof PROPOSAL_KIND_VOCABULARY)[number];

/**
 * Canonical lifecycle status vocabulary. Shared by `proposals.status`
 * (0001) and by `plans.status` / `slices.status` (0008): the three
 * columns carry the same enum and this list is the only definition of
 * it on the TypeScript side.
 */
export const LIFECYCLE_STATUS_VOCABULARY = [
	'draft',
	'ready',
	'in-progress',
	'review',
	'blocked',
	'paused',
	'done',
	'retired',
	'superseded',
	'quarantined',
] as const;

export type TLifecycleStatus = (typeof LIFECYCLE_STATUS_VOCABULARY)[number];

const KIND_SET: ReadonlySet<string> = new Set(PROPOSAL_KIND_VOCABULARY);
const STATUS_SET: ReadonlySet<string> = new Set(LIFECYCLE_STATUS_VOCABULARY);

/**
 * Spellings seen in the wild (or trivially likely) that mean an
 * existing kind. A synonym belongs here; a distinct family belongs in
 * `PROPOSAL_KIND_VOCABULARY`.
 */
export const PROPOSAL_KIND_ALIASES: Readonly<Record<string, TProposalKind>> = {
	feature: 'feat',
	features: 'feat',
	bug: 'fix',
	bugfix: 'fix',
	hotfix: 'fix',
	documentation: 'docs',
	doc: 'docs',
	performance: 'perf',
	infrastructure: 'infra',
	tests: 'test',
	chores: 'chore',
	refactoring: 'refactor',
};

/**
 * Markdown statuses are prose, not an enum: `pending`, `done`,
 * `done (2026-07-24)`, `parked`, `promoted → x00165`. Only the first
 * token carries meaning; everything after it is a human annotation.
 */
export const LIFECYCLE_STATUS_ALIASES: Readonly<
	Record<string, TLifecycleStatus>
> = {
	pending: 'ready',
	todo: 'ready',
	claimable: 'ready',
	open: 'ready',
	parked: 'paused',
	promoted: 'superseded',
	wip: 'in-progress',
	'in-progress': 'in-progress',
	inprogress: 'in-progress',
};

export const isProposalKind = (value: string): value is TProposalKind =>
	KIND_SET.has(value);

export const isLifecycleStatus = (value: string): value is TLifecycleStatus =>
	STATUS_SET.has(value);

/**
 * Normalises a raw frontmatter `kind` to the canonical vocabulary.
 * Returns `null` when the value is absent or unknown — the caller
 * quarantines that ONE entity, it never aborts the run.
 */
export const normalizeProposalKind = (
	raw: string | null | undefined,
): TProposalKind | null => {
	if (typeof raw !== 'string') return null;
	const token = raw.trim().toLowerCase();
	if (token === '') return null;
	if (isProposalKind(token)) return token;
	return PROPOSAL_KIND_ALIASES[token] ?? null;
};

/**
 * Normalises a raw frontmatter / markdown status to the canonical
 * lifecycle vocabulary. The first token is the status; the rest is a
 * human annotation (`done (S2.x, S3.x all green)`).
 */
export const normalizeLifecycleStatus = (
	raw: string | null | undefined,
): TLifecycleStatus | null => {
	if (typeof raw !== 'string') return null;
	const token = (raw.trim().split(/[\s(.,:;—–]/)[0] ?? '').toLowerCase();
	if (token === '') return null;
	if (isLifecycleStatus(token)) return token;
	return LIFECYCLE_STATUS_ALIASES[token] ?? null;
};

/**
 * Thrown by the write boundary when a value that reached it is not in
 * the vocabulary. It carries the column and the raw value so the
 * caller can quarantine the entity with a useful reason instead of
 * seeing an opaque `CHECK constraint failed`.
 */
export class VocabularyViolationError extends Error {
	constructor(
		readonly column: 'kind' | 'status',
		readonly rawValue: string | null,
		readonly entityUid: string,
	) {
		super(
			`${entityUid}: ${column} ${
				rawValue === null ? 'is missing' : `"${rawValue}" is not in the accepted vocabulary`
			}`,
		);
		this.name = 'VocabularyViolationError';
	}
}

const CREATE_TABLE_BLOCK =
	/CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?"?([A-Za-z_][A-Za-z0-9_]*)"?\s*\(([\s\S]*?)\n\);/g;

const columnEnum = (block: string, column: string): readonly string[] | null => {
	const pattern = new RegExp(
		`${column}\\s+TEXT[^,]*?CHECK\\s*\\(\\s*${column}\\s+IN\\s*\\(([^)]*)\\)`,
		'i',
	);
	const match = pattern.exec(block);
	if (!match) return null;
	return (match[1] ?? '')
		.split(',')
		.map((value) => value.trim().replace(/^'|'$/g, ''))
		.filter((value) => value !== '');
};

/**
 * The enum SQLite actually enforces for `<table>.<column>` after every
 * migration has been applied, read straight out of the `.sql` files.
 * The LAST `CREATE TABLE` for that table wins, which is exactly how a
 * rebuild migration (0011) supersedes the original definition.
 */
export const readColumnVocabularyFromMigrations = (
	table: string,
	column: string,
): readonly string[] => {
	let found: readonly string[] | null = null;
	for (const name of MIGRATION_FILES) {
		const sql = readMigrationSource(name);
		CREATE_TABLE_BLOCK.lastIndex = 0;
		let match = CREATE_TABLE_BLOCK.exec(sql);
		while (match !== null) {
			if (match[1] === table) {
				const values = columnEnum(match[2] ?? '', column);
				if (values !== null) found = values;
			}
			match = CREATE_TABLE_BLOCK.exec(sql);
		}
	}
	if (found === null) {
		throw new Error(
			`no CHECK enum found for ${table}.${column} in the migration files`,
		);
	}
	return found;
};
