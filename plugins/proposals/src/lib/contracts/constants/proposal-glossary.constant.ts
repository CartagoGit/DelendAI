/**
 * Single source of truth for the f00016 proposal state machine: the 7
 * statuses (one folder each), the 12 kinds (one filename prefix each),
 * and the legal status→status transitions. Every consumer (the
 * scaffold linter S2, the transition tool S3, the folder reconciler
 * S5, the id allocator S13, the i18n glossary S6) imports from here —
 * nothing redefines its own copy of "what are the statuses" again.
 *
 * NOT used yet by `sync-proposal-registry.ts` / `proposal-document.ts`:
 * those still validate the OLD 8-status union because the 14 legacy
 * proposals on disk still use it. Wiring them to this glossary is the
 * `PROPOSAL_STATE_MACHINE_V2` flag's job (f00016 §8 risks), flipped only
 * after S11/S12 migrate every legacy file — doing it earlier would
 * make `sync_proposals` reject every proposal currently on disk.
 */

export type IProposalStatus =
	| 'ready'
	| 'in-progress'
	| 'review'
	| 'done'
	| 'paused'
	| 'blocked'
	| 'retired';

export interface IProposalStatusInfo {
	/** Folder under `docs/mcp-vertex/proposals/` this status lives in (f00016 §4.1). */
	readonly folder: string;
	/** Terminal statuses only leave via `proposal_retire` (rare, defensive). */
	readonly terminal: boolean;
}

export const PROPOSAL_STATUSES: Readonly<
	Record<IProposalStatus, IProposalStatusInfo>
> = {
	ready: { folder: 'ready', terminal: false },
	'in-progress': { folder: 'in-progress', terminal: false },
	review: { folder: 'review', terminal: false },
	done: { folder: 'done', terminal: true },
	paused: { folder: 'paused', terminal: false },
	blocked: { folder: 'blocked', terminal: false },
	retired: { folder: 'retired', terminal: true },
};

/** Folder names happen to equal status names today; kept as an explicit
 * map (not `Object.keys`) so the two can diverge later without a ripple. */
export const STATUS_TO_FOLDER: Readonly<Record<IProposalStatus, string>> =
	Object.fromEntries(
		Object.entries(PROPOSAL_STATUSES).map(([status, info]) => [
			status,
			info.folder,
		]),
	) as Readonly<Record<IProposalStatus, string>>;

/**
 * Legal status→status edges (f00016 §4.2 DFA), interpreted from the ASCII
 * diagram where it didn't spell out an edge explicitly:
 * - `done`/`retired` are terminal; `done` may still `proposal_retire`
 *   (a shipped feature can later be superseded — `superseded_by`
 *   exists in the frontmatter schema for exactly this), `retired` has
 *   no outgoing edge at all.
 * - `paused` only leaves via `proposal_resume` → `ready` (human-only,
 *   per the proposal's own prose); reaching `paused` itself is allowed
 *   from `ready` or `in-progress` (a human can pause active work, not
 *   just queued work).
 * - `blocked` auto-resolves to `ready` when `blocked-by` empties; it
 *   can be reached from `ready` or `in-progress` via `proposal_block`.
 */
export const PROPOSAL_STATUS_TRANSITIONS: Readonly<
	Record<IProposalStatus, ReadonlySet<IProposalStatus>>
> = {
	ready: new Set(['in-progress', 'blocked', 'paused', 'retired']),
	'in-progress': new Set(['review', 'blocked', 'paused', 'retired']),
	review: new Set(['done', 'in-progress', 'retired']),
	done: new Set(['retired']),
	paused: new Set(['ready', 'retired']),
	blocked: new Set(['ready', 'retired']),
	retired: new Set([]),
};

export type IProposalKind =
	| 'feat'
	| 'breaking'
	| 'fix'
	| 'refactor'
	| 'perf'
	| 'audit'
	| 'chore'
	| 'docs'
	| 'test'
	| 'infra'
	| 'spike'
	| 'legacy'
	| 'resume'
	| 'plan';

export interface IProposalKindInfo {
	/** Single lowercase letter; unique across all 12 kinds (f00016 §2.2). */
	readonly prefix: string;
	readonly glyph: string;
	/** Conventional Commit type this kind produces (`''` for `spike`: no commit). */
	readonly conventionalCommitType: string;
	readonly bump: 'major' | 'minor' | 'patch' | 'none';
}

export const PROPOSAL_KINDS: Readonly<
	Record<IProposalKind, IProposalKindInfo>
> = {
	feat: {
		prefix: 'f',
		glyph: '✨',
		conventionalCommitType: 'feat',
		bump: 'minor',
	},
	breaking: {
		prefix: 'b',
		glyph: '💥',
		conventionalCommitType: 'feat!',
		bump: 'major',
	},
	fix: {
		prefix: 'x',
		glyph: '🐛',
		conventionalCommitType: 'fix',
		bump: 'patch',
	},
	refactor: {
		prefix: 'r',
		glyph: '🛠️',
		conventionalCommitType: 'refactor',
		bump: 'patch',
	},
	perf: {
		prefix: 'v',
		glyph: '⚡',
		conventionalCommitType: 'perf',
		bump: 'patch',
	},
	audit: {
		prefix: 'a',
		glyph: '🔬',
		conventionalCommitType: 'chore(audit)',
		bump: 'patch',
	},
	chore: {
		prefix: 'c',
		glyph: '🧹',
		conventionalCommitType: 'chore',
		bump: 'patch',
	},
	docs: {
		prefix: 'd',
		glyph: '📚',
		conventionalCommitType: 'docs',
		bump: 'none',
	},
	test: {
		prefix: 't',
		glyph: '🧪',
		conventionalCommitType: 'test',
		bump: 'none',
	},
	infra: {
		prefix: 'i',
		glyph: '🏗️',
		conventionalCommitType: 'chore(infra)',
		bump: 'none',
	},
	spike: {
		prefix: 's',
		glyph: '🧭',
		conventionalCommitType: '',
		bump: 'none',
	},
	legacy: {
		prefix: 'l',
		glyph: '📦',
		conventionalCommitType: 'feat',
		bump: 'minor',
	},
	/** Cross-session handoff summaries (n<NNN>-*.md). No version bump, no commit. */
	resume: {
		prefix: 'n',
		glyph: '🧭',
		conventionalCommitType: '',
		bump: 'none',
	},
	/**
	 * Plan-of-plans: a proposal that orchestrates other proposals and/or
	 * carries its own executable slices (q<NNN>-*.md). A `plan` cannot
	 * close (`status: done`) until every contained proposal, sub-plan
	 * and slice is `done` AND peer-reviewed. No conventional commit and
	 * no semver bump — the work that closes a plan is the work the
	 * children ship, not the plan itself. See `q00001-plan-of-plans`.
	 */
	plan: {
		prefix: 'q',
		glyph: '🗂️',
		conventionalCommitType: '',
		bump: 'none',
	},
};

export const PROPOSAL_PREFIX_BY_KIND: Readonly<Record<IProposalKind, string>> =
	Object.fromEntries(
		Object.entries(PROPOSAL_KINDS).map(([kind, info]) => [
			kind,
			info.prefix,
		]),
	) as Readonly<Record<IProposalKind, string>>;

/**
 * Reverse lookup, prefix → kind. Includes `p` (the retired, pre-S11
 * legacy prefix) as an alias for `legacy` alongside the canonical `l` —
 * `PROPOSAL_PREFIX_BY_KIND.legacy` is `l` (the only prefix new files
 * ever get), but the 14 not-yet-migrated `pNNN-*.md` files must still
 * resolve to a known kind until S11 runs.
 */
export const PROPOSAL_KIND_BY_PREFIX: Readonly<Record<string, IProposalKind>> =
	{
		...(Object.fromEntries(
			Object.entries(PROPOSAL_KINDS).map(([kind, info]) => [
				info.prefix,
				kind,
			]),
		) as Readonly<Record<string, IProposalKind>>),
		p: 'legacy',
	};

/**
 * `done/<kind-subfolder>/` mirror — f00042 + f00016 §4.1.
 *
 * Closed proposals for the kinds that ship in volume get grouped under
 * a sub-folder of `done/`, so the closure view scales without becoming
 * a flat dump. The convention is "add a sub-folder when the second
 * file of that kind lands in `done/`" — `feat`, `fix`, `refactor`,
 * `audit`, `chore`, `docs`, `test`, `plan`, `resume` all have one
 * today (mirroring the live `done/feats/`, `done/fixes/`, etc. on
 * disk). Less-common kinds (`breaking`, `perf`, `infra`, `spike`)
 * also ship occasionally, so we pre-declare their buckets too. `legacy`
 * stays at `done/` because its prefix is a synonym for "kind unknown /
 * pre-f00016" — sub-foldering by kind would be a lie about its content.
 *
 * Missing entries fall back to `done` itself (no sub-folder) so the
 * reconciler never crashes on a kind this table hasn't seen yet.
 */
export const KIND_TO_DONE_SUBFOLDER: Readonly<
	Partial<Record<IProposalKind, string>>
> = {
	feat: 'feats',
	fix: 'fixes',
	refactor: 'refactors',
	audit: 'audits',
	chore: 'chores',
	docs: 'docs',
	test: 'tests',
	plan: 'plans',
	resume: 'resumes',
	breaking: 'breakings',
	perf: 'perfs',
	infra: 'infras',
	spike: 'spikes',
};

/**
 * Compute the folder a closed proposal should live in given its kind.
 *
 * Defaults to `STATUS_TO_FOLDER.done` (i.e. just `done`) for kinds
 * without a registered sub-folder, so this helper is safe to call for
 * every transition — including for the `legacy` kind and for any
 * future kind that hasn't shipped twice yet.
 *
 * Pure: no I/O, no globals.
 */
export const doneFolderFor = (kind: IProposalKind | undefined): string => {
	const sub = kind === undefined ? undefined : KIND_TO_DONE_SUBFOLDER[kind];
	return sub === undefined
		? STATUS_TO_FOLDER.done
		: `${STATUS_TO_FOLDER.done}/${sub}`;
};

export interface IProposalFlagInfo {
	readonly label: string;
}

/**
 * Frontmatter booleans that refine behaviour without being a status
 * (f00016 §2.1): `draft` and `deferred` were folded into existing
 * mechanisms (`blocked-by: [self:*]` and a flag on `paused/`,
 * respectively) instead of adding two more statuses.
 */
export const PROPOSAL_FLAGS: Readonly<Record<string, IProposalFlagInfo>> = {
	triaged: { label: 'A human has reviewed and accepted this proposal.' },
	deferred: {
		label: "paused, specifically because it's not this cycle (not a new status).",
	},
	cancelled: {
		label: 'Abandoned without shipping; pairs with status: retired.',
	},
};
