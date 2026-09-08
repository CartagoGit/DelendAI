/**
 * db-reconcile.tool.ts — f00534 S1.
 *
 * `proposals_db_reconcile` — the FIRST production writer of
 * `.delendai/state/proposals.sqlite`.
 *
 * Before this file the whole `@delendai/proposals-sqlite` layer was
 * built, tested and disconnected: the only production consumer,
 * `buildSqlLifecycleReaders` in `plugins/proposals/src/index.ts`, opens
 * the database `readonly: true` and returns `null` when the file is
 * absent — which it always was, because nothing ever created it. Every
 * SQL read therefore fell back to JSON, 100% of the time.
 *
 * This tool closes that gap and nothing else:
 *
 *   markdown -> reconcileShadowToStaging -> applyValidatedCandidate
 *
 * It changes no source of truth. Markdown stays the truth; the database
 * is a derived projection, and a00094 proves the projection rebuilds
 * deterministically from the same markdown. Deleting the file loses
 * nothing, which is what makes this increment reversible.
 *
 * ## Why there is a pre-flight pass
 *
 * `applyValidatedCandidate` promotes a staging database ONLY when its
 * shadow reconciliation run has status `ok`. Two things in a real
 * repository stop that from happening:
 *
 *  1. `reconcileProposalMarkdown` quarantines any file it cannot parse
 *     (a `README.md` under the proposals tree has no frontmatter), and
 *     a single quarantined file makes the run `degraded`, which
 *     `applyValidatedCandidate` refuses to promote.
 *  2. `ProposalRepo.upsertProjection` writes the RAW frontmatter `kind`
 *     and `status` into columns carrying CHECK constraints, with no
 *     normalisation. One proposal with `kind: infra` (not in the enum)
 *     aborts the entire transaction with `CHECK constraint failed`, and
 *     the run comes back `failed` with zero rows staged.
 *
 * Neither is this tool's to fix — both live in
 * `packages/proposals-sqlite` and belong to the reconciler, not to its
 * caller. What this tool does instead is refuse to feed the reconciler
 * input it is known to reject: a cheap pure pre-flight pass over the
 * same `reconcileProposalMarkdown` classifies every file, and the files
 * the projection cannot accept are EXCLUDED from the run and REPORTED
 * back in `excluded[]`, one entry per file with its reason. They are
 * never dropped silently — the operator sees exactly what did not make
 * it into the projection, and the follow-up (normalise in the
 * reconciler, or let `applyValidatedCandidate` promote a `degraded`
 * run) is a separate, visible decision.
 */
// effect-boundary-authorized: this tool IS the filesystem boundary for
// the proposals database. It reads the proposal markdown tree and hands
// the bytes to the reconciler, which owns every SQLite write. There is
// no ctx.effects adapter for SQLite promotion and inventing one here
// would only add a layer around `@delendai/proposals-sqlite`.
import { existsSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { join, relative } from 'node:path';

import z from 'zod';

import type { IToolRegistration } from '@delendai/core/public';
import { toolOk } from '@delendai/core/public';
import {
	applyValidatedCandidate,
	LIFECYCLE_STATUS_VOCABULARY,
	PROPOSAL_KIND_VOCABULARY,
	reconcileProposalMarkdown,
	reconcileShadowToStaging,
	resolveProposalsDbPaths,
	type IProposalCandidate,
	type IReconcilerInputFile,
	type IShadowReconcileInput,
} from '@delendai/proposals-sqlite';

/** Wire-level tool name suffix; the namespace prefix is prepended. */
export const DB_RECONCILE_TOOL_SUFFIX = 'db_reconcile';

/** Registration id, as it appears in the plugin's tool list. */
export const DB_RECONCILE_REGISTRATION_ID = 'proposals_db_reconcile';

/**
 * The `proposals.kind` CHECK constraint of migration `0001_initial.sql`,
 * mirrored here so the pre-flight pass can reject a candidate BEFORE
 * SQLite aborts the whole transaction over it.
 *
 * This is a mirror, and mirrors drift. `db-reconcile.tool.spec.ts` reads
 * the migration SQL and asserts both sets below are exactly the IN lists
 * it declares, so a schema change that is not reflected here fails a
 * test rather than a production run.
 */
export const PROJECTABLE_PROPOSAL_KINDS: ReadonlySet<string> = new Set(
	PROPOSAL_KIND_VOCABULARY,
);

/**
 * Derived from the same vocabulary the write boundary enforces, never
 * a second hand-maintained copy. x00539 made
 * `packages/proposals-sqlite/src/lib/vocabulary.ts` the single owner of
 * the accepted kinds and statuses, and pinned it against the CHECK
 * enum read back out of the migration SQL. This pre-flight predates
 * that module and used to carry its own literal lists, which is exactly
 * the drift that let `kind: infra` reach a CHECK-constrained column and
 * fail a whole run.
 */
export const PROJECTABLE_PROPOSAL_STATUSES: ReadonlySet<string> = new Set(
	LIFECYCLE_STATUS_VOCABULARY,
);

/** Why one file did not reach the projection. */
export type TExclusionCode =
	| 'unparseable'
	| 'missing_kind'
	| 'missing_status'
	| 'kind_not_projectable'
	| 'status_not_projectable'
	| 'duplicate_id';

export interface IExcludedFile {
	readonly path: string;
	readonly code: TExclusionCode;
	readonly message: string;
}

export interface IDbReconcileInput {
	/** Workspace root; the DB path comes from `resolveProposalsDbPaths`. */
	readonly workspaceRoot: string;
	/** Absolute path of the proposal markdown tree to project. */
	readonly proposalsDirAbs: string;
	/** Commit the projection is attributed to. Defaults to the repo HEAD. */
	readonly sourceCommit?: string;
	/** Build the staging DB and validate it, but never promote. */
	readonly dryRun?: boolean;
	/** Injected clock, so specs get a deterministic `updated_at`. */
	readonly now?: number;
	/**
	 * Verbatim passthrough of `IShadowReconcileInput.driver` — the seam
	 * `@delendai/proposals-sqlite` documents "for tests that want to
	 * inject a custom migrations list". Forwarded so a spec can drive the
	 * staging-build failure path THROUGH the real tool rather than around
	 * it, and prove the active database survives it untouched.
	 */
	readonly driver?: IShadowReconcileInput['driver'];
}

/**
 * A type alias, not an interface, on purpose: `toolOk` takes a
 * `Record<string, unknown>`, and only an object *type* gets the implicit
 * index signature that assignment needs. Same reason
 * `IProposalsDbStatusOutput` is a `z.infer` alias.
 */
export type IDbReconcileOutput = {
	readonly status: 'ok' | 'rejected';
	/** True when the active database did not exist before this run. */
	readonly created: boolean;
	readonly dryRun: boolean;
	readonly databasePath: string;
	readonly stagingPath: string;
	readonly statePath: string;
	readonly sourceCommit: string;
	readonly logicalDigest: string | null;
	readonly filesScanned: number;
	readonly filesReconciled: number;
	readonly proposals: number;
	readonly plans: number;
	readonly slices: number;
	readonly staged: {
		readonly proposals: number;
		readonly plans: number;
		readonly slices: number;
	};
	readonly excluded: readonly IExcludedFile[];
	readonly excludedCount: number;
	readonly integrity: 'ok' | 'failed' | 'not-run';
	readonly foreignKey: 'ok' | 'failed' | 'not-run';
	readonly reason: string | null;
	readonly startedAt: number;
	readonly durationMs: number;
};

export const proposalsDbReconcileInputSchema = z.object({
	sourceCommit: z.string().min(1).optional(),
	dryRun: z.boolean().optional(),
});

const excludedFileSchema = z.object({
	path: z.string(),
	code: z.enum([
		'unparseable',
		'missing_kind',
		'missing_status',
		'kind_not_projectable',
		'status_not_projectable',
		'duplicate_id',
	]),
	message: z.string(),
});

export const proposalsDbReconcileOutputSchema = z.object({
	status: z.enum(['ok', 'rejected']),
	created: z.boolean(),
	dryRun: z.boolean(),
	databasePath: z.string(),
	stagingPath: z.string(),
	statePath: z.string(),
	sourceCommit: z.string(),
	logicalDigest: z.string().nullable(),
	filesScanned: z.number().int().nonnegative(),
	filesReconciled: z.number().int().nonnegative(),
	proposals: z.number().int().nonnegative(),
	plans: z.number().int().nonnegative(),
	slices: z.number().int().nonnegative(),
	staged: z.object({
		proposals: z.number().int().nonnegative(),
		plans: z.number().int().nonnegative(),
		slices: z.number().int().nonnegative(),
	}),
	excluded: z.array(excludedFileSchema),
	excludedCount: z.number().int().nonnegative(),
	integrity: z.enum(['ok', 'failed', 'not-run']),
	foreignKey: z.enum(['ok', 'failed', 'not-run']),
	reason: z.string().nullable(),
	startedAt: z.number().int().nonnegative(),
	durationMs: z.number().int().nonnegative(),
});

/**
 * Every `*.md` under `dir`, with paths relative to `dir` so the
 * projection's `source_path` is workspace-shaped and stable across
 * machines (the logical digest depends on it).
 */
export const collectProposalMarkdown = (
	dir: string,
): readonly IReconcilerInputFile[] => {
	if (!existsSync(dir)) return [];
	const files: IReconcilerInputFile[] = [];
	const walk = (current: string): void => {
		for (const entry of readdirSync(current, { withFileTypes: true })) {
			const full = join(current, entry.name);
			if (entry.isDirectory()) {
				walk(full);
				continue;
			}
			if (!entry.isFile()) continue;
			if (!entry.name.endsWith('.md')) continue;
			files.push({
				path: relative(dir, full),
				raw: readFileSync(full, 'utf8'),
			});
		}
	};
	walk(dir);
	return files.sort((a, b) => a.path.localeCompare(b.path));
};

/**
 * Classify one parsed candidate against the projection's CHECK
 * constraints. `null` means the candidate is projectable.
 */
export const classifyCandidate = (
	candidate: IProposalCandidate,
): IExcludedFile | null => {
	if (candidate.kind === null) {
		return {
			path: candidate.path,
			code: 'missing_kind',
			message: `frontmatter.kind is required; ${candidate.uid} has none`,
		};
	}
	if (candidate.status === null) {
		return {
			path: candidate.path,
			code: 'missing_status',
			message: `frontmatter.status is required; ${candidate.uid} has none`,
		};
	}
	if (!PROJECTABLE_PROPOSAL_KINDS.has(candidate.kind)) {
		return {
			path: candidate.path,
			code: 'kind_not_projectable',
			message: `kind "${candidate.kind}" is outside the proposals.kind CHECK constraint`,
		};
	}
	if (!PROJECTABLE_PROPOSAL_STATUSES.has(candidate.status)) {
		return {
			path: candidate.path,
			code: 'status_not_projectable',
			message: `status "${candidate.status}" is outside the proposals.status CHECK constraint`,
		};
	}
	return null;
};

export interface IPreflightResult {
	readonly accepted: readonly IReconcilerInputFile[];
	readonly excluded: readonly IExcludedFile[];
}

/**
 * Pure pre-flight: parse every file with the SAME reconciler the real
 * run uses, and split the set into what the projection accepts and what
 * it does not. Nothing is written; nothing is hidden — every rejected
 * file comes back in `excluded` with a code and a reason.
 */
export const preflightProposalFiles = (
	files: readonly IReconcilerInputFile[],
	sourceCommit: string,
): IPreflightResult => {
	const preview = reconcileProposalMarkdown({
		sourceCommit,
		files,
		mode: 'shadow',
	});
	const excluded: IExcludedFile[] = preview.quarantined.map((entry) => ({
		path: entry.path,
		code: 'unparseable' as const,
		message: `${entry.errorCode}: ${entry.errorMessage}`,
	}));
	// Two proposals may not share a uid. `ProposalRepo.upsertProjection`
	// would quietly collapse them, but `PlanRepo.create` is a plain
	// INSERT, so a duplicated id aborts the whole staging transaction with
	// `UNIQUE constraint failed: plans.uid`. The winner is the first in
	// the reconciler's canonical (uid, path) order, which makes the choice
	// independent of the order the files were read in; every loser is
	// reported by path so the duplicate is visible and fixable.
	const seenUids = new Map<string, string>();
	for (const candidate of preview.proposals) {
		const verdict = classifyCandidate(candidate);
		if (verdict !== null) {
			excluded.push(verdict);
			continue;
		}
		const winner = seenUids.get(candidate.uid);
		if (winner !== undefined) {
			excluded.push({
				path: candidate.path,
				code: 'duplicate_id',
				message: `id "${candidate.uid}" is already claimed by ${winner}`,
			});
			continue;
		}
		seenUids.set(candidate.uid, candidate.path);
	}
	const rejectedPaths = new Set(excluded.map((entry) => entry.path));
	return {
		accepted: files.filter((file) => !rejectedPaths.has(file.path)),
		excluded: excluded.sort((a, b) => a.path.localeCompare(b.path)),
	};
};

/**
 * Resolve the commit the projection is attributed to by reading the git
 * plumbing directly — no subprocess, and a workspace that is not a git
 * checkout still reconciles (attributed to `workspace`).
 */
export const resolveHeadCommit = (workspaceRoot: string): string => {
	const gitDir = join(workspaceRoot, '.git');
	try {
		const head = readFileSync(join(gitDir, 'HEAD'), 'utf8').trim();
		if (!head.startsWith('ref:')) return head;
		const ref = head.slice(4).trim();
		const looseRef = join(gitDir, ref);
		if (existsSync(looseRef)) {
			return readFileSync(looseRef, 'utf8').trim();
		}
		const packed = readFileSync(join(gitDir, 'packed-refs'), 'utf8');
		for (const line of packed.split('\n')) {
			const [sha, name] = line.trim().split(' ');
			if (name === ref && sha !== undefined) return sha;
		}
		return ref;
	} catch {
		return 'workspace';
	}
};

const removeStagingArtifacts = (stagingPath: string): void => {
	for (const suffix of ['', '-wal', '-shm']) {
		rmSync(`${stagingPath}${suffix}`, { force: true });
	}
};

/**
 * The whole tool as one pure-ish function, so specs drive it without an
 * MCP server in the way.
 */
export const reconcileProposalsDb = (
	input: IDbReconcileInput,
): IDbReconcileOutput => {
	const wallStart = Date.now();
	const startedAt = input.now ?? wallStart;
	const paths = resolveProposalsDbPaths(input.workspaceRoot);
	const sourceCommit =
		input.sourceCommit ?? resolveHeadCommit(input.workspaceRoot);
	const dryRun = input.dryRun === true;
	const created = !existsSync(paths.databasePath);
	const files = collectProposalMarkdown(input.proposalsDirAbs);
	const preflight = preflightProposalFiles(files, sourceCommit);

	const base = {
		created,
		dryRun,
		databasePath: paths.databasePath,
		stagingPath: paths.stagingPath,
		statePath: paths.stateDir,
		sourceCommit,
		filesScanned: files.length,
		filesReconciled: preflight.accepted.length,
		excluded: preflight.excluded,
		excludedCount: preflight.excluded.length,
		startedAt,
	};

	const staged = reconcileShadowToStaging({
		mode: 'shadow',
		workspacePath: input.workspaceRoot,
		sourceCommit,
		sha: sourceCommit,
		files: preflight.accepted,
		now: startedAt,
		...(input.driver !== undefined ? { driver: input.driver } : {}),
	});

	const stagedCounts = {
		proposals: staged.proposalsStaged,
		plans: staged.plansStaged,
		slices: staged.slicesStaged,
	};

	if (staged.status !== 'ok') {
		return {
			...base,
			status: 'rejected',
			logicalDigest: staged.stagingDigest,
			proposals: 0,
			plans: 0,
			slices: 0,
			staged: stagedCounts,
			integrity: staged.integrity.status,
			foreignKey: staged.foreignKey.status,
			reason:
				staged.error ??
				`shadow reconciliation status is ${staged.status}`,
			durationMs: Date.now() - wallStart,
		};
	}

	if (dryRun) {
		removeStagingArtifacts(paths.stagingPath);
		return {
			...base,
			status: 'ok',
			logicalDigest: staged.stagingDigest,
			proposals: 0,
			plans: 0,
			slices: 0,
			staged: stagedCounts,
			integrity: staged.integrity.status,
			foreignKey: staged.foreignKey.status,
			reason: null,
			durationMs: Date.now() - wallStart,
		};
	}

	const applied = applyValidatedCandidate({
		stagingPath: staged.stagingPath,
		activePath: paths.databasePath,
		sourceCommit,
		expectedDigest: staged.stagingDigest,
		now: startedAt,
	});

	if (applied.status === 'ok') {
		// The staging database has served its purpose. Leaving it behind
		// would make the state dir look like a half-finished promotion.
		removeStagingArtifacts(paths.stagingPath);
	}

	return {
		...base,
		status: applied.status,
		logicalDigest: applied.logicalDigest ?? staged.stagingDigest,
		proposals: applied.proposalsApplied,
		plans: applied.plansApplied,
		slices: applied.slicesApplied,
		staged: stagedCounts,
		integrity: staged.integrity.status,
		foreignKey: staged.foreignKey.status,
		reason: applied.reason,
		durationMs: Date.now() - wallStart,
	};
};

export interface IDbReconcileToolOptions {
	readonly workspaceRoot: string;
	readonly proposalsDirAbs: string;
	readonly namespacePrefix?: string;
}

export const buildDbReconcileToolRegistration = (
	options: IDbReconcileToolOptions,
): IToolRegistration => {
	const toolName = `${options.namespacePrefix ?? 'proposals'}_${DB_RECONCILE_TOOL_SUFFIX}`;
	return {
		id: DB_RECONCILE_REGISTRATION_ID,
		register: async (server) => {
			server.registerTool(
				toolName,
				{
					title: 'Reconcile the proposals DB from markdown',
					description:
						'Projects the proposal markdown tree into the operational SQLite database (.delendai/state/proposals.sqlite) through the shadow -> validate -> promote pipeline. Markdown stays the source of truth; the database is a derived, deterministically rebuildable projection. Creates the database when it does not exist, updates it when it does, and is idempotent: two runs over the same tree yield the same logical digest and duplicate no rows. When staging validation fails the active database is left untouched and the reason is returned.',
					inputSchema: proposalsDbReconcileInputSchema,
					outputSchema: proposalsDbReconcileOutputSchema,
				},
				async (args) => {
					const parsed = proposalsDbReconcileInputSchema.parse(
						args ?? {},
					);
					const output = reconcileProposalsDb({
						workspaceRoot: options.workspaceRoot,
						proposalsDirAbs: options.proposalsDirAbs,
						...(parsed.sourceCommit !== undefined
							? { sourceCommit: parsed.sourceCommit }
							: {}),
						...(parsed.dryRun !== undefined
							? { dryRun: parsed.dryRun }
							: {}),
					});
					return toolOk(output);
				},
			);
		},
	};
};
